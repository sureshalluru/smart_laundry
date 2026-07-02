"""
Item Tracking routes — QR code generation, photo upload, intake/fold confirmation,
category management, and polling for POS sync.
"""
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.database import get_db, get_cursor
from app.services.token_service import generate_token, validate_token, hash_token

logger = logging.getLogger(__name__)

# Import rate limiter from main app
from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)

router = APIRouter()
track_router = APIRouter()  # Public endpoints for mobile upload page (token auth, no admin auth)


def get_laundry_base_url(laundry_id: str) -> str:
    """
    Look up the laundry's custom domain from the database.
    Returns the full URL (https://domain) or falls back to the default.
    """
    try:
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute(
                "SELECT user_domain FROM shop.laundry_shops WHERE laundry_id = %s",
                (laundry_id,),
            )
            row = cur.fetchone()
            if row and row.get("user_domain"):
                domain = row["user_domain"]
                if not domain.startswith("http"):
                    domain = f"https://{domain}"
                return domain
    except Exception as e:
        logger.warning(f"Failed to lookup laundry domain for {laundry_id}: {e}")

    return "https://www.smartlaundrybasket.ai"  # fallback


# ── Models ────────────────────────────────────────────────────────────────────

class QRCodeResponse(BaseModel):
    qrUrl: str
    expiresAt: str
    token: str


# ── QR Code Generation ────────────────────────────────────────────────────────

@router.get("/item-tracking/qr-code", response_model=QRCodeResponse)
async def generate_qr_code(
    orderId: str = Query(..., description="Order ID"),
    laundryId: str = Query(..., description="Laundry shop ID"),
    phase: str = Query(..., description="Phase: intake or fold"),
    employeeId: str = Query(..., description="Employee ID"),
    baseUrl: Optional[str] = Query(None, description="Base URL for the mobile page"),
):
    """
    Generate a QR code URL with an embedded authentication token.
    The QR code links to the mobile upload page for the specified order and phase.
    Creates a tracking session record in the database.
    """
    if phase not in ("intake", "fold"):
        raise HTTPException(status_code=400, detail="Phase must be 'intake' or 'fold'")

    # Generate token
    token = generate_token(
        order_id=orderId,
        laundry_id=laundryId,
        phase=phase,
        employee_id=employeeId,
    )

    # Validate token to get expiry info
    payload = validate_token(token)
    if not payload:
        raise HTTPException(status_code=500, detail="Failed to generate valid token")

    # Build the QR URL
    base = baseUrl or ""
    qr_url = f"{base}/track/{token}"

    # Create tracking session in DB (or update if one already exists)
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """
            INSERT INTO tracking.tracking_sessions
                (order_id, laundry_id, employee_id, phase, token_hash, status, expires_at)
            VALUES (%s, %s, %s, %s, %s, 'waiting', %s)
            ON CONFLICT (order_id, laundry_id, phase) DO UPDATE
            SET token_hash = EXCLUDED.token_hash,
                status = 'waiting',
                expires_at = EXCLUDED.expires_at,
                employee_id = EXCLUDED.employee_id,
                confirmed_at = NULL,
                result_data = NULL
            """,
            (
                orderId,
                laundryId,
                employeeId,
                phase,
                hash_token(token),
                payload.exp,
            ),
        )

    return QRCodeResponse(
        qrUrl=qr_url,
        expiresAt=payload.exp.isoformat(),
        token=token,
    )


# ── Category Management ───────────────────────────────────────────────────────

class CategoryItem(BaseModel):
    categoryId: Optional[str] = None
    name: str
    displayOrder: int = 0
    isActive: bool = True


class CategoryUpdateRequest(BaseModel):
    laundryId: str
    categories: list[CategoryItem]


class CategoryResponse(BaseModel):
    categoryId: str
    name: str
    displayOrder: int
    isActive: bool


@router.get("/item-tracking/categories", response_model=list[CategoryResponse])
async def get_categories(
    laundryId: str = Query(..., description="Laundry shop ID"),
    includeInactive: bool = Query(False, description="Include deactivated categories"),
):
    """
    Get item categories for a laundry shop.
    By default returns only active categories, ordered by display_order.
    If no categories exist, seeds default categories first.
    """
    from app.migrations.add_item_tracking import seed_default_categories

    with get_db() as conn:
        cur = get_cursor(conn)

        # Check if any categories exist — seed defaults if not
        cur.execute(
            "SELECT COUNT(*) AS cnt FROM tracking.item_categories WHERE laundry_id = %s",
            (laundryId,),
        )
        row = cur.fetchone()
        if row and row["cnt"] == 0:
            seed_default_categories(laundryId)
            # Re-fetch after seeding (need new transaction since seed_default_categories uses its own)

    # Fetch categories
    with get_db() as conn:
        cur = get_cursor(conn)

        if includeInactive:
            cur.execute(
                """
                SELECT category_id, name, display_order, is_active
                FROM tracking.item_categories
                WHERE laundry_id = %s
                ORDER BY display_order
                """,
                (laundryId,),
            )
        else:
            cur.execute(
                """
                SELECT category_id, name, display_order, is_active
                FROM tracking.item_categories
                WHERE laundry_id = %s AND is_active = TRUE
                ORDER BY display_order
                """,
                (laundryId,),
            )

        rows = cur.fetchall()

    return [
        CategoryResponse(
            categoryId=str(row["category_id"]),
            name=row["name"],
            displayOrder=row["display_order"],
            isActive=row["is_active"],
        )
        for row in rows
    ]


