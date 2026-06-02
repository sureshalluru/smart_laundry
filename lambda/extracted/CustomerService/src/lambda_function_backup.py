import json
import boto3
import logging
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError
from decimal import Decimal
import datetime
import base64
import urllib.parse

# Configure logger for AWS Lambda
logger = logging.getLogger()
logger.setLevel(logging.INFO)
s3 = boto3.client('s3')

dynamodb = boto3.resource('dynamodb')
customer_table = dynamodb.Table('Customer')
orders_table = dynamodb.Table('LaundryOrders')
laundry_frequency_table = dynamodb.Table('LaundryFrequency')
employee_table = dynamodb.Table('Employee')
review_table = dynamodb.Table('Reviews')

# Helper to convert Decimal to float/int recursively
def convert_decimal(obj):
    if isinstance(obj, list):
        return [convert_decimal(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        # Convert to int if it's a whole number, else float
        return int(obj) if obj % 1 == 0 else float(obj)
    return obj

# To check if the customer exists in the Database and retrieve the customer information
def get_customer_information(customer_id):
    logger.info(f"get_customer_information called with customer_id={customer_id}")
    try:
        logger.info("Querying the Customer table for the given customer_id.")
        response = customer_table.query(
            KeyConditionExpression=Key('customerId').eq(customer_id)
        )
        if 'Items' not in response or len(response['Items']) == 0:
            logger.warning(f"No customer found for customerId={customer_id}")
            return {
                "statusCode": 404,
                "body": json.dumps({
                    "status": "error",
                    "message": "Customer not found"
                })
            }

        logger.info("Customer record found. Extracting data.")
        # Extract customer information
        customer_data = response['Items'][0]
        email = customer_data.get("email")
        first_name = customer_data.get("firstName")
        last_name = customer_data.get("lastName")
        phone_number = customer_data.get("phoneNumber")
        addresses = customer_data.get("addresses", [])
        notification_preferences = customer_data.get("notification_preferences", {})

        # Extract all frequencyIds from the addresses
        frequency_ids = [addr.get('frequencyId') for addr in addresses if addr.get('frequencyId')]
        logger.info(f"Found frequency_ids={frequency_ids} in customer addresses.")
        # Use BatchGetItem to retrieve all frequency details in one call
        frequency_details = []
        if frequency_ids:
            logger.info("Calling batch_get_item for frequency details.")

            # Retrieve customerId for each frequencyId from customer record
            keys = [{'frequencyId': addr['frequencyId'], 'customerId': customer_id}
                    for addr in addresses if 'frequencyId' in addr]

            logger.info(f"Formatted Keys for batch_get_item: {keys}")

            batch_response = dynamodb.batch_get_item(
                RequestItems={
                    'LaundryFrequency': {
                        'Keys': keys
                    }
                }
            )

            frequency_items = batch_response.get('Responses', {}).get('LaundryFrequency', [])

            # Create a mapping of frequencyId to frequency data
            frequency_map = {(item['frequencyId'], item['customerId']): item for item in frequency_items}

            # Build frequency details list based on addresses
            for address in addresses:
                frequency_id = address.get('frequencyId')
                if frequency_id and (frequency_id, customer_id) in frequency_map:
                    frequency_data = frequency_map[(frequency_id, customer_id)]
                    frequency_details.append({
                        "frequencyId": frequency_id,
                        "address": address.get("address"),
                        "frequency": frequency_data.get("frequency"),
                        "frequencyCreatedDate": frequency_data.get('frequencyCreatedDate'),
                        "frequencyStartDate": frequency_data.get("frequencyStartDate"),
                        "futurePickupDate": frequency_data.get('futurePickupDate'),
                        "dropoffTimeInterval": frequency_data.get("dropoffTimeInterval"),
                        "pickupDate": frequency_data.get("pickupDate"),
                        "pickupTimeInterval": frequency_data.get("pickupTimeInterval")
                    })

        logger.info("Successfully retrieved customer and frequency details.")
        return {
            "statusCode": 200,
            "body": json.dumps({
                "status": "success",
                "data": {
                    "email": email,
                    "firstName": first_name,
                    "lastName": last_name,
                    "phoneNumber": phone_number,
                    "addresses": addresses,
                    "notificationPreferences": notification_preferences,
                    "frequencyDetails": frequency_details
                }
            })
        }

    except ClientError as e:
        logger.error(f"ClientError while fetching customer: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "status": "error",
                "message": f"Unable to check customer: {e.response['Error']['Message']}"
            })
        }
    except Exception as e:
        logger.error(f"Unexpected error in get_customer_information: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "status": "error",
                "message": f"An unexpected error occurred: {str(e)}"
            })
        }

