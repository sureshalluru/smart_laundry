"""
instore_payments.py — in-store payment capture and reconciliation.
PostgreSQL + audit triggers.
"""
from utils import get_single_order_details, recalc_tip_if_percentage
from utils import capture_hold_store_payment, execute_order_update, calculate_total_cost
from utils import capture_store_payment, convert_decimals, get_current_timestamp
from decimal import Decimal, ROUND_HALF_UP
from order_history import log_order_update   # correct import — NOT order_updates
from enum import Enum
import logging
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)


class OrderStatus(Enum):
    ORDER_SUBMITTED      = "OrderSubmitted"
    ORDER_PICKED_UP      = "OrderPickedUp"
    READY_FOR_INTAKE     = "ReadyForIntake"
    RECEIVED             = "ReceivedAtFacility"
    PROCESSING_STARTED   = "ProcessingStarted"
    PROCESSING_COMPLETED = "ProcessingCompleted"
    EN_ROUTE_TO_DELIVERY = "EnRouteToDelivery"
    DELIVERED            = "Delivered"
    ORDER_CANCELED       = "OrderCanceled"


# ── helpers ───────────────────────────────────────────────────────────────────

def _update_and_log(order_id, laundry_id, emp_id, update_expression, expression_values, audit_details):
    """
    Set the session emp_id (so DB triggers record who made the change),
    execute the update, then write to order_history.
    """
    db.set_emp_id(emp_id)
    updated = execute_order_update(order_id, update_expression, expression_values)
    log_order_update(laundry_id, order_id, emp_id, audit_details)
    return updated


# ── payLaterInStorePayment ────────────────────────────────────────────────────

