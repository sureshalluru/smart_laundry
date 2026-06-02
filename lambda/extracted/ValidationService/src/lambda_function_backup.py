import boto3
import logging
from botocore.exceptions import ClientError

# Configure logger for Lambda
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize DynamoDB
dynamodb = boto3.resource('dynamodb')
customer_table = dynamodb.Table('LaundryShopInfo')

# CORS headers
CORS_HEADERS = {
    'Access-Control-Allow-Origin': 'https://www.roundrocklaundry.com',  # Your Wix domain
    'Access-Control-Allow-Credentials': 'true'
}


def check_laundry_id(laundry_id):
    logger.info("check_laundry_id called with laundry_id: %s", laundry_id)
    try:
        response = customer_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('laundryId').eq(laundry_id)
        )
        items = response.get('Items', [])
        logger.info("Query returned %d items", len(items))
        if items:
            laundry_info = items[0]
            laundry_name = laundry_info.get('laundryName', '')
            laundry_payment_key = laundry_info.get('stripePublicKey', '')
            laundry_stripe_terminal_id = laundry_info.get('stripeTerminalId', '')
            laundry_time_zone = laundry_info.get('laundryTimeZone','')
            laundry_user_domain = laundry_info.get("laundryDomain", {}).get("userDomain")
            terminal_exists = bool(laundry_stripe_terminal_id)
            logger.info("Laundry found: %s", laundry_name)
            return {
                'status': 'success',
                'exists': True,
                'laundryTimeZone':laundry_time_zone,
                'laundryName': laundry_name,
                # 'headers': CORS_HEADERS,
                'stripePublicKey': laundry_payment_key,
                'laundryUserDomain' : laundry_user_domain,
                'stripeTerminalExists': terminal_exists,
            }
        else:
            logger.info("Laundry ID %s not found", laundry_id)
            return {'status': 'success', 'exists': False, 'headers': CORS_HEADERS}
    except ClientError as e:
        logger.error("ClientError in check_laundry_id: %s", e.response['Error']['Message'])
        return {'status': 'error', 'message': f"Unable to check Laundry ID: {e.response['Error']['Message']}"}
    except Exception as e:
        logger.exception("Unexpected error in check_laundry_id")
        return {'status': 'error', 'message': f"An unexpected error occurred: {str(e)}"}


def get_laundry_info(laundry_id, isCustomer=None):
    logger.info("get_laundry_info called with laundry_id: %s, isCustomer: %s", laundry_id, isCustomer)
    try:
        response = customer_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('laundryId').eq(laundry_id)
        )
        items = response.get('Items', [])
        if not items:
            logger.warning("Laundry ID %s not found", laundry_id)
            return {'status': 'error', 'message': 'Laundry ID not found'}

        laundry_info = items[0]
        # print("laundry info:", laundry_info)
        laundry_services = laundry_info.get('laundryServices', [])
        if isCustomer:
            laundry_services = [service for service in laundry_services if service.get('customerAccess', False)]
            logger.info("Filtered laundry services for customer access")

        delivery_time_slots = laundry_info.get('deliveryTimeSlots', [])
        instore_delivery_time_slots = laundry_info.get('inStorePickupTimeSlots',[])
        delivery_time_interval = laundry_info.get('deliveryTimeInterval', '')
        frequency_interval = laundry_info.get('frequencyInterval', [])
        laundry_name = laundry_info.get('laundryName', '')
        laundry_timezone = laundry_info.get('laundryTimeZone', '')
        laundry_stripe_public_key = laundry_info.get('stripePublicKey', '')
        laundry_stripe_terminal_id = laundry_info.get('stripeTerminalId', '')
        terminal_exists = bool(laundry_stripe_terminal_id)
        address_info = laundry_info.get('laundryAddress', {})
        formatted_address = ""
        if address_info:
            street = address_info.get('street', '')
            city = address_info.get('city', '')
            state = address_info.get('state', '')
            zip_code = address_info.get('zipCode', '')
            formatted_address = f"{street}, {city}, {state} {zip_code}"


        # Get promotions Description and Coupon Code
        promotions = laundry_info.get('Promotions', {})
        frequency_promotions = []

        # Determine Uber credentials availability
        uber_env = laundry_info.get('uberEnv', '')
        uber_credentials = laundry_info.get('uberCredentials', {})
        # checks whether Uber credentials exist for the current uberEnv (like 'test' or 'prod') and returns True or False.
        uber_env_credentials_exist = bool(uber_credentials.get(uber_env)) 

        logger.info("Uber environment: %s, Uber credentials exist: %s", uber_env, uber_env_credentials_exist)

        if isCustomer and frequency_interval:
            for freq in frequency_interval:
                for promo_code, promo in promotions.items():
                    if (
                            promo.get('linkedFrequency') == freq
                            and promo.get('isOnlineFrequencyPromo') == True
                            and promo.get('isActive') == True
                    ):
                        frequency_promotions.append({
                            'frequency': freq,
                            'promoCode': promo_code,
                            'description': promo.get('description', '')
                        })
                        break  # Only one promo per frequency, as per your rule

        logger.info("Successfully retrieved laundry info for laundry_id: %s", laundry_id)
        return {
            'status': 'success',
            'laundryServices': laundry_services,
            'deliveryTimeSlots': delivery_time_slots,
            'deliveryTimeInterval': delivery_time_interval,
            'frequencyInterval': frequency_interval,
            'frequencyPromotions': frequency_promotions,
            'laundryTimeZone': laundry_timezone,
            'stripePublicKey': laundry_stripe_public_key,
            'inStorePickupTimeSlots': instore_delivery_time_slots,
            'stripeTerminalExists': terminal_exists,
            'laundryName': laundry_name,
            'laundryAddress': formatted_address,
            'uberEnv': uber_env,
            'uberCredentialsExist': uber_env_credentials_exist
        }

    except ClientError as e:
        logger.error("ClientError in get_laundry_info: %s", e.response['Error']['Message'])
        return {'status': 'error', 'message': f"Unable to get shop info: {e.response['Error']['Message']}"}
    except Exception as e:
        logger.exception("Unexpected error in get_laundry_info")
        return {'status': 'error', 'message': f"An unexpected error occurred: {str(e)}"}


