"""
Subscription management service — reschedule, skip, pause, resume.
Handles recurring order frequency self-service operations.
"""
from datetime import datetime, timedelta, date
from app.database import get_db, get_cursor
import logging

logger = logging.getLogger(__name__)


# ─── Frequency interval helpers ───

def _freq_days(frequency: str) -> int:
    """Return the interval in days for a frequency type."""
    f = (frequency or "").lower().replace("-", "").replace(" ", "")
    if f == "weekly":
        return 7
    elif f == "monthly":
        return 30
    elif f in ("biweekly", "biweekly"):
        return 14
    return 14  # default to bi-weekly


def _next_cadence_date(from_date: date, frequency: str) -> date:
    """Calculate the next cadence-aligned date from a given date."""
    days = _freq_days(frequency)
    return from_date + timedelta(days=days)


# ─── Cutoff logic ───

def _get_cutoff_hours(laundry_id: str, conn) -> int:
    """Get the subscription cutoff hours for a laundry (default 12)."""
    cur = get_cursor(conn)
    cur.execute(
        "SELECT subscription_cutoff_hours FROM shop.laundry_shops WHERE laundry_id = %s",
        (laundry_id,)
    )
    row = cur.fetchone()
    if row and row.get("subscription_cutoff_hours"):
        return row["subscription_cutoff_hours"]
    return 12


def _is_within_cutoff(pickup_date: date, pickup_time_interval: str, cutoff_hours: int) -> bool:
    """Check if the current time is within the cutoff window of the pickup."""
    # Parse pickup time — e.g. "9:00-11:00" → use start time
    pickup_hour = 9  # default
    if pickup_time_interval:
        try:
            start_str = pickup_time_interval.split("-")[0].strip()
            parts = start_str.replace(":", " ").split()
            pickup_hour = int(parts[0])
        except (ValueError, IndexError):
            pass

    pickup_datetime = datetime.combine(pickup_date, datetime.min.time().replace(hour=pickup_hour))
    cutoff_datetime = pickup_datetime - timedelta(hours=cutoff_hours)
    return datetime.now() >= cutoff_datetime


# ─── SubscriptionService ───

