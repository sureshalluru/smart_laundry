import boto3
from datetime import datetime
import logging

cloudwatch = boto3.client('cloudwatch', region_name='us-east-1')
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# def publish_order_metric(metric_name, order_type="Online", laundry_id=None, status="success", customer_id=None):
#     dimensions = [
#         {'Name': 'OrderType', 'Value': order_type}
#     ]
#     if laundry_id:
#         dimensions.append({'Name': 'LaundryId', 'Value': laundry_id})

#     try:
#         cloudwatch.put_metric_data(
#             Namespace='LaundryOrders',
#             MetricData=[
#                 {
#                     'MetricName': metric_name,
#                     'Dimensions': dimensions,
#                     'Timestamp': datetime.utcnow(),
#                     'Value': 1,
#                     'Unit': 'Count'
#                 }
#             ]
#         )
#         if status == 'failed':
#             logger.error(f"[FAILED ORDER] CustomerID: {customer_id}, LaundryID: {laundry_id}")
#         else:
#             logger.info(f"[SUCCESS ORDER] Order placed for LaundryID: {laundry_id}")
#     except Exception as e:
#         logger.error(f"Error publishing CloudWatch metric: {str(e)}")

def publish_order_metric(metric_name, order_type="Online", laundry_id=None, status="success", customer_id=None):
    dimensions = [{'Name': 'OrderType', 'Value': order_type}]
    if laundry_id:
        dimensions.append({'Name': 'LaundryId', 'Value': laundry_id})

    logger.info(f"[CloudWatch] Publishing metric: {metric_name}, Dimensions: {dimensions}, Status: {status}")

    try:
        cloudwatch.put_metric_data(
            Namespace='LaundryOrders',
            MetricData=[{
                'MetricName': metric_name,
                'Dimensions': dimensions,
                'Timestamp': datetime.utcnow(),
                'Value': float(1),
                'Unit': 'Count'
            }]
        )
        if status == 'failed':
            logger.error(f"[FAILED ORDER] CustomerID: {customer_id}, LaundryID: {laundry_id}")
        else:
            logger.info(f"[SUCCESS ORDER] Order placed for LaundryID: {laundry_id}")
    except Exception as e:
        logger.exception(f"[CloudWatch] Failed to publish metric '{metric_name}'")