@router.post("/item-tracking/categories")
async def update_categories(request: CategoryUpdateRequest):
    """
    Add, rename, reorder, or deactivate categories for a laundry.
    Accepts the full list of categories — updates are applied based on categoryId presence.
    - If categoryId is provided: update the existing category (rename, reorder, deactivate)
    - If categoryId is None: insert a new category
    """
    with get_db() as conn:
        cur = get_cursor(conn)

        for cat in request.categories:
            if cat.categoryId:
                # Update existing category
                cur.execute(
                    """
                    UPDATE tracking.item_categories
                    SET name = %s, display_order = %s, is_active = %s, updated_at = NOW()
                    WHERE category_id = %s::uuid AND laundry_id = %s
                    """,
                    (cat.name, cat.displayOrder, cat.isActive, cat.categoryId, request.laundryId),
                )
            else:
                # Insert new category
                cur.execute(
                    """
                    INSERT INTO tracking.item_categories (laundry_id, name, display_order, is_active)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (laundry_id, name) DO UPDATE
                    SET display_order = EXCLUDED.display_order,
                        is_active = EXCLUDED.is_active,
                        updated_at = NOW()
                    """,
                    (request.laundryId, cat.name, cat.displayOrder, cat.isActive),
                )

    return {"status": "success", "message": "Categories updated"}


# ── Mobile Upload Page Endpoints (token-authenticated, no admin auth) ─────────

class PhotoUploadRequest(BaseModel):
    token: str
    images: list[str]  # Base64 encoded images (2-3 angle photos)


class VisionResultItemResponse(BaseModel):
    category: str
    count: int
    confidence: int
    note: Optional[str] = None
    flagged: bool = False


class PhotoUploadResponse(BaseModel):
    status: str
    result: Optional[dict] = None
    error: Optional[str] = None


