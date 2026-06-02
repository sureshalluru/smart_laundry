"""
OrderFrequencyService — migrated from DynamoDB to PostgreSQL.
Scheduled Lambda: scans laundry_frequency records and auto-creates orders
for customers whose weekly/biweekly cycle is due today.
"""
import json
import uuid
import logging
import boto3
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from enum import Enum
import traceback
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda')
UBER_LAMBDA_NAME = "UberIntegration"


# ── Enums ─────────────────────────────────────────────────────────────────────

class OrderStatus(Enum):
    ORDER_SUBMITTED = "OrderSubmitted"

class PaymentStatus(Enum):
    PAYMENT_INITIATED = 'Unpaid'
    PAYMENT_FAILED    = 'Failed'
    PAYMENT_PENDING   = 'Pending'
    PAYMENT_PAID      = 'Paid'

class OrderType(Enum):
    ONLINE = 'Online'


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_current_timestamp():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def generate_order_id(prefix):
    return f"{prefix}{uuid.uuid4().hex[:6].upper()}"


# ── DB helpers ────────────────────────────────────────────────────────────────

def fetch_frequency_records():
    """Return all active frequency records from orders.laundry_frequency."""
    cur = db.get_cursor()
    # cur.execute("""
    #     SELECT lf.frequency_id, lf.customer_id, lf.laundry_id, lf.address_id,
    #            lf.frequency, lf.frequency_start_date,
    #            lf.pickup_time_interval, lf.dropoff_time_interval,
    #            lf.special_instructions, lf.laundry_bags,
    #            lf.coupon, lf.uber_pickup_frequency, lf.uber_dropoff_frequency,
    #            lf.tip_amount, lf.tip_percentage, lf.tip_type, lf.tip_method, lf.tip_receiver_id
    #     FROM orders.laundry_frequency lf
    #     WHERE lf.is_active = TRUE
    # """)
    cur.execute("""
        SELECT lf.frequency_id, lf.customer_id, lf.laundry_id, lf.address_id,
               lf.frequency, lf.frequency_start_date,
               lf.pickup_time_interval, lf.dropoff_time_interval,
               lf.special_instructions, lf.laundry_bags,
               lf.coupon,
               lf.tip_amount, lf.tip_percentage, lf.tip_type, lf.tip_method
        FROM orders.laundry_frequency lf
        WHERE lf.is_active = TRUE
    """)
    rows = cur.fetchall()

    # Fetch services per frequency record
    records = []
    for row in rows:
        r = dict(row)
        # TEMP: Uber disabled
        r['uber_pickup_frequency'] = False
        r['uber_dropoff_frequency'] = False
        cur.execute("""
            SELECT service_name AS "serviceName", service_price AS "servicePrice",
                   weight_or_count AS "weightOrCount"
            FROM orders.laundry_frequency_services
            WHERE frequency_id = %s
        """, (r['frequency_id'],))
        r['services'] = [dict(s) for s in cur.fetchall()]
        records.append(r)

    return records


def fetch_laundry_info(laundry_id):
    """Fetch laundry shop info from PostgreSQL."""
    cur = db.get_cursor()
    cur.execute("""
        SELECT laundry_id, laundry_name, contact_email, contact_phone,
               street, city, state, zip_code, country,
               pickup_dropoff_instructions
        FROM shop.laundry_shops
        WHERE laundry_id = %s
    """, (laundry_id,))
    row = cur.fetchone()
    if not row:
        raise ValueError(f"No laundry found for laundryId: {laundry_id}")
    r = dict(row)
    return {
        'laundryId':   r['laundry_id'],
        'laundryName': r['laundry_name'],
        'contactDetails': {
            'email':       r['contact_email'],
            'phoneNumber': r['contact_phone'],
        },
        'laundryAddress': {
            'street':  r['street'],  'city':    r['city'],
            'state':   r['state'],   'zipCode': r['zip_code'],
            'country': r['country'],
        },
        'address': f"{r['street']}, {r['city']}, {r['state']} {r['zip_code']}, {r['country']}",
        'pickupDropoffInstructions': r['pickup_dropoff_instructions'],
        'uberEnv': {},
    }


