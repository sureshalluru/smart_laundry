"""
Uber Integration routes — replaces UberIntegration Lambda.
Handles: delivery quotes, scheduling, status webhooks.
"""
from fastapi import APIRouter, Depends, Query, Body, Request
from typing import Optional
from app.database import get_db, get_cursor
from app.auth import get_current_user
from app.config import settings
import httpx
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/quote")
async def get_uber_quote(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Get an Uber delivery quote."""
    # TODO: Port from UberIntegration get-uber-quote
    return {"status": "success", "message": "TODO: implement get-uber-quote"}


@router.post("/schedule")
async def schedule_uber_delivery(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Schedule an Uber delivery."""
    # TODO: Port from UberIntegration schedule-uber-order
    return {"status": "success", "message": "TODO: implement schedule-uber-order"}


@router.post("/cancel")
async def cancel_uber_delivery(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Cancel an Uber delivery."""
    # TODO: Port from UberIntegration cancel-uber-delivery
    return {"status": "success", "message": "TODO: implement cancel-uber-delivery"}


@router.get("/delivery/{delivery_id}")
async def get_delivery_status(
    delivery_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get Uber delivery details."""
    # TODO: Port from UberIntegration get-uber-delivery
    return {"status": "success", "message": "TODO: implement get-uber-delivery"}


@router.post("/webhook")
async def uber_webhook(request: Request):
    """Handle Uber delivery status webhooks. No auth (Uber calls this)."""
    body = await request.json()
    logger.info("Uber webhook received: %s", body)
    # TODO: Port webhook handler from UberIntegration
    return {"status": "ok"}