# To check if the customer exists in the Database and retrieve the customer information
def get_customer_details(customer_id):
    logger.info(f"get_customer_details called with customer_id={customer_id}")
    try:
        logger.info("Querying the Customer table for the given customer_id.")
        response = customer_table.query(
            KeyConditionExpression=Key('customerId').eq(customer_id)
        )
        if 'Items' not in response or len(response['Items']) == 0:
            logger.warning(f"No customer found for customerId={customer_id}")
            return {
                "statusCode": 404,
                "body": json.dumps({
                    "status": "error",
                    "message": "Customer not found"
                })
            }

        logger.info("Customer record found. Extracting data.")
        # Extract customer information
        customer_data = response['Items'][0]
        email = customer_data.get("email")
        first_name = customer_data.get("firstName")
        last_name = customer_data.get("lastName")
        phone_number = customer_data.get("phoneNumber")
        addresses = customer_data.get("addresses", [])
        notification_preferences = customer_data.get("notification_preferences", {})
        customer_payment_ids = customer_data.get('customerPaymentId', {})

        logger.info("Successfully retrieved customer details.")
        return {
            "statusCode": 200,
            "body": {
                "status": "success",
                "data": {
                    "email": email,
                    "firstName": first_name,
                    "lastName": last_name,
                    "phoneNumber": phone_number,
                    "addresses": addresses,
                    "notificationPreferences": notification_preferences,
                    "customerPaymentId": customer_payment_ids
                }
            }
        }

    except ClientError as e:
        logger.error(f"ClientError while fetching customer: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "status": "error",
                "message": f"Unable to check customer: {e.response['Error']['Message']}"
            })
        }
    except Exception as e:
        logger.error(f"Unexpected error in get_customer_details: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "status": "error",
                "message": f"An unexpected error occurred: {str(e)}"
            })
        }

def show_all_customers(laundry_id, last_evaluated_key=None, batch_size=20):
    try:
        # Define scan parameters with a filter that checks if 'laundryId' contains the given laundry_id.
        scan_params = {
            'FilterExpression': Attr('laundryId').contains(laundry_id),
            'Limit': batch_size  # Limit the number of items scanned per batch.
        }

        # If a last_evaluated_key is provided and valid, include it to continue from the previous scan.
        if last_evaluated_key and isinstance(last_evaluated_key, dict):
            scan_params['ExclusiveStartKey'] = last_evaluated_key

        # Execute the scan on the customer table.
        response = customer_table.scan(**scan_params)
        items = response.get('Items', [])

        formatted_customers = []
        for item in items:
            try:
                # Get the laundry-specific stats from the nested 'laundryStats' dictionary.
                # Convert laundry_id to string since keys in 'laundryStats' are stored as strings.
                laundry_stats = item.get('laundryStats', {}).get(str(laundry_id), {})

                # Build the customer dictionary with the desired fields.
                customer = {
                    "customerId": item.get('customerId', ''),
                    "firstName": item.get('firstName', ''),
                    "lastName": item.get('lastName', ''),
                    "email": item.get('email', ''),
                    "phoneNumber": item.get('phoneNumber', ''),
                    "notification_preferences": item.get('notification_preferences', {
                        "email": False,
                        "phone": False
                    }),
                    "addresses": item.get('addresses', []),
                    # Extract laundry-specific stats, converting values where necessary.
                    "totalOrdersPlaced": int(laundry_stats.get('totalOrdersPlaced', 0)),
                    "totalOrderValue": float(laundry_stats.get('totalOrderValue', 0.0)),
                    "currentOrders": laundry_stats.get('currentOrders', []),
                    "lastCompletedOrder": laundry_stats.get('lastCompletedOrder', {})
                }
                formatted_customers.append(customer)
            except Exception as e:
                # If any error occurs processing an individual item, skip it.
                continue

        # Prepare the response body with the customer data and pagination information.
        response_body = {
            "status": "success",
            "customers": formatted_customers,
            "pagination": {
                "batchSize": batch_size,
                # Return the DynamoDB LastEvaluatedKey directly. It should be formatted as a dict.
                "lastEvaluatedKey": response.get('LastEvaluatedKey'),
                "hasMore": bool(response.get('LastEvaluatedKey'))
            }
        }

        # Return the response with a successful status code.
        return {
            "statusCode": 200,
            "body": convert_decimal(response_body)  # Assumes convert_decimal converts DynamoDB decimals.
        }

    except Exception as e:
        # In case of errors, return a 500 status code with the error message.
        return {
            "statusCode": 500,
            "body": {
                "status": "error",
                "message": str(e)
            }
        }


