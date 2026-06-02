"""
Payment routes — replaces PaymentService Lambda.
Delegates to app.services.payment_service for business logic.
"""
from fastapi import APIRouter, Depends, Query, Body
from typing import Optional
from app.auth import get_current_user
from app.services import payment_service
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/save-card")
async def save_card(body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """Save/attach a payment method to a Stripe customer."""
    return payment_service.save_card_details(
        customer_id=body.get("customerId"),
        customer_payment_id=body.get("customerPaymentId"),
        payment_method_id=body.get("paymentMethodId"),
        laundry_id=body.get("laundryId"),
    )


@router.get("/cards")
async def get_cards(
    customerPaymentId: str = Query(...),
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Get saved cards for a customer."""
    return payment_service.get_card_details(customerPaymentId, laundryId)


@router.delete("/card")
async def delete_card(
    paymentMethodId: str = Query(...),
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Detach a payment method."""
    return payment_service.delete_card_details(paymentMethodId, laundryId)


@router.post("/create-hold")
async def create_hold(body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """Create a payment hold (manual capture intent)."""
    return payment_service.create_hold(
        customer_payment_id=body.get("customerPaymentId"),
        amount=body.get("amount"),
        description=body.get("description"),
        laundry_id=body.get("laundryId"),
    )


@router.post("/capture")
async def capture(body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """Capture a payment (charge customer card)."""
    return payment_service.capture_payment(
        customer_payment_id=body.get("customerPaymentId"),
        price=body.get("amount"),
        order_id=body.get("orderId"),
        description=body.get("description"),
        customer_id=body.get("customerId"),
        laundry_id=body.get("laundryId"),
    )


@router.post("/capture-store")
async def capture_store(body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """In-store card payment."""
    return payment_service.capture_store_payment(
        card_payment_id=body.get("cardPaymentId"),
        price=body.get("amount"),
        order_id=body.get("orderId"),
        customer_id=body.get("customerId"),
        laundry_id=body.get("laundryId"),
    )


@router.post("/capture-final")
async def capture_final(body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """Capture a previously held payment."""
    return payment_service.capture_hold_store_payment(
        intent_id=body.get("paymentIntentId"),
        price=body.get("amount"),
        laundry_id=body.get("laundryId"),
    )


@router.post("/hold-store")
async def hold_store(body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """Create an in-store hold."""
    return payment_service.create_instore_hold(
        card_payment_id=body.get("cardPaymentId"),
        amount=body.get("amount"),
        description=body.get("description", ""),
        laundry_id=body.get("laundryId"),
        save_card=body.get("saveCard", False),
        customer_id=body.get("customerId"),
        customer_payment_id=body.get("customerPaymentId"),
    )


@router.post("/cancel-hold")
async def cancel_hold(body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """Cancel a payment intent."""
    return payment_service.cancel_intent(
        intent_id=body.get("paymentIntentId"),
        laundry_id=body.get("laundryId"),
    )


@router.post("/refund")
async def refund(body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """Process a refund."""
    return payment_service.refund_payment(
        payment_intent_id=body.get("paymentIntentId"),
        amount=body.get("amount"),
        description=body.get("description", ""),
        laundry_id=body.get("laundryId"),
    )