@track_router.post("/track/upload", response_model=PhotoUploadResponse)
@limiter.limit("10/minute")
async def upload_photos(request: Request, body: PhotoUploadRequest):
    """
    Accept photos from the mobile upload page, upload to S3,
    call Claude Vision, and return structured results.
    Token-based auth (no admin login required).
    """
    from app.services.vision_service import (
        analyze_photos,
        flag_low_confidence,
        VisionServiceError,
    )
    from app.services.s3_service import get_s3_client, DELIVERY_IMAGES_BUCKET
    import asyncio
    import base64
    import uuid

    # Validate token
    payload = validate_token(body.token)
    if not payload:
        logger.warning(f"[item-tracking] Token validation failed: token_prefix={body.token[:20]}...")
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    logger.info(f"[item-tracking] Upload started: order={payload.order_id} laundry={payload.laundry_id} phase={payload.phase} images={len(body.images)}")

    # Validate image count (4 required for full angle coverage)
    if len(body.images) < 2:
        logger.warning(f"[item-tracking] Invalid image count ({len(body.images)}) for order={payload.order_id}")
        raise HTTPException(status_code=400, detail="Minimum 2 photos required (4 recommended: left, right, front, top)")
    if len(body.images) > 4:
        logger.warning(f"[item-tracking] Invalid image count ({len(body.images)}) for order={payload.order_id}")
        raise HTTPException(status_code=400, detail="Maximum 4 photos per upload")

    # Upload images to S3 in parallel and collect bytes for vision service
    async def _upload_single_image(i: int, img_base64: str):
        """Decode, validate, and upload a single image to S3. Returns (url, bytes, content_type)."""
        # Strip data URL prefix if present
        if "," in img_base64 and img_base64.startswith("data:"):
            img_base64 = img_base64.split(",", 1)[1]

        try:
            image_bytes = base64.b64decode(img_base64)
        except Exception:
            logger.warning(f"[item-tracking] Invalid base64 for image {i+1}: order={payload.order_id} laundry={payload.laundry_id}")
            raise HTTPException(status_code=400, detail=f"Invalid base64 data for image {i+1}")

        if len(image_bytes) < 1000:
            logger.warning(f"[item-tracking] Image {i+1} too small ({len(image_bytes)} bytes): order={payload.order_id}")
            raise HTTPException(status_code=400, detail=f"Image {i+1} appears corrupted or too small. Please retake the photo.")

        # Detect content type
        content_type = "image/jpeg"
        ext = "jpg"
        if image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
            content_type = "image/png"
            ext = "png"

        # Upload to S3 (boto3 is synchronous, so use asyncio.to_thread)
        unique_id = uuid.uuid4().hex[:8]
        s3_key = f"{payload.laundry_id}/{payload.order_id}/tracking_{payload.phase}_{unique_id}.{ext}"

        try:
            s3 = get_s3_client()
            await asyncio.to_thread(
                s3.put_object,
                Bucket=DELIVERY_IMAGES_BUCKET,
                Key=s3_key,
                Body=image_bytes,
                ContentType=content_type,
            )
            image_url = f"https://{DELIVERY_IMAGES_BUCKET}.s3.amazonaws.com/{s3_key}"
            return (image_url, image_bytes, content_type)
        except Exception as e:
            logger.error(f"[item-tracking] S3 upload failed: order={payload.order_id} laundry={payload.laundry_id} image={i+1}/{len(body.images)} key={s3_key} error={e}")
            raise HTTPException(status_code=500, detail=f"Storage upload failed for image {i+1}. Please retry.")

    # Run all uploads in parallel
    upload_tasks = [_upload_single_image(i, img) for i, img in enumerate(body.images)]
    upload_results = await asyncio.gather(*upload_tasks, return_exceptions=True)

    # Check for exceptions in results
    for i, result in enumerate(upload_results):
        if isinstance(result, Exception):
            if isinstance(result, HTTPException):
                raise result
            logger.error(f"[item-tracking] Parallel upload failed for image {i+1}: {result}")
            raise HTTPException(status_code=500, detail=f"Storage upload failed for image {i+1}. Please retry.")

    # Separate URLs and bytes from results
    image_urls = [r[0] for r in upload_results]
    image_bytes_list = [(r[1], r[2]) for r in upload_results]  # [(bytes, content_type), ...]

    # Get active categories for this laundry
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """
            SELECT name FROM tracking.item_categories
            WHERE laundry_id = %s AND is_active = TRUE
            ORDER BY display_order
            """,
            (payload.laundry_id,),
        )
        category_rows = cur.fetchall()

    categories = [row["name"] for row in category_rows]
    if not categories:
        # Use defaults if none configured
        from app.migrations.add_item_tracking import DEFAULT_CATEGORIES
        categories = DEFAULT_CATEGORIES

    # Call Claude Vision with pre-loaded image bytes (skips re-download from S3)
    try:
        vision_result = await analyze_photos(image_urls, categories, phase=payload.phase, image_data=image_bytes_list)
    except VisionServiceError as e:
        logger.error(f"[item-tracking] Vision analysis failed: order={payload.order_id} laundry={payload.laundry_id} images_uploaded={len(image_urls)} error={type(e).__name__}: {e}")
        if e.code == "RATE_LIMIT":
            raise HTTPException(status_code=429, detail=e.message)
        raise HTTPException(status_code=503, detail=e.message)
    except Exception as e:
        logger.error(f"[item-tracking] Vision analysis failed: order={payload.order_id} laundry={payload.laundry_id} images_uploaded={len(image_urls)} error={type(e).__name__}: {e}")
        raise HTTPException(status_code=503, detail="AI analysis unavailable. Please retry in a moment.")

    # Flag low-confidence items
    flagged_items = flag_low_confidence(vision_result.items)

    logger.info(f"[item-tracking] Upload complete: order={payload.order_id} laundry={payload.laundry_id} items_found={len(flagged_items)} time_ms={vision_result.processing_time_ms}")

    return PhotoUploadResponse(
        status="success",
        result={
            "items": flagged_items,
            "imageUrls": image_urls,
            "processingTimeMs": vision_result.processing_time_ms,
        },
    )


# ── Intake Confirmation ───────────────────────────────────────────────────────

class ConfirmIntakeRequest(BaseModel):
    token: str
    items: list[dict]  # [{ "category": "Shirts", "count": 5 }]
    photoUrls: list[str]


class ConfirmIntakeResponse(BaseModel):
    status: str
    recordId: Optional[str] = None
    smsSent: bool = False