# Update the notification preferences for a customer
def update_notification_preferences(customer_id, notification_preferences):
    logger.info(f"update_notification_preferences called with customer_id={customer_id}, "
                f"notification_preferences={notification_preferences}")
    try:
        # First, check if the customer exists
        logger.info("Checking if the customer exists in the Customer table.")
        response = customer_table.get_item(Key={'customerId': customer_id})
        if 'Item' not in response:
            logger.warning(f"No customer found for customerId={customer_id}.")
            return {
                "statusCode": 404,
                "body": json.dumps({
                    "status": "error",
                    "message": "Customer not found"
                })
            }

        logger.info("Customer found. Updating notification preferences.")
        # Update notification_preferences for the customer
        response = customer_table.update_item(
            Key={'customerId': customer_id},
            UpdateExpression="SET notification_preferences = :preferences",
            ExpressionAttributeValues={
                ':preferences': notification_preferences
            },
            ReturnValues="UPDATED_NEW"
        )
        logger.info("Notification preferences updated successfully.")
        return {
            "statusCode": 200,
            "body": json.dumps({
                "status": "success",
                "message": "Notification preferences updated successfully",
                "updatedPreferences": response['Attributes']['notification_preferences']
            })
        }
    except ClientError as e:
        logger.error(f"ClientError while updating notification preferences: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "status": "error",
                "message": f"Unable to update notification preferences: {e.response['Error']['Message']}"
            })
        }
    except Exception as e:
        logger.error(f"Unexpected error in update_notification_preferences: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "status": "error",
                "message": f"An unexpected error occurred: {str(e)}"
            })
        }

# Get the Orders List for the Customer
def get_order_details(customer_id, laundry_id, limit, last_evaluated_key):
    logger.info(f"get_order_details called with customer_id={customer_id}, laundry_id={laundry_id}, "
                f"limit={limit}, last_evaluated_key={last_evaluated_key}")
    try:
        # Use the GSI 'CustomerLaundryIndex' with partition key: laundryId and sort key: createdAt.
        query_params = {
            'IndexName': 'CustomerLaundryIndex',
            'KeyConditionExpression': Key('laundryId').eq(laundry_id),
            'FilterExpression': Attr('customerId').eq(customer_id),
            'ProjectionExpression': 'orderId, orderType, createdAt, totalCost, orderStatus, paymentStatus',
            'Limit': limit,
            'ScanIndexForward': False  # Retrieve in descending order (newest orders first)
        }
        if last_evaluated_key:
            query_params['ExclusiveStartKey'] = json.loads(last_evaluated_key)

        logger.info("Querying orders table using the CustomerLaundryIndex GSI.")
        response = orders_table.query(**query_params)
        items = response.get('Items', [])
        logger.info(f"Fetched {len(items)} items from the Orders table.")

        return {
            "statusCode": 200,
            "body": {
                "status": "success",
                "data": items,
                "lastKey": json.dumps(response.get('LastEvaluatedKey', None)) if response.get(
                    'LastEvaluatedKey') else None
            }
        }

    except ClientError as e:
        logger.error(f"ClientError while fetching orders: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "status": "error",
                "message": f"Unable to fetch orders: {e.response['Error']['Message']}"
            })
        }
    except Exception as e:
        logger.error(f"Unexpected error in get_order_details: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "status": "error",
                "message": f"An unexpected error occurred: {str(e)}"
            })
        }