def fetch_customer_info(customer_id, laundry_id):
    """Fetch customer + payment profile from PostgreSQL."""
    cur = db.get_cursor()
    cur.execute("""
        SELECT c.customer_id, c.first_name, c.last_name, c.phone_number,
               c.email, c.notif_email, c.notif_sms,
               cpp.stripe_customer_id AS payment_method_id
        FROM shop.customers c
        LEFT JOIN shop.customer_payment_profiles cpp
          ON cpp.customer_id = c.customer_id AND cpp.laundry_id = %s
        WHERE c.customer_id = %s
    """, (laundry_id, customer_id))
    row = cur.fetchone()
    if not row:
        return None
    return dict(row)


def fetch_customer_address(customer_id, address_id):
    """Return address string and instructions for a given address_id."""
    cur = db.get_cursor()
    cur.execute("""
        SELECT address, address_instructions
        FROM shop.customer_addresses
        WHERE customer_id = %s AND address_id = %s
    """, (customer_id, address_id))
    row = cur.fetchone()
    if not row:
        return None, None
    return row['address'], row['address_instructions']


def update_frequency_start_date(frequency_id, days_to_advance):
    """Advance frequency_start_date by days_to_advance so the next cycle is correct."""
    cur = db.get_cursor()
    cur.execute("""
        UPDATE orders.laundry_frequency
        SET frequency_start_date = frequency_start_date + INTERVAL '%s days',
            updated_at = NOW()
        WHERE frequency_id = %s
    """, (days_to_advance, frequency_id))
    db.commit()
    logger.info("Updated frequency_start_date for frequency_id=%s (+%s days)", frequency_id, days_to_advance)


