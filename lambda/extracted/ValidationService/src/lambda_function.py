"""
ValidationService — laundry shop info, address validation, phone search, referral links.
Migrated from DynamoDB to PostgreSQL.
"""
import json
import logging
import time
import hmac
import hashlib
import base64
import os
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CORS_HEADERS = {
    'Access-Control-Allow-Origin': 'https://www.roundrocklaundry.com',
    'Access-Control-Allow-Credentials': 'true'
}

key_b64 = os.environ.get('REFERRAL_KEY', '')
key = base64.urlsafe_b64decode(key_b64) if key_b64 else b''


# ── laundry shop functions ────────────────────────────────────────────────────

def check_laundry_id(laundry_id):
    logger.info("check_laundry_id: %s", laundry_id)
    try:
        cur = db.get_cursor()
        cur.execute("""
            SELECT laundry_name, stripe_public_key, stripe_terminal_id,
                   laundry_timezone, user_domain
            FROM shop.laundry_shops
            WHERE laundry_id = %s
        """, (laundry_id,))
        row = cur.fetchone()
        if not row:
            logger.info("Laundry ID %s not found", laundry_id)
            return {'status': 'success', 'exists': False}

        logger.info("Laundry found: %s", row["laundry_name"])
        return {
            'status': 'success',
            'exists': True,
            'laundryName': row["laundry_name"],
            'laundryTimeZone': row["laundry_timezone"],
            'stripePublicKey': row["stripe_public_key"] or '',
            'laundryUserDomain': row["user_domain"],
            'stripeTerminalExists': bool(row["stripe_terminal_id"]),
        }
    except Exception as e:
        logger.exception("check_laundry_id error")
        return {'status': 'error', 'message': str(e)}


def get_laundry_info(laundry_id, isCustomer=None):
    logger.info("get_laundry_info: %s isCustomer=%s", laundry_id, isCustomer)
    try:
        cur = db.get_cursor()

        # Core shop info
        cur.execute("""
            SELECT laundry_name, laundry_timezone, stripe_public_key, stripe_terminal_id,
                   delivery_time_interval, user_domain,
                   street, city, state, zip_code, country,
                   serviceable_zip_codes
            FROM shop.laundry_shops
            WHERE laundry_id = %s
        """, (laundry_id,))
        shop = cur.fetchone()
        if not shop:
            return {'status': 'error', 'message': 'Laundry ID not found'}

        # Services
        cur.execute("""
            SELECT service_name, price, description, input_weight, customer_access
            FROM shop.laundry_services
            WHERE laundry_id = %s AND is_active = TRUE
            ORDER BY service_id
        """, (laundry_id,))
        all_services = [
            {
                'serviceName':    r["service_name"],
                'price':          str(r["price"]),
                'description':    r["description"] or '',
                'inputWeight':    r["input_weight"],
                'customerAccess': r["customer_access"],
            }
            for r in cur.fetchall()
        ]
        laundry_services = (
            [s for s in all_services if s['customerAccess']]
            if isCustomer else all_services
        )

        # Delivery time slots
        cur.execute("""
            SELECT day_of_week AS day, start_time AS "startTime", end_time AS "endTime"
            FROM shop.delivery_time_slots WHERE laundry_id = %s ORDER BY id
        """, (laundry_id,))
        delivery_time_slots = [
            {'day': r["day"], 'startTime': str(r["startTime"]), 'endTime': str(r["endTime"])}
            for r in cur.fetchall()
        ]

        # In-store pickup time slots
        cur.execute("""
            SELECT day_of_week AS day, start_time AS "startTime", end_time AS "endTime"
            FROM shop.instore_pickup_time_slots WHERE laundry_id = %s ORDER BY id
        """, (laundry_id,))
        instore_slots = [
            {'day': r["day"], 'startTime': str(r["startTime"]), 'endTime': str(r["endTime"])}
            for r in cur.fetchall()
        ]

        # Frequency intervals
        cur.execute("""
            SELECT interval FROM shop.frequency_intervals WHERE laundry_id = %s
        """, (laundry_id,))
        frequency_interval = [r["interval"] for r in cur.fetchall()]

        # Uber credentials existence
        cur.execute("""
            SELECT env FROM shop.laundry_uber_credentials WHERE laundry_id = %s LIMIT 1
        """, (laundry_id,))
        uber_row = cur.fetchone()
        uber_env = uber_row["env"] if uber_row else ''
        uber_env_credentials_exist = bool(uber_row)

        # Active frequency promotions (one per frequency)
        frequency_promotions = []
        if isCustomer and frequency_interval:
            cur.execute("""
                SELECT promo_code, linked_frequency, description
                FROM shop.promotions
                WHERE laundry_id = %s
                  AND is_active = TRUE
                  AND is_online_frequency_promo = TRUE
                  AND linked_frequency IS NOT NULL
            """, (laundry_id,))
            promo_rows = cur.fetchall()
            covered = set()
            for r in promo_rows:
                freq = r["linked_frequency"]
                if freq in frequency_interval and freq not in covered:
                    frequency_promotions.append({
                        'frequency':   freq,
                        'promoCode':   r["promo_code"],
                        'description': r["description"] or '',
                    })
                    covered.add(freq)

        addr = f"{shop['street']}, {shop['city']}, {shop['state']} {shop['zip_code']}"

        logger.info("Successfully retrieved laundry info for %s", laundry_id)
        return {
            'status': 'success',
            'laundryName': shop["laundry_name"],
            'laundryTimeZone': shop["laundry_timezone"],
            'stripePublicKey': shop["stripe_public_key"] or '',
            'stripeTerminalExists': bool(shop["stripe_terminal_id"]),
            'deliveryTimeInterval': str(shop["delivery_time_interval"] or ''),
            'laundryAddress': addr,
            'laundryServices': laundry_services,
            'deliveryTimeSlots': delivery_time_slots,
            'inStorePickupTimeSlots': instore_slots,
            'frequencyInterval': frequency_interval,
            'frequencyPromotions': frequency_promotions,
            'uberEnv': uber_env,
            'uberCredentialsExist': uber_env_credentials_exist,
        }

    except Exception as e:
        logger.exception("get_laundry_info error")
        return {'status': 'error', 'message': str(e)}