# Get the Individual Order Details of the Customer
def get_order_by_id(order_id, customer_id):
    logger.info(f"get_order_by_id called with order_id={order_id}, customer_id={customer_id}")
    try:
        # Fetch the order details from the LaundryOrders table
        logger.info(f"Fetching order data from Orders table for orderId={order_id}.")
        order_response = orders_table.get_item(Key={'orderId': order_id})
        if 'Item' not in order_response:
            logger.warning(f"No order found for orderId={order_id}.")
            return {
                "statusCode": 404,
                "body": json.dumps({
                    "status": "error",
                    "message": "Order not found"
                })
            }

        logger.info("Order record found. Extracting required fields.")
        order_data = order_response['Item']
        
        logger.info(order_data)
        extracted_order_data = {
            "orderId": order_data.get("orderId"),
            "customerId": order_data.get("customerId"),
            "autoGenerated": order_data.get("autoGenerated"),
            "coupon": order_data.get("coupon"),
            "pickupDate": order_data.get("pickupDate"),
            "dropoffDate": order_data.get("dropoffDate"),
            "addressId": order_data.get("addressId"),
            "dropoffTimeInterval": order_data.get("dropoffTimeInterval"),
            "pickupTimeInterval": order_data.get("pickupTimeInterval"),
            "services": order_data.get("services"),
            "createdAt":order_data.get('createdAt'),
            "specialInstructions": order_data.get("specialInstructions"),
            "totalCost": order_data.get("totalCost"),
            "paymentStatus": order_data.get("paymentStatus"),
            "orderStatus": order_data.get("orderStatus"),
            "laundryBags": order_data.get("laundryBags"),
            "finalPaymentIntentId": order_data.get("finalPaymentIntentId"),
            "tip": order_data.get("tip", {}),
            "orderType": order_data.get("orderType", ""),
            "discountedPrice": order_data.get("discountedPrice", 0),
            "isReviewed":order_data.get("isReviewed",False),
        }
        extracted_order_data["pickupService"] = order_data.get("pickupService", "")
        extracted_order_data["dropoffService"] = order_data.get("dropoffService", "")
        # # Include uberPickupFee only if pickupService is Uber and fee exists
        # if order_data.get("pickupService") == "Uber" and "uberInfo" in order_data:
        #     extracted_order_data["uberPickupFee"] = order_data["uberPickupFee"]

        # # Include uberDropoffFee only if dropoffService is Uber and fee exists
        # if order_data.get("dropoffService") == "Uber" and "uberDropoffFee" in order_data:
        #     extracted_order_data["uberDropoffFee"] = order_data["uberDropoffFee"]

        uber_info = order_data.get("uberInfo", {})

        # Uber Pickup Info
        if order_data.get("pickupService") == "Uber":
            pickup_info = uber_info.get("laundryPickup")
            if pickup_info:
                if "feeCents" in pickup_info:
                    extracted_order_data["uberPickupFee"] = round(pickup_info["feeCents"] / 100, 2)
                if "trackingUrl" in pickup_info:
                    extracted_order_data["pickupTrackingUrl"] = pickup_info["trackingUrl"]
                if "status" in pickup_info:
                    extracted_order_data["pickupStatus"] = pickup_info["status"]

        # Uber Dropoff Info
        if order_data.get("dropoffService") == "Uber":
            dropoff_info = uber_info.get("laundryDropoff")
            if dropoff_info:
                if "feeCents" in dropoff_info:
                    extracted_order_data["uberDropoffFee"] = round(dropoff_info["feeCents"] / 100, 2)
                if "trackingUrl" in dropoff_info:
                    extracted_order_data["dropoffTrackingUrl"] = dropoff_info["trackingUrl"]
                if "status" in dropoff_info:
                    extracted_order_data["dropoffStatus"] = dropoff_info["status"]


        # Include Uber details if present
        # if "uber" in order_data:
        #     extracted_order_data["uber"] = order_data["uber"]
        # If tipReceiverId exists in the tip object, fetch employee details to display in the review message
        tip_receiver_id = extracted_order_data['tip'].get('tipReceiverId')
        if tip_receiver_id:
            logger.info(f"Tip receiver found: {tip_receiver_id}. Fetching employee details.")
            try:
                employee_response = employee_table.get_item(
                    Key={
                        'empId': tip_receiver_id,
                        'laundryId': order_data.get('laundryId', '')
                    }
                )
                if 'Item' in employee_response:
                    employee_data = employee_response['Item']
                    extracted_order_data['employee'] = {
                        'firstName': employee_data.get('firstName', ''),
                        'lastName': employee_data.get('lastName', '')
                    }
                    logger.info(f"Successfully fetched employee details for empId={tip_receiver_id}")
                else:
                    logger.warning(f"Employee not found for empId={tip_receiver_id}")
            except Exception as e:
                logger.error(f"Error fetching employee details: {str(e)}")

        if extracted_order_data['customerId'] != customer_id:
            logger.warning(f"Order customerId={extracted_order_data['customerId']} does not match the provided customerId={customer_id}.")
            return {
                "statusCode": 404,
                "body": json.dumps({
                    "status": "error",
                    "message": "Order does not exist for this customer"
                })
            }
        # If addressId exists, fetch address details from the customer record
        if extracted_order_data['addressId'] != '':
            logger.info(f"AddressId found: {extracted_order_data['addressId']}. Fetching address.")
            customer_response = customer_table.get_item(Key={'customerId': customer_id})
            if 'Item' not in customer_response:
                logger.warning(f"Customer not found for customerId={customer_id} when retrieving address.")
                return {
                    "statusCode": 404,
                    "body": json.dumps({
                        "status": "error",
                        "message": "Customer not found"
                    })
                }
            customer_data = customer_response['Item']
            address_id = order_data.get("addressId")
            addresses = customer_data.get("addresses", [])

            matching_address = next(
                (addr for addr in addresses if addr.get("addressId") == address_id), None
            )

            if not matching_address:
                logger.warning(f"Address not found for addressId={address_id} in customer record.")
                return {
                    "statusCode": 404,
                    "body": json.dumps({
                        "status": "error",
                        "message": "Address not found for the given addressId"
                    })
                }
            extracted_order_data.update({
                "address": matching_address.get("address"),
                "addressInstructions": matching_address.get("addressInstructions"),
                "doorNumber": matching_address.get("doorNumber"),
            })
        else:
            logger.info("No addressId present. Adding empty address fields.")
            extracted_order_data.update({
                "address": '',
                "addressInstructions": '',
                "doorNumber": '',
            })

        logger.info("Returning combined order and address details.")
        return {
            "statusCode": 200,
            "body": {
                "status": "success",
                "data": extracted_order_data
            }
        }

    except ClientError as e:
        logger.error(f"ClientError while fetching order data: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "status": "error",
                "message": f"Unable to fetch data: {e.response['Error']['Message']}"
            })
        }
    except Exception as e:
        logger.error(f"Unexpected error in get_order_by_id: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "status": "error",
                "message": f"An unexpected error occurred: {str(e)}"
            })
        }

