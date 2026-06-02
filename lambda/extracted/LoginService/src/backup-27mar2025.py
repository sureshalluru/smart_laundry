import boto3
import json
import time
import logging
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Attr
from decimal import Decimal

from enum import Enum

import os
import hmac
import hashlib
import base64


# Configure the logger for AWS Lambda
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# This expects an environment variable REFERRAL_KEY containing a Base64-encoded secret (32 bytes recommended).
key_b64 = os.environ['REFERRAL_KEY']
key = base64.urlsafe_b64decode(key_b64)

dynamodb = boto3.resource('dynamodb')
customer_table = dynamodb.Table('Customer')



customer_cache = None
last_cache_timestamp = None
CACHE_TTL_SECONDS = 4 * 60 * 60  # 4 hours

# ---------- HMAC Token Functions ----------
def generate_referral_token(customer_id, laundry_id, expires_in_days=30):
    payload = {
        "customer_id": customer_id,
        "laundry_id": laundry_id,
        "exp": int(time.time()) + expires_in_days * 86400
    }
    payload_json = json.dumps(payload, sort_keys=True).encode()
    signature = hmac.new(key, payload_json, hashlib.sha256).digest()
    token = base64.urlsafe_b64encode(payload_json + b"." + signature).decode()
    return token

def generate_referral_link(customer_id, laundry_id, laundry_user_domain):
    token = generate_referral_token(customer_id, laundry_id)
    link = f"{laundry_user_domain}{laundry_id}/login?ref={token}"
    return {
      "status": "success",
      "referralLink": link,
      "message": "Referral link generated successfully"
    }
    
def verify_referral_token(token):
    try:
        raw = base64.urlsafe_b64decode(token)
        payload_json, signature = raw.rsplit(b".", 1)
        expected_signature = hmac.new(key, payload_json, hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected_signature):
            raise ValueError("Signature mismatch")
        payload = json.loads(payload_json.decode())
        if "exp" in payload and payload["exp"] < time.time():
            raise ValueError("Referral token expired")
        return payload
    except Exception:
        return None

def is_cache_stale():
    if last_cache_timestamp is None:
        logger.info("Cache is empty, needs refresh")
        return True
    age = time.time() - last_cache_timestamp
    logger.info(f"Cache age: {age:.2f} seconds")
    return age > CACHE_TTL_SECONDS

def load_customer_cache():
    global customer_cache, last_cache_timestamp

    customer_cache = []
    response = customer_table.scan()
    customer_cache.extend(response.get('Items', []))

    while 'LastEvaluatedKey' in response:
        response = customer_table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
        customer_cache.extend(response.get('Items', []))

    # For TTL-based cache, use time.time()
    last_cache_timestamp = time.time()

    logger.info(f"Cache refreshed with {len(customer_cache)} customers.")

def search_phone_substring(query, laundry_id):
    """Search customers whose phone numbers contain the query and belong to the given laundry_id."""
    global customer_cache

    logger.info(f"search_phone_substring START: query={query}, laundry_id={laundry_id}")

    try:
        if is_cache_stale():
            load_customer_cache()

        normalized_query = query.replace("+1", "").strip()

        matching_customers = [
            {
                'phoneNumber': customer.get('phoneNumber'),
                'firstName': customer.get('firstName', ''),
                'lastName': customer.get('lastName', ''),
                'customerId': customer.get('customerId')
            }
            for customer in customer_cache
            if normalized_query in customer.get('phoneNumber', '') and
               laundry_id in customer.get('laundryId', [])
        ]

        logger.info(f"Found {len(matching_customers)} matches for laundry_id={laundry_id}")
        return {'suggestions': matching_customers[:10]}
    except Exception as e:
        logger.error(f"Error in search_phone_substring: {str(e)}")
        return {'error': f"An error occurred: {str(e)}"}