def validate_address(laundry_id, address):
    logger.info("validate_address called with laundry_id: %s, address: %s", laundry_id, address)
    try:
        # Extract zip code and country from the address
        address_parts = address.split(',')
        zip_code = address_parts[-2].split()[-1].strip()  # Extract zip code from address
        country = address_parts[-1].strip()  # Extract country from address
        logger.info("Extracted zip_code: %s, country: %s", zip_code, country)

        response = customer_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('laundryId').eq(laundry_id)
        )
        items = response.get('Items', [])
        if not items:
            logger.warning("Laundry ID %s not found during address validation", laundry_id)
            return {'status': 'error', 'message': 'Laundry ID not found'}

        laundry_info = items[0]
        serviceable_zip_codes = laundry_info.get('serviceableZipCodes', [])
        laundry_country = laundry_info['laundryAddress']['country']
        logger.info("Laundry country: %s, serviceable_zip_codes: %s", laundry_country, serviceable_zip_codes)

        if zip_code in serviceable_zip_codes and country == laundry_country:
            logger.info("Address is serviceable")
            return {'status': 'success', 'serviceable': True, 'headers': CORS_HEADERS}
        else:
            logger.info("Address is NOT serviceable")
            return {'status': 'success', 'serviceable': False, 'headers': CORS_HEADERS}
    except ClientError as e:
        logger.error("ClientError in validate_address: %s", e.response['Error']['Message'])
        return {'status': 'error', 'message': f"Unable to validate address: {e.response['Error']['Message']}"}
    except Exception as e:
        logger.exception("Unexpected error in validate_address")
        return {'status': 'error', 'message': f"An unexpected error occurred: {str(e)}"}


def respond(status_code, body):
    logger.info("respond called with status_code: %s, body: %s", status_code, body)
    return {
        'headers': CORS_HEADERS,
        'body': body
    }


def lambda_handler(event, context):
    logger.info("lambda_handler invoked")
    logger.info("Event: %s", event)
    try:
        params = event.get('queryStringParameters', {})
        logger.info("Query string parameters: %s", params)
        operation = params.get('operation')
        laundry_id = params.get('laundryId')
        address = params.get('address')
        logger.info("Operation: %s, laundry_id: %s, address: %s", operation, laundry_id, address)
        print(event)  # Debug print if needed; logs are preferred.

        if not operation:
            logger.error("Missing operation parameter")
            return '{"status": "error", "message": "Missing operation"}'

        if operation == 'checkLaundryId':
            if not laundry_id:
                logger.error("Missing laundryId for checkLaundryId operation")
                return '{"status": "error", "message": "Missing laundryId"}'
            result = check_laundry_id(laundry_id)
            logger.info("checkLaundryId result: %s", result)
            return result

        elif operation == 'validateAddress':
            if not laundry_id or not address:
                logger.error("Missing laundryId or address for validateAddress operation")
                return '{"status": "error", "message": "Missing laundryId or address"}'
            result = validate_address(laundry_id, address)
            logger.info("validateAddress result: %s", result)
            return result

        elif operation == 'getLaundryInfo':
            if not laundry_id:
                logger.error("Missing laundryId for getLaundryInfo operation")
                return '{"status": "error", "message": "Missing laundryId"}'
            isCustomer = params.get('isCustomer')
            if isCustomer is not None:
                isCustomer = str(isCustomer).lower() == 'true'
            result = get_laundry_info(laundry_id, isCustomer=isCustomer)
            logger.info("getLaundryInfo result: %s", result)
            return result

        logger.error("Unsupported operation: %s", operation)
        return '{"status": "error", "message": "Unsupported operation"}'

    except Exception as e:
        logger.exception("Error in lambda_handler: %s", str(e))
        return f'{{"status": "error", "message": "An unexpected error occurred: {str(e)}"}}'
