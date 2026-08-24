"""
Smart Laundry — single-port application.
Serves API routes + both React frontends from one process.

Routes:
  /api/*      → Backend API (FastAPI)
  /admin/*    → Admin/POS React app
  /*          → Customer ordering React app
"""
import os
import logging
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.config import settings

logger = logging.getLogger(__name__)

# Rate limiter — per IP address
limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])

# Suppress noisy access logs for polling endpoints and bot probes
class SuppressPollingFilter(logging.Filter):
    def filter(self, record):
        msg = record.getMessage()
        # Suppress frequent polling/routine endpoints
        if "/api/chat/messages" in msg:
            return False
        if "/api/chat/admin/conversations" in msg:
            return False
        if "/api/laundry/validate-laundry" in msg:
            return False
        if "/api/laundry/get-info" in msg:
            return False
        if "/api/admin/item-tracking/status" in msg:
            return False
        if "/api/tracking/driver" in msg:
            return False
        if "/health" in msg:
            return False
        # Suppress bot scanner probes
        if ".php" in msg or ".asp" in msg or "/wp-" in msg or "/.env" in msg:
            return False
        return True

logging.getLogger("uvicorn.access").addFilter(SuppressPollingFilter())

# Configure structured request logging
logging.getLogger("smart_laundry.requests").setLevel(logging.DEBUG if os.environ.get("DEBUG") else logging.INFO)

from app.routes import (
    auth,
    orders_info,
    orders,
    customers,
    payments,
    laundry_shop,
    validation,
    employees,
    promotions,
    notifications,
    uber,
    frequency,
    admin_extra,
    driver,
    payment_operations,
    customer_public,
    chat,
    platform_admin,
    dashboard,
    engagement,
    export,
    item_tracking,
    route_planning,
    onboarding_verification,
    reports,
    tracking,
    company,
    company_join,
    faq,
    faq_admin,
    city_pages,
    sitemap,
    admin_integrations,
    referrals,
    demo,
    counter_mock,
)

