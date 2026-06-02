"""
order_frequency.py — frequency record management.
Migrated from DynamoDB to PostgreSQL.
"""
import uuid
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from utils import get_current_timestamp
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handle_frequency_logic(customer_id, laundry_id, address_id, frequency_id, services,
                            pickup_date, pickup_time_interval, dropoff_time_interval,
                            special_instructions, frequency, laundry_bags, tip, coupon,
                            uber_pickup_frequency=None, uber_dropoff_frequency=None):
    logger.info("handle_frequency_logic: customer=%s laundry=%s", customer_id, laundry_id)
    try:
        current_time = get_current_timestamp()
        current_dt = datetime.fromisoformat(current_time.replace("Z", "+00:00"))
        pickup_date_only = datetime.strptime(pickup_date, '%Y-%m-%d').date()
        freq_start_dt = datetime.combine(pickup_date_only, current_dt.time(), tzinfo=timezone.utc)
        freq_start_iso = freq_start_dt.isoformat().replace("+00:00", "Z")

        days = 7 if frequency.lower() == 'weekly' else 14
        future_pickup = (freq_start_dt + timedelta(days=days)).strftime('%Y-%m-%d')

        tip_amount = float(tip.get('tipAmount', 0)) if tip else 0
        tip_pct = tip.get('tipPercentage') if tip else None
        tip_type = tip.get('tipType') if tip else None
        tip_method = tip.get('tipMethod') if tip else None

        cur = db.get_cursor()

        if frequency_id:
            # Update existing
            cur.execute("""
                UPDATE orders.laundry_frequency SET
                    pickup_date = %s, frequency = %s,
                    frequency_start_date = %s, future_pickup_date = %s,
                    pickup_time_interval = %s, dropoff_time_interval = %s,
                    tip_amount = %s, tip_percentage = %s, tip_type = %s, tip_method = %s,
                    coupon = %s, laundry_bags = %s, special_instructions = %s
                WHERE frequency_id = %s AND customer_id = %s
            """, (
                pickup_date, frequency, freq_start_iso, future_pickup,
                pickup_time_interval, dropoff_time_interval,
                tip_amount, tip_pct, tip_type, tip_method,
                coupon, int(laundry_bags), special_instructions,
                frequency_id, customer_id
            ))

            # Replace services
            cur.execute("DELETE FROM orders.laundry_frequency_services WHERE frequency_id = %s", (frequency_id,))
            for svc in services:
                cur.execute("""
                    INSERT INTO orders.laundry_frequency_services
                        (frequency_id, service_name, service_price, weight_or_count)
                    VALUES (%s,%s,%s,%s)
                """, (frequency_id, svc.get('serviceName'), float(svc.get('servicePrice', 0)),
                      float(svc.get('weightOrCount', 0))))
        else:
            frequency_id = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO orders.laundry_frequency (
                    frequency_id, customer_id, laundry_id, address_id,
                    frequency, pickup_date, pickup_time_interval, dropoff_time_interval,
                    future_pickup_date, laundry_bags, coupon, special_instructions,
                    tip_amount, tip_percentage, tip_type, tip_method,
                    frequency_created_date, frequency_start_date
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),%s)
            """, (
                frequency_id, customer_id, laundry_id, address_id,
                frequency, pickup_date, pickup_time_interval, dropoff_time_interval,
                future_pickup, int(laundry_bags), coupon, special_instructions,
                tip_amount, tip_pct, tip_type, tip_method,
                freq_start_iso,
            ))

            for svc in services:
                cur.execute("""
                    INSERT INTO orders.laundry_frequency_services
                        (frequency_id, service_name, service_price, weight_or_count)
                    VALUES (%s,%s,%s,%s)
                """, (frequency_id, svc.get('serviceName'), float(svc.get('servicePrice', 0)),
                      float(svc.get('weightOrCount', 0))))

        db.commit()
        logger.info("Frequency record saved: %s", frequency_id)
        return frequency_id

    except Exception as e:
        db.rollback()
        logger.exception("handle_frequency_logic error")
        return {'status': 'error', 'message': str(e)}


def cancel_recurring_order(customer_id, frequency_id):
    logger.info("cancel_recurring_order: frequency_id=%s", frequency_id)
    try:
        cur = db.get_cursor()
        cur.execute("""
            UPDATE orders.laundry_frequency SET is_active = FALSE
            WHERE frequency_id = %s AND customer_id = %s
        """, (frequency_id, customer_id))
        db.commit()
    except Exception as e:
        db.rollback()
        logger.exception("cancel_recurring_order error")
        return {'status': 'error', 'message': str(e)}