def payLaterInStorePayment(order_id, laundry_id, is_cash, card_payment_method_id, emp_id,
                           is_cash_refunded, is_extra_cash_received, excess_tip_amount,
                           isTerminalPayment, terminalAmount, terminalPaymentIntentId):
    try:
        _, current_order = get_single_order_details('getSingleOrder', laundry_id, order_id)
        if not current_order:
            return {'status': 'error', 'message': f"Order {order_id} not found."}

        tip_info   = current_order.get('tip', {})
        customer_id = current_order.get('customerId')
        tip_type   = tip_info.get('tipType', 'custom')
        tip_amount = tip_info.get('tipAmount', 0)
        tip_info['tipReceiverId'] = emp_id

        existing_payment_intents = current_order.get('finalPaymentIntentId', [])
        total_cost   = current_order.get("totalCost", 0)
        combined_cost = total_cost + tip_amount

        # ── Existing payment intents ──────────────────────────────────────────
        if existing_payment_intents:
            existing_total = existing_payment_intents[0].get('amount')
            payment_method = existing_payment_intents[0].get('paymentMethod')

            # Exact match
            if combined_cost == existing_total and not card_payment_method_id:
                if payment_method == 'Cash':
                    updated = _update_and_log(
                        order_id, laundry_id, emp_id,
                        "SET paymentStatus = :ps, orderStatus = :os, updatedAt = :ua, tip = :t",
                        {':ps': 'Paid', ':os': OrderStatus.EN_ROUTE_TO_DELIVERY.value,
                         ':ua': get_current_timestamp(), ':t': tip_info},
                        {'paymentStatus': {'old': current_order.get('paymentStatus'), 'new': 'Paid'},
                         'orderStatus': {'old': current_order.get('orderStatus'), 'new': OrderStatus.EN_ROUTE_TO_DELIVERY.value}}
                    )
                    updated['customerName'] = current_order.get('customerName')
                    updated['customerPhone'] = current_order.get('customerPhone')
                    return {'status': 'success', 'message': f"Payment processed for Order {order_id}.",
                            'updatedOrder': convert_decimals(updated)}

                elif payment_method == 'Card':
                    intent_id = existing_payment_intents[0]['paymentIntentId']
                    resp = capture_hold_store_payment(intent_id, combined_cost, laundry_id)
                    if resp.get('status') != 'success':
                        return {'status': 'error', 'message': resp.get('message', 'Error processing card capture.')}
                    updated = _update_and_log(
                        order_id, laundry_id, emp_id,
                        "SET paymentStatus = :ps, orderStatus = :os, updatedAt = :ua, tip = :t",
                        {':ps': 'Paid', ':os': OrderStatus.EN_ROUTE_TO_DELIVERY.value,
                         ':ua': get_current_timestamp(), ':t': tip_info},
                        {'paymentStatus': {'old': current_order.get('paymentStatus'), 'new': 'Paid'},
                         'orderStatus': {'old': current_order.get('orderStatus'), 'new': OrderStatus.EN_ROUTE_TO_DELIVERY.value}}
                    )
                    updated['customerName'] = current_order.get('customerName')
                    updated['customerPhone'] = current_order.get('customerPhone')
                    return {'status': 'success', 'message': f"Payment processed for Order {order_id}.",
                            'updatedOrder': convert_decimals(updated)}

            # Refund excess
            elif combined_cost < existing_total and not card_payment_method_id:
                if payment_method == 'Card':
                    if tip_type == 'percentage':
                        new_tip = recalc_tip_if_percentage(total_cost, tip_info)
                        tip_info['tipAmount'] = new_tip
                        combined_cost = total_cost + new_tip
                    resp = capture_hold_store_payment(existing_payment_intents[0]['paymentIntentId'], combined_cost, laundry_id)
                    if resp.get('status') != 'success':
                        return {'status': 'error', 'message': resp.get('message', 'Error processing refund.')}
                elif payment_method == 'Cash':
                    if not is_cash_refunded:
                        return {'status': 'error', 'message': "Excess cash payment not refunded."}
                    if tip_type == 'percentage':
                        new_tip = recalc_tip_if_percentage(total_cost, tip_info)
                        tip_info['tipAmount'] = new_tip
                        combined_cost = total_cost + new_tip

                final_payment_intent_id = [{'amount': combined_cost,
                                             'paymentIntentId': existing_payment_intents[0].get('paymentIntentId'),
                                             'paymentMethod': payment_method}]
                updated = _update_and_log(
                    order_id, laundry_id, emp_id,
                    "SET finalPaymentIntentId = :f, paymentStatus = :ps, orderStatus = :os, updatedAt = :ua, tip = :t",
                    {':f': final_payment_intent_id, ':ps': 'Paid',
                     ':os': OrderStatus.EN_ROUTE_TO_DELIVERY.value,
                     ':ua': get_current_timestamp(), ':t': tip_info},
                    {'paymentStatus': {'old': current_order.get('paymentStatus'), 'new': 'Paid'},
                     'orderStatus': {'old': current_order.get('orderStatus'), 'new': OrderStatus.EN_ROUTE_TO_DELIVERY.value},
                     'tip': {'old': current_order.get('tip', {}), 'new': tip_info}}
                )
                updated['customerName'] = current_order.get('customerName')
                updated['customerPhone'] = current_order.get('customerPhone')
                return {'status': 'success', 'message': f"Excess payment refunded for Order {order_id}.",
                        'updatedOrder': convert_decimals(updated)}

            # Extra payment needed
            elif combined_cost > existing_total:
                difference = combined_cost - existing_total
                new_payment_entry = {}

                if excess_tip_amount:
                    try:
                        excess_tip_amount = Decimal(str(excess_tip_amount))
                    except Exception as e:
                        return {'status': 'error', 'message': f"Invalid tip amount: {excess_tip_amount}. Error: {str(e)}"}
                    difference += excess_tip_amount
                    tip_info['tipAmount'] = tip_info.get('tipAmount', 0) + excess_tip_amount
                    combined_cost += excess_tip_amount

                if is_extra_cash_received:
                    if payment_method == 'Card':
                        resp = capture_hold_store_payment(existing_payment_intents[0].get('paymentIntentId'), existing_total, laundry_id)
                        if resp.get('status') != 'success':
                            return {'status': 'error', 'message': "Failed to finalize original card hold."}
                    new_payment_entry = {'amount': difference, 'paymentIntentId': None, 'paymentMethod': 'Cash'}
                else:
                    if isTerminalPayment:
                        if not terminalAmount or not terminalPaymentIntentId:
                            return {'status': 'error', 'message': "Terminal Payment Details are missing"}
                        new_payment_entry = {'amount': terminalAmount, 'paymentIntentId': terminalPaymentIntentId, 'paymentMethod': 'Card'}
                    else:
                        if not card_payment_method_id:
                            return {'status': 'error', 'message': "Card details required for remaining balance."}
                        resp = capture_store_payment(card_payment_method_id, difference, laundry_id, customer_id, order_id)
                        if resp.get('status') != 'success':
                            return {'status': 'error', 'message': resp.get('message', 'Error capturing card payment.')}
                        new_payment_entry = {'amount': difference, 'paymentIntentId': resp['paymentIntentId'], 'paymentMethod': 'Card'}
                    if payment_method == 'Card':
                        resp = capture_hold_store_payment(existing_payment_intents[0].get('paymentIntentId'), existing_total, laundry_id)
                        if resp.get('status') != 'success':
                            return {'status': 'error', 'message': "Previous hold capture failed."}

                existing_payment_intents.append(new_payment_entry)
                updated = _update_and_log(
                    order_id, laundry_id, emp_id,
                    "SET finalPaymentIntentId = :f, paymentStatus = :ps, orderStatus = :os, updatedAt = :ua, tip = :t",
                    {':f': existing_payment_intents, ':ps': 'Paid',
                     ':os': OrderStatus.EN_ROUTE_TO_DELIVERY.value,
                     ':ua': get_current_timestamp(), ':t': tip_info},
                    {'paymentStatus': {'old': current_order.get('paymentStatus'), 'new': 'Paid'},
                     'orderStatus': {'old': current_order.get('orderStatus'), 'new': OrderStatus.EN_ROUTE_TO_DELIVERY.value},
                     'tip': {'old': current_order.get('tip', {}), 'new': tip_info}}
                )
                updated['customerName'] = current_order.get('customerName')
                updated['customerPhone'] = current_order.get('customerPhone')
                return {'status': 'success', 'message': f"Additional payment collected for Order {order_id}.",
                        'updatedOrder': convert_decimals(updated)}

            else:
                if card_payment_method_id:
                    return {'status': 'error', 'message': "Received Card Details but couldn't reconcile amounts."}
                return {'status': 'error', 'message': f"Combined cost ({combined_cost}) exceeds existing payment ({existing_total})."}

        # ── No existing payment intents — new payment ─────────────────────────
        final_payment_intent_id = []
        if tip_type == 'percentage':
            new_tip = recalc_tip_if_percentage(total_cost, tip_info)
            tip_info['tipAmount'] = new_tip
            combined_cost = total_cost + new_tip

        if is_cash:
            final_payment_intent_id = [{'amount': combined_cost, 'paymentIntentId': None, 'paymentMethod': 'Cash'}]
        elif isTerminalPayment:
            if not terminalAmount or not terminalPaymentIntentId:
                return {'status': 'error', 'message': "Terminal Payment Details are missing"}
            final_payment_intent_id = [{'amount': terminalAmount, 'paymentIntentId': terminalPaymentIntentId, 'paymentMethod': 'Card'}]
        else:
            if not card_payment_method_id:
                return {'status': 'error', 'message': "Card Information not received"}
            resp = capture_store_payment(card_payment_method_id, combined_cost, laundry_id, customer_id, order_id)
            if resp.get('status') != 'success':
                return {'status': 'error', 'message': resp.get('message', 'Error capturing card payment')}
            final_payment_intent_id = [{'amount': combined_cost, 'paymentIntentId': resp['paymentIntentId'], 'paymentMethod': 'Card'}]

        updated = _update_and_log(
            order_id, laundry_id, emp_id,
            "SET finalPaymentIntentId = :f, paymentStatus = :ps, orderStatus = :os, updatedAt = :ua, tip = :t",
            {':f': final_payment_intent_id, ':ps': 'Paid',
             ':os': OrderStatus.EN_ROUTE_TO_DELIVERY.value,
             ':ua': get_current_timestamp(), ':t': tip_info},
            {'paymentStatus': {'old': current_order.get('paymentStatus'), 'new': 'Paid'},
             'orderStatus': {'old': current_order.get('orderStatus'), 'new': OrderStatus.EN_ROUTE_TO_DELIVERY.value},
             'tip': {'old': current_order.get('tip', {}), 'new': tip_info}}
        )
        updated['customerName'] = current_order.get('customerName')
        updated['customerPhone'] = current_order.get('customerPhone')
        return {'status': 'success', 'message': f"Payment captured for Order {order_id}.",
                'updatedOrder': convert_decimals(updated)}

    except Exception as e:
        logger.exception("payLaterInStorePayment error")
        return {'status': 'error', 'message': str(e)}


