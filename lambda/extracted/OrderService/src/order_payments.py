"""
order_payments.py — payment helpers for OrderService.
All payment operations delegate to PaymentService Lambda.
The only DynamoDB reference (frequency rollback) is migrated to PostgreSQL.
"""
import json
import logging
import boto3
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handle_rollback(frequency_id, payment_intent_id, laundry_id):
    logger.info("Initiating rollback: frequency_id=%s payment_intent_id=%s", frequency_id, payment_intent_id)
    try:
        if frequency_id:
            cur = db.get_cursor()
            cur.execute("DELETE FROM orders.laundry_frequency WHERE frequency_id = %s", (frequency_id,))
            db.commit()
            logger.info("Frequency record deleted: %s", frequency_id)
        if payment_intent_id:
            cancel_payment_intent(payment_intent_id, laundry_id)
    except Exception as e:
        db.rollback()
        logger.exception("Rollback error: %s", e)


def cancel_payment_intent(payment_intent_id, laundry_id):
    try:
        boto3.client('lambda').invoke(
            FunctionName='PaymentService',
            InvocationType='RequestResponse',
            Payload=json.dumps({
                'orderPaymentOperation': 'cancelHold',
                'paymentIntentId': payment_intent_id,
                'laundryId': laundry_id
            })
        )
    except Exception as e:
        logger.exception("cancel_payment_intent error: %s", e)


def create_payment_hold(customer_id, laundry_id, description):
    try:
        resp = boto3.client('lambda').invoke(
            FunctionName='PaymentService',
            InvocationType='RequestResponse',
            Payload=json.dumps({
                'orderPaymentOperation': 'createHold',
                'customerPaymentId': customer_id,
                'laundryId': laundry_id,
                'description': description,
                'amount': 1
            })
        )
        payload = json.loads(resp['Payload'].read())
        if payload.get('status') != 'success':
            return {'status': 'error', 'message': 'Failed to create payment hold.'}
        return payload
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


def capture_store_payment(card_payment_id, order_amount, laundry_id, description,
                          save_card=False, customer_id=None, customer_payment_id=None):
    try:
        payload = {
            'orderPaymentOperation': 'holdStorePayment',
            'cardPaymentId': card_payment_id,
            'laundryId': laundry_id,
            'amount': float(order_amount),
            'description': description,
            'saveCard': save_card
        }
        if customer_id:
            payload['customerId'] = customer_id
        if customer_payment_id:
            payload['customerPaymentId'] = customer_payment_id

        resp = boto3.client('lambda').invoke(
            FunctionName='PaymentService', InvocationType='RequestResponse',
            Payload=json.dumps(payload))
        result = json.loads(resp['Payload'].read())
        if result.get('status') != 'success':
            return {'status': 'error', 'message': 'Failed to create payment hold.'}
        return result
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


def capture_product_store_payment(card_payment_id, order_amount, laundry_id, order_id,
                                  intent_description="", customer_id=None):
    try:
        resp = boto3.client('lambda').invoke(
            FunctionName='PaymentService', InvocationType='RequestResponse',
            Payload=json.dumps({
                'orderPaymentOperation': 'captureStorePayment',
                'cardPaymentId': card_payment_id,
                'laundryId': laundry_id,
                'amount': float(order_amount),
                'orderId': order_id,
                'intentDescription': intent_description,
                'customerId': customer_id
            }))
        result = json.loads(resp['Payload'].read())
        if result.get('status') != 'success':
            return {'status': 'error', 'message': 'Failed to capture payment.'}
        return result
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


def invoke_refund_payment(payment_intent_id, description, amount):
    try:
        resp = boto3.client('lambda').invoke(
            FunctionName='PaymentService', InvocationType='RequestResponse',
            Payload=json.dumps({
                'orderPaymentOperation': 'refundPayment',
                'paymentIntentId': payment_intent_id,
                'description': description,
                'amount': float(amount)
            }))
        return json.loads(resp['Payload'].read())
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


def store_save_card(customer_id, customer_payment_id, laundry_id, card_payment_id, payment_intent_id):
    try:
        resp = boto3.client('lambda').invoke(
            FunctionName='PaymentService', InvocationType='RequestResponse',
            Payload=json.dumps({
                'orderPaymentOperation': 'saveStoreCustomerCard',
                'customerId': customer_id,
                'customerPaymentId': customer_payment_id,
                'laundryId': laundry_id,
                'cardPaymentId': card_payment_id,
                'paymentIntentId': payment_intent_id
            }))
        return json.loads(resp['Payload'].read())
    except Exception as e:
        return {'status': 'error', 'message': str(e)}