def create_review(order_id, customer_id, laundry_id, employee_id, employee_rating, order_date, review_comment, image):
    try:
        logger.info(f"Starting review creation for order_id={order_id}, customer_id={customer_id}")
        image_url = None

        # Process image if provided
        if image:
            logger.info("Image data received, preparing to upload to S3")
            try:
                image_key = f"laundry-review-images/{laundry_id}/images/{order_id}.jpg"
                logger.info(f"Generated S3 key: {image_key}")

                # Log image metadata (without logging actual binary data)
                logger.info(f"Image details - Type: {type(image)}, Length: {len(image) if hasattr(image, '__len__') else 'N/A'}")

                # Upload to S3
                logger.info("Attempting S3 put_object operation")
                image=base64.b64decode(image)
                s3.put_object(
                    Bucket='laundry-review-images',
                    Key=image_key,
                    Body=image,
                    ContentType='image/jpeg'
                )
                logger.info("S3 upload successful")

                image_url = f"https://laundry-review-images.s3.amazonaws.com/{image_key}"
                logger.info(f"Generated image URL: {image_url}")
            except Exception as upload_error:
                logger.error(f"Failed to upload image to S3: {str(upload_error)}")
                logger.error(f"S3 upload error details: {upload_error.response['Error'] if hasattr(upload_error, 'response') else 'No additional error info'}")
                raise upload_error
        else:
            logger.info("No image data provided, skipping image upload")

        # Create review record
        review_date = datetime.datetime.utcnow().isoformat() + 'Z'
        review_item = {
            'laundryId#empId': f"{laundry_id}#{employee_id}",
            'orderDate#orderId': f"{order_date}#{order_id}",
            'reviewDate': review_date,
            'employeeRating': employee_rating,
            'reviewComment': review_comment,
            'photoUrl': image_url,
            'customerId': customer_id,
        }
        logger.info(f"Prepared review item: {review_item}")

        logger.info("Attempting to save review to DynamoDB")
        review_table.put_item(Item=review_item)
        logger.info("Review saved to DynamoDB successfully")

        # Update related records
        logger.info(f"Updating employee rating for employee_id={employee_id}")
        update_employee_rating(employee_id, employee_rating, laundry_id)

        logger.info(f"Updating review status for order_id={order_id}")
        update_order_review_status(order_id)

        return {
            'status': 'success',
            'message': 'Review submitted successfully',
            'imageUrl': image_url
        }

    except Exception as e:
        logger.error(f"Error in create_review: {str(e)}", exc_info=True)
        return {
            'status': 'error',
            'message': str(e)
        }