# ── inStoreOnlinePayment ──────────────────────────────────────────────────────

def inStoreOnlinePayment(card_payment_method_id, order_id, laundry_id, customer_id):
    try:
        _, current_order = get_single_order_details('getSingleOrder', laundry_id, order_id)
        if not current_order:
            return {'status': 'error', 'message': f"Order {order_id} not found."}

        sub_total = Decimal(str(current_order.get('subTotal') or
                               calculate_total_cost(current_order.get('services', []), current_order.get('products', []))))
        tip_info  = current_order.get('tip', {})
        tip_type  = tip_info.get('tipType', 'custom')
        tip_amount = tip_info.get('tipAmount', 0)
        total_cost = current_order.get('totalCost', 0)

        if tip_type == 'percentage':
            tip_amount = recalc_tip_if_percentage(total_cost, tip_info)
            tip_info['tipAmount'] = tip_amount

        grand_total   = total_cost + tip_amount
        combined_cost = grand_total

        resp = capture_store_payment(card_payment_method_id, combined_cost, laundry_id, customer_id, order_id)
        if resp.get('status') != 'success':
            return {'status': 'error', 'message': resp.get('message', 'Error capturing card payment.')}

        final_payment_intent_id = [{'amount': combined_cost, 'paymentIntentId': resp['paymentIntentId'], 'paymentMethod': 'Card'}]

        # No emp_id available here — customer-initiated payment; trigger will record NULL emp
        db.set_emp_id(None)
        updated = execute_order_update(order_id,
            "SET finalPaymentIntentId = :f, paymentStatus = :ps, updatedAt = :ua, tip = :t, subTotal = :subTotal, totalCost = :totalCost, grandTotal = :grandTotal",
            {':f': final_payment_intent_id, ':ps': 'Paid', ':ua': get_current_timestamp(),
             ':t': tip_info, ':subTotal': sub_total, ':totalCost': total_cost, ':grandTotal': grand_total})

        return {'status': 'success', 'message': f"Payment captured for Order {order_id}.",
                'updatedOrder': convert_decimals(updated)}

    except Exception as e:
        logger.exception("inStoreOnlinePayment error")
        return {'status': 'error', 'message': str(e)}