@track_router.post("/track/confirm-intake", response_model=ConfirmIntakeResponse)
async def confirm_intake(request: ConfirmIntakeRequest):
    """
    Confirm the intake record for an order.
    Saves the intake record, updates the tracking session, and sends SMS to customer.
    """
    from app.services.notification_service import send_sms
    from app.services.sms_formatter import format_intake_sms

    # Validate token
    payload = validate_token(request.token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if payload.phase != "intake":
        raise HTTPException(status_code=400, detail="Token is not for intake phase")

    now = datetime.now(timezone.utc)

    with get_db() as conn:
        cur = get_cursor(conn)

        # Check for duplicate
        cur.execute(
            "SELECT record_id FROM tracking.intake_records WHERE order_id = %s AND laundry_id = %s",
            (payload.order_id, payload.laundry_id),
        )
        existing = cur.fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Intake already recorded for this order")

        # Save intake record
        import json
        cur.execute(
            """
            INSERT INTO tracking.intake_records
                (order_id, laundry_id, employee_id, items, photo_urls, status, confirmed_at)
            VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, 'confirmed', %s)
            RETURNING record_id
            """,
            (
                payload.order_id,
                payload.laundry_id,
                payload.employee_id,
                json.dumps(request.items),
                json.dumps(request.photoUrls),
                now,
            ),
        )
        row = cur.fetchone()
        record_id = str(row["record_id"])

        # Update tracking session to confirmed
        cur.execute(
            """
            UPDATE tracking.tracking_sessions
            SET status = 'confirmed', result_data = %s::jsonb, confirmed_at = %s
            WHERE order_id = %s AND laundry_id = %s AND phase = 'intake' AND status = 'waiting'
            """,
            (
                json.dumps({"recordId": record_id, "items": request.items}),
                now,
                payload.order_id,
                payload.laundry_id,
            ),
        )

        # Auto-update order status to Processing when intake is confirmed
        cur.execute(
            """
            UPDATE orders.orders
            SET order_status = 'Processing', status_category = 'Active', updated_at = NOW()
            WHERE order_id = %s AND laundry_id = %s
              AND order_status IN ('OrderSubmitted', 'ReadyForIntake', 'ReceivedAtFacility')
            """,
            (payload.order_id, payload.laundry_id),
        )

    # Send SMS to customer (non-blocking — don't fail the confirmation if SMS fails)
    sms_sent = False
    try:
        # Look up customer phone and shop name for this order
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute(
                """
                SELECT c.phone_number as customer_phone, c.first_name as customer_name, l.laundry_name
                FROM orders.orders o
                JOIN shop.customers c ON c.customer_id = o.customer_id
                JOIN shop.laundry_shops l ON l.laundry_id = o.laundry_id
                WHERE o.order_id = %s AND o.laundry_id = %s
                """,
                (payload.order_id, payload.laundry_id),
            )
            order_info = cur.fetchone()

        if order_info and order_info.get("customer_phone"):
            # Get laundry's custom domain for the tracking URL
            base_url = get_laundry_base_url(payload.laundry_id)
            sms_message = format_intake_sms(
                shop_name=order_info["laundry_name"],
                order_id=payload.order_id,
                items=request.items,
                base_url=base_url,
                laundry_id=payload.laundry_id,
            )
            sms_sent = send_sms(order_info["customer_phone"], sms_message)
    except Exception as e:
        logger.error(f"Failed to send intake SMS for order {payload.order_id}: {e}")

    return ConfirmIntakeResponse(
        status="success",
        recordId=record_id,
        smsSent=sms_sent,
    )


# ── Fold Confirmation ─────────────────────────────────────────────────────────

class AcknowledgementItem(BaseModel):
    category: str
    reason: str
    intakeCount: Optional[int] = None
    foldCount: Optional[int] = None
    freeText: Optional[str] = None


class ConfirmFoldRequest(BaseModel):
    token: str
    items: list[dict]  # [{ "category": "Shirts", "count": 5 }]
    acknowledgements: list[AcknowledgementItem] = []
    photoUrls: list[str]


class ConfirmFoldResponse(BaseModel):
    status: str
    recordId: Optional[str] = None
    smsSent: bool = False
    discrepancies: list[dict] = []


@track_router.post("/track/confirm-fold", response_model=ConfirmFoldResponse)
async def confirm_fold(request: ConfirmFoldRequest):
    """
    Confirm the fold record for an order.
    Runs reconciliation, validates acknowledgements, saves record, and sends SMS.
    """
    from app.services.notification_service import send_sms
    from app.services.sms_formatter import format_completion_sms
    from app.services.reconciliation_service import compute_discrepancies

    # Validate token
    payload = validate_token(request.token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if payload.phase != "fold":
        raise HTTPException(status_code=400, detail="Token is not for fold phase")

    now = datetime.now(timezone.utc)

    # Fetch intake record for reconciliation
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(
            "SELECT items FROM tracking.intake_records WHERE order_id = %s AND laundry_id = %s",
            (payload.order_id, payload.laundry_id),
        )
        intake_row = cur.fetchone()

    # Compute discrepancies
    discrepancies = []
    if intake_row:
        intake_items = intake_row["items"] if isinstance(intake_row["items"], list) else []
        discrepancies = compute_discrepancies(intake_items, request.items)

        # Validate all discrepancies are acknowledged
        acknowledged_categories = {ack.category for ack in request.acknowledgements}
        unresolved = [d for d in discrepancies if d["category"] not in acknowledged_categories]

        if unresolved:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "All discrepancies must be acknowledged before confirming",
                    "unresolved": unresolved,
                },
            )

    # Save fold record
    import json
    with get_db() as conn:
        cur = get_cursor(conn)

        # Check for duplicate
        cur.execute(
            "SELECT record_id FROM tracking.fold_records WHERE order_id = %s AND laundry_id = %s",
            (payload.order_id, payload.laundry_id),
        )
        existing = cur.fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Fold record already exists for this order")

        acknowledgements_data = [ack.model_dump() for ack in request.acknowledgements]

        cur.execute(
            """
            INSERT INTO tracking.fold_records
                (order_id, laundry_id, employee_id, items, photo_urls,
                 discrepancies, acknowledgements, status, confirmed_at)
            VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, 'confirmed', %s)
            RETURNING record_id
            """,
            (
                payload.order_id,
                payload.laundry_id,
                payload.employee_id,
                json.dumps(request.items),
                json.dumps(request.photoUrls),
                json.dumps(discrepancies),
                json.dumps(acknowledgements_data),
                now,
            ),
        )
        row = cur.fetchone()
        record_id = str(row["record_id"])

        # Update tracking session
        cur.execute(
            """
            UPDATE tracking.tracking_sessions
            SET status = 'confirmed', result_data = %s::jsonb, confirmed_at = %s
            WHERE order_id = %s AND laundry_id = %s AND phase = 'fold' AND status = 'waiting'
            """,
            (
                json.dumps({"recordId": record_id, "items": request.items, "discrepancies": discrepancies}),
                now,
                payload.order_id,
                payload.laundry_id,
            ),
        )

        # Auto-update order status to ProcessingCompleted when fold is confirmed
        cur.execute(
            """
            UPDATE orders.orders
            SET order_status = 'ProcessingCompleted', updated_at = NOW()
            WHERE order_id = %s AND laundry_id = %s
              AND order_status NOT IN ('OrderCanceled', 'Delivered', 'ProcessingCompleted')
            """,
            (payload.order_id, payload.laundry_id),
        )

    # Send completion SMS
    sms_sent = False
    try:
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute(
                """
                SELECT c.phone_number as customer_phone, l.laundry_name
                FROM orders.orders o
                JOIN shop.customers c ON c.customer_id = o.customer_id
                JOIN shop.laundry_shops l ON l.laundry_id = o.laundry_id
                WHERE o.order_id = %s AND o.laundry_id = %s
                """,
                (payload.order_id, payload.laundry_id),
            )
            order_info = cur.fetchone()

        if order_info and order_info.get("customer_phone"):
            base_url = get_laundry_base_url(payload.laundry_id)
            sms_message = format_completion_sms(
                shop_name=order_info["laundry_name"],
                items=request.items,
                has_discrepancies=len(discrepancies) > 0,
                base_url=base_url,
                order_id=payload.order_id,
                laundry_id=payload.laundry_id,
            )
            sms_sent = send_sms(order_info["customer_phone"], sms_message)
    except Exception as e:
        logger.error(f"Failed to send completion SMS for order {payload.order_id}: {e}")

    return ConfirmFoldResponse(
        status="success",
        recordId=record_id,
        smsSent=sms_sent,
        discrepancies=discrepancies,
    )