app = FastAPI(
    title="Smart Laundry API",
    version="1.0.0",
    description="Unified backend + frontend for Smart Laundry platform",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# Start background scheduler and run migrations on app startup
@app.on_event("startup")
def startup_event():
    import os
    if os.environ.get("SKIP_MIGRATIONS") != "1":
        from app.migrations import run_all as run_migrations
        run_migrations()
    else:
        logger.info("Skipping migrations (SKIP_MIGRATIONS=1)")
    from app.scheduler import start_scheduler
    start_scheduler()

    # Initialize encryption service (validates MASTER_ENCRYPTION_KEY)
    from app.services.encryption_service import get_encryption_service
    enc = get_encryption_service()
    if enc:
        logger.info("[startup] EncryptionService initialized — tenant key encryption enabled")
    else:
        logger.warning("[startup] EncryptionService not available — MASTER_ENCRYPTION_KEY not configured")

# CORS (still needed for local dev when React dev servers run separately)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Structured Request Logging ────────────────────────────────────────────────
from app.middleware.request_logging import RequestLoggingMiddleware
app.add_middleware(RequestLoggingMiddleware)

# ── API Routes ────────────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(orders_info.router, prefix="/api/admin", tags=["Admin Orders"])
app.include_router(admin_extra.router, prefix="/api/admin", tags=["Admin Extra"])
app.include_router(orders.router, prefix="/api/orders", tags=["Order Placement"])
app.include_router(customers.router, prefix="/api/customers", tags=["Customers"])
app.include_router(customers.router, prefix="/api/customer", tags=["Customer Compat"])
app.include_router(payments.router, prefix="/api/payments", tags=["Payments"])
app.include_router(payment_operations.router, prefix="/api/payment", tags=["Payment Operations"])
app.include_router(laundry_shop.router, prefix="/api/laundry", tags=["Laundry Shop"])
app.include_router(validation.router, prefix="/api/laundry", tags=["Validation"])
app.include_router(employees.router, prefix="/api/employees", tags=["Employees"])
app.include_router(promotions.router, prefix="/api/promotions", tags=["Promotions"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(uber.router, prefix="/api/uber", tags=["Uber Integration"])
app.include_router(frequency.router, prefix="/api/frequency", tags=["Order Frequency"])
app.include_router(driver.router, prefix="/api/driver", tags=["Driver"])
app.include_router(customer_public.router, prefix="/api/customer", tags=["Customer Public"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(platform_admin.router, prefix="/api/platform", tags=["Platform Admin"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(engagement.router, prefix="/api/engagement", tags=["Customer Engagement"])
app.include_router(export.router, prefix="/api/admin", tags=["Export"])
app.include_router(item_tracking.router, prefix="/api/admin", tags=["Item Tracking"])
app.include_router(item_tracking.track_router, prefix="/api", tags=["Item Tracking Mobile"])
app.include_router(route_planning.router, prefix="/api/routes", tags=["Route Planning"])
app.include_router(admin_integrations.router, prefix="/api/admin", tags=["Admin Integrations"])
app.include_router(onboarding_verification.router, prefix="/api/platform/onboard", tags=["Onboarding Verification"])
app.include_router(company_join.router, prefix="/api/platform/onboard", tags=["Company Join"])
app.include_router(reports.router, prefix="/api/admin/reports", tags=["Financial Reports"])
app.include_router(tracking.router, prefix="/api/tracking", tags=["Driver Tracking"])
app.include_router(tracking.public_router, prefix="/api/tracking", tags=["Driver Tracking Public"])
app.include_router(company.router, prefix="/api/company", tags=["Company Management"])
app.include_router(faq.router, prefix="/api/faq", tags=["FAQ Public"])
app.include_router(faq_admin.router, prefix="/api/admin/faq", tags=["FAQ Admin"])
app.include_router(city_pages.router, prefix="/api/city-pages", tags=["City SEO Pages"])
app.include_router(sitemap.router, prefix="/api", tags=["SEO Sitemap"])
app.include_router(referrals.router, prefix="/api/referrals", tags=["Referrals"])
app.include_router(demo.router, prefix="/api/demo", tags=["Demo Mode"])

# Garment-counter demo mock (Jetson + EC2). Mounted only when explicitly
# enabled so it never serves fabricated data in a real environment. Point the
# counter PWA's Camera and Cloud URLs at <origin>/mockapi to demo it.
if settings.enable_demo_counter:
    app.include_router(counter_mock.router, prefix="/mockapi", tags=["Counter Mock (DEMO)"])
    logger.warning("Garment-counter DEMO mock enabled at /mockapi — serving fabricated data.")


# Block bot scanners probing for PHP/WordPress/exploit files
@app.middleware("http")
async def block_bot_scanners(request: Request, call_next):
    from fastapi.responses import Response
    path = request.url.path.lower()
    # Block requests for PHP files, common exploit paths
    blocked_extensions = ('.php', '.asp', '.aspx', '.jsp', '.cgi', '.env', '.git', '.sql')
    blocked_paths = ('/wp-', '/wordpress', '/xmlrpc', '/.env', '/.git', '/admin.php', '/shell')
    if any(path.endswith(ext) for ext in blocked_extensions) or any(bp in path for bp in blocked_paths):
        return Response(status_code=404, content="Not Found")
    return await call_next(request)


# ── App Version endpoint ──────────────────────────────────────────────────────
# Returns the build timestamp so clients can detect stale bundles.
# The version is set at server startup time (each deploy = new version).
import time as _time
_APP_BUILD_VERSION = str(int(_time.time()))

@app.get("/api/version")
async def app_version():
    """Returns current app build version. Clients poll this to detect deploys."""
    from fastapi.responses import JSONResponse
    return JSONResponse(
        content={"version": _APP_BUILD_VERSION},
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


@app.get("/health")
async def health_check():
    import os
    from app.scheduler import scheduler
    return {
        "status": "healthy",
        "scheduler_running": scheduler.running,
        "scheduled_jobs": len(scheduler.get_jobs()) if scheduler.running else 0,
        "twilio_configured": bool(settings.twilio_account_sid and settings.twilio_auth_token),
        "email_configured": bool(settings.source_email),
        "twilio_sid_from_env": os.environ.get("TWILIO_ACCOUNT_SID", "NOT SET")[:10] + "..." if os.environ.get("TWILIO_ACCOUNT_SID") else "NOT SET",
        "twilio_sid_from_settings": settings.twilio_account_sid[:10] + "..." if settings.twilio_account_sid else "EMPTY",
    }


# ── Static File Serving (React builds) ────────────────────────────────────────
# These paths are relative to where uvicorn runs from (services/api/)
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent  # smart-laundry/
ADMIN_BUILD = BASE_DIR / "apps" / "admin" / "build"
CUSTOMER_BUILD = BASE_DIR / "apps" / "customer" / "build"
# Garment counter is a Vite app: builds to dist/ (not build/) and hashed
# assets live under assets/ (not static/).
COUNTER_BUILD = BASE_DIR / "apps" / "garment-counter" / "dist"

# Static file serving — DON'T use app.mount (can only serve one directory)
# Instead, handle /static requests in the catch-all by checking both builds

# Admin SPA catch-all: /admin/* → admin/build/index.html
@app.get("/admin")
@app.get("/admin/{full_path:path}")
async def serve_admin(request: Request, full_path: str = ""):
    """Serve admin React app for all /admin/* routes."""
    if full_path:
        file_path = ADMIN_BUILD / full_path
        if file_path.is_file():
            # Static assets with hashes — cache forever; others no-cache
            if full_path.startswith("static/"):
                return FileResponse(file_path, headers={
                    "Cache-Control": "public, max-age=31536000, immutable",
                })
            return FileResponse(file_path, headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
            })
    index = ADMIN_BUILD / "index.html"
    if index.exists():
        return FileResponse(index, headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        })
    return {"error": "Admin app not built. Run: cd apps/admin && npm run build"}


# Garment Counter SPA catch-all: /counter/* → garment-counter/dist/index.html
# (Vite app — hashed assets under assets/, plus PWA files at the root.)
@app.get("/counter")
@app.get("/counter/{full_path:path}")
async def serve_counter(request: Request, full_path: str = ""):
    """Serve the garment-counter Vite PWA for all /counter/* routes."""
    if full_path:
        file_path = COUNTER_BUILD / full_path
        if file_path.is_file():
            # Hashed asset bundles — cache forever; everything else no-cache.
            if full_path.startswith("assets/"):
                return FileResponse(file_path, headers={
                    "Cache-Control": "public, max-age=31536000, immutable",
                })
            return FileResponse(file_path, headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
            })
    index = COUNTER_BUILD / "index.html"
    if index.exists():
        return FileResponse(index, headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        })
    return {"error": "Counter app not built. Run: cd apps/garment-counter && npm run build"}


# Customer SPA catch-all: /* → customer/build/index.html
# This MUST be last so it doesn't override /api/* or /admin/*
@app.get("/")
async def serve_customer_root(request: Request):
    """Serve customer React app for root URL."""
    index = CUSTOMER_BUILD / "index.html"
    if index.exists():
        return FileResponse(index, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
    return {"error": "Customer app not built. Run: cd apps/customer && npm run build"}


@app.get("/{full_path:path}")
async def serve_customer(request: Request, full_path: str):
    """Serve SPA for all non-API routes. Handles static files from both builds."""
    # Don't intercept API routes
    if full_path.startswith("api/") or full_path == "api":
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={"detail": "API endpoint not found"})

    # Helper to safely check if a path is a file (handles invalid chars, long paths)
    def _is_file_safe(path):
        try:
            return path.is_file()
        except (OSError, ValueError):
            return False

    # Serve static files — check BOTH builds (admin and customer have different bundles)
    if full_path.startswith("static/"):
        # Check admin build first
        file_path = ADMIN_BUILD / full_path
        if _is_file_safe(file_path):
            # Hashed filenames (main.abc123.js) are immutable — cache forever
            return FileResponse(file_path, headers={
                "Cache-Control": "public, max-age=31536000, immutable",
            })
        # Then customer build
        file_path = CUSTOMER_BUILD / full_path
        if _is_file_safe(file_path):
            return FileResponse(file_path, headers={
                "Cache-Control": "public, max-age=31536000, immutable",
            })
        return {"error": "Static file not found"}

    # Check if it's a real file in customer build (favicon, manifest, etc.)
    file_path = CUSTOMER_BUILD / full_path
    if _is_file_safe(file_path):
        # sw.js and manifest must never be cached by Safari
        if full_path in ("sw.js", "manifest.json", "service-worker.js"):
            return FileResponse(file_path, headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
            })
        return FileResponse(file_path)

    # Check admin build files
    file_path = ADMIN_BUILD / full_path
    if _is_file_safe(file_path):
        if full_path in ("sw.js", "manifest.json", "service-worker.js"):
            return FileResponse(file_path, headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
            })
        return FileResponse(file_path)

    # Route decision: paths with /admin, /driver, or /company go to admin app, everything else to customer
    # Supports both /admin/* and /{laundryId}/admin patterns
    if "/admin" in f"/{full_path}" or "/driver" in f"/{full_path}" or full_path.startswith("admin") or full_path.startswith("company"):
        index = ADMIN_BUILD / "index.html"
        if index.exists():
            return FileResponse(index, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
        return {"error": "Admin app not built. Run: cd apps/admin && npm run build"}

    # Default: serve customer app with dynamic meta tags for tenant pages
    # If the path looks like a tenant page (/{laundryId}/site or /{laundryId}/...), inject laundry meta
    index = CUSTOMER_BUILD / "index.html"
    if index.exists():
        # Check if this is a tenant route (starts with a laundryId segment)
        parts = full_path.strip("/").split("/")
        if parts and parts[0] not in ("slb", "static", "manifest.json", "favicon.ico", "robots.txt"):
            # Likely a tenant page — try to inject laundry name into meta tags
            try:
                laundry_id = parts[0]
                from app.database import get_db, get_cursor
                with get_db() as conn:
                    cur = get_cursor(conn)
                    cur.execute("SELECT laundry_name, laundry_logo FROM shop.laundry_shops WHERE laundry_id = %s", (laundry_id,))
                    row = cur.fetchone()
                if row and row["laundry_name"]:
                    laundry_name = row["laundry_name"]
                    laundry_logo = row.get("laundry_logo") or ""
                    html_content = index.read_text(encoding="utf-8")
                    # Replace generic meta tags with tenant-specific ones
                    html_content = html_content.replace(
                        '<meta property="og:title" content="Smart Laundry Basket - All-in-One Laundry Management Platform" />',
                        f'<meta property="og:title" content="{laundry_name} - Free Pickup &amp; Delivery" />'
                    )
                    html_content = html_content.replace(
                        '<meta property="og:description" content="Run your laundry business smarter. Online orders, POS, route planning, customer engagement, financial reports — all in one platform. Starting at $149/mo." />',
                        f'<meta property="og:description" content="{laundry_name} - Schedule your free laundry pickup and delivery. Wash &amp; fold, dry cleaning, and more." />'
                    )
                    html_content = html_content.replace(
                        '<title>Smart Laundry Basket - Laundry Management Platform</title>',
                        f'<title>{laundry_name} - Free Pickup and Delivery</title>'
                    )
                    html_content = html_content.replace(
                        'content="Smart Laundry Basket - All-in-one laundry management platform. Online ordering, free pickup &amp; delivery scheduling, POS, route optimization, customer engagement. Starting at $149/mo."',
                        f'content="{laundry_name} - Schedule your free laundry pickup and delivery online. Wash and fold, dry cleaning, and more."'
                    )
                    if laundry_logo:
                        html_content = html_content.replace(
                            '<meta property="og:url" content="https://www.smartlaundrybasket.ai" />',
                            f'<meta property="og:url" content="https://www.smartlaundrybasket.ai/{laundry_id}/site" />\n    <meta property="og:image" content="{laundry_logo}" />'
                        )
                    from fastapi.responses import HTMLResponse
                    return HTMLResponse(content=html_content, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
            except Exception as e:
                logger.debug(f"Could not inject tenant meta for path {full_path}: {e}")
                # Fall through to serve static file

        return FileResponse(index, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})

    # Fallback to admin if customer isn't built
    index = ADMIN_BUILD / "index.html"
    if index.exists():
        return FileResponse(index)

    return {"error": "No app built. Run npm run build in apps/admin or apps/customer"}