# ── payLaterInStorePaymentTest ────────────────────────────────────────────────

def payLaterInStorePaymentTest(order_id, laundry_id, employee_id, tip_payload, payment_updates, is_cash_refunded=False):
    logger.info("=== payLaterInStorePaymentTest START: order=%s laundry=%s ===", order_id, laundry_id)
    try:
        _, order = get_single_order_details('getSingleOrder', laundry_id, order_id)
        if not order:
            return {"status": "error", "message": f"Order {order_id} not found."}

        sub_total  = Decimal(str(order.get('subTotal') or
                                 calculate_total_cost(order.get('services', []), order.get('products', []))))
        total_cost = Decimal(str(order['totalCost']))
        existing_intents = order.get("finalPaymentIntentId", [])
        old_tip    = order.get("tip", {})
        customer_id = order.get("customerId")

        # Tip recalculation
        if tip_payload.get("tipType") == "percentage":
            pct = Decimal(str(tip_payload.get("tipPercentage", 0))) / Decimal(100)
            tip_payload["tipAmount"] = (sub_total * pct).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        tip_amount = tip_payload.get("tipAmount")
        if tip_amount is None:
            return {"status": "error", "message": "tipAmount is required."}

        new_tip_amount = Decimal(str(tip_amount))
        tip_payload["tipReceiverId"] = employee_id

        grand_total  = (total_cost + new_tip_amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        new_combined = grand_total

        if existing_intents:
            existing       = existing_intents[0]
            existing_amount = Decimal(str(existing["amount"]))
        else:
            existing        = None
            existing_amount = Decimal("0")

        diff = new_combined - existing_amount

        # Refund
        if diff < 0:
            method = existing["paymentMethod"]
            if method in ("Card", "Terminal"):
                resp = capture_hold_store_payment(existing["paymentIntentId"], new_combined, laundry_id)
                if resp.get("status") != "success":
                    return {"status": "error", "message": resp.get("message", "Refund failed.")}
                existing_intents[0]["amount"] = new_combined
            else:
                if not is_cash_refunded:
                    return {"status": "error", "message": "Cash refund not confirmed."}
                existing_intents[0]["amount"] = new_combined

        # Extra collection
        elif diff > 0:
            if not payment_updates:
                return {"status": "error", "message": "No payment update provided for extra amount."}
            upd    = payment_updates[0]
            amt    = Decimal(str(upd.get("amount", "0")))
            method = upd.get("paymentMethod")
            pid    = upd.get("paymentIntentId")

            if amt <= 0 or not method:
                return {"status": "error", "message": "Invalid payment update: amount or method missing."}

            if method == "Card":
                if not pid:
                    return {"status": "error", "message": "paymentIntentId required for Card payments."}
                cap = capture_store_payment(pid, amt, laundry_id, customer_id, order_id)
                if cap.get("status") != "success":
                    return {"status": "error", "message": cap.get("message", "Card capture failed.")}
                pid = cap["paymentIntentId"]

            existing_intents.append({"amount": amt, "paymentIntentId": pid, "paymentMethod": method})

            if existing and existing["paymentMethod"] in ("Card", "Terminal"):
                resp_old = capture_hold_store_payment(existing["paymentIntentId"], existing_amount, laundry_id)
                if resp_old.get("status") != "success":
                    return {"status": "error", "message": resp_old.get("message", "Finalize old payment failed.")}

        # Exact match
        else:
            if existing and existing["paymentMethod"] in ("Card", "Terminal"):
                resp0 = capture_hold_store_payment(existing["paymentIntentId"], existing_amount, laundry_id)
                if resp0.get("status") != "success":
                    return {"status": "error", "message": resp0.get("message", "Finalize payment failed.")}

        # Build update expression
        is_commercial = order.get("orderType") == "Commercial"
        if is_commercial:
            update_expr = "SET finalPaymentIntentId = :f, tip = :t, paymentStatus = :ps, updatedAt = :ua, subTotal = :subTotal, grandTotal = :grandTotal"
            expr_vals = {":f": existing_intents, ":t": tip_payload, ":ps": "Paid",
                         ":ua": get_current_timestamp(), ":subTotal": sub_total, ":grandTotal": grand_total}
        else:
            update_expr = "SET finalPaymentIntentId = :f, tip = :t, paymentStatus = :ps, orderStatus = :os, updatedAt = :ua, subTotal = :subTotal, grandTotal = :grandTotal"
            expr_vals = {":f": existing_intents, ":t": tip_payload, ":ps": "Paid",
                         ":os": OrderStatus.EN_ROUTE_TO_DELIVERY.value,
                         ":ua": get_current_timestamp(), ":subTotal": sub_total, ":grandTotal": grand_total}

        audit_details = {
            "finalPaymentIntentId": {"old": order.get("finalPaymentIntentId", []), "new": existing_intents},
            "tip": {"old": old_tip, "new": tip_payload},
            "paymentStatus": {"old": order.get("paymentStatus"), "new": "Paid"},
            "subTotal": {"old": order.get("subTotal"), "new": sub_total},
            "grandTotal": {"old": order.get("grandTotal"), "new": grand_total},
        }
        if not is_commercial:
            audit_details["orderStatus"] = {"old": order.get("orderStatus"), "new": OrderStatus.EN_ROUTE_TO_DELIVERY.value}

        updated = _update_and_log(order_id, laundry_id, employee_id, update_expr, expr_vals, audit_details)
        updated["customerName"] = order.get("customerName")
        updated["customerPhone"] = order.get("customerPhone")

        return {"status": "success", "message": f"Order {order_id} payment updated.",
                "updatedOrder": convert_decimals(updated)}

    except Exception as e:
        logger.exception("payLaterInStorePaymentTest error")
        return {"status": "error", "message": str(e)}
