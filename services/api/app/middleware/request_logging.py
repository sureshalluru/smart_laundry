"""
Global request logging middleware.
Provides structured error logging with request IDs for traceability.
"""
import time
import uuid
import logging
import traceback
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse

logger = logging.getLogger("smart_laundry.requests")

# Endpoints to skip detailed logging (high-frequency polling)
SKIP_LOG_PATHS = {
    "/api/chat/messages",
    "/api/chat/admin/conversations",
    "/api/laundry/validate-laundry",
    "/api/laundry/get-info",
    "/api/admin/item-tracking/status",
    "/health",
}


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip non-API and static file requests
        path = request.url.path
        if not path.startswith("/api") and path != "/health":
            return await call_next(request)

        # Skip noisy polling endpoints
        if path in SKIP_LOG_PATHS:
            return await call_next(request)

        # Generate request ID
        request_id = uuid.uuid4().hex[:12]
        request.state.request_id = request_id

        # Extract context from URL/query params for log enrichment
        context = _extract_context(request)

        method = request.method
        client_ip = request.client.host if request.client else "unknown"
        start_time = time.time()

        # Log request start (DEBUG level — only visible in verbose mode)
        logger.debug(f"[{request_id}] {method} {path} started | ip={client_ip} {context}")

        try:
            response = await call_next(request)
        except Exception as exc:
            # This catches unhandled exceptions that would otherwise be a silent 500
            duration_ms = int((time.time() - start_time) * 1000)
            logger.error(
                f"[{request_id}] UNHANDLED EXCEPTION | {method} {path} | "
                f"duration={duration_ms}ms | {context} | "
                f"error={type(exc).__name__}: {exc}\n"
                f"{traceback.format_exc()}"
            )
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error", "requestId": request_id},
                headers={"X-Request-ID": request_id},
            )

        duration_ms = int((time.time() - start_time) * 1000)
        status = response.status_code

        # Add request ID to response headers
        response.headers["X-Request-ID"] = request_id

        # Log based on status code
        if status >= 500:
            logger.error(f"[{request_id}] {method} {path} → {status} | {duration_ms}ms | {context}")
        elif status >= 400:
            logger.warning(f"[{request_id}] {method} {path} → {status} | {duration_ms}ms | {context}")
        else:
            # Only log slow successful requests (>2s) at INFO, otherwise DEBUG
            if duration_ms > 2000:
                logger.info(f"[{request_id}] {method} {path} → {status} | {duration_ms}ms (SLOW) | {context}")
            else:
                logger.debug(f"[{request_id}] {method} {path} → {status} | {duration_ms}ms | {context}")

        return response


def _extract_context(request: Request) -> str:
    """Extract useful context from the request for logging."""
    parts = []

    # Try to get laundry_id from query params
    laundry_id = request.query_params.get("laundryId") or request.query_params.get("laundry_id")
    if laundry_id:
        parts.append(f"laundry={laundry_id}")

    # Try to get order_id from query params
    order_id = request.query_params.get("orderId") or request.query_params.get("order_id")
    if order_id:
        parts.append(f"order={order_id}")

    # Extract laundry_id from path (common pattern: /api/admin/orders-info?laundryId=5)
    path_parts = request.url.path.split("/")
    for i, part in enumerate(path_parts):
        if part == "laundry" and i + 1 < len(path_parts) and path_parts[i + 1].isdigit():
            parts.append(f"laundry={path_parts[i + 1]}")
            break

    return " | ".join(parts) if parts else ""