class SubscriptionService:

    @staticmethod
    def get_details(frequency_id: str, customer_id: str) -> dict:
        """Get full subscription details including upcoming dates and status."""
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                SELECT lf.frequency_id, lf.frequency, lf.future_pickup_date,
                       lf.pickup_time_interval, lf.is_active,
                       lf.is_paused, lf.pause_resume_date, lf.pause_started_at,
                       lf.original_pickup_date, lf.reschedule_offset,
                       lf.consecutive_skips, lf.total_skips_30d, lf.last_skip_date,
                       ls.subscription_cutoff_hours
                FROM orders.laundry_frequency lf
                JOIN shop.laundry_shops ls ON ls.laundry_id = lf.laundry_id
                WHERE lf.frequency_id = %s AND lf.customer_id = %s AND lf.is_active = TRUE
            """, (frequency_id, customer_id))
            sub = cur.fetchone()

        if not sub:
            return None

        pickup_date = sub["future_pickup_date"]
        frequency = sub["frequency"]
        cutoff_hours = sub["subscription_cutoff_hours"] or 12
        pickup_time = sub["pickup_time_interval"] or "9:00-11:00"

        is_rescheduled = sub["original_pickup_date"] is not None
        is_paused = sub["is_paused"] or False
        within_cutoff = _is_within_cutoff(pickup_date, pickup_time, cutoff_hours) if pickup_date else False

        # Determine display status
        if is_paused:
            status = "paused"
        elif is_rescheduled:
            status = "rescheduled"
        else:
            status = "active"

        # Compute upcoming dates
        upcoming = SubscriptionService.get_upcoming_dates_from(pickup_date, frequency, count=4)

        return {
            "frequencyId": str(sub["frequency_id"]),
            "frequency": frequency,
            "nextPickupDate": str(pickup_date) if pickup_date else None,
            "originalPickupDate": str(sub["original_pickup_date"]) if sub["original_pickup_date"] else None,
            "isRescheduled": is_rescheduled,
            "isPaused": is_paused,
            "pauseResumeDate": str(sub["pause_resume_date"]) if sub["pause_resume_date"] else None,
            "pickupTimeInterval": pickup_time,
            "status": status,
            "isWithinCutoff": within_cutoff,
            "consecutiveSkips": sub["consecutive_skips"] or 0,
            "upcomingDates": upcoming,
        }

    @staticmethod
    def get_upcoming_dates_from(start_date: date, frequency: str, count: int = 4) -> list:
        """Project the next N pickup dates from a start date."""
        if not start_date:
            return []
        days = _freq_days(frequency)
        dates = []
        d = start_date
        for _ in range(count):
            dates.append(str(d))
            d = d + timedelta(days=days)
        return dates

    @staticmethod
    def reschedule(frequency_id: str, customer_id: str, target_date_str: str, actor: str = "customer") -> dict:
        """Reschedule the next occurrence to a target date within ±3 days."""
        target_date = date.fromisoformat(target_date_str)
        today = date.today()

        # Target must be in the future
        if target_date <= today:
            return {"status": "error", "code": "DATE_IN_PAST",
                    "message": "Target date must be in the future."}

        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                SELECT lf.frequency_id, lf.future_pickup_date, lf.original_pickup_date,
                       lf.pickup_time_interval, lf.frequency, lf.laundry_id, lf.customer_id
                FROM orders.laundry_frequency lf
                WHERE lf.frequency_id = %s AND lf.customer_id = %s AND lf.is_active = TRUE
            """, (frequency_id, customer_id))
            sub = cur.fetchone()

            if not sub:
                return {"status": "error", "code": "SUBSCRIPTION_NOT_FOUND",
                        "message": "Subscription not found or inactive."}

            # Already rescheduled?
            if sub["original_pickup_date"] is not None:
                return {"status": "error", "code": "ALREADY_RESCHEDULED",
                        "message": "Already rescheduled. Undo first to reschedule again."}

            current_date = sub["future_pickup_date"]
            diff_days = (target_date - current_date).days

            # Validate ±3 range
            if abs(diff_days) > 3:
                return {"status": "error", "code": "INVALID_DATE_RANGE",
                        "message": f"Target date must be within ±3 days of scheduled date ({current_date})."}

            # Cutoff check (skip for admin)
            if actor == "customer":
                cutoff_hours = _get_cutoff_hours(sub["laundry_id"], conn)
                pickup_time = sub["pickup_time_interval"] or "9:00-11:00"
                if _is_within_cutoff(current_date, pickup_time, cutoff_hours):
                    return {"status": "error", "code": "CUTOFF_EXCEEDED",
                            "message": "Too late to reschedule — pickup is being prepared."}

            # Perform the reschedule
            cur.execute("""
                UPDATE orders.laundry_frequency
                SET future_pickup_date = %s,
                    original_pickup_date = %s,
                    reschedule_offset = %s,
                    updated_at = NOW()
                WHERE frequency_id = %s AND original_pickup_date IS NULL
            """, (target_date, current_date, diff_days, frequency_id))

            if cur.rowcount == 0:
                return {"status": "error", "code": "ALREADY_RESCHEDULED",
                        "message": "Reschedule conflict — please try again."}

            # Log action
            SubscriptionService._log_action(
                cur, frequency_id, "reschedule", actor,
                original_date=current_date, new_date=target_date
            )

            # Calculate next after this
            freq_days = _freq_days(sub["frequency"])
            next_after = current_date + timedelta(days=freq_days)

        return {
            "status": "success",
            "message": f"Rescheduled to {target_date.strftime('%b %d')}",
            "data": {
                "originalDate": str(current_date),
                "newDate": str(target_date),
                "nextAfterThis": str(next_after),
            }
        }

    @staticmethod
    def undo_reschedule(frequency_id: str, customer_id: str, actor: str = "customer") -> dict:
        """Revert a reschedule back to the original date."""
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                SELECT frequency_id, future_pickup_date, original_pickup_date,
                       pickup_time_interval, laundry_id
                FROM orders.laundry_frequency
                WHERE frequency_id = %s AND customer_id = %s AND is_active = TRUE
            """, (frequency_id, customer_id))
            sub = cur.fetchone()

            if not sub:
                return {"status": "error", "code": "SUBSCRIPTION_NOT_FOUND",
                        "message": "Subscription not found or inactive."}

            if sub["original_pickup_date"] is None:
                return {"status": "error", "code": "NOT_RESCHEDULED",
                        "message": "This occurrence has not been rescheduled."}

            original_date = sub["original_pickup_date"]

            # Cutoff check on the original date (skip for admin)
            if actor == "customer":
                cutoff_hours = _get_cutoff_hours(sub["laundry_id"], conn)
                pickup_time = sub["pickup_time_interval"] or "9:00-11:00"
                if _is_within_cutoff(original_date, pickup_time, cutoff_hours):
                    return {"status": "error", "code": "CUTOFF_EXCEEDED",
                            "message": "Too late to undo — pickup is being prepared."}

            cur.execute("""
                UPDATE orders.laundry_frequency
                SET future_pickup_date = %s,
                    original_pickup_date = NULL,
                    reschedule_offset = NULL,
                    updated_at = NOW()
                WHERE frequency_id = %s
            """, (original_date, frequency_id))

            SubscriptionService._log_action(
                cur, frequency_id, "undo_reschedule", actor,
                original_date=sub["future_pickup_date"], new_date=original_date
            )

        return {
            "status": "success",
            "message": f"Reverted to original date {original_date.strftime('%b %d')}",
            "data": {"restoredDate": str(original_date)}
        }

    @staticmethod
    def skip(frequency_id: str, customer_id: str, reason: str = None, actor: str = "customer") -> dict:
        """Skip the next occurrence and advance to the following cadence date."""
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                SELECT frequency_id, future_pickup_date, original_pickup_date,
                       frequency, pickup_time_interval, laundry_id, consecutive_skips
                FROM orders.laundry_frequency
                WHERE frequency_id = %s AND customer_id = %s AND is_active = TRUE
            """, (frequency_id, customer_id))
            sub = cur.fetchone()

            if not sub:
                return {"status": "error", "code": "SUBSCRIPTION_NOT_FOUND",
                        "message": "Subscription not found or inactive."}

            current_date = sub["future_pickup_date"]

            # Cutoff check (skip for admin)
            if actor == "customer":
                cutoff_hours = _get_cutoff_hours(sub["laundry_id"], conn)
                pickup_time = sub["pickup_time_interval"] or "9:00-11:00"
                if _is_within_cutoff(current_date, pickup_time, cutoff_hours):
                    return {"status": "error", "code": "CUTOFF_EXCEEDED",
                            "message": "Too late to skip — pickup is being prepared."}

            # Advance from original date if rescheduled, otherwise from current
            base_date = sub["original_pickup_date"] if sub["original_pickup_date"] else current_date
            freq_days = _freq_days(sub["frequency"])
            next_date = base_date + timedelta(days=freq_days)

            consecutive = (sub["consecutive_skips"] or 0) + 1

            cur.execute("""
                UPDATE orders.laundry_frequency
                SET future_pickup_date = %s,
                    original_pickup_date = NULL,
                    reschedule_offset = NULL,
                    consecutive_skips = %s,
                    last_skip_date = %s,
                    updated_at = NOW()
                WHERE frequency_id = %s
            """, (next_date, consecutive, date.today(), frequency_id))

            SubscriptionService._log_action(
                cur, frequency_id, "skip", actor,
                original_date=current_date, new_date=next_date, reason=reason
            )

        return {
            "status": "success",
            "message": f"Skipped! Next pickup is {next_date.strftime('%b %d')}.",
            "data": {
                "skippedDate": str(current_date),
                "nextPickupDate": str(next_date),
                "consecutiveSkips": consecutive,
            }
        }

    @staticmethod
    def pause(frequency_id: str, customer_id: str, weeks: int, actor: str = "customer") -> dict:
        """Pause subscription for 1-4 weeks."""
        if weeks not in (1, 2, 3, 4):
            return {"status": "error", "code": "INVALID_PAUSE_DURATION",
                    "message": "Pause duration must be 1, 2, 3, or 4 weeks."}

        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                SELECT frequency_id, future_pickup_date, is_paused,
                       pickup_time_interval, laundry_id, customer_id
                FROM orders.laundry_frequency
                WHERE frequency_id = %s AND customer_id = %s AND is_active = TRUE
            """, (frequency_id, customer_id))
            sub = cur.fetchone()

            if not sub:
                return {"status": "error", "code": "SUBSCRIPTION_NOT_FOUND",
                        "message": "Subscription not found or inactive."}

            if sub["is_paused"]:
                return {"status": "error", "code": "ALREADY_PAUSED",
                        "message": "Subscription is already paused."}

            # Cutoff check (skip for admin)
            if actor == "customer":
                cutoff_hours = _get_cutoff_hours(sub["laundry_id"], conn)
                pickup_time = sub["pickup_time_interval"] or "9:00-11:00"
                current_date = sub["future_pickup_date"]
                if _is_within_cutoff(current_date, pickup_time, cutoff_hours):
                    return {"status": "error", "code": "CUTOFF_EXCEEDED",
                            "message": "Too late to pause — pickup is being prepared."}

            # Check no order in progress for this customer/laundry
            cur.execute("""
                SELECT order_id FROM orders.laundry_orders
                WHERE customer_id = %s AND laundry_id = %s
                  AND order_status NOT IN ('Delivered', 'OrderCanceled')
                LIMIT 1
            """, (customer_id, sub["laundry_id"]))
            active_order = cur.fetchone()
            if active_order:
                return {"status": "error", "code": "ORDER_IN_PROGRESS",
                        "message": "Cannot pause while an order is in progress."}

            resume_date = date.today() + timedelta(days=weeks * 7)

            cur.execute("""
                UPDATE orders.laundry_frequency
                SET is_paused = TRUE,
                    pause_resume_date = %s,
                    pause_started_at = NOW(),
                    updated_at = NOW()
                WHERE frequency_id = %s
            """, (resume_date, frequency_id))

            SubscriptionService._log_action(
                cur, frequency_id, "pause", actor,
                metadata={"weeks": weeks, "resume_date": str(resume_date)}
            )

        return {
            "status": "success",
            "message": f"Paused until {resume_date.strftime('%b %d')}. Reply RESUME to come back early.",
            "data": {
                "pauseResumeDate": str(resume_date),
                "weeks": weeks,
            }
        }

    @staticmethod
    def resume(frequency_id: str, customer_id: str, actor: str = "customer") -> dict:
        """Resume a paused subscription."""
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                SELECT frequency_id, future_pickup_date, is_paused, frequency, laundry_id
                FROM orders.laundry_frequency
                WHERE frequency_id = %s AND customer_id = %s AND is_active = TRUE
            """, (frequency_id, customer_id))
            sub = cur.fetchone()

            if not sub:
                return {"status": "error", "code": "SUBSCRIPTION_NOT_FOUND",
                        "message": "Subscription not found or inactive."}

            if not sub["is_paused"]:
                return {"status": "error", "code": "NOT_PAUSED",
                        "message": "Subscription is not paused."}

            # Calculate next cadence-aligned date on or after today
            today = date.today()
            freq_days = _freq_days(sub["frequency"])
            # Start from the stored future_pickup_date and advance until >= tomorrow
            next_date = sub["future_pickup_date"]
            while next_date <= today:
                next_date = next_date + timedelta(days=freq_days)

            cur.execute("""
                UPDATE orders.laundry_frequency
                SET is_paused = FALSE,
                    future_pickup_date = %s,
                    pause_resume_date = NULL,
                    pause_started_at = NULL,
                    updated_at = NOW()
                WHERE frequency_id = %s
            """, (next_date, frequency_id))

            SubscriptionService._log_action(
                cur, frequency_id, "resume", actor,
                new_date=next_date
            )

        return {
            "status": "success",
            "message": f"Resumed! Next pickup is {next_date.strftime('%b %d')}.",
            "data": {"nextPickupDate": str(next_date)}
        }

    @staticmethod
    def _log_action(cur, frequency_id: str, action_type: str, actor: str,
                    original_date=None, new_date=None, reason=None, metadata=None):
        """Insert an audit log entry into subscription_actions."""
        import json
        cur.execute("""
            INSERT INTO orders.subscription_actions
                (frequency_id, action_type, actor, original_date, new_date, reason, metadata)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            frequency_id, action_type, actor,
            original_date, new_date, reason,
            json.dumps(metadata) if metadata else "{}"
        ))
