"""
Referral service — core referral code generation, validation, and management logic.
"""
import secrets
import string
import logging

from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)

# Clean alphabet: A-Z + 0-9 minus confusing characters (O, 0, I, 1, L)
ALPHABET = string.ascii_uppercase + string.digits
CLEAN_ALPHABET = ''.join(c for c in ALPHABET if c not in 'O0I1L')


def generate_referral_code(length=6):
    """Generate a random alphanumeric referral code using the clean alphabet.

    Args:
        length: Number of characters (default 6, max 8).

    Returns:
        A string of `length` characters from CLEAN_ALPHABET.
    """
    return ''.join(secrets.choice(CLEAN_ALPHABET) for _ in range(length))


def create_referral_code_for_customer(customer_id, laundry_id):
    """Create and persist a referral code for a customer.

    Handles uniqueness collisions by retrying up to 3 times with incremented length.

    Args:
        customer_id: The customer's ID.
        laundry_id: The laundry tenant ID.

    Returns:
        The generated code string.

    Raises:
        RuntimeError: If all retry attempts fail (extremely unlikely).
    """
    max_attempts = 3
    length = 6

    with get_db() as conn:
        cur = get_cursor(conn)

        for attempt in range(max_attempts):
            code = generate_referral_code(length)
            try:
                cur.execute(
                    """
                    INSERT INTO shop.referral_codes (customer_id, laundry_id, code, is_active)
                    VALUES (%s, %s, %s, TRUE)
                    """,
                    (customer_id, laundry_id, code),
                )
                logger.info(
                    "Created referral code %s for customer %s at laundry %s",
                    code, customer_id, laundry_id,
                )
                return code
            except Exception as e:
                # Check if it's a unique constraint violation
                error_msg = str(e).lower()
                if "unique" in error_msg or "duplicate" in error_msg:
                    conn.rollback()
                    length += 1
                    logger.warning(
                        "Referral code collision on attempt %d, retrying with length %d",
                        attempt + 1, length,
                    )
                    continue
                raise

        raise RuntimeError(
            f"Failed to generate unique referral code after {max_attempts} attempts "
            f"for customer {customer_id} at laundry {laundry_id}"
        )


def validate_referral_code(code, laundry_id, phone_number, email):
    """Validate a referral code for use during registration.

    Checks:
    1. Code exists and is active for the given laundry.
    2. Code owner is not the same person as the registering user (self-referral check).

    Args:
        code: The referral code string to validate.
        laundry_id: The laundry tenant ID.
        phone_number: The registering user's phone number.
        email: The registering user's email.

    Returns:
        dict with:
        - {"valid": True, "referrerFirstName": <name>} if valid
        - {"valid": False, "reason": "code_not_found"} if code doesn't exist
        - {"valid": False, "reason": "self_referral"} if code owner matches registering user
    """
    with get_db() as conn:
        cur = get_cursor(conn)

        # Look up the code in referral_codes where is_active=TRUE and laundry_id matches
        cur.execute(
            """
            SELECT rc.customer_id
            FROM shop.referral_codes rc
            WHERE rc.code = %s
              AND rc.laundry_id = %s
              AND rc.is_active = TRUE
            """,
            (code, laundry_id),
        )
        code_row = cur.fetchone()

        if not code_row:
            return {"valid": False, "reason": "code_not_found"}

        referrer_customer_id = code_row["customer_id"]

        # Check if code owner's phone or email matches the registering user
        cur.execute(
            """
            SELECT first_name, phone_number, email
            FROM shop.customers
            WHERE customer_id = %s
            """,
            (referrer_customer_id,),
        )
        referrer = cur.fetchone()

        if not referrer:
            return {"valid": False, "reason": "code_not_found"}

        # Self-referral check: compare phone number or email
        referrer_phone = referrer.get("phone_number") or ""
        referrer_email = referrer.get("email") or ""

        if (phone_number and referrer_phone and phone_number == referrer_phone) or \
           (email and referrer_email and email.lower() == referrer_email.lower()):
            return {"valid": False, "reason": "self_referral"}

        return {"valid": True, "referrerFirstName": referrer.get("first_name", "")}


