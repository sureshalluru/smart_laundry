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
from app.config import settings

# Suppress noisy access logs for polling endpoints and bot probes
class SuppressPollingFilter(logging.Filter):
    def filter(self, record):
        msg = record.getMessage()
        if "/api/chat/messages" in msg:
            return False
        # Suppress bot scanner probes
        if ".php" in msg or ".asp" in msg or "/wp-" in msg or "/.env" in msg:
            return False
        return True

logging.getLogger("uvicorn.access").addFilter(SuppressPollingFilter())
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
)

app = FastAPI(
    title="Smart Laundry API",
    version="1.0.0",
    description="Unified backend + frontend for Smart Laundry platform",
)


# Start background scheduler and run migrations on app startup
@app.on_event("startup")
def startup_event():
    from app.migrations import run_all as run_migrations
    run_migrations()
    from app.scheduler import start_scheduler
    start_scheduler()

# CORS (still needed for local dev when React dev servers run separately)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
            return FileResponse(file_path)
    index = ADMIN_BUILD / "index.html"
    if index.exists():
        return FileResponse(index)
    return {"error": "Admin app not built. Run: cd apps/admin && npm run build"}


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
    if full_path.startswith("api"):
        return {"error": "Not found"}

    # Serve static files — check BOTH builds (admin and customer have different bundles)
    if full_path.startswith("static/"):
        # Check admin build first
        file_path = ADMIN_BUILD / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        # Then customer build
        file_path = CUSTOMER_BUILD / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return {"error": "Static file not found"}

    # Check if it's a real file in customer build (favicon, manifest, etc.)
    file_path = CUSTOMER_BUILD / full_path
    if file_path.is_file():
        return FileResponse(file_path)

    # Check admin build files
    file_path = ADMIN_BUILD / full_path
    if file_path.is_file():
        return FileResponse(file_path)

    # Route decision: paths with /admin or /driver go to admin app, everything else to customer
    if "/admin" in f"/{full_path}" or "/driver" in f"/{full_path}" or full_path.startswith("admin"):
        index = ADMIN_BUILD / "index.html"
        if index.exists():
            return FileResponse(index, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
        return {"error": "Admin app not built. Run: cd apps/admin && npm run build"}

    # Default: serve customer app
    index = CUSTOMER_BUILD / "index.html"
    if index.exists():
        return FileResponse(index, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})

    # Fallback to admin if customer isn't built
    index = ADMIN_BUILD / "index.html"
    if index.exists():
        return FileResponse(index)

    return {"error": "No app built. Run npm run build in apps/admin or apps/customer"}