def insert_order(order_id, customer_id, laundry_id, address_id, services, tip_data,
                 pickup_date, dropoff_date, pickup_time_interval, dropoff_time_interval,
                 special_instructions, laundry_bags, coupon, frequency,
                 payment_status, payment_intent_id):
    """Insert order + services + tip into PostgreSQL."""
    cur = db.get_cursor()
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
            %s,%s,%s,%s,
            'Online','OrderSubmitted','Active',%s,
            %s,%s,%s,%s,
            %s,%s,%s,
            1.00,1.00,1.00,
            %s,TRUE,FALSE,'',
            %s,NOW(),NOW()
        )
    """, (
        order_id, laundry_id, customer_id, address_id,
        payment_status,
        pickup_date, pickup_time_interval, dropoff_date, dropoff_time_interval,
        laundry_bags, special_instructions, coupon,
        frequency or None,
        payment_intent_id,
    ))

    for svc in services:
        cur.execute("""
            INSERT INTO orders.order_services (order_id, service_name, service_price, weight_or_count)
            VALUES (%s,%s,%s,%s)
        """, (
            order_id,
            svc.get('serviceName'),
            float(svc.get('servicePrice', 0)),
            float(svc.get('weightOrCount', 0)),
        ))

    # Insert tip row
    tip_amount   = float(tip_data.get('tip_amount') or 0)
    tip_pct      = tip_data.get('tip_percentage')
    tip_type     = tip_data.get('tip_type') or 'noTip'
    tip_method   = tip_data.get('tip_method') or None   # '' → NULL (enum)
    tip_receiver = tip_data.get('tip_receiver_id') or None
    cur.execute("""
        INSERT INTO orders.order_tips (order_id, tip_amount, tip_percentage, tip_type, tip_method, tip_receiver_id)
        VALUES (%s,%s,%s,%s,%s,%s)
        ON CONFLICT (order_id) DO UPDATE SET
            tip_amount=EXCLUDED.tip_amount,
            tip_percentage=EXCLUDED.tip_percentage,
            tip_type=EXCLUDED.tip_type,
            tip_method=EXCLUDED.tip_method,
            tip_receiver_id=EXCLUDED.tip_receiver_id
    """, (order_id, tip_amount, tip_pct, tip_type, tip_method, tip_receiver))

    db.commit()
    logger.info("Inserted order %s into PostgreSQL", order_id)


# ── Payment hold ──────────────────────────────────────────────────────────────

def create_payment_hold(payment_method_id, laundry_id, description=''):
    try:
        resp = lambda_client.invoke(
            FunctionName='PaymentService',
            InvocationType='RequestResponse',
            Payload=json.dumps({
                'orderPaymentOperation': 'createHold',
                'customerPaymentId': payment_method_id,
                'laundryId': laundry_id,
                'description': description,
                'amount': 1 # Temporary hold amount
            })
        )
        return json.loads(resp['Payload'].read())
    except Exception as e:
        logger.exception("create_payment_hold error")
        return {'status': 'error', 'message': str(e)}


# ── Notifications ─────────────────────────────────────────────────────────────

def invoke_notification_lambda(notification_type, recipient, message, subject=None, sender=None):
    try:
        payload = {'type': notification_type, 'recipient': recipient, 'message': message}
        if notification_type == 'email' and subject:
            payload['subject'] = subject
            payload['sender']  = sender
        lambda_client.invoke(
            FunctionName='customerNotificationService',
            InvocationType='Event',
            Payload=json.dumps(payload)
        )
    except Exception as e:
        logger.warning("Notification failed: %s", e)


def send_notification(customer, order_details, laundry_info):
    try:
        laundry_name   = laundry_info.get('laundryName', 'Our Laundry')
        support_email  = laundry_info.get('contactDetails', {}).get('email', 'N/A')
        support_phone  = laundry_info.get('contactDetails', {}).get('phoneNumber', 'N/A')
        order_id       = order_details['orderId']
        pickup_date    = order_details['pickupDate']
        pickup_time    = order_details['pickupTimeInterval']
        dropoff_date   = order_details['dropoffDate']
        dropoff_time   = order_details['dropoffTimeInterval']
        frequency      = order_details.get('frequency', '')
        services_str   = ', '.join([s.get('serviceName', '') for s in order_details.get('services', [])])

        html = f"""
        <html><body>
        <p>Dear {customer.get('first_name', 'Customer')},</p>
        <p>Your {frequency} order has been placed with <strong>{laundry_name}</strong>.</p>
        <table border="1" cellpadding="8">
          <tr><th>Order ID</th><td>{order_id}</td></tr>
          <tr><th>Services</th><td>{services_str}</td></tr>
          <tr><th>Pickup</th><td>{pickup_date} {pickup_time}</td></tr>
          <tr><th>Delivery</th><td>{dropoff_date} {dropoff_time}</td></tr>
        </table>
        <p>Questions? Email {support_email} or call {support_phone}.</p>
        <p>{laundry_name} Team</p>
        </body></html>
        """

        if customer.get('notif_email') and customer.get('email'):
            invoke_notification_lambda('email', customer['email'], html,
                                       subject=f"{frequency} Order Confirmation", sender=support_email)

        if customer.get('notif_sms') and customer.get('phone_number'):
            sms = (f"{frequency} Order at {laundry_name}! ID: {order_id}, "
                   f"Services: {services_str}, Pickup: {pickup_date} {pickup_time}, "
                   f"Delivery: {dropoff_date} {dropoff_time}. Call {support_phone}.")
            invoke_notification_lambda('sms', customer['phone_number'], sms)

        # Notify laundry team
        team_html = f"""
        <html><body>
        <p>New auto-generated order from {customer.get('first_name','')} {customer.get('last_name','')}.</p>
        <table border="1" cellpadding="8">
          <tr><th>Order ID</th><td>{order_id}</td></tr>
          <tr><th>Services</th><td>{services_str}</td></tr>
          <tr><th>Pickup</th><td>{pickup_date} {pickup_time}</td></tr>
          <tr><th>Delivery</th><td>{dropoff_date} {dropoff_time}</td></tr>
        </table>
        </body></html>
        """
        invoke_notification_lambda('email', support_email, team_html,
                                   subject="New Auto-Generated Order", sender=support_email)
    except Exception as e:
        logger.warning("send_notification error: %s", e)


# ── Uber integration ──────────────────────────────────────────────────────────

def schedule_uber_leg(order_id, leg_type, delivery_date, time_interval,
                      pickup_address, dropoff_address, pickup_phone, dropoff_phone,
                      pickup_name, dropoff_name, pickup_notes, dropoff_notes,
                      laundry_bags, laundry_id, laundry_name, uber_env):
    """Invoke UberIntegration Lambda for a pickup or dropoff leg."""
    try:
        payload = {
            'operation':      'schedule-uber-order',
            'laundry_id':     laundry_id,
            'uberEnv':        uber_env,
            'pickup_address': pickup_address,
            'dropoff_address':dropoff_address,
            'pickup_phone':   pickup_phone,
            'dropoff_phone':  dropoff_phone,
            'order_id':       order_id,
            'delivery_date':  str(delivery_date),
            'time_interval':  str(time_interval),
            'laundry_bags_qty': int(laundry_bags),
            'type':           leg_type,
            'pickup_name':    pickup_name,
            'dropoff_name':   dropoff_name,
            'pickup_notes':   pickup_notes,
            'dropoff_notes':  dropoff_notes,
            'laundry_name':   laundry_name,
        }
        resp = lambda_client.invoke(
            FunctionName=UBER_LAMBDA_NAME,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload).encode()
        )
        raw = json.load(resp['Payload'])
        logger.info("[UBER] %s response: %s", leg_type, json.dumps(raw))
        status_code = raw.get('statusCode', 500)
        body = json.loads(raw.get('body', '{}'))
        if status_code != 200 or body.get('message') != 'Uber delivery scheduled and order updated.':
            logger.warning("[UBER] %s leg failed — falling back to LaundryDriver", leg_type)
            # Update order to use LaundryDriver for this leg
            col = 'pickup_service' if leg_type == 'laundryPickup' else 'dropoff_service'
            cur = db.get_cursor()
            cur.execute(f"UPDATE orders.orders SET {col} = 'LaundryDriver' WHERE order_id = %s", (order_id,))
            db.commit()
    except Exception as e:
        logger.exception("[UBER] schedule_uber_leg error for %s", leg_type)


# ── Core order creation ───────────────────────────────────────────────────────

def create_order_for_frequency(record):
    order_id = generate_order_id("O-")
    """Create one auto-generated order for a frequency record."""
    customer_id          = record['customer_id']
    laundry_id           = record['laundry_id']
    address_id           = record['address_id']
    frequency            = record['frequency']
    services             = record['services']
    pickup_time_interval = record.get('pickup_time_interval', 'N/A')
    dropoff_time_interval= record.get('dropoff_time_interval', 'N/A')
    special_instructions = record.get('special_instructions', '')
    laundry_bags         = record.get('laundry_bags', 1)
    coupon               = record.get('coupon')
    uber_pickup          = record.get('uber_pickup_frequency')
    uber_dropoff         = record.get('uber_dropoff_frequency')
    tip_data             = {
        'tip_amount':     record.get('tip_amount', 0),
        'tip_percentage': record.get('tip_percentage'),
        'tip_type':       record.get('tip_type'),
        'tip_method':     record.get('tip_method'),
        'tip_receiver_id':record.get('tip_receiver_id',None),
    }

    pickup_date  = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
    dropoff_date = (datetime.now() + timedelta(days=2)).strftime('%Y-%m-%d')

    # Fetch customer
    customer = fetch_customer_info(customer_id, laundry_id)
    if not customer:
        logger.warning("Customer %s not found — skipping", customer_id)
        return False

    # Payment hold
    payment_method_id = customer.get('payment_method_id', '')
    payment_status    = PaymentStatus.PAYMENT_FAILED.value
    payment_intent_id = None

    if payment_method_id:
        hold_resp = create_payment_hold(
            payment_method_id, laundry_id,
            description=f'Auto-generated order:{order_id} customer:{customer_id}'
        )
        if hold_resp.get('status') == 'success':
            payment_status    = PaymentStatus.PAYMENT_INITIATED.value
            payment_intent_id = hold_resp.get('paymentIntentId')
            logger.info("Payment hold OK for customer %s, intent=%s", customer_id, payment_intent_id)
        else:
            logger.warning("Payment hold failed for customer %s: %s", customer_id, hold_resp.get('message'))
    else:
        logger.warning("No payment method for customer %s in laundry %s", customer_id, laundry_id)

    # Insert into PostgreSQL
    insert_order(
        order_id=order_id,
        customer_id=customer_id,
        laundry_id=laundry_id,
        address_id=address_id,
        services=services,
        tip_data=tip_data,
        pickup_date=pickup_date,
        dropoff_date=dropoff_date,
        pickup_time_interval=pickup_time_interval,
        dropoff_time_interval=dropoff_time_interval,
        special_instructions=special_instructions,
        laundry_bags=laundry_bags,
        coupon=coupon,
        frequency=frequency,
        payment_status=payment_status,
        payment_intent_id=payment_intent_id,
    )

    # Notifications
    try:
        laundry_info = fetch_laundry_info(laundry_id)
        order_for_notif = {
            'orderId':             order_id,
            'pickupDate':          pickup_date,
            'pickupTimeInterval':  pickup_time_interval,
            'dropoffDate':         dropoff_date,
            'dropoffTimeInterval': dropoff_time_interval,
            'services':            services,
            'frequency':           frequency,
        }
        send_notification(customer, order_for_notif, laundry_info)
    except Exception as e:
        logger.warning("Notification error for order %s: %s", order_id, e)

    # Uber legs
    try:
        laundry_info     = fetch_laundry_info(laundry_id)
        laundry_address  = laundry_info['address']
        laundry_name     = laundry_info['laundryName']
        laundry_phone    = laundry_info['contactDetails']['phoneNumber']
        laundry_instructions = laundry_info.get('pickupDropoffInstructions', '')
        uber_env         = laundry_info.get('uberEnv', {})
        customer_address, address_instructions = fetch_customer_address(customer_id, address_id)
        customer_full_name = f"{customer.get('first_name','')} {customer.get('last_name','')}".strip()
        customer_phone   = customer.get('phone_number', '')

        if uber_pickup:
            schedule_uber_leg(
                order_id=order_id, leg_type='laundryPickup',
                delivery_date=pickup_date, time_interval=pickup_time_interval,
                pickup_address=customer_address, dropoff_address=laundry_address,
                pickup_phone=customer_phone, dropoff_phone=laundry_phone,
                pickup_name=customer_full_name, dropoff_name=laundry_name,
                pickup_notes=address_instructions or '', dropoff_notes=laundry_instructions,
                laundry_bags=laundry_bags, laundry_id=laundry_id,
                laundry_name=laundry_name, uber_env=uber_env,
            )

        if uber_dropoff:
            schedule_uber_leg(
                order_id=order_id, leg_type='laundryDropoff',
                delivery_date=dropoff_date, time_interval=dropoff_time_interval,
                pickup_address=laundry_address, dropoff_address=customer_address,
                pickup_phone=laundry_phone, dropoff_phone=customer_phone,
                pickup_name=laundry_name, dropoff_name=customer_full_name,
                pickup_notes=laundry_instructions, dropoff_notes=address_instructions or '',
                laundry_bags=laundry_bags, laundry_id=laundry_id,
                laundry_name=laundry_name, uber_env=uber_env,
            )
    except Exception as e:
        logger.warning("Uber scheduling error for order %s: %s", order_id, e)

    logger.info("Created order %s for customer %s (%s)", order_id, customer_id, frequency)
    return True


# ── Lambda handler ────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    try:
        logger.info("OrderFrequencyService started")
        current_date = datetime.now(timezone.utc).date()
        count = 0

        records = fetch_frequency_records()
        logger.info("Fetched %s active frequency records", len(records))

        if not records:
            return {'statusCode': 200, 'body': json.dumps({'message': 'No frequency records to process'})}

        for record in records:
            try:
                frequency  = (record.get('frequency') or '').lower()
                start_date = record['frequency_start_date']
                if hasattr(start_date, 'date'):
                    start_date = start_date.date()

                days_since = (current_date - start_date).days
                logger.info("customer=%s frequency=%s days_since=%s",
                            record['customer_id'], frequency, days_since)

                if frequency == 'weekly' and days_since == 6:
                    if create_order_for_frequency(record):
                        update_frequency_start_date(record['frequency_id'], 7)
                        count += 1
                elif frequency == 'biweekly' and days_since == 13:
                    if create_order_for_frequency(record):
                        update_frequency_start_date(record['frequency_id'], 14)
                        count += 1
                else:
                    logger.info("No order due for customer %s today", record['customer_id'])

            except Exception as e:
                logger.error("Error processing frequency_id=%s: %s\n%s",
                             record.get('frequency_id'), e, traceback.format_exc())
                continue

        logger.info("OrderFrequencyService complete — %s orders created", count)
        return {
            'statusCode': 200,
            'body': json.dumps({'message': f'Processed {count} orders', 'ordersCreated': count})
        }

    except Exception as e:
        logger.exception("CRITICAL ERROR in OrderFrequencyService")
        return {
            'statusCode': 500,
            'body': json.dumps({'message': 'Error in auto-order generation', 'error': str(e)})
        }
