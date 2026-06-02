"""
order_placement.py — place online, in-store, and cancel orders.
Fully migrated to PostgreSQL.
"""
import json
import boto3
import uuid
import logging
from decimal import Decimal, InvalidOperation
from enum import Enum
from utils import fetch_laundry_info, generate_order_id, get_current_timestamp
from order_payments import (capture_product_store_payment, create_payment_hold,
                             handle_rollback, cancel_payment_intent, capture_store_payment,
                             invoke_refund_payment, store_save_card)
from order_frequency import handle_frequency_logic, cancel_recurring_order
from order_notifications import send_notification, send_cancellation_notification
from publish_metric import publish_order_metric
from datetime import datetime, timedelta
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda')
UBER_INTEGRATION_LAMBDA = "UberIntegration"


class OrderStatus(Enum):
    ORDER_SUBMITTED    = "OrderSubmitted"
    ORDER_PICKED_UP    = "OrderPickedUp"
    READY_FOR_INTAKE   = "ReadyForIntake"
    RECEIVED           = "ReceivedAtFacility"
    PROCESSING_STARTED = "ProcessingStarted"
    PROCESSING_COMPLETED = "ProcessingCompleted"
    EN_ROUTE_TO_DELIVERY = "EnRouteToDelivery"
    DELIVERED          = "Delivered"
    ORDER_CANCELED     = "OrderCanceled"


class PaymentStatus(Enum):
    PAYMENT_INITIATED = "Unpaid"
    PAYMENT_SUCCESS   = "Paid"


class OrderType(Enum):
    INSTORE = "InStore"
    ONLINE  = "Online"


class OrderStatusCategory(Enum):
    ACTIVE    = "Active"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


# ── In-store product orders ───────────────────────────────────────────────────

def instoreProductsOrder(event):
    logger.info("Processing instoreProductsOrder")
    try:
        laundry_id        = event.get('laundryId')
        items_sold        = event.get('itemsSold')
        total_price       = event.get('totalPrice')
        payment_type      = event.get('paymentType')
        terminal_intent_id = event.get('terminalPaymentIntentId', '')

        if not laundry_id or not items_sold or not total_price:
            return {'status': 'error', 'message': 'Missing required parameters'}
        if payment_type not in ["Card", "Cash", "Terminal"]:
            return {'status': 'error', 'message': 'Invalid payment type. Must be Card, Cash, or Terminal.'}

        items_with_prices = []
        for item in items_sold:
            product_name = item.get('productName')
            quantity     = item.get('quantity')
            unit_price   = float(str(item.get('unitPrice', 0)))
            if not product_name or quantity is None:
                return {'status': 'error', 'message': 'Invalid item in itemsSold'}
            items_with_prices.append({
                'productName': product_name,
                'quantity':    quantity,
                'unitPrice':   unit_price,
            })

        order_id    = generate_order_id('ISP-')
        total_price = float(str(total_price))
        payment_intent_id = ''

        if payment_type == 'Card':
            card_payment_method_id = event.get('cardPaymentMethodId')
            if not card_payment_method_id:
                return {'status': 'error', 'message': 'Card payment method ID is missing'}
            payment_response = capture_product_store_payment(
                card_payment_method_id, total_price, laundry_id, order_id)
            if payment_response['status'] != 'success':
                return {'status': 'error', 'message': payment_response.get('message', 'Payment failed.')}
            payment_intent_id = payment_response['paymentIntentId']

        elif payment_type == 'Terminal':
            if not terminal_intent_id:
                return {'status': 'error', 'message': 'Terminal Payment Intent Id not found.'}
            payment_intent_id = terminal_intent_id

        # Insert into PostgreSQL
        cur = db.get_cursor()
        cur.execute("""
            INSERT INTO orders.instore_product_orders
                (product_order_id, laundry_id, payment_intent_id, payment_method, total_price, created_at)
            VALUES (%s,%s,%s,%s,%s,NOW())
        """, (order_id, laundry_id, payment_intent_id or None, payment_type, total_price))

        for item in items_with_prices:
            cur.execute("""
                INSERT INTO orders.instore_product_order_items
                    (product_order_id, product_name, quantity, unit_price)
                VALUES (%s,%s,%s,%s)
            """, (order_id, item['productName'], item['quantity'], item['unitPrice']))

        db.commit()
        logger.info("Instore product order placed: %s", order_id)
        return {
            'status':      'success',
            'message':     'Order placed successfully',
            'orderId':     order_id,
            'items':       items_with_prices,
            'totalPrice':  total_price,
            'paymentType': payment_type,
        }
    except Exception as e:
        db.rollback()
        logger.exception("instoreProductsOrder error")
        return {'status': 'error', 'message': str(e)}


