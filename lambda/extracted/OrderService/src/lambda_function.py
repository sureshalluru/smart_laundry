import json
import boto3
import logging
from enum import Enum
from order_placement import place_order, in_store_place_order, instoreProductsOrder, cancel_online_order
from commercial_order_info import placeCommercialLaundryOrders
from uber_integration import uber_place_order_new

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# DynamoDB table references removed — all DB operations use PostgreSQL via db.py


# Order Status Enum class
class OrderStatus(Enum):
    ORDER_SUBMITTED = "OrderSubmitted"  # Laundry Order submitted by the customer
    ORDER_PICKED_UP = "OrderPickedUp"  # Laundry Order has been picked up from the customer’s location
    READY_FOR_INTAKE = "ReadyForIntake"  # Laundry Order is ready to be processed at the facility
    RECEIVED = "ReceivedAtFacility"  # Laundry Order has been received at the processing facility
    PROCESSING_STARTED = "ProcessingStarted"  # Laundry Order Processing has started
    PROCESSING_COMPLETED = "ProcessingCompleted"  # Laundry Order Processing done
    EN_ROUTE_TO_DELIVERY = 'EnRouteToDelivery'  # Laundry on its way to Customer
    DELIVERED = "Delivered"  # Laundry Delivered to Customer
    ORDER_CANCELED = "OrderCanceled"  # Laundry Order Canceled by the Customer


# Payment Status Enum class
class PaymentStatus(Enum):
    PAYMENT_INITIATED = 'Unpaid'
    PAYMENT_SUCCESS = 'Paid'


# Order Type Enum class
class OrderType(Enum):
    INSTORE = 'InStore'
    ONLINE = 'Online'


# Enum for Laundry Products Order Attributes
class LaundryProductsOrderAttributes(Enum):
    ORDER_ID = "productOrderId"  # Maps to 'ProductsOrderId' in DynamoDB
    LAUNDRY_ID = "laundryId"
    ITEMS_SOLD = "itemsSold"
    TOTAL_PRICE = "totalPrice"
    CREATED_DATETIME = "createdAt"
    PAYMENT_METHOD = "paymentMethod"
    PAYMENT_INTENT_ID = "paymentIntentId"


def lambda_handler(event, context):
    logger.info("lambda_handler invoked")
    logger.info(f"Received event: {json.dumps(event)}")
    try:
        # Extract the query string parameters
        # operation = event.get('operation')
        operation = event.get('operation') or event.get('queryStringParameters', {}).get('operation')
        if not operation:
            logger.error("Missing operation in event")
            return {'status': 'error', 'message': 'Missing operation'}
        logger.info(f"Operation: {operation}")
        if operation == 'placeOrder':
            response = place_order(event)
            logger.info(f"placeOrder response: {response}")
            return response
        elif operation == 'inStorePlaceOrder':
            response = in_store_place_order(event)
            logger.info(f"inStorePlaceOrder response: {response}")
            return response
        # elif operation == 'inStoreTestPlaceOrder':
        #     response = in_store_test_place_order(event)
        #     logger.info(f"inStoreTestPlaceOrder response: {response}")
        #     return response
        elif operation == 'cancelOnlineOrder':
            customer_id = event.get('customerId')
            order_id = event.get('orderId')
            laundry_id = event.get('laundryId')
            cancelReason = event.get('cancelReason')
            new_address = event.get('address')
            isRecurring = True if event.get('isRecurring') == 'true' else False
            if not customer_id or not order_id or not laundry_id:
                logger.error("Missing required parameters for cancelOnlineOrder")
                return {'status': 'error', 'message': 'Missing Required Parameters.'}
            if not cancelReason:
                response = cancel_online_order(order_id, customer_id, laundry_id, isRecurring, new_address)
            elif cancelReason == '':
                response = cancel_online_order(order_id, customer_id, laundry_id, isRecurring, new_address)
            else:
                response = cancel_online_order(order_id, customer_id, laundry_id, isRecurring, new_address, cancelReason)

            logger.info(f"cancelOnlineOrder response: {response}")
            return response
        elif operation == 'otherInstoreOrders':
            response = instoreProductsOrder(event)
            logger.info(f"otherInstoreOrders response: {response}")
            return response
        elif operation == 'CommercialLaundryOrders':
            response = placeCommercialLaundryOrders(event)
            logger.info(f"CommercialLaundryOrders response: {response}")
            return response
        elif operation == 'uberPlaceOrder':                
            resp = uber_place_order_new(event)
            logger.info(f"uberPlaceOrder response: {resp}")
            return resp
        
        else:
            logger.error("Invalid operation requested")
            return {'status': 'error', 'message': 'Invalid operation'}
    except Exception as e:
        logger.exception(f"Error in lambda_handler: {str(e)}")
        return {'status': 'error', 'message': f"An unexpected error occurred: {str(e)}"}


        logger.error(f"Error publishing metric: {str(e)}")