def regenerate_code(customer_id, laundry_id):
    """Invalidate the customer's current active code and generate a new one.

    Args:
        customer_id: The customer's ID.
        laundry_id: The laundry tenant ID.

    Returns:
        The new referral code string.
    """
    with get_db() as conn:
        cur = get_cursor(conn)

        # Invalidate all existing active codes for this customer/laundry
        cur.execute(
            """
            UPDATE shop.referral_codes
            SET is_active = FALSE
            WHERE customer_id = %s
              AND laundry_id = %s
              AND is_active = TRUE
            """,
            (customer_id, laundry_id),
        )

    # Create a new code (uses its own transaction)
    return create_referral_code_for_customer(customer_id, laundry_id)


def count_monthly_referrals(referrer_id, laundry_id):
    """Count referral events that reached first_order_completed in the current calendar month.

    Used for monthly cap enforcement. Only counts events whose updated_at falls
    within the current month (i.e., events that completed this month).

    Args:
        referrer_id: The referrer's customer ID.
        laundry_id: The laundry tenant ID.

    Returns:
        Integer count of completed referral events this month for the referrer.
    """
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM shop.referral_events
            WHERE referrer_id = %s
              AND laundry_id = %s
              AND status = 'first_order_completed'
              AND referrer_rewarded = TRUE
              AND updated_at >= date_trunc('month', NOW())
              AND updated_at < date_trunc('month', NOW()) + interval '1 month'
            """,
            (referrer_id, laundry_id),
        )
        row = cur.fetchone()
        return row["cnt"] if row else 0


def process_first_order_reward(customer_id, laundry_id, order_id):
    """Process reward distribution when a referee completes their first order.

    This function:
    1. Checks for a referral_event with status 'signed_up' for the customer (as referee)
    2. Transitions event to 'first_order_completed'
    3. If program is active: creates reward credits for both referrer and referee
    4. Respects monthly cap for referrer (referee always gets reward)
    5. Sends notification to referrer about the earned reward (best effort)

    Args:
        customer_id: The referee's customer ID (the one who placed the order).
        laundry_id: The laundry tenant ID.
        order_id: The order ID that triggered this reward.

    Returns:
        dict indicating outcome, e.g.:
        - {"rewarded": True, "referrer_rewarded": True, "referee_rewarded": True}
        - {"rewarded": False, "reason": "no_referral_event"}
        - {"rewarded": False, "reason": "program_inactive"}
        - {"rewarded": True, "referrer_rewarded": False, "referee_rewarded": True, "reason": "monthly_cap_reached"}
    """
    with get_db() as conn:
        cur = get_cursor(conn)

        # 1. Look for a referral_event with status 'signed_up' where this customer is the referee
        cur.execute(
            """
            SELECT id, referrer_id, referee_id, status
            FROM shop.referral_events
            WHERE referee_id = %s
              AND laundry_id = %s
              AND status = 'signed_up'
            """,
            (customer_id, laundry_id),
        )
        event = cur.fetchone()

        if not event:
            return {"rewarded": False, "reason": "no_referral_event"}

        event_id = event["id"]
        referrer_id = event["referrer_id"]

        # 2. Transition event to 'first_order_completed'
        cur.execute(
            """
            UPDATE shop.referral_events
            SET status = 'first_order_completed',
                updated_at = NOW()
            WHERE id = %s
            """,
            (event_id,),
        )

        # 3. Check if the referral program is active for this laundry
        cur.execute(
            """
            SELECT is_active, referrer_reward_amount, referee_reward_amount,
                   max_monthly_referrals, credit_expiration_days
            FROM shop.referral_program_config
            WHERE laundry_id = %s
            """,
            (laundry_id,),
        )
        config = cur.fetchone()

        if not config or not config["is_active"]:
            # Program inactive — event status updated but no rewards issued
            return {"rewarded": False, "reason": "program_inactive"}

        referrer_reward_amount = config["referrer_reward_amount"]
        referee_reward_amount = config["referee_reward_amount"]
        max_monthly = config["max_monthly_referrals"]
        expiration_days = config["credit_expiration_days"]

        # 4. Always give referee their reward
        cur.execute(
            """
            INSERT INTO shop.reward_credits
                (customer_id, laundry_id, amount, source, referral_event_id, status, expires_at)
            VALUES (%s, %s, %s, 'referee_reward', %s, 'active',
                    NOW() + interval '1 day' * %s)
            """,
            (customer_id, laundry_id, referee_reward_amount, event_id, expiration_days),
        )
        cur.execute(
            """
            UPDATE shop.referral_events
            SET referee_rewarded = TRUE
            WHERE id = %s
            """,
            (event_id,),
        )

        # 5. Check monthly cap for referrer
        # Count how many rewards the referrer has already received this month
        cur.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM shop.referral_events
            WHERE referrer_id = %s
              AND laundry_id = %s
              AND status = 'first_order_completed'
              AND referrer_rewarded = TRUE
              AND updated_at >= date_trunc('month', NOW())
              AND updated_at < date_trunc('month', NOW()) + interval '1 month'
            """,
            (referrer_id, laundry_id),
        )
        monthly_count_row = cur.fetchone()
        monthly_count = monthly_count_row["cnt"] if monthly_count_row else 0

        if monthly_count >= max_monthly:
            # Monthly cap reached — referee got reward but referrer does not
            return {
                "rewarded": True,
                "referrer_rewarded": False,
                "referee_rewarded": True,
                "reason": "monthly_cap_reached",
            }

        # 6. Issue reward to referrer
        cur.execute(
            """
            INSERT INTO shop.reward_credits
                (customer_id, laundry_id, amount, source, referral_event_id, status, expires_at)
            VALUES (%s, %s, %s, 'referrer_reward', %s, 'active',
                    NOW() + interval '1 day' * %s)
            """,
            (referrer_id, laundry_id, referrer_reward_amount, event_id, expiration_days),
        )
        cur.execute(
            """
            UPDATE shop.referral_events
            SET referrer_rewarded = TRUE
            WHERE id = %s
            """,
            (event_id,),
        )

    # 7. Send notification to referrer (best effort — don't block reward distribution)
    try:
        _notify_referrer_reward(referrer_id, laundry_id, referrer_reward_amount, customer_id)
    except Exception as e:
        logger.warning(
            "Failed to send referral reward notification to referrer %s: %s",
            referrer_id, str(e),
        )

    return {
        "rewarded": True,
        "referrer_rewarded": True,
        "referee_rewarded": True,
    }


