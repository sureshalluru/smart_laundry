"""
driver_operations.py — image upload and order status update for drivers.
PostgreSQL + audit triggers.
"""
import uuid
import base64
import logging
import boto3
from utils import generate_response, get_single_order_details, get_current_timestamp, execute_order_update, get_status_category
from order_history import log_order_update
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3_client = boto3.client('s3')


def handle_upload_image(body, laundry_id, order_id, emp_id):
    image_base64 = body.get('imageBase64')
    photo_upload_timestamp = body.get('photoUploadTimestamp')
    delivery_photo_upload_timestamp = body.get('deliveryPhotoUploadTimestamp')

    if not image_base64 or not laundry_id or not order_id:
        return generate_response(400, {"message": "Missing required parameters for uploading image."})

    try:
        current_order_status, current_order = get_single_order_details("getSingleOrder", laundry_id, order_id)
        if current_order_status != 200 or "orderStatus" not in current_order:
            return generate_response(404, {"message": "Order not found."})
        old_status = current_order.get("orderStatus", "Unknown")
    except Exception as e:
        return generate_response(500, {"message": f"Error retrieving order: {str(e)}"})

    upload_result = upload_image_to_s3(image_base64, "laundry-delivery-images")
    if upload_result['status'] != 'success':
        return generate_response(500, {"message": "Failed to upload image.", "error": upload_result['message']})

    image_url = upload_result['url']

    # Determine new status based on current status
    new_status = old_status
    if old_status == "OrderSubmitted":
        new_status = "ReadyForIntake"
    elif old_status == "EnRouteToDelivery":
        new_status = "Delivered"

    # Set emp_id so the DB trigger records who made this change
    db.set_emp_id(emp_id)

    update_expression = "SET imageUrl = :imageUrl, updatedAt = :updatedAt"
    expression_values = {":imageUrl": image_url, ":updatedAt": get_current_timestamp()}

    if new_status != old_status:
        update_expression += ", orderStatus = :orderStatus"
        expression_values[":orderStatus"] = new_status
        new_cat = get_status_category(new_status)
        update_expression += ", statusCategory = :statusCategory"
        expression_values[":statusCategory"] = new_cat

    if photo_upload_timestamp:
        update_expression += ", photoUploadTimestamp = :photoUploadTimestamp"
        expression_values[":photoUploadTimestamp"] = photo_upload_timestamp

    if delivery_photo_upload_timestamp:
        update_expression += ", deliveryPhotoUploadTimestamp = :deliveryPhotoUploadTimestamp"
        expression_values[":deliveryPhotoUploadTimestamp"] = delivery_photo_upload_timestamp

    updated_order = execute_order_update(order_id, update_expression, expression_values)

    # Also write to order_history (trigger handles order_audit_log automatically)
    log_order_update(laundry_id, order_id, emp_id, {'orderStatus': {'old': old_status, 'new': new_status}})

    return generate_response(200, {
        "message": "Image uploaded and order updated successfully.",
        "imageUrl": image_url,
        "updatedOrder": updated_order
    })


def upload_image_to_s3(image_base64, bucket_name):
    try:
        image_binary = base64.b64decode(image_base64)
        file_name = f"images/{uuid.uuid4().hex}.jpg"
        s3_client.put_object(Bucket=bucket_name, Key=file_name, Body=image_binary, ContentType="image/jpeg")
        return {"status": "success", "url": f"https://{bucket_name}.s3.amazonaws.com/{file_name}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
