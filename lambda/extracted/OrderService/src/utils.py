"""
utils.py — shared helpers for OrderService.
Migrated from DynamoDB to PostgreSQL.
"""
import uuid
import logging
import boto3
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from enum import Enum
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)


class OrderStatus(Enum):
    ORDER_SUBMITTED = "OrderSubmitted"
    ORDER_PICKED_UP = "OrderPickedUp"
    READY_FOR_INTAKE = "ReadyForIntake"
    RECEIVED = "ReceivedAtFacility"
    PROCESSING_STARTED = "ProcessingStarted"
    PROCESSING_COMPLETED = "ProcessingCompleted"
    EN_ROUTE_TO_DELIVERY = 'EnRouteToDelivery'
    DELIVERED = "Delivered"
    ORDER_CANCELED = "OrderCanceled"


class StatusCategory(Enum):
    ACTIVE = "Active"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


class OrderType(Enum):
    ONLINE = "Online"
    INSTORE = "InStore"
    COMMERCIAL = "Commercial"


def get_current_timestamp():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def is_valid_decimal(value):
    try:
        Decimal(str(value))
        return True
    except (ValueError, InvalidOperation):
        return False


def generate_order_id(prefix):
    return f"{prefix}{uuid.uuid4().hex[:6].upper()}"


def fetch_laundry_info(laundry_id):
    """Fetch laundry shop info from PostgreSQL."""
    cur = db.get_cursor()
    cur.execute("""
        SELECT ls.laundry_id, ls.laundry_name, ls.contact_email, ls.contact_phone,
               ls.street, ls.city, ls.state, ls.zip_code, ls.country,
               ls.pickup_dropoff_instructions, ls.laundry_timezone,
               ls.stripe_public_key, ls.stripe_private_key, ls.stripe_terminal_id,
               ls.serviceable_zip_codes,
               COALESCE(json_agg(DISTINCT jsonb_build_object(
                   'serviceName', lsvc.service_name,
                   'price', lsvc.price,
                   'description', lsvc.description,
                   'inputWeight', lsvc.input_weight,
                   'customerAccess', lsvc.customer_access
               )) FILTER (WHERE lsvc.service_id IS NOT NULL), '[]') AS laundry_services
        FROM shop.laundry_shops ls
        LEFT JOIN shop.laundry_services lsvc ON lsvc.laundry_id = ls.laundry_id AND lsvc.is_active = TRUE
        WHERE ls.laundry_id = %s
        GROUP BY ls.laundry_id
    """, (laundry_id,))
    row = cur.fetchone()
    if not row:
        raise ValueError(f"No laundry details found for laundryId: {laundry_id}")

    # Build address string
    addr = f"{row['street']}, {row['city']}, {row['state']} {row['zip_code']}, {row['country']}"

    return {
        'laundryId': row['laundry_id'],
        'laundryName': row['laundry_name'],
        'contactDetails': {'email': row['contact_email'], 'phoneNumber': row['contact_phone']},
        'laundryAddress': {
            'street': row['street'], 'city': row['city'],
            'state': row['state'], 'zipCode': row['zip_code'], 'country': row['country']
        },
        'laundryServices': row['laundry_services'],
        'laundryTimeZone': row['laundry_timezone'],
        'stripePublicKey': row['stripe_public_key'],
        'stripePrivateKey': row['stripe_private_key'],
        'stripeTerminalId': row['stripe_terminal_id'],
        'serviceableZipCodes': row['serviceable_zip_codes'],
        'pickupDropoffInstructions': row['pickup_dropoff_instructions'],
        'address': addr,
    }


def get_status_category(order_status):
    active = {OrderStatus.ORDER_SUBMITTED.value, OrderStatus.ORDER_PICKED_UP.value,
              OrderStatus.READY_FOR_INTAKE.value, OrderStatus.RECEIVED.value,
              OrderStatus.PROCESSING_STARTED.value, OrderStatus.PROCESSING_COMPLETED.value,
              OrderStatus.EN_ROUTE_TO_DELIVERY.value}
    completed = {OrderStatus.DELIVERED.value}
    cancelled = {OrderStatus.ORDER_CANCELED.value}

    if order_status in active:
        return StatusCategory.ACTIVE.value
    elif order_status in completed:
        return StatusCategory.COMPLETED.value
    elif order_status in cancelled:
        return StatusCategory.CANCELLED.value
    return StatusCategory.ACTIVE.value


# GSI key generation — kept for compatibility, not used in PostgreSQL
def generate_order_gsi_keys(**kwargs):
    return {
        'statusCategory': get_status_category(kwargs.get('order_status', '')),
        'customerLaundryKey': '',
        'customerSortKey': '',
        'laundryStatusKey': '',
        'laundryStatusTypeKey': '',
        'dateSortKey': '',
    }