def update_employee_rating(employee_id, new_rating,laundry_id):
    """Update employee's average rating with proper calculation"""
    try:
        logger.info(f"Updating rating for employee {employee_id}")

        # Get current employee data
        response = employee_table.get_item(
            Key={
                'empId': employee_id,
                'laundryId': laundry_id
            }
        )
        employee = response.get('Item', {})

        # Handle first review case
        current_avg = Decimal(employee.get('avgRating', '0.0'))
        total_reviews = Decimal(employee.get('totalReviews', '0'))

        if 'avgRating' not in employee or 'totalReviews' not in employee:
            # First review - set rating directly
            new_avg = new_rating
            new_total_reviews = 1
        else:
            # Calculate new average
            new_total_reviews = total_reviews + 1
            new_avg = (current_avg  + new_rating) / 2
            new_avg = new_avg.quantize(Decimal('0.1'))

        logger.info(f"New average: {new_avg}, Total reviews: {new_total_reviews}")

        # Update employee record
        employee_table.update_item(
            Key={
                'empId': employee_id,
                'laundryId': laundry_id
            },
            UpdateExpression='SET avgRating = :avg, totalReviews = :total',
            ExpressionAttributeValues={
                ':avg': new_avg,
                ':total': int(new_total_reviews)
            },
            ReturnValues='UPDATED_NEW'
        )

    except Exception as e:
        logger.error(f"Error updating employee rating: {str(e)}")
        raise

def update_order_review_status(order_id):
    """Mark order as reviewed"""
    try:
        logger.info(f"Updating review status for order {order_id}")
        orders_table.update_item(
            Key={'orderId': order_id},
            UpdateExpression='SET isReviewed = :reviewed',
            ExpressionAttributeValues={
                ':reviewed': True
            }
        )
    except Exception as e:
        logger.error(f"Error updating order status: {str(e)}")
        raise

