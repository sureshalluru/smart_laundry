"""
Referral & Community Engagement — customer and admin endpoints.
"""
from typing import Optional
from fastapi import APIRouter, Depends, Body, HTTPException, Query, status
from app.database import get_db, get_cursor
from app.auth import get_current_user
from app.services.referral_service import (
    create_referral_code_for_customer,
    validate_referral_code,
    regenerate_code,
)
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_laundry_id(current_user: dict, query_param: str = None, body: dict = None) -> str:
    """Extract laundry_id from JWT (camelCase or snake_case), query param, or body."""
    return (
        current_user.get("laundryId")
        or current_user.get("laundry_id")
        or query_param
        or (body.get("laundryId") if body else None)
        or ""
    )


# ---------------------------------------------------------------------------
# Customer endpoints (auth required)
# ---------------------------------------------------------------------------


@router.get("/my-code")
async def get_my_code(
    laundryId: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Return the customer's active referral code, creating one if missing."""
    customer_id = current_user.get("sub")
    laundry_id = _get_laundry_id(current_user, laundryId)

    if not customer_id or not laundry_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing customer or laundry context",
        )

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """
            SELECT code FROM shop.referral_codes
            WHERE customer_id = %s AND laundry_id = %s AND is_active = TRUE
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (customer_id, laundry_id),
        )
        row = cur.fetchone()

    if row:
        return {"code": row["code"], "laundryId": laundry_id}

    # No active code — generate one
    code = create_referral_code_for_customer(customer_id, laundry_id)
    return {"code": code, "laundryId": laundry_id}


@router.post("/regenerate-code")
async def regenerate_referral_code(
    laundryId: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Invalidate old referral code and generate a new one."""
    customer_id = current_user.get("sub")
    laundry_id = _get_laundry_id(current_user, laundryId)

    if not customer_id or not laundry_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing customer or laundry context",
        )

    new_code = regenerate_code(customer_id, laundry_id)
    return {"code": new_code, "laundryId": laundry_id}


@router.get("/my-stats")
async def get_my_stats(
    laundryId: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Return referral stats: total referrals, conversions, pending, total earned."""
    customer_id = current_user.get("sub")
    laundry_id = _get_laundry_id(current_user, laundryId)

    if not customer_id or not laundry_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing customer or laundry context",
        )

    with get_db() as conn:
        cur = get_cursor(conn)

        # Total referrals (all events where this customer is the referrer)
        cur.execute(
            """
            SELECT
                COUNT(*) AS total_referrals,
                COUNT(*) FILTER (WHERE status IN ('first_order_completed', 'rewarded')) AS conversions,
                COUNT(*) FILTER (WHERE status = 'signed_up') AS pending
            FROM shop.referral_events
            WHERE referrer_id = %s AND laundry_id = %s
            """,
            (customer_id, laundry_id),
        )
        stats = cur.fetchone()

        # Total earned (sum of reward credits for this customer)
        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0) AS total_earned
            FROM shop.reward_credits
            WHERE customer_id = %s AND laundry_id = %s
            """,
            (customer_id, laundry_id),
        )
        earnings = cur.fetchone()

    total_earned = float(earnings["total_earned"]) if earnings else 0.0

    return {
        "totalReferrals": stats["total_referrals"] if stats else 0,
        "conversions": stats["conversions"] if stats else 0,
        "pending": stats["pending"] if stats else 0,
        "totalEarned": f"${total_earned:.2f}",
    }


@router.get("/my-referrals")
async def get_my_referrals(
    laundryId: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """List referred customers with first name and status."""
    customer_id = current_user.get("sub")
    laundry_id = _get_laundry_id(current_user, laundryId)

    if not customer_id or not laundry_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing customer or laundry context",
        )

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """
            SELECT c.first_name, re.status
            FROM shop.referral_events re
            JOIN shop.customers c
              ON c.customer_id = re.referee_id
            WHERE re.referrer_id = %s AND re.laundry_id = %s
            ORDER BY re.created_at DESC
            """,
            (customer_id, laundry_id),
        )
        rows = cur.fetchall()

    referrals = [
        {"firstName": row["first_name"], "status": row["status"]}
        for row in rows
    ]
    return {"referrals": referrals}


@router.get("/my-credits")
async def get_my_credits(
    laundryId: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Return credit balance with expiration breakdown."""
    customer_id = current_user.get("sub")
    laundry_id = _get_laundry_id(current_user, laundryId)

    if not customer_id or not laundry_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing customer or laundry context",
        )

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """
            SELECT amount, expires_at
            FROM shop.reward_credits
            WHERE customer_id = %s
              AND laundry_id = %s
              AND status = 'active'
              AND expires_at > NOW()
            ORDER BY expires_at ASC
            """,
            (customer_id, laundry_id),
        )
        rows = cur.fetchall()

    balance = sum(float(row["amount"]) for row in rows)
    credits = [
        {
            "amount": f"${float(row['amount']):.2f}",
            "expiresAt": row["expires_at"].isoformat() if row["expires_at"] else None,
        }
        for row in rows
    ]

    return {
        "balance": f"${balance:.2f}",
        "credits": credits,
    }


@router.get("/community")
async def get_community_board(
    laundryId: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Return community board data from cache."""
    laundry_id = _get_laundry_id(current_user, laundryId)

    if not laundry_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing laundry context",
        )

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """
            SELECT recent_activity, leaderboard, milestones
            FROM shop.community_board_cache
            WHERE laundry_id = %s
            """,
            (laundry_id,),
        )
        row = cur.fetchone()

    if not row:
        return {
            "recentActivity": [],
            "leaderboard": [],
            "milestones": [],
        }

    return {
        "recentActivity": row["recent_activity"] or [],
        "leaderboard": row["leaderboard"] or [],
        "milestones": row["milestones"] or [],
    }