def validate_address(laundry_id, address):
    logger.info("validate_address: %s | %s", laundry_id, address)
    try:
        # Extract zip code and country from the address string
        parts = address.split(',')
        zip_code = parts[-2].split()[-1].strip() if len(parts) >= 2 else ''
        country  = parts[-1].strip() if len(parts) >= 1 else ''

        cur = db.get_cursor()
        cur.execute("""
            SELECT serviceable_zip_codes, country
            FROM shop.laundry_shops WHERE laundry_id = %s
        """, (laundry_id,))
        row = cur.fetchone()
        if not row:
            return {'status': 'error', 'message': 'Laundry ID not found'}

        serviceable = row["serviceable_zip_codes"] or []
        laundry_country = row["country"] or ''

        if zip_code in serviceable and country == laundry_country:
            return {'status': 'success', 'serviceable': True}
        return {'status': 'success', 'serviceable': False}

    except Exception as e:
        logger.exception("validate_address error")
        return {'status': 'error', 'message': str(e)}


# ── phone search & referral helpers ──────────────────────────────────────────

def check_phone_number(phone_number, laundry_id):
    logger.info("check_phone_number: phone=%s laundry=%s", phone_number, laundry_id)
    try:
        normalized = phone_number.replace("+1", "").strip()
        cur = db.get_cursor()
        cur.execute("""
            SELECT c.customer_id, c.first_name, c.special_instructions,
                   cpp.stripe_customer_id
            FROM shop.customers c
            LEFT JOIN shop.customer_payment_profiles cpp
              ON cpp.customer_id = c.customer_id AND cpp.laundry_id = %s
            WHERE c.phone_number LIKE %s
            LIMIT 1
        """, (laundry_id, f"%{normalized}%"))
        row = cur.fetchone()
        if not row:
            return {'exists': False}

        cur.execute("""
            INSERT INTO shop.customer_laundry_stats (customer_id, laundry_id)
            VALUES (%s, %s) ON CONFLICT (customer_id, laundry_id) DO NOTHING
        """, (row["customer_id"], laundry_id))
        db.commit()

        return {
            'exists': True,
            'customerId': row["customer_id"],
            'customerPaymentId': row["stripe_customer_id"] or "",
            'firstName': row["first_name"],
            'specialInstructions': row["special_instructions"] or "",
        }
    except Exception as e:
        logger.exception("check_phone_number error")
        return {'error': str(e)}