# Delete an address based on addressId and customerId
def delete_address(customer_id, address_id):
    logger.info(f"delete_address called with customer_id={customer_id}, address_id={address_id}")
    try:
        logger.info("Retrieving customer record for address deletion.")
        response = customer_table.get_item(Key={'customerId': customer_id})
        if 'Item' not in response:
            logger.warning(f"No customer record found for customerId={customer_id}.")
            return {
                "statusCode": 404,
                "body": json.dumps({
                    "status": "error",
                    "message": "Customer not found"
                })
            }

        customer_data = response['Item']
        addresses = customer_data.get('addresses', [])

        # Find the address to be deleted
        logger.info("Searching for the specified address to delete.")
        address_to_delete = None
        for address in addresses:
            if address.get('addressId') == address_id:
                address_to_delete = address
                break

        if not address_to_delete:
            logger.warning(f"Address with addressId={address_id} not found.")
            return {
                "statusCode": 404,
                "body": json.dumps({
                    "status": "error",
                    "message": "Address not found"
                })
            }

        freq_id = address_to_delete.get('frequencyId')
        if freq_id:
            logger.warning(
                f"Cannot delete addressId={address_id} because it has a recurring order with frequencyId={freq_id}.")
            return {
                "statusCode": 404,
                "body": json.dumps({
                    "status": "error",
                    "message": "This address cannot be deleted because recurring order exists."
                })
            }

        logger.info(f"AddressId={address_id} can be deleted. Proceeding with removal.")
        updated_addresses = [address for address in addresses if address.get('addressId') != address_id]
        if len(addresses) == len(updated_addresses):
            logger.warning("No address was removed. Address not found.")
            return {
                "statusCode": 404,
                "body": json.dumps({
                    "status": "error",
                    "message": "Address not found"
                })
            }

        logger.info("Updating customer record in DynamoDB after address deletion.")
        customer_table.update_item(
            Key={'customerId': customer_id},
            UpdateExpression="SET addresses = :updated_addresses",
            ExpressionAttributeValues={':updated_addresses': updated_addresses}
        )
        logger.info("Address deleted successfully.")
        return {
            "statusCode": 200,
            "body": json.dumps({
                "status": "success",
                "message": "Address deleted successfully"
            })
        }

    except ClientError as e:
        logger.error(f"ClientError while deleting address: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "status": "error",
                "message": f"Unable to delete address: {e.response['Error']['Message']}"
            })
        }
    except Exception as e:
        logger.error(f"Unexpected error in delete_address: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "status": "error",
                "message": f"An unexpected error occurred: {str(e)}"
            })
        }

