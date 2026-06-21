"""
S3 Image Upload Service.
Handles reliable image uploads to AWS S3 for driver pickup photos,
weight/scale photos, and review images.
"""
import boto3
import base64
import uuid
import logging
from botocore.exceptions import ClientError, NoCredentialsError
from app.config import settings

logger = logging.getLogger(__name__)

# S3 bucket for delivery/order images
DELIVERY_IMAGES_BUCKET = "laundry-delivery-images"
REVIEW_IMAGES_BUCKET = "laundry-review-images"

# Initialize S3 client (uses AWS credentials from environment or IAM role)
_s3_client = None


def get_s3_client():
    """Get or create S3 client. Uses AWS credentials from env vars or IAM role."""
    global _s3_client
    if _s3_client is None:
        try:
            _s3_client = boto3.client(
                "s3",
                region_name=settings.aws_region or "us-east-1",
            )
            logger.info("S3 client initialized")
        except Exception as e:
            logger.warning(f"S3 client init warning: {e}")
            _s3_client = boto3.client("s3", region_name="us-east-1")
    return _s3_client


def upload_order_image(laundry_id: str, order_id: str, image_base64: str, image_type: str = "pickup") -> dict:
    """
    Upload an order image to S3.
    
    Args:
        laundry_id: The laundry shop ID
        order_id: The order ID
        image_base64: Base64 encoded image data (with or without data: prefix)
        image_type: "pickup" or "weight"
    
    Returns:
        dict with "status", "url" on success, or "status", "message" on failure
    """
    try:
        # Strip data URL prefix if present
        if "," in image_base64 and image_base64.startswith("data:"):
            image_base64 = image_base64.split(",", 1)[1]

        # Decode base64 to bytes
        try:
            image_bytes = base64.b64decode(image_base64)
        except Exception as decode_err:
            logger.error(f"Base64 decode failed: {decode_err}")
            return {"status": "error", "message": "Invalid image data"}

        # Validate minimum size (a real photo should be at least 1KB)
        if len(image_bytes) < 1000:
            logger.warning(f"Image too small ({len(image_bytes)} bytes) for order {order_id}")
            return {"status": "error", "message": "Image data appears corrupted or too small"}

        # Detect content type from bytes
        content_type = "image/jpeg"  # default
        if image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
            content_type = "image/png"
        elif image_bytes[:4] == b'\x00\x00\x00\x1c' or image_bytes[:4] == b'\x00\x00\x00 ':
            content_type = "image/heic"
        elif image_bytes[:2] == b'\xff\xd8':
            content_type = "image/jpeg"

        # Generate S3 key
        ext = "jpg" if "jpeg" in content_type else content_type.split("/")[-1]
        unique_id = uuid.uuid4().hex[:8]
        s3_key = f"{laundry_id}/{order_id}/{image_type}_{unique_id}.{ext}"

        # Upload to S3
        s3 = get_s3_client()
        s3.put_object(
            Bucket=DELIVERY_IMAGES_BUCKET,
            Key=s3_key,
            Body=image_bytes,
            ContentType=content_type,
        )

        # Generate public URL
        image_url = f"https://{DELIVERY_IMAGES_BUCKET}.s3.amazonaws.com/{s3_key}"

        logger.info(f"Image uploaded to S3: {image_url} ({len(image_bytes)} bytes)")
        return {"status": "success", "url": image_url}

    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "Unknown")
        logger.error(f"S3 upload failed ({error_code}): {e}")
        return {"status": "error", "message": f"Storage upload failed: {error_code}"}
    except Exception as e:
        logger.exception(f"Image upload error for order {order_id}")
        return {"status": "error", "message": f"Upload failed: {str(e)}"}


def upload_review_image(laundry_id: str, order_id: str, image_base64: str) -> dict:
    """
    Upload a review image to S3.
    
    Returns:
        dict with "status", "url" on success
    """
    try:
        # Strip data URL prefix if present
        if "," in image_base64 and image_base64.startswith("data:"):
            image_base64 = image_base64.split(",", 1)[1]

        image_bytes = base64.b64decode(image_base64)
        if len(image_bytes) < 500:
            return {"status": "error", "message": "Image too small"}

        content_type = "image/jpeg"
        if image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
            content_type = "image/png"

        s3_key = f"{laundry_id}/reviews/{order_id}.jpg"

        s3 = get_s3_client()
        s3.put_object(
            Bucket=REVIEW_IMAGES_BUCKET,
            Key=s3_key,
            Body=image_bytes,
            ContentType=content_type,
        )

        image_url = f"https://{REVIEW_IMAGES_BUCKET}.s3.amazonaws.com/{s3_key}"
        logger.info(f"Review image uploaded: {image_url}")
        return {"status": "success", "url": image_url}

    except Exception as e:
        logger.exception(f"Review image upload error for order {order_id}")
        return {"status": "error", "message": str(e)}


def generate_presigned_url(bucket: str, key: str, expires_in: int = 3600) -> str:
    """
    Generate a pre-signed URL for accessing a private S3 object.

    Args:
        bucket: S3 bucket name
        key: Object key in the bucket
        expires_in: URL validity in seconds (default 1 hour)

    Returns:
        Pre-signed URL string, or the direct URL if signing fails
    """
    try:
        s3 = get_s3_client()
        url = s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': key},
            ExpiresIn=expires_in,
        )
        return url
    except Exception as e:
        logger.warning(f"Failed to generate pre-signed URL: {e}")
        # Fallback to direct URL
        return f"https://{bucket}.s3.amazonaws.com/{key}"


def get_presigned_urls(photo_urls: list[str], expires_in: int = 3600) -> list[str]:
    """
    Convert a list of S3 URLs to pre-signed URLs.

    Args:
        photo_urls: List of S3 URLs (https://bucket.s3.amazonaws.com/key)
        expires_in: URL validity in seconds

    Returns:
        List of pre-signed URLs
    """
    presigned = []
    for url in photo_urls:
        try:
            # Parse bucket and key from URL
            # Format: https://bucket-name.s3.amazonaws.com/key/path
            if ".s3.amazonaws.com/" in url:
                parts = url.split(".s3.amazonaws.com/", 1)
                bucket = parts[0].replace("https://", "")
                key = parts[1]
                presigned.append(generate_presigned_url(bucket, key, expires_in))
            else:
                presigned.append(url)
        except Exception:
            presigned.append(url)
    return presigned