# ── POS Polling / Sync Endpoints ─────────────────────────────────────────────

class TrackingStatusResponse(BaseModel):
    status: str  # "waiting" | "confirmed" | "expired"
    record: Optional[dict] = None
    qrGeneratedAt: Optional[str] = None
    confirmedAt: Optional[str] = None


@router.get("/item-tracking/status", response_model=TrackingStatusResponse)
async def get_tracking_status(
    orderId: str = Query(...),
    laundryId: str = Query(...),
    phase: str = Query(..., description="intake or fold"),
):
    """
    Polling endpoint for POS to check if the mobile upload flow is complete.
    POS calls this every 3 seconds while waiting for employee to finish on phone.
    """
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """
            SELECT session_id, status, result_data, expires_at, confirmed_at, created_at
            FROM tracking.tracking_sessions
            WHERE order_id = %s AND laundry_id = %s AND phase = %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (orderId, laundryId, phase),
        )
        session = cur.fetchone()

    if not session:
        return TrackingStatusResponse(status="no_session")

    # Check if expired
    now = datetime.now(timezone.utc)
    expires_at = session["expires_at"]
    if hasattr(expires_at, 'tzinfo') and expires_at.tzinfo is None:
        from datetime import timezone as tz
        expires_at = expires_at.replace(tzinfo=tz.utc)

    if session["status"] == "waiting" and now > expires_at:
        return TrackingStatusResponse(
            status="expired",
            qrGeneratedAt=session["created_at"].isoformat() if session["created_at"] else None,
        )

    if session["status"] == "confirmed":
        return TrackingStatusResponse(
            status="confirmed",
            record=session["result_data"],
            confirmedAt=session["confirmed_at"].isoformat() if session["confirmed_at"] else None,
        )

    return TrackingStatusResponse(
        status="waiting",
        qrGeneratedAt=session["created_at"].isoformat() if session["created_at"] else None,
    )


# ── Tracking Record Retrieval ─────────────────────────────────────────────────

class TrackingRecordResponse(BaseModel):
    intakeRecord: Optional[dict] = None
    foldRecord: Optional[dict] = None
    discrepancies: list[dict] = []
    acknowledgements: list[dict] = []


@router.get("/item-tracking/record", response_model=TrackingRecordResponse)
async def get_tracking_record(
    orderId: str = Query(...),
    laundryId: str = Query(...),
):
    """
    Retrieve the full tracking record for an order (intake + fold + discrepancies).
    Used in the order detail view on POS for audit purposes.
    Returns pre-signed URLs for photos so they're accessible in the browser.
    """
    from app.services.s3_service import get_presigned_urls

    with get_db() as conn:
        cur = get_cursor(conn)

        # Fetch intake record
        cur.execute(
            """
            SELECT record_id, items, photo_urls, employee_id, confirmed_at, created_at
            FROM tracking.intake_records
            WHERE order_id = %s AND laundry_id = %s
            """,
            (orderId, laundryId),
        )
        intake_row = cur.fetchone()

        # Fetch fold record
        cur.execute(
            """
            SELECT record_id, items, photo_urls, discrepancies, acknowledgements,
                   employee_id, confirmed_at, created_at
            FROM tracking.fold_records
            WHERE order_id = %s AND laundry_id = %s
            """,
            (orderId, laundryId),
        )
        fold_row = cur.fetchone()

    intake_record = None
    if intake_row:
        intake_record = {
            "recordId": str(intake_row["record_id"]),
            "items": intake_row["items"],
            "photoUrls": get_presigned_urls(intake_row["photo_urls"] or []),
            "employeeId": intake_row["employee_id"],
            "confirmedAt": intake_row["confirmed_at"].isoformat() if intake_row["confirmed_at"] else None,
        }

    fold_record = None
    discrepancies = []
    acknowledgements = []
    if fold_row:
        fold_record = {
            "recordId": str(fold_row["record_id"]),
            "items": fold_row["items"],
            "photoUrls": get_presigned_urls(fold_row["photo_urls"] or []),
            "employeeId": fold_row["employee_id"],
            "confirmedAt": fold_row["confirmed_at"].isoformat() if fold_row["confirmed_at"] else None,
        }
        discrepancies = fold_row["discrepancies"] or []
        acknowledgements = fold_row["acknowledgements"] or []

    return TrackingRecordResponse(
        intakeRecord=intake_record,
        foldRecord=fold_record,
        discrepancies=discrepancies,
        acknowledgements=acknowledgements,
    )


# ── Token Validation (for mobile page load) ───────────────────────────────────

class TokenValidationResponse(BaseModel):
    orderId: str
    laundryId: str
    phase: str
    employeeId: str
    expiresAt: str


@track_router.get("/track/validate", response_model=TokenValidationResponse)
async def validate_tracking_token(token: str = Query(...)):
    """
    Validate a tracking token and return its payload.
    Used by the mobile upload page on load to verify the link is still valid.
    """
    payload = validate_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired link. Please scan a new QR code from the POS.")

    return TokenValidationResponse(
        orderId=payload.order_id,
        laundryId=payload.laundry_id,
        phase=payload.phase,
        employeeId=payload.employee_id,
        expiresAt=payload.exp.isoformat(),
    )


# ── Customer-Facing Photo Access ──────────────────────────────────────────────

class CustomerTrackingResponse(BaseModel):
    orderId: str
    intakeItems: Optional[list[dict]] = None
    intakePhotos: Optional[list[str]] = None
    intakeConfirmedAt: Optional[str] = None
    foldItems: Optional[list[dict]] = None
    foldPhotos: Optional[list[str]] = None
    foldConfirmedAt: Optional[str] = None
    # Order details
    orderStatus: Optional[str] = None
    paymentStatus: Optional[str] = None
    grandTotal: Optional[str] = None
    balanceDue: Optional[str] = None
    pickupDate: Optional[str] = None
    dropoffDate: Optional[str] = None
    services: Optional[list[dict]] = None
    paymentLink: Optional[str] = None


@track_router.get("/track/customer/{order_id}", response_model=CustomerTrackingResponse)
async def get_customer_tracking(
    order_id: str,
    laundryId: str = Query(...),
):
    """
    Public endpoint for customers to view their item tracking photos and counts.
    No auth required — accessible via the order tracking link.
    """
    from app.services.s3_service import get_presigned_urls

    with get_db() as conn:
        cur = get_cursor(conn)

        # Fetch intake record
        cur.execute(
            """
            SELECT items, photo_urls, confirmed_at
            FROM tracking.intake_records
            WHERE order_id = %s AND laundry_id = %s
            """,
            (order_id, laundryId),
        )
        intake_row = cur.fetchone()

        # Fetch fold record
        cur.execute(
            """
            SELECT items, photo_urls, confirmed_at
            FROM tracking.fold_records
            WHERE order_id = %s AND laundry_id = %s
            """,
            (order_id, laundryId),
        )
        fold_row = cur.fetchone()

    # Fetch order details in a separate block (non-critical — don't break tracking if this fails)
    order_row = None
    order_services = []
    try:
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute(
                """
                SELECT order_status, payment_status, grand_total,
                       pickup_date, dropoff_date
                FROM orders.orders
                WHERE order_id = %s AND laundry_id = %s
                """,
                (order_id, laundryId),
            )
            order_row = cur.fetchone()

            if order_row:
                # Compute balance_due from payments
                cur.execute(
                    "SELECT COALESCE(SUM(amount), 0) as paid FROM orders.order_payments WHERE order_id = %s",
                    (order_id,),
                )
                paid_row = cur.fetchone()
                paid_amount = float(paid_row["paid"]) if paid_row else 0
                grand_total = float(order_row["grand_total"] or 0)
                balance_due = max(0, round(grand_total - paid_amount, 2))

                cur.execute(
                    """
                    SELECT service_name, service_price, weight_or_count
                    FROM orders.order_services
                    WHERE order_id = %s
                    """,
                    (order_id,),
                )
                order_services = [
                    {"service": r["service_name"], "servicePrice": str(r["service_price"] or 0), "weightOrCount": str(r["weight_or_count"] or 1)}
                    for r in cur.fetchall()
                ]
    except Exception as e:
        logger.warning(f"[item-tracking] Failed to fetch order details for {order_id}: {e}")
        balance_due = 0

    response = CustomerTrackingResponse(orderId=order_id)

    if intake_row:
        response.intakeItems = intake_row["items"]
        response.intakePhotos = get_presigned_urls(intake_row["photo_urls"] or [])
        response.intakeConfirmedAt = intake_row["confirmed_at"].isoformat() if intake_row["confirmed_at"] else None

    if fold_row:
        response.foldItems = fold_row["items"]
        response.foldPhotos = get_presigned_urls(fold_row["photo_urls"] or [])
        response.foldConfirmedAt = fold_row["confirmed_at"].isoformat() if fold_row["confirmed_at"] else None

    if order_row:
        response.orderStatus = order_row["order_status"]
        response.paymentStatus = order_row["payment_status"]
        response.grandTotal = str(order_row["grand_total"]) if order_row.get("grand_total") else None
        response.balanceDue = str(balance_due) if balance_due > 0 else None
        response.pickupDate = str(order_row["pickup_date"]) if order_row.get("pickup_date") else None
        response.dropoffDate = str(order_row["dropoff_date"]) if order_row.get("dropoff_date") else None
        response.services = order_services

        # Generate payment link only after fold is confirmed and if unpaid
        try:
            if order_row.get("payment_status") != "Paid" and balance_due > 0 and fold_row:
                base_url = get_laundry_base_url(laundryId)
                response.paymentLink = f"{base_url}/{laundryId}/user/my-orders?order_id={order_id}&is_open=true"
        except (ValueError, TypeError):
            pass

    return response


# ── Customer Discrepancy Feedback ─────────────────────────────────────────────

class CustomerFeedbackRequest(BaseModel):
    orderId: str
    laundryId: str
    phase: str  # 'intake' or 'fold'
    customerCounts: list[dict]  # [{ "category": "Shirts", "count": 6 }]
    comment: Optional[str] = None


class CustomerFeedbackResponse(BaseModel):
    status: str
    feedbackId: str


@track_router.post("/track/customer-feedback", response_model=CustomerFeedbackResponse)
async def submit_customer_feedback(request: CustomerFeedbackRequest):
    """
    Customer reports a discrepancy between their actual item counts and what the AI counted.
    Looks up the AI counts from the intake/fold record and saves the feedback for review.
    """
    import json

    if request.phase not in ("intake", "fold"):
        raise HTTPException(status_code=400, detail="Phase must be 'intake' or 'fold'")

    with get_db() as conn:
        cur = get_cursor(conn)

        # Look up the existing record for AI counts and photo URLs
        if request.phase == "intake":
            cur.execute(
                """
                SELECT items, photo_urls
                FROM tracking.intake_records
                WHERE order_id = %s AND laundry_id = %s
                """,
                (request.orderId, request.laundryId),
            )
        else:
            cur.execute(
                """
                SELECT items, photo_urls
                FROM tracking.fold_records
                WHERE order_id = %s AND laundry_id = %s
                """,
                (request.orderId, request.laundryId),
            )

        record = cur.fetchone()
        if not record:
            raise HTTPException(
                status_code=404,
                detail=f"No {request.phase} record found for this order",
            )

        ai_counts = record["items"] if isinstance(record["items"], list) else []
        photo_urls = record["photo_urls"] if record["photo_urls"] else []

        # Save customer feedback
        cur.execute(
            """
            INSERT INTO tracking.customer_feedback
                (order_id, laundry_id, phase, customer_counts, ai_counts, photo_urls, comment)
            VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s)
            RETURNING feedback_id
            """,
            (
                request.orderId,
                request.laundryId,
                request.phase,
                json.dumps(request.customerCounts),
                json.dumps(ai_counts),
                json.dumps(photo_urls),
                request.comment,
            ),
        )
        row = cur.fetchone()
        feedback_id = str(row["feedback_id"])

    return CustomerFeedbackResponse(status="success", feedbackId=feedback_id)


# ── Weight Detection from Scale Photo ─────────────────────────────────────────

class DetectWeightRequest(BaseModel):
    imageBase64: str
    laundryId: str
    orderId: str


class DetectWeightResponse(BaseModel):
    statusCode: int = 200
    body: dict


@router.post("/item-tracking/detect-weight", response_model=DetectWeightResponse)
async def detect_weight(request: DetectWeightRequest):
    """
    Detect the weight displayed on a scale from a photo using Claude Vision AI.

    Accepts a base64-encoded image of a scale, sends it to Claude Vision with
    a weight detection prompt, and returns the detected weight value.

    No admin JWT auth required — protected by PIN session on frontend (same pattern
    as other employee endpoints like photo-upload-status).

    Body:
        imageBase64: Base64 encoded image (optionally with data URL prefix)
        laundryId: Laundry shop ID
        orderId: Order ID

    Returns:
        { "statusCode": 200, "body": { "weight": number|null, "unit": string|null, "confidence": number } }
    """
    import base64
    import json
    import anthropic
    from app.config import settings
    from app.services.vision_service import build_weight_detection_prompt

    image_base64 = request.imageBase64

    if not image_base64:
        return DetectWeightResponse(
            statusCode=400,
            body={"message": "Missing imageBase64 in request body", "weight": None, "confidence": 0}
        )

    # Strip data URL prefix if present
    if "," in image_base64 and image_base64.startswith("data:"):
        image_base64 = image_base64.split(",", 1)[1]

    # Validate base64 data
    try:
        image_bytes = base64.b64decode(image_base64)
    except Exception:
        return DetectWeightResponse(
            statusCode=400,
            body={"message": "Invalid base64 image data", "weight": None, "confidence": 0}
        )

    if len(image_bytes) < 1000:
        return DetectWeightResponse(
            statusCode=400,
            body={"message": "Image appears corrupted or too small", "weight": None, "confidence": 0}
        )

    # Detect content type
    media_type = "image/jpeg"
    if image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
        media_type = "image/png"

    # Send to Claude Vision for weight detection
    try:
        if not settings.anthropic_api_key:
            logger.warning("[item-tracking] Anthropic API key not configured for weight detection")
            return DetectWeightResponse(
                statusCode=503,
                body={"message": "Vision AI not configured", "weight": None, "confidence": 0}
            )

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        # Resize image if needed (reuse the utility from vision_service)
        from app.services.vision_service import _resize_image
        image_bytes = _resize_image(image_bytes, media_type, max_dimension=1024)

        # Re-encode after potential resize
        img_base64_encoded = base64.standard_b64encode(image_bytes).decode("utf-8")

        # Build the weight detection prompt
        weight_prompt = build_weight_detection_prompt()

        # Call Claude Vision — use Sonnet for reliable scale reading
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=128,
            system=weight_prompt,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": img_base64_encoded,
                            },
                        },
                        {
                            "type": "text",
                            "text": "Please read the weight displayed on the scale in this photo.",
                        },
                    ],
                }
            ],
        )

        # Parse the response
        response_text = response.content[0].text
        logger.info(f"[item-tracking] Weight detection response for order={request.orderId}: {response_text[:200]}")

        # Extract JSON from response
        text = response_text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:])
            if text.endswith("```"):
                text = text[:-3].strip()

        result_data = json.loads(text)

        weight = result_data.get("weight")
        unit = result_data.get("unit")
        confidence = result_data.get("confidence", 0)

        # Validate the parsed values
        if weight is not None:
            try:
                weight = float(weight)
            except (TypeError, ValueError):
                weight = None
                confidence = 0

        if isinstance(confidence, (int, float)):
            confidence = int(confidence)
        else:
            confidence = 0

        return DetectWeightResponse(
            statusCode=200,
            body={"weight": weight, "unit": unit, "confidence": confidence}
        )

    except json.JSONDecodeError as e:
        logger.warning(f"[item-tracking] Weight detection JSON parse failed for order={request.orderId}: {e}")
        return DetectWeightResponse(
            statusCode=200,
            body={"weight": None, "unit": None, "confidence": 0}
        )
    except anthropic.APIConnectionError as e:
        logger.error(f"[item-tracking] Claude API connection error for weight detection: {e}")
        return DetectWeightResponse(
            statusCode=200,
            body={"weight": None, "unit": None, "confidence": 0}
        )
    except anthropic.RateLimitError as e:
        logger.error(f"[item-tracking] Claude API rate limit for weight detection: {e}")
        return DetectWeightResponse(
            statusCode=200,
            body={"weight": None, "unit": None, "confidence": 0}
        )
    except anthropic.APIStatusError as e:
        logger.error(f"[item-tracking] Claude API error for weight detection: {e}")
        return DetectWeightResponse(
            statusCode=200,
            body={"weight": None, "unit": None, "confidence": 0}
        )
    except Exception as e:
        logger.error(f"[item-tracking] Unexpected error in weight detection for order={request.orderId}: {e}")
        return DetectWeightResponse(
            statusCode=200,
            body={"weight": None, "unit": None, "confidence": 0}
        )


# ── Admin Feedback Review ─────────────────────────────────────────────────────

@router.get("/item-tracking/feedback")
async def get_customer_feedback(
    laundryId: str = Query(..., description="Laundry shop ID"),
    status: Optional[str] = Query(None, description="Filter by status: pending, reviewed, resolved"),
    orderId: Optional[str] = Query(None, description="Filter by order ID"),
):
    """
    Admin endpoint to list customer feedback entries for review.
    Used to identify AI counting errors and improve prompts.
    """
    with get_db() as conn:
        cur = get_cursor(conn)

        query = """
            SELECT feedback_id, order_id, laundry_id, phase,
                   customer_counts, ai_counts, photo_urls, comment, status, created_at
            FROM tracking.customer_feedback
            WHERE laundry_id = %s
        """
        params = [laundryId]

        if status:
            query += " AND status = %s"
            params.append(status)

        if orderId:
            query += " AND order_id = %s"
            params.append(orderId)

        query += " ORDER BY created_at DESC"

        cur.execute(query, tuple(params))
        rows = cur.fetchall()

    return [
        {
            "feedbackId": str(row["feedback_id"]),
            "orderId": row["order_id"],
            "laundryId": row["laundry_id"],
            "phase": row["phase"],
            "customerCounts": row["customer_counts"],
            "aiCounts": row["ai_counts"],
            "photoUrls": row["photo_urls"],
            "comment": row["comment"],
            "status": row["status"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        }
        for row in rows
    ]