# ---------------------------------------------------------------------------
# Public endpoint (no auth)
# ---------------------------------------------------------------------------


@router.post("/validate-code")
async def validate_code(body: dict = Body(...)):
    """Validate a referral code pre-registration (public, no auth required)."""
    code = body.get("code", "").strip()
    laundry_id = body.get("laundryId", "").strip()
    phone_number = body.get("phoneNumber", "").strip()
    email = body.get("email", "").strip()

    if not code or not laundry_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="code and laundryId are required",
        )

    result = validate_referral_code(code, laundry_id, phone_number, email)
    return result


# ---------------------------------------------------------------------------
# Admin endpoints (auth required)
# ---------------------------------------------------------------------------


@router.get("/config")
async def get_referral_config(
    laundryId: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Get referral program config for the laundry (admin only)."""
    laundry_id = _get_laundry_id(current_user, laundryId)

    if not laundry_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing laundry context",
        )

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """
            SELECT is_active, referrer_reward_amount, referee_reward_amount,
                   max_monthly_referrals, credit_expiration_days
            FROM shop.referral_program_config
            WHERE laundry_id = %s
            """,
            (laundry_id,),
        )
        row = cur.fetchone()

    if not row:
        # Return defaults if no config exists yet
        return {
            "isActive": False,
            "referrerRewardAmount": 5.00,
            "refereeRewardAmount": 5.00,
            "maxMonthlyReferrals": 10,
            "creditExpirationDays": 90,
        }

    return {
        "isActive": row["is_active"],
        "referrerRewardAmount": float(row["referrer_reward_amount"]),
        "refereeRewardAmount": float(row["referee_reward_amount"]),
        "maxMonthlyReferrals": row["max_monthly_referrals"],
        "creditExpirationDays": row["credit_expiration_days"],
    }


@router.put("/config")
async def update_referral_config(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Create or update referral program config (upsert with defaults)."""
    laundry_id = _get_laundry_id(current_user, body=body)

    if not laundry_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing laundry context",
        )

    is_active = body.get("isActive", body.get("is_active", False))
    referrer_reward_amount = body.get("referrerRewardAmount", body.get("referrer_reward_amount", 5.00))
    referee_reward_amount = body.get("refereeRewardAmount", body.get("referee_reward_amount", 5.00))
    max_monthly_referrals = body.get("maxMonthlyReferrals", body.get("max_monthly_referrals", 10))
    credit_expiration_days = body.get("creditExpirationDays", body.get("credit_expiration_days", 90))

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """
            INSERT INTO shop.referral_program_config
                (laundry_id, is_active, referrer_reward_amount, referee_reward_amount,
                 max_monthly_referrals, credit_expiration_days, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (laundry_id)
            DO UPDATE SET
                is_active = EXCLUDED.is_active,
                referrer_reward_amount = EXCLUDED.referrer_reward_amount,
                referee_reward_amount = EXCLUDED.referee_reward_amount,
                max_monthly_referrals = EXCLUDED.max_monthly_referrals,
                credit_expiration_days = EXCLUDED.credit_expiration_days,
                updated_at = NOW()
            """,
            (
                laundry_id,
                is_active,
                referrer_reward_amount,
                referee_reward_amount,
                max_monthly_referrals,
                credit_expiration_days,
            ),
        )

    return {
        "isActive": is_active,
        "referrerRewardAmount": float(referrer_reward_amount),
        "refereeRewardAmount": float(referee_reward_amount),
        "maxMonthlyReferrals": max_monthly_referrals,
        "creditExpirationDays": credit_expiration_days,
    }