def _notify_referrer_reward(referrer_id, laundry_id, reward_amount, referee_id):
    """Send notification to referrer about their earned reward (best effort).

    Args:
        referrer_id: The referrer's customer ID.
        laundry_id: The laundry tenant ID.
        reward_amount: The reward amount in dollars.
        referee_id: The referee's customer ID (for first name in message).
    """
    from app.services.notification_service import send_email, send_sms_for_tenant

    with get_db() as conn:
        cur = get_cursor(conn)

        # Get referrer contact info
        cur.execute(
            """
            SELECT first_name, email, phone_number
            FROM shop.customers
            WHERE customer_id = %s
            """,
            (referrer_id,),
        )
        referrer = cur.fetchone()

        # Get referee first name for the message
        cur.execute(
            """
            SELECT first_name
            FROM shop.customers
            WHERE customer_id = %s
            """,
            (referee_id,),
        )
        referee = cur.fetchone()

    if not referrer:
        logger.warning("Referrer %s not found for notification", referrer_id)
        return

    referee_name = referee.get("first_name", "Your friend") if referee else "Your friend"
    referrer_email = referrer.get("email")
    referrer_phone = referrer.get("phone_number")

    message = (
        f"Great news! {referee_name} just placed their first order. "
        f"You've earned a ${reward_amount:.2f} reward credit. Thanks for referring!"
    )

    if referrer_email:
        send_email(
            referrer_email,
            "You earned a referral reward!",
            f"<p>{message}</p>",
        )

    if referrer_phone:
        send_sms_for_tenant(referrer_phone, message, laundry_id)
