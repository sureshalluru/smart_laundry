"""
commercial_order_info.py — place commercial laundry orders.
Migrated from DynamoDB to PostgreSQL.
"""
import uuid
import logging
from decimal import Decimal, InvalidOperation
from enum import Enum
from utils import fetch_laundry_info, generate_order_id, get_current_timestamp
from order_payments import capture_store_payment, handle_rollback, store_save_card
from order_notifications import send_commercial_order_notification
from publish_metric import publish_order_metric
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)


class OrderStatus(Enum):
    RECEIVED = "ReceivedAtFacility"
    ORDER_CANCELED = "OrderCanceled"


class PaymentStatus(Enum):
    PAYMENT_INITIATED = 'Unpaid'
    PAYMENT_SUCCESS = 'Paid'


def placeCommercialLaundryOrders(event):
    logger.info("Processing placeCommercialLaundryOrders")
    address_id = ''
    frequency_id = None
    pay_now = False
    payment_intent_id = None
    laundry_id = None
    card_payment_method_id = None
    cancel_reason = ""

    try:
        customer_id          = event.get('customerId')
        customer_payment_id  = event.get('customerPaymentId')
        save_card            = event.get('saveCard', False)
        if isinstance(save_card, str):
            save_card = save_card.lower() == 'true'
        new_address          = event.get('address')
        address_instructions = event.get('addressInstructions')
        door_number          = event.get('doorNumber')
        laundry_id           = event.get('laundryId')
        special_instructions = event.get('specialInstructions')
        save_special_instructions = event.get('saveSpecialInstructions', False)
        if isinstance(save_special_instructions, str):
            save_special_instructions = save_special_instructions.lower() == 'true'
        services                  = event.get('services')
        products                  = event.get('products', [])
        pickup_date               = event.get('pickupDate')
        pickup_time_interval      = event.get('pickupTimeInterval')
        dropoff_date              = event.get('dropoffDate')
        dropoff_time_interval     = event.get('dropoffTimeInterval')
        coupon                    = event.get('coupon')
        total_cost                = event.get('totalCost')
        sub_total                 = event.get('subTotal', 0)
        grand_total               = event.get('grandTotal', 0)
        discounted_price          = event.get('discountedPrice', 0)
        pay_now                   = event.get('isPayNow')
        tip_data                  = event.get('tip', {})
        laundry_bags              = event.get('laundryBags', 1)
        card_payment_method_id    = event.get('cardPaymentMethodId')
        terminal_payment_method_id = event.get('terminalPaymentMethodId')
        is_terminal_payment       = event.get('isTerminalPayment', False)
        terminal_intent_id        = event.get('terminalPaymentIntentId', '')
        order_id                  = generate_order_id("CL-")

        if total_cost is None:
            return {'status': 'error', 'message': 'totalCost is required and cannot be null.'}

        cur = db.get_cursor()

        # ── Fetch customer ────────────────────────────────────────────────────
        cur.execute("""
            SELECT customer_id, first_name, last_name, email, phone_number,
                   special_instructions
            FROM shop.customers WHERE customer_id = %s
        """, (customer_id,))
        customer = cur.fetchone()
        if not customer:
            return {'status': 'error', 'message': 'Customer does not exist'}

        if save_special_instructions and special_instructions:
            cur.execute("""
                UPDATE shop.customers SET special_instructions = %s WHERE customer_id = %s
            """, (special_instructions, customer_id))

        # ── Resolve / create address ──────────────────────────────────────────
        if new_address:
            cur.execute("""
                SELECT address_id FROM shop.customer_addresses
                WHERE customer_id = %s AND address = %s AND is_active = TRUE LIMIT 1
            """, (customer_id, new_address))
            addr_row = cur.fetchone()
            if addr_row:
                address_id = addr_row['address_id']
            else:
                address_id = str(uuid.uuid4())
                cur.execute("""
                    INSERT INTO shop.customer_addresses
                        (address_id, customer_id, address, door_number, address_instructions)
                    VALUES (%s,%s,%s,%s,%s)
                """, (address_id, customer_id, new_address, door_number, address_instructions))

        # ── Coerce decimals ───────────────────────────────────────────────────
        total_cost       = float(Decimal(str(total_cost)).quantize(Decimal('0.01')))
        sub_total        = float(Decimal(str(sub_total)).quantize(Decimal('0.01')))
        grand_total      = float(Decimal(str(grand_total)).quantize(Decimal('0.01')))
        discounted_price = float(Decimal(str(discounted_price)).quantize(Decimal('0.01')))
        laundry_bags     = int(laundry_bags)
        tip_amount       = float(Decimal(str(tip_data.get('tipAmount', '0.00'))).quantize(Decimal('0.01')))
        amount_to_collect = total_cost + tip_amount

        order_status   = OrderStatus.RECEIVED.value
        order_type     = "Commercial"
        current_time   = get_current_timestamp()
        payment_status = PaymentStatus.PAYMENT_INITIATED.value
        final_payments = []

        # ── Payment ───────────────────────────────────────────────────────────
        if pay_now:
            if is_terminal_payment:
                final_payments = [{'amount': amount_to_collect, 'paymentIntentId': terminal_intent_id, 'paymentMethod': 'Card'}]
                payment_status = PaymentStatus.PAYMENT_SUCCESS.value
                store_save_card(customer_id, customer_payment_id, laundry_id, terminal_payment_method_id, terminal_intent_id)
            elif not card_payment_method_id:
                final_payments = [{'amount': amount_to_collect, 'paymentIntentId': None, 'paymentMethod': 'Cash'}]
                payment_status = PaymentStatus.PAYMENT_SUCCESS.value
            else:
                payment_response = capture_store_payment(
                    card_payment_id=card_payment_method_id,
                    order_amount=amount_to_collect,
                    laundry_id=laundry_id,
                    description=f'Commercial | Order ID: {order_id} | Customer ID: {customer_id}',
                    save_card=save_card,
                    customer_id=customer_id,
                    customer_payment_id=customer_payment_id
                )
                if payment_response['status'] != 'success':
                    return {'status': 'error', 'message': payment_response.get('message', 'Card payment failed')}
                final_payments = [{'amount': amount_to_collect, 'paymentIntentId': payment_response['paymentIntentId'], 'paymentMethod': 'Card'}]
                payment_status = PaymentStatus.PAYMENT_SUCCESS.value

        # ── Insert order ──────────────────────────────────────────────────────
        db.set_emp_id(None)  # commercial orders placed by customer, no emp
        cur.execute("""
            INSERT INTO orders.orders (
                order_id, laundry_id, customer_id, address_id,
                order_type, order_status, status_category, payment_status,
                pickup_date, pickup_time_interval, dropoff_date, dropoff_time_interval,
                laundry_bags, special_instructions, coupon,
                sub_total, discounted_price, total_cost, grand_total,
                auto_generated, is_reviewed, cancel_reason,
                created_at, updated_at
            ) VALUES (
                %s,%s,%s,%s,'Commercial',%s,'Active',%s,
                %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                FALSE,FALSE,%s,NOW(),NOW()
            )
        """, (
            order_id, laundry_id, customer_id, address_id or None,
            order_status, payment_status,
            pickup_date, pickup_time_interval, dropoff_date, dropoff_time_interval,
            laundry_bags, special_instructions, coupon,
            sub_total, discounted_price, total_cost, grand_total,
            cancel_reason,
        ))

        # services
        for svc in (services or []):
            cur.execute("""
                INSERT INTO orders.order_services (order_id, service_name, service_price, weight_or_count)
                VALUES (%s,%s,%s,%s)
            """, (order_id, svc.get('serviceName'), float(svc.get('servicePrice', 0)), float(svc.get('weightOrCount', 0))))

        # products
        for prod in (products or []):
            cur.execute("""
                INSERT INTO orders.order_products (order_id, product_name, product_price, product_count)
                VALUES (%s,%s,%s,%s)
            """, (order_id, prod.get('productName'), float(prod.get('unitPrice', 0)), int(prod.get('quantity', 1))))

        # tip
        if tip_amount > 0:
            cur.execute("""
                INSERT INTO orders.order_tips (order_id, tip_amount, tip_percentage, tip_type, tip_method)
                VALUES (%s,%s,%s,%s,%s) ON CONFLICT (order_id) DO NOTHING
            """, (order_id, tip_amount, tip_data.get('tipPercentage'),
                  tip_data.get('tipType'), tip_data.get('tipMethod')))

        # payments
        for p in final_payments:
            if p.get('paymentIntentId') or p.get('paymentMethod') == 'Cash':
                cur.execute("""
                    INSERT INTO orders.order_payments (order_id, payment_intent_id, amount, payment_method)
                    VALUES (%s,%s,%s,%s)
                """, (order_id, p.get('paymentIntentId'), p['amount'], p.get('paymentMethod')))

        db.commit()

        # ── Notifications ─────────────────────────────────────────────────────
        laundry_info = fetch_laundry_info(laundry_id)
        order_dict = {
            'orderId': order_id, 'customerId': customer_id, 'laundryId': laundry_id,
            'services': services or [], 'pickupDate': pickup_date,
            'pickupTimeInterval': pickup_time_interval, 'dropoffDate': dropoff_date,
            'dropoffTimeInterval': dropoff_time_interval,
        }
        send_commercial_order_notification(
            recipient_email=customer['email'],
            subject=f"Your Commercial Order {order_id} is Confirmed",
            order_details=order_dict, laundry_info=laundry_info, is_customer=True)
        send_commercial_order_notification(
            recipient_email=laundry_info.get('contactDetails', {}).get('email', ''),
            subject=f"New Commercial Order {order_id} Received",
            order_details=order_dict, laundry_info=laundry_info, is_customer=False)

        publish_order_metric("SuccessfulOrders", order_type="Commercial", laundry_id=laundry_id, status="success")
        logger.info("✅ Commercial order placed: %s", order_id)
        return {'status': 'success', 'orderId': order_id}

    except Exception as e:
        db.rollback()
        logger.exception("❌ Error placing commercial order")
        publish_order_metric("FailedOrders", order_type="Commercial", customer_id=customer_id,
                             laundry_id=laundry_id, status="failed")
        if pay_now and card_payment_method_id:
            handle_rollback(frequency_id, payment_intent_id, laundry_id)
        return {'status': 'error', 'message': f"An error occurred: {str(e)}"}