def lambda_handler(event, context):
    logger.info(f"lambda_handler invoked with event={event}")
    params = event.get('queryStringParameters', {}) or {}
    logger.info(f"Query string parameters: {params}")

    body = event.get('body', '{}')
    if isinstance(body, str):
        body = json.loads(body)

    try:
        operation = params.get('operation')
        logger.info(f"Operation requested: {operation}")

        if operation == 'getCustomerInformation':
            customer_id = params.get('customerId')
            if not customer_id:
                logger.warning("Missing customerId in getCustomerInformation request.")
                return {
                    "statusCode": 400,
                    "body": json.dumps({
                        "status": "error",
                        "message": "Missing customerId"
                    })
                }
            response = get_customer_information(customer_id)
            logger.info(f"getCustomerInformation response: {response}")
            return response

        elif operation == 'getOrderDetails':
            customer_id = params.get('customerId')
            laundry_id = params.get('laundryId')
            limit = 30
            last_evaluated_key = params.get('lastKey')
            if not customer_id or not laundry_id:
                logger.warning("Missing customerId or laundryId in getOrderDetails request.")
                return {
                    "statusCode": 400,
                    "body": json.dumps({
                        "status": "error",
                        "message": "Missing customerId or laundryId"
                    })
                }
            response = get_order_details(customer_id, laundry_id, limit, last_evaluated_key)
            logger.info(f"getOrderDetails response: {response}")
            return response

        elif operation == 'getCustomerOrderInfo':
            order_id = params.get('orderId')
            customer_id = params.get('customerId')
            if not order_id or not customer_id:
                logger.warning("Missing orderId or customerId in getCustomerOrderInfo request.")
                return {
                    "statusCode": 400,
                    "body": json.dumps({
                        "status": "error",
                        "message": "Missing orderId or customerId"
                    })
                }
            response = get_order_by_id(order_id, customer_id)
            logger.info(f"getCustomerOrderInfo response: {response}")
            return response

        elif operation == 'updateNotificationPreferences':
            customer_id = params.get('customerId')
            try:
                notification_preferences = json.loads(params.get('notificationPreferences', '{}'))
            except json.JSONDecodeError:
                logger.warning("Invalid JSON for notificationPreferences.")
                return {
                    "statusCode": 400,
                    "body": json.dumps({
                        "status": "error",
                        "message": "Invalid notificationPreferences format"
                    })
                }

            if not customer_id or not notification_preferences:
                logger.warning(
                    "Missing customerId or notificationPreferences in updateNotificationPreferences request.")
                return {
                    "statusCode": 400,
                    "body": json.dumps({
                        "status": "error",
                        "message": "Missing customerId or notificationPreferences"
                    })
                }
            response = update_notification_preferences(customer_id, notification_preferences)
            logger.info(f"updateNotificationPreferences response: {response}")
            return response

        elif operation == 'deleteCustomerAddress':
            customer_id = params.get('customerId')
            address_id = params.get('addressId')
            if not customer_id or not address_id:
                logger.warning("Missing customerId or addressId in deleteCustomerAddress request.")
                return {
                    "statusCode": 400,
                    "body": json.dumps({
                        "status": "error",
                        "message": "Missing customerId or addressId"
                    })
                }
            response = delete_address(customer_id, address_id)
            logger.info(f"deleteCustomerAddress response: {response}")
            return response

        elif operation == 'showAllCustomers':
            batch_size_str = params.get('batchSize', '50')
            batch_size = int(batch_size_str) if batch_size_str else 50
            batch_size = max(1, min(batch_size, 100))

            last_evaluated_key = None
            if 'lastEvaluatedKey' in params and params['lastEvaluatedKey']:
                try:
                    decoded_key = urllib.parse.unquote(params['lastEvaluatedKey'])
                    last_evaluated_key = json.loads(decoded_key)
                    logger.info(f"Parsed lastEvaluatedKey: {last_evaluated_key}")
                except json.JSONDecodeError:
                    logger.error("Invalid lastEvaluatedKey format")
                    last_evaluated_key = None

            laundry_id = params.get('laundryId')
            response = show_all_customers(laundry_id, last_evaluated_key, batch_size)
            return response

        elif operation == 'getCustomerDetailsForAdmin':
            customer_id = params.get('customerId')
            if not customer_id:
                logger.warning("Missing customerId in getCustomerDetailsForAdmin request.")
                return {
                    "statusCode": 400,
                    "body": json.dumps({
                        "status": "error",
                        "message": "Missing customerId"
                    })
                }
            response = get_customer_details(customer_id)
            logger.info(f"getCustomerDetailsForAdmin response: {response}")
            return response
        elif operation == 'createReview':
            logger.info("Processing review creation")
            print(body)
            order_id = body.get('orderId')
            customer_id = body.get('customerId')
            laundry_id = body.get('laundryId')
            employee_rating = body.get('employeeRating')
            order_date = body.get('orderDate')
            review_comment = body.get('reviewComment')
            employee_id = body.get('employeeId')
            image=body.get('imageBase64')

            result = create_review(order_id,customer_id,laundry_id, employee_id ,employee_rating, order_date,  review_comment, image )
            logger.info(f"Review creation result: {result}")
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps(result)
            }

        else:
            logger.warning(f"Unsupported operation: {operation}")
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "status": "error",
                    "message": "Unsupported operation"
                })
            }

    except Exception as e:
        logger.error(f"Unhandled exception in lambda_handler: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "status": "error",
                "message": f"An unexpected error occurred: {str(e)}"
            })
        }