def search_phone_substring(query, laundry_id):
    try:
        normalized = query.replace("+1", "").strip()
        cur = db.get_cursor()
        cur.execute("""
            SELECT c.customer_id, c.first_name, c.last_name, c.phone_number
            FROM shop.customers c
            JOIN shop.customer_laundry_stats cls
              ON cls.customer_id = c.customer_id AND cls.laundry_id = %s
            WHERE c.phone_number LIKE %s
            LIMIT 10
        """, (laundry_id, f"%{normalized}%"))
        suggestions = [
            {
                "customerId":  r["customer_id"],
                "firstName":   r["first_name"],
                "lastName":    r["last_name"],
                "phoneNumber": r["phone_number"],
            }
            for r in cur.fetchall()
        ]
        return {"suggestions": suggestions}
    except Exception as e:
        logger.exception("search_phone_substring error")
        return {"error": str(e)}


def generate_referral_token(customer_id, laundry_id, expires_in_days=30):
    payload = {"customer_id": customer_id, "laundry_id": laundry_id,
               "exp": int(time.time()) + expires_in_days * 86400}
    payload_json = json.dumps(payload, sort_keys=True).encode()
    sig = hmac.new(key, payload_json, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(payload_json + b"." + sig).decode()

def generate_referral_link(customer_id, laundry_id, laundry_user_domain):
    token = generate_referral_token(customer_id, laundry_id)
    return {"status": "success",
            "referralLink": f"{laundry_user_domain}{laundry_id}/login?ref={token}",
            "message": "Referral link generated successfully"}

def verify_referral_token(token):
    try:
        raw = base64.urlsafe_b64decode(token)
        payload_json, sig = raw.rsplit(b".", 1)
        expected = hmac.new(key, payload_json, hashlib.sha256).digest()
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(payload_json.decode())
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


# ── handler ───────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    logger.info("lambda_handler invoked: %s", event)
    try:
        params = event.get('queryStringParameters', {}) or {}
        operation  = params.get('operation')
        laundry_id = params.get('laundryId')
        address    = params.get('address')

        if not operation:
            return '{"status": "error", "message": "Missing operation"}'

        if operation == 'checkLaundryId':
            if not laundry_id:
                return '{"status": "error", "message": "Missing laundryId"}'
            return check_laundry_id(laundry_id)

        elif operation == 'validateAddress':
            if not laundry_id or not address:
                return '{"status": "error", "message": "Missing laundryId or address"}'
            return validate_address(laundry_id, address)

        elif operation == 'getLaundryInfo':
            if not laundry_id:
                return '{"status": "error", "message": "Missing laundryId"}'
            is_customer = params.get('isCustomer')
            if is_customer is not None:
                is_customer = str(is_customer).lower() == 'true'
            return get_laundry_info(laundry_id, isCustomer=is_customer)

        elif operation == 'checkPhoneNumber':
            phone = params.get('phoneNumber')
            if not phone:
                return {'error': 'Missing phoneNumber'}
            return check_phone_number(phone, laundry_id)

        elif operation == 'searchPhone':
            query = params.get('phoneQuery')
            if not query:
                return {'statusCode': 400, 'body': json.dumps({'error': 'Missing query'})}
            return {'statusCode': 200, 'body': json.dumps(search_phone_substring(query, laundry_id))}

        elif operation == 'generateReferralLink':
            result = generate_referral_link(
                params.get('customerId'), laundry_id, params.get('laundryUserDomain'))
            return {'statusCode': 200, 'body': json.dumps(result)}

        elif operation == 'verifyReferralToken':
            token = params.get('ref') or params.get('token')
            payload = verify_referral_token(token)
            if not payload:
                return {'statusCode': 400, 'body': json.dumps({'error': 'Invalid or expired token'})}
            return {'statusCode': 200, 'body': json.dumps({'payload': payload})}

        return '{"status": "error", "message": "Unsupported operation"}'

    except Exception as e:
        logger.exception("lambda_handler error")
        return f'{{"status": "error", "message": "An unexpected error occurred: {str(e)}"}}'