@router.get("/analytics")
async def get_referral_analytics(
    laundryId: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Return referral analytics for the laundry (admin only)."""
    laundry_id = _get_laundry_id(current_user, laundryId)

    if not laundry_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing laundry context",
        )

    with get_db() as conn:
        cur = get_cursor(conn)

        # Total referrals (all time)
        cur.execute(
            """
            SELECT COUNT(*) AS total_referrals
            FROM shop.referral_events
            WHERE laundry_id = %s
            """,
            (laundry_id,),
        )
        total_row = cur.fetchone()
        total_referrals = total_row["total_referrals"] if total_row else 0

        # Monthly referrals (current calendar month)
        cur.execute(
            """
            SELECT COUNT(*) AS monthly_referrals
            FROM shop.referral_events
            WHERE laundry_id = %s
              AND created_at >= date_trunc('month', CURRENT_DATE)
            """,
            (laundry_id,),
        )
        monthly_row = cur.fetchone()
        monthly_referrals = monthly_row["monthly_referrals"] if monthly_row else 0

        # Conversion rate: (first_order_completed + rewarded) / total * 100
        cur.execute(
            """
            SELECT
                COUNT(*) FILTER (WHERE status IN ('first_order_completed', 'rewarded')) AS conversions,
                COUNT(*) AS total
            FROM shop.referral_events
            WHERE laundry_id = %s
            """,
            (laundry_id,),
        )
        conv_row = cur.fetchone()
        conversions = conv_row["conversions"] if conv_row else 0
        total_events = conv_row["total"] if conv_row else 0
        conversion_rate = round((conversions / total_events * 100), 1) if total_events > 0 else 0.0

        # Total rewards issued
        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0) AS total_rewards
            FROM shop.reward_credits
            WHERE laundry_id = %s
            """,
            (laundry_id,),
        )
        rewards_row = cur.fetchone()
        total_rewards = float(rewards_row["total_rewards"]) if rewards_row else 0.0

        # Top referrers (by count of completed referrals, current month)
        cur.execute(
            """
            SELECT
                c.first_name,
                SUBSTRING(c.last_name FROM 1 FOR 1) || '.' AS last_initial,
                COUNT(*) AS count
            FROM shop.referral_events re
            JOIN shop.customers c
              ON c.customer_id = re.referrer_id
            WHERE re.laundry_id = %s
              AND re.status IN ('first_order_completed', 'rewarded')
            GROUP BY c.first_name, c.last_name
            ORDER BY count DESC
            LIMIT 10
            """,
            (laundry_id,),
        )
        top_rows = cur.fetchall()

    top_referrers = [
        {
            "firstName": row["first_name"],
            "lastName": row["last_initial"],
            "count": row["count"],
        }
        for row in top_rows
    ]

    return {
        "totalReferrals": total_referrals,
        "monthlyReferrals": monthly_referrals,
        "conversionRate": conversion_rate,
        "totalRewardsIssued": f"${total_rewards:.2f}",
        "topReferrers": top_referrers,
    }


@router.get("/events")
async def get_referral_events(
    laundryId: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None, description="Start date filter (ISO format)"),
    endDate: Optional[str] = Query(None, description="End date filter (ISO format)"),
    status_filter: Optional[str] = Query(None, alias="status", description="Status filter"),
    current_user: dict = Depends(get_current_user),
):
    """List referral events with date range and status filters (admin only)."""
    laundry_id = _get_laundry_id(current_user, laundryId)

    if not laundry_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing laundry context",
        )

    query = """
        SELECT
            cr.first_name AS referrer_first_name,
            SUBSTRING(cr.last_name FROM 1 FOR 1) || '.' AS referrer_last_initial,
            ce.first_name AS referee_first_name,
            SUBSTRING(ce.last_name FROM 1 FOR 1) || '.' AS referee_last_initial,
            re.status,
            re.created_at,
            COALESCE(rc.amount, 0) AS reward_amount
        FROM shop.referral_events re
        JOIN shop.customers cr
          ON cr.customer_id = re.referrer_id
        JOIN shop.customers ce
          ON ce.customer_id = re.referee_id
        LEFT JOIN shop.reward_credits rc
          ON rc.referral_event_id = re.id AND rc.source = 'referee_reward'
        WHERE re.laundry_id = %s
    """
    params: list = [laundry_id]

    if startDate:
        query += " AND re.created_at >= %s"
        params.append(startDate)

    if endDate:
        query += " AND re.created_at <= %s"
        params.append(endDate)

    if status_filter:
        query += " AND re.status = %s"
        params.append(status_filter)

    query += " ORDER BY re.created_at DESC"

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(query, params)
        rows = cur.fetchall()

    events = [
        {
            "referrerName": f"{row['referrer_first_name']} {row['referrer_last_initial']}",
            "refereeName": f"{row['referee_first_name']} {row['referee_last_initial']}",
            "status": row["status"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
            "rewardAmount": f"${float(row['reward_amount']):.2f}",
        }
        for row in rows
    ]

    return {"events": events}


# ---------------------------------------------------------------------------
# Debug / manual trigger endpoint (remove in production)
# ---------------------------------------------------------------------------


@router.post("/trigger-reward")
async def trigger_reward(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Manually trigger referral reward for a customer/order (admin testing only)."""
    from app.services.referral_service import process_first_order_reward

    customer_id = body.get("customerId")
    laundry_id = body.get("laundryId") or _get_laundry_id(current_user, body=body)
    order_id = body.get("orderId")

    if not customer_id or not laundry_id:
        raise HTTPException(status_code=400, detail="customerId and laundryId required")

    result = process_first_order_reward(customer_id, laundry_id, order_id or "manual-trigger")
    logger.info(f"Manual referral trigger: customer={customer_id}, laundry={laundry_id}, result={result}")
    return result