def check_phone_number(phone_number, laundry_id):
    """
    Checks if the given phone_number exists in the system.
    If it exists, also update the customer's record with the provided laundry_id if not already present.
    Additionally, if the new laundry_id is added to the laundryId array, add the default structure to laundryStats.
    """
    logger.info(f"check_phone_number START: phone_number={phone_number}, laundry_id={laundry_id}")
    try:
        logger.info("Scanning the Customer table for the provided phone_number.")
        response = customer_table.scan(
            FilterExpression=Attr('phoneNumber').eq(phone_number)
        )
        items = response.get('Items', [])
        logger.info(f"Scan completed. Found {len(items)} items for phone_number={phone_number}.")

        if not items:
            logger.info(f"No customer found for phone_number={phone_number}. Exiting check_phone_number.")
            return {'exists': False}

        # Assuming phoneNumber is unique, take the first matching customer
        customer = items[0]
        customer_id = customer['customerId']
        logger.info(f"Customer found: customerId={customer_id}")

        # Retrieve the current laundryId list (default to an empty list if not present)
        laundry_ids = customer.get('laundryId', [])
        logger.info(f"Current laundryIds for customerId={customer_id}: {laundry_ids}")
        # Prepare default laundry stats structure
        default_laundry_stats = {
            "currentOrders": [],
            "lastCompletedOrder": {},
            "totalOrderValue": Decimal("0.0"),
            "totalOrdersPlaced": 0
        }

        # Retrieve the current laundryStats dictionary (default to empty dict if not present)
        laundry_stats = customer.get('laundryStats', {})
        # Check if the provided laundry_id is already in the list
        if laundry_id not in laundry_ids:
            logger.info(f"laundry_id={laundry_id} not found in customer record. Updating record.")
            updated_laundry_ids = laundry_ids + [laundry_id]
            # If the laundry_id key does not exist in laundry_stats, add the default structure
            if laundry_id not in laundry_stats:
                laundry_stats[laundry_id] = default_laundry_stats
            # Update the customer's record with both laundryId and laundryStats
            update_response = customer_table.update_item(
                Key={'customerId': customer_id},
                UpdateExpression='SET laundryId = :l, laundryStats = :ls',
                ExpressionAttributeValues={
                    ':l': updated_laundry_ids,
                    ':ls': laundry_stats
                }
            )
            logger.info(f"Update successful for customerId={customer_id}: {update_response}")
        #TODO: Remove this logic at later point of time this is only for old recorded customers
        # Case 2: If laundry_id exists in laundry_ids but missing in laundry_stats.
        elif laundry_id in laundry_ids and laundry_id not in laundry_stats:
            logger.info(f"laundry_id={laundry_id} exists in laundry_ids but not in laundryStats. Updating record.")
            laundry_stats[laundry_id] = default_laundry_stats
            update_response = customer_table.update_item(
                Key={'customerId': customer_id},
                UpdateExpression='SET laundryStats = :ls',
                ExpressionAttributeValues={
                    ':ls': laundry_stats
                }
            )
            logger.info(f"laundryStats updated for customerId={customer_id}: {update_response}")

        payment_intent_ids = customer.get('customerPaymentId', {})
        payment_intent_id = payment_intent_ids.get(laundry_id, "")
        customer_firstname = customer.get('firstName', '')
        customer_special_instructions = customer.get('specialInstructions', '')

        # Log the final customer details before returning
        logger.info(f"Returning customer details: customerId={customer_id}, customerPaymentId={payment_intent_id}, firstName={customer_firstname}, specialInstructions={customer_special_instructions}")
        return {
            'exists': True,
            'customerId': customer_id,
            'customerPaymentId': payment_intent_id,
            'firstName': customer_firstname,
            'specialInstructions': customer_special_instructions
        }
    except ClientError as e:
        logger.error(f"ClientError in check_phone_number: {e}")
        return {'error': f"Unable to check phone number: {e.response['Error']['Message']}"}
    except Exception as e:
        logger.error(f"Unexpected error in check_phone_number: {str(e)}")
        return {'error': f"An unexpected error occurred: {str(e)}"}
    finally:
        logger.info("check_phone_number END")

def lambda_handler(event, context):
    """
    Main Lambda handler function.
    Routes the request to either 'checkPhoneNumber' or 'addCustomer' operations.
    """
    logger.info("lambda_handler START")
    logger.info(f"Received event: {event}")

    params = event.get('queryStringParameters', {}) or {}
    logger.info(f"Received query parameters: {params}")

    try:
        operation = params.get('operation')
        logger.info(f"Operation requested: {operation}")

        if operation == 'checkPhoneNumber':
            phone_number = params.get('phoneNumber')
            laundry_id = params.get('laundryId')
            if not phone_number:
                logger.warning("Missing phoneNumber parameter in checkPhoneNumber operation.")
                return {'error': 'Missing phoneNumber'}

            logger.info("Invoking check_phone_number function.")
            result = check_phone_number(phone_number, laundry_id)
            logger.info(f"check_phone_number result: {result}")
            return result

        elif operation == 'searchPhone':
            print("received params", params)
            query = params.get('phoneQuery')
            laundry_id = params.get('laundryId')
            if not query:
                return {
                    'statusCode': 400,
                    'body': json.dumps({'error': 'Missing query'})
                }

            result = search_phone_substring(query, laundry_id)
            return {'statusCode': 200, 'headers': {'Content-Type': 'application/json'}, 'body': json.dumps(result)}

        elif operation == 'generateReferralLink':
            customer_id = params.get('customerId')
            laundry_id = params.get('laundryId')
            laundry_user_domain = params.get('laundryUserDomain')
          
            result = generate_referral_link(customer_id, laundry_id, laundry_user_domain)
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps(result)
            }
        elif operation == 'verifyReferralToken':
            token = params.get('ref') or params.get('token')
            payload = verify_referral_token(token)
            if not payload:
                return {
                    'statusCode': 400,
                    'body': json.dumps({'error': 'Invalid or expired token'})
                }
            return {
                'statusCode': 200,
                'body': json.dumps({'payload': payload})
            }
        else:
            logger.warning(f"Unsupported operation requested: {operation}")
            return {'error': 'Unsupported operation'}
    except Exception as e:
        logger.error(f"Unhandled exception in lambda_handler: {str(e)}")
        return {'error': f"An unexpected error occurred: {str(e)}"}
    finally:
        logger.info("lambda_handler END")