# ── Online order placement ────────────────────────────────────────────────────

def place_order(event):
    logger.info("Processing place_order")
    payment_intent_id = None
    frequency_id      = None
    laundry_id        = None
    try:
        customer_id          = event.get('customerId')
        new_address          = event.get('address')
        address_instructions = event.get('addressInstructions')
        door_number          = event.get('doorNumber')
        laundry_id           = event.get('laundryId')
        special_instructions = event.get('specialInstructions')
        order_total_cost     = event.get('totalCost')
        order_sub_total      = event.get('subTotal', 0)
        order_grand_total    = event.get('grandTotal', 0)
        save_special_instructions = event.get('saveSpecialInstructions', False)
        if isinstance(save_special_instructions, str):
            save_special_instructions = save_special_instructions.lower() == 'true'
        services             = event.get('services')
        pickup_date          = event.get('pickupDate')
        pickup_time_interval = event.get('pickupTimeInterval')
        dropoff_date         = event.get('dropoffDate')
        dropoff_time_interval = event.get('dropoffTimeInterval')
        frequency            = event.get('frequency')
        laundry_bags         = event.get('laundryBags', 1)
        tip_data             = event.get('tip', {})
        coupon               = event.get('coupon')
        uber_pickup_frequency  = event.get('uberPickupFrequency')
        uber_dropoff_frequency = event.get('uberDropoffFrequency')

        if not customer_id or not new_address or not services or not laundry_id:
            return {'status': 'error', 'message': 'Missing required parameters'}

        order_status  = OrderStatus.ORDER_SUBMITTED.value
        payment_status = PaymentStatus.PAYMENT_INITIATED.value
        order_type    = OrderType.ONLINE.value
        current_time  = get_current_timestamp()
        laundry_bags  = int(laundry_bags)

        # ── Fetch customer from PostgreSQL ────────────────────────────────────
        cur = db.get_cursor()
        cur.execute("""
            SELECT c.customer_id, c.first_name, c.last_name, c.phone_number,
                   c.special_instructions, c.notif_email, c.notif_sms,
                   cpp.stripe_customer_id AS payment_method_id
            FROM shop.customers c
            LEFT JOIN shop.customer_payment_profiles cpp
              ON cpp.customer_id = c.customer_id AND cpp.laundry_id = %s
            WHERE c.customer_id = %s
        """, (laundry_id, customer_id))
        customer_row = cur.fetchone()
        if not customer_row:
            return {'status': 'error', 'message': 'Customer does not exist'}

        payment_method_id = customer_row["payment_method_id"] or ''
        if not payment_method_id:
            return {'status': 'error', 'message': 'Please add a new card to place an order'}

        # Fetch addresses
        cur.execute("""
            SELECT address_id, address, address_instructions, door_number
            FROM shop.customer_addresses
            WHERE customer_id = %s AND is_active = TRUE
        """, (customer_id,))
        addresses = [dict(r) for r in cur.fetchall()]

        if save_special_instructions:
            cur.execute("UPDATE shop.customers SET special_instructions = %s WHERE customer_id = %s",
                        (special_instructions, customer_id))

        # ── Resolve / create address ──────────────────────────────────────────
        address_id = None
        for addr in addresses:
            if addr['address'] == new_address:
                address_id = addr['address_id']
                if not address_instructions:
                    address_instructions = addr.get('address_instructions', '')
                break

        if not address_id:
            address_id = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO shop.customer_addresses
                    (address_id, customer_id, address, door_number, address_instructions)
                VALUES (%s,%s,%s,%s,%s)
            """, (address_id, customer_id, new_address, door_number, address_instructions))
            addresses.append({'address_id': address_id, 'address': new_address})

        # ── Coerce service decimals ───────────────────────────────────────────
        for svc in services:
            svc['weightOrCount'] = float(str(svc.get('weightOrCount', 0)))
            svc['servicePrice']  = float(str(svc.get('servicePrice', 0)))

        # ── Payment hold ──────────────────────────────────────────────────────
        hold_response = create_payment_hold(
            payment_method_id, laundry_id,
            description=f'Online laundry:{laundry_id} customerId:{customer_id}')
        if hold_response['status'] != 'success':
            return {'status': 'error', 'message': 'Failed to create payment hold'}
        payment_intent_id = hold_response.get('paymentIntentId', '')
        if not payment_intent_id:
            return {'status': 'error', 'message': 'Failed to retrieve paymentIntentId'}

        # ── Tip ───────────────────────────────────────────────────────────────
        try:
            tip_amount = float(str(tip_data.get('tipAmount', '0.00')))
        except (ValueError, TypeError):
            tip_amount = 0.0
        tip_payload = {
            'tipAmount':     tip_amount,
            'tipPercentage': tip_data.get('tipPercentage'),
            'tipType':       tip_data.get('tipType'),
            'tipReceiverId': tip_data.get('tipReceiverId'),
            'tipMethod':     'Card',
        }

        # ── Costs ─────────────────────────────────────────────────────────────
        try:
            total_cost  = round(float(str(order_total_cost)), 2)
            sub_total   = round(float(str(order_sub_total)), 2)
            grand_total = round(float(str(order_grand_total)), 2)
        except (ValueError, TypeError):
            total_cost = sub_total = grand_total = 1.00

        # ── Frequency — empty string must be NULL for the enum column ─────────
        frequency = frequency or None

        # ── Frequency ─────────────────────────────────────────────────────────
        if frequency:
            handle_frequency_logic(
                customer_id=customer_id, laundry_id=laundry_id, address_id=address_id,
                frequency_id=None, services=services,
                pickup_date=pickup_date, pickup_time_interval=pickup_time_interval,
                dropoff_time_interval=dropoff_time_interval,
                special_instructions=special_instructions,
                frequency=frequency, laundry_bags=laundry_bags,
                tip=tip_payload, coupon=coupon,
                uber_pickup_frequency=uber_pickup_frequency,
                uber_dropoff_frequency=uber_dropoff_frequency,
            )

        # ── Insert order ──────────────────────────────────────────────────────
        order_id = generate_order_id("O-")
        db.set_emp_id(None)
        cur.execute("""
            INSERT INTO orders.orders (
                order_id, laundry_id, customer_id, address_id,
                order_type, order_status, status_category, payment_status,
                pickup_date, pickup_time_interval, dropoff_date, dropoff_time_interval,
                laundry_bags, special_instructions, coupon,
                sub_total, total_cost, grand_total,
                frequency, auto_generated, is_reviewed, cancel_reason,
                hold_payment_intent_id, created_at, updated_at
            ) VALUES (
                %s,%s,%s,%s,'Online',%s,'Active',%s,
                %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                %s,FALSE,FALSE,'',%s,NOW(),NOW()
            )
        """, (
            order_id, laundry_id, customer_id, address_id,
            order_status, payment_status,
            pickup_date, pickup_time_interval, dropoff_date, dropoff_time_interval,
            laundry_bags, special_instructions, coupon,
            sub_total, total_cost, grand_total,
            frequency, payment_intent_id,
        ))

        for svc in services:
            cur.execute("""
                INSERT INTO orders.order_services (order_id, service_name, service_price, weight_or_count)
                VALUES (%s,%s,%s,%s)
            """, (order_id, svc.get('serviceName'), svc['servicePrice'], svc['weightOrCount']))

        # Always insert tip row — stores tipType/tipPercentage/tipMethod even when tipAmount is 0
        # so the tip can be calculated correctly when the order is completed
        tip_type = tip_payload.get('tipType')
        tip_method = tip_payload.get('tipMethod')
        tip_pct = tip_payload.get('tipPercentage')
        if tip_type or tip_method or tip_amount > 0:
            cur.execute("""
                INSERT INTO orders.order_tips (order_id, tip_amount, tip_percentage, tip_type, tip_method)
                VALUES (%s,%s,%s,%s,%s)
                ON CONFLICT (order_id) DO UPDATE SET
                    tip_amount = EXCLUDED.tip_amount,
                    tip_percentage = EXCLUDED.tip_percentage,
                    tip_type = EXCLUDED.tip_type,
                    tip_method = EXCLUDED.tip_method
            """, (order_id, tip_amount, tip_pct, tip_type, tip_method))

        db.commit()

        # ── Notification ──────────────────────────────────────────────────────
        customer_for_notif = {
            'firstName':               customer_row["first_name"],
            'lastName':                customer_row["last_name"],
            'email':                   None,
            'phoneNumber':             customer_row["phone_number"],
            'notification_preferences': {
                'email': customer_row["notif_email"],
                'phone': customer_row["notif_sms"],
            },
            'addresses': addresses,
        }
        order_for_notif = {
            'orderId': order_id, 'addressId': address_id,
            'pickupDate': pickup_date, 'pickupTimeInterval': pickup_time_interval,
            'dropoffDate': dropoff_date, 'dropoffTimeInterval': dropoff_time_interval,
            'services': services, 'frequency': frequency,
        }
        send_notification(customer_for_notif, order_for_notif, laundry_id)
        publish_order_metric("SuccessfulOrders", order_type="Online", laundry_id=laundry_id, status="success")

        logger.info("Order placed: %s", order_id)
        return {'status': 'success', 'orderId': order_id}

    except Exception as e:
        db.rollback()
        logger.exception("place_order error")
        publish_order_metric("FailedOrders", order_type="Online",
                             customer_id=customer_id, laundry_id=laundry_id, status="failed")
        handle_rollback(frequency_id, payment_intent_id, laundry_id)
        return {'status': 'error', 'message': str(e)}


# ── In-store order placement ──────────────────────────────────────────────────

def in_store_place_order(event):
    logger.info("Processing in_store_place_order")
    payment_intent_id = None
    laundry_id        = None
    try:
        customer_id          = event.get('customerId')
        customer_payment_id  = event.get('customerPaymentId')
        laundry_id           = event.get('laundryId')
        special_instructions = event.get('specialInstructions')
        services             = event.get('services', [])
        products             = event.get('products', [])
        pickup_date          = event.get('pickupDate')
        pickup_time_interval = event.get('pickupTimeInterval')
        dropoff_date         = event.get('dropoffDate')
        dropoff_time_interval = event.get('dropoffTimeInterval')
        coupon               = event.get('coupon')
        total_cost           = event.get('totalCost')
        sub_total            = event.get('subTotal', 0)
        grand_total          = event.get('grandTotal', 0)
        discounted_price     = event.get('discountedPrice', 0)
        tip_data             = event.get('tip', {})
        laundry_bags         = event.get('laundryBags', 1)
        card_payment_method_id = event.get('cardPaymentMethodId')
        is_terminal_payment  = event.get('isTerminalPayment', False)
        terminal_intent_id   = event.get('terminalPaymentIntentId', '')
        save_card            = event.get('saveCard', False)
        is_pay_now           = event.get('isPayNow')
        if isinstance(save_card, str):
            save_card = save_card.lower() == 'true'

        if not laundry_id or not customer_id:
            return {'status': 'error', 'message': 'Missing required parameters'}

        total_cost       = round(float(str(total_cost or 0)), 2)
        sub_total        = round(float(str(sub_total or 0)), 2)
        grand_total      = round(float(str(grand_total or 0)), 2)
        discounted_price = round(float(str(discounted_price or 0)), 2)
        laundry_bags     = int(laundry_bags)
        tip_amount       = round(float(str(tip_data.get('tipAmount', 0))), 2)
        amount_to_collect = total_cost + tip_amount

        order_id       = generate_order_id("IS-")
        order_status   = OrderStatus.RECEIVED.value
        payment_status = PaymentStatus.PAYMENT_INITIATED.value
        final_payments = []

        # Payment
        if card_payment_method_id:
            payment_response = capture_store_payment(
                card_payment_method_id, amount_to_collect, laundry_id,
                description=f'InStore | Order: {order_id}',
                save_card=save_card, customer_id=customer_id,
                customer_payment_id=customer_payment_id)
            if payment_response['status'] != 'success':
                return {'status': 'error', 'message': payment_response.get('message', 'Card payment failed')}
            final_payments = [{'amount': amount_to_collect,
                               'paymentIntentId': payment_response['paymentIntentId'],
                               'paymentMethod': 'Card'}]
            payment_status = PaymentStatus.PAYMENT_SUCCESS.value
        elif is_terminal_payment and terminal_intent_id:
            final_payments = [{'amount': amount_to_collect,
                               'paymentIntentId': terminal_intent_id,
                               'paymentMethod': 'Terminal'}]
            payment_status = PaymentStatus.PAYMENT_SUCCESS.value
        elif is_pay_now and not card_payment_method_id:
            final_payments = [{'amount': amount_to_collect,
                               'paymentIntentId': None,
                               'paymentMethod': 'Cash'}]
            payment_status = PaymentStatus.PAYMENT_SUCCESS.value
            

        cur = db.get_cursor()
        db.set_emp_id(None)
        cur.execute("""
            INSERT INTO orders.orders (
                order_id, laundry_id, customer_id,
                order_type, order_status, status_category, payment_status,
                pickup_date, pickup_time_interval, dropoff_date, dropoff_time_interval,
                laundry_bags, special_instructions, coupon,
                sub_total, discounted_price, total_cost, grand_total,
                auto_generated, is_reviewed, cancel_reason,
                created_at, updated_at
            ) VALUES (
                %s,%s,%s,'InStore',%s,'Active',%s,
                %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                FALSE,FALSE,'',NOW(),NOW()
            )
        """, (
            order_id, laundry_id, customer_id,
            order_status, payment_status,
            pickup_date, pickup_time_interval, dropoff_date, dropoff_time_interval,
            laundry_bags, special_instructions, coupon,
            sub_total, discounted_price, total_cost, grand_total,
        ))

        for svc in services:
            cur.execute("""
                INSERT INTO orders.order_services (order_id, service_name, service_price, weight_or_count)
                VALUES (%s,%s,%s,%s)
            """, (order_id, svc.get('serviceName'), float(str(svc.get('servicePrice', 0))),
                  float(str(svc.get('weightOrCount', 0)))))

        for prod in products:
            cur.execute("""
                INSERT INTO orders.order_products (order_id, product_name, product_price, product_count)
                VALUES (%s,%s,%s,%s)
            """, (order_id, prod.get('productName'), float(str(prod.get('productPrice', 0))),
                  int(prod.get('productCount', 1))))

        tip_type = tip_data.get('tipType')
        tip_method = tip_data.get('tipMethod')
        tip_pct = tip_data.get('tipPercentage')
        if tip_type or tip_method or tip_amount > 0:
            cur.execute("""
                INSERT INTO orders.order_tips (order_id, tip_amount, tip_percentage, tip_type, tip_method)
                VALUES (%s,%s,%s,%s,%s)
                ON CONFLICT (order_id) DO UPDATE SET
                    tip_amount = EXCLUDED.tip_amount,
                    tip_percentage = EXCLUDED.tip_percentage,
                    tip_type = EXCLUDED.tip_type,
                    tip_method = EXCLUDED.tip_method
            """, (order_id, tip_amount, tip_pct, tip_type, tip_method))

        for p in final_payments:
            cur.execute("""
                INSERT INTO orders.order_payments (order_id, payment_intent_id, amount, payment_method)
                VALUES (%s,%s,%s,%s)
            """, (order_id, p.get('paymentIntentId'), p['amount'], p.get('paymentMethod')))

        db.commit()
        publish_order_metric("SuccessfulOrders", order_type="InStore", laundry_id=laundry_id, status="success")
        logger.info("InStore order placed: %s", order_id)
        return {'status': 'success', 'orderId': order_id}

    except Exception as e:
        db.rollback()
        logger.exception("in_store_place_order error")
        publish_order_metric("FailedOrders", order_type="InStore",
                             customer_id=customer_id, laundry_id=laundry_id, status="failed")
        return {'status': 'error', 'message': str(e)}


# ── Cancel online order ───────────────────────────────────────────────────────

def cancel_online_order(order_id, customer_id, laundry_id, is_recurring, new_address, reason="Unknown"):
    logger.info("cancel_online_order: %s customer=%s", order_id, customer_id)
    try:
        cur = db.get_cursor()
        cur.execute("""
            SELECT order_id, customer_id, order_status, hold_payment_intent_id,
                   frequency, address_id
            FROM orders.orders WHERE order_id = %s
        """, (order_id,))
        order = cur.fetchone()
        if not order:
            return {'status': 'error', 'message': 'Order not found'}
        if order["customer_id"] != customer_id:
            return {'status': 'error', 'message': 'Customer ID does not match the order'}
        if order["order_status"] == OrderStatus.ORDER_CANCELED.value:
            return {'status': 'error', 'message': 'Order is already canceled'}

        # Cancel the order
        cur.execute("""
            UPDATE orders.orders
            SET order_status = %s, status_category = 'Cancelled',
                cancel_reason = %s, frequency = '', updated_at = NOW()
            WHERE order_id = %s
        """, (OrderStatus.ORDER_CANCELED.value, reason, order_id))

        # Cancel recurring frequency if applicable
        if is_recurring and order["address_id"]:
            cur.execute("""
                UPDATE orders.laundry_frequency SET is_active = FALSE
                WHERE address_id = %s AND customer_id = %s
            """, (order["address_id"], customer_id))

        db.commit()

        # Cancel payment hold
        if order["hold_payment_intent_id"]:
            cancel_payment_intent(order["hold_payment_intent_id"], laundry_id)

        logger.info("Order cancelled: %s", order_id)
        return {'status': 'success', 'message': 'Order canceled successfully'}

    except Exception as e:
        db.rollback()
        logger.exception("cancel_online_order error")
        return {'status': 'error', 'message': str(e)}
