"""
LoginService — phone lookup, referral links, phone search.
Migrated from DynamoDB to PostgreSQL.
This Lambda duplicates ValidationService functionality; both are kept for backwards compatibility.
"""
import json
import logging
import time
import hmac
import hashlib
import base64
import os
import sys

# Add src to path so db.py is importable
sys.path.insert(0, os.path.dirname(__file__))
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)

key_b64 = os.environ.get('REFERRAL_KEY', '')
key = base64.urlsafe_b64decode(key_b64) if key_b64 else b''


# ── referral helpers ──────────────────────────────────────────────────────────

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


# ── DB operations ─────────────────────────────────────────────────────────────

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

        # Ensure customer_laundry_stats row exists for this laundry
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


# ── handler ───────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    logger.info("lambda_handler START: %s", event)
    params = event.get('queryStringParameters', {}) or {}
    try:
        operation = params.get('operation')

        if operation == 'checkPhoneNumber':
            phone = params.get('phoneNumber')
            laundry_id = params.get('laundryId')
            if not phone:
                return {'error': 'Missing phoneNumber'}
            return check_phone_number(phone, laundry_id)

        elif operation == 'searchPhone':
            query = params.get('phoneQuery')
            laundry_id = params.get('laundryId')
            if not query:
                return {'statusCode': 400, 'body': json.dumps({'error': 'Missing query'})}
            return {'statusCode': 200, 'body': json.dumps(search_phone_substring(query, laundry_id))}

        elif operation == 'generateReferralLink':
            result = generate_referral_link(
                params.get('customerId'), params.get('laundryId'), params.get('laundryUserDomain'))
            return {'statusCode': 200, 'body': json.dumps(result)}

        elif operation == 'verifyReferralToken':
            token = params.get('ref') or params.get('token')
            payload = verify_referral_token(token)
            if not payload:
                return {'statusCode': 400, 'body': json.dumps({'error': 'Invalid or expired token'})}
            return {'statusCode': 200, 'body': json.dumps({'payload': payload})}

        else:
            return {'error': 'Unsupported operation'}

    except Exception as e:
        logger.exception("lambda_handler error")
        return {'error': str(e)}
    finally:
        logger.info("lambda_handler END")
