"""
Background Scheduler — runs recurring tasks inside the app process.
No dependency on Render cron jobs or external HTTP calls.

Jobs:
- Frequency processor: daily at 6 AM CT (creates recurring orders)
- Engagement processor: daily at 10 AM CT (sends customer reminders)
- Community board refresh: every 5 minutes (referral community board cache)
- Credit expiration: daily at 2 AM CT (expire old credits, send reminders)

Safety: On startup, checks if today's jobs were missed and runs them immediately.
"""
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from pytz import timezone
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()

CT = timezone("America/Chicago")


def _was_frequency_run_today():
    """Check if the frequency processor already created orders today."""
    try:
        from app.database import get_db, get_cursor
        today = datetime.now(CT).strftime('%Y-%m-%d')
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                SELECT COUNT(*) as cnt FROM orders.orders
                WHERE auto_generated = TRUE AND created_at::date = %s
            """, (today,))
            count = cur.fetchone()["cnt"]
            return count > 0
    except Exception as e:
        logger.warning(f"Could not check frequency run status: {e}")
        return False


def run_frequency_processor():
    """Process recurring/frequency orders."""
    logger.info("⏰ Scheduler: Running frequency processor...")
    try:
        import asyncio
        from app.routes.frequency import process_frequencies
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(process_frequencies())
        loop.close()
        logger.info(f"⏰ Frequency processor result: {result}")
    except Exception as e:
        logger.exception(f"⏰ Frequency processor failed: {e}")


def run_engagement_processor():
    """Process customer engagement reminders."""
    logger.info("⏰ Scheduler: Running engagement processor...")
    try:
        import asyncio
        from app.routes.engagement import process_engagement
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(process_engagement())
        loop.close()
        logger.info(f"⏰ Engagement processor result: {result}")
    except Exception as e:
        logger.exception(f"⏰ Engagement processor failed: {e}")


def run_community_board_refresh():
    """Refresh the community board cache for all laundries with active referral programs.

    Runs every 5 minutes. For each laundry with an active referral program, aggregates:
    - Recent referral activity (anonymized first-name-only)
    - Monthly leaderboard (first name + last initial)
    - Community milestones (50, 100, 250, 500 total referrals)

    Writes results to shop.community_board_cache.
    """
    logger.info("⏰ Scheduler: Running community board refresh...")
    try:
        from app.database import get_db, get_cursor

        MILESTONES = [50, 100, 250, 500]

        with get_db() as conn:
            cur = get_cursor(conn)

            # Get all laundries with active referral programs
            cur.execute("""
                SELECT laundry_id FROM shop.referral_program_config
                WHERE is_active = TRUE
            """)
            active_laundries = cur.fetchall()

            for row in active_laundries:
                laundry_id = row["laundry_id"]

                # 1. Recent referral activity (last 7 days, anonymized first-name-only)
                cur.execute("""
                    SELECT c.first_name, re.status, re.updated_at
                    FROM shop.referral_events re
                    JOIN shop.customers c ON c.customer_id = re.referrer_id
                    WHERE re.laundry_id = %s
                      AND re.updated_at >= NOW() - interval '7 days'
                    ORDER BY re.updated_at DESC
                    LIMIT 20
                """, (laundry_id,))
                recent_events = cur.fetchall()

                recent_activity = []
                for event in recent_events:
                    first_name = event.get("first_name", "Someone")
                    status = event.get("status", "")
                    if status == "first_order_completed":
                        recent_activity.append(
                            f"{first_name} just earned a reward!"
                        )
                    elif status == "signed_up":
                        recent_activity.append(
                            f"{first_name} referred a friend!"
                        )

                # 2. Monthly leaderboard (first name + last initial)
                cur.execute("""
                    SELECT c.first_name, c.last_name, COUNT(*) as referral_count
                    FROM shop.referral_events re
                    JOIN shop.customers c ON c.customer_id = re.referrer_id
                    WHERE re.laundry_id = %s
                      AND re.status IN ('first_order_completed', 'rewarded')
                      AND re.updated_at >= date_trunc('month', NOW())
                      AND re.updated_at < date_trunc('month', NOW()) + interval '1 month'
                    GROUP BY c.customer_id, c.first_name, c.last_name
                    ORDER BY referral_count DESC
                    LIMIT 10
                """, (laundry_id,))
                leaderboard_rows = cur.fetchall()

                leaderboard = []
                for lb_row in leaderboard_rows:
                    first_name = lb_row.get("first_name", "")
                    last_name = lb_row.get("last_name", "")
                    last_initial = f" {last_name[0].upper()}." if last_name else ""
                    leaderboard.append({
                        "name": f"{first_name}{last_initial}",
                        "count": lb_row["referral_count"],
                    })

                # 3. Total referrals and milestones
                cur.execute("""
                    SELECT COUNT(*) as total
                    FROM shop.referral_events
                    WHERE laundry_id = %s
                """, (laundry_id,))
                total_row = cur.fetchone()
                total_referrals = total_row["total"] if total_row else 0

                milestones = [m for m in MILESTONES if total_referrals >= m]

                # 4. Upsert into community_board_cache
                import json
                cur.execute("""
                    INSERT INTO shop.community_board_cache
                        (laundry_id, recent_activity, leaderboard, milestones,
                         total_referrals, refreshed_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (laundry_id) DO UPDATE SET
                        recent_activity = EXCLUDED.recent_activity,
                        leaderboard = EXCLUDED.leaderboard,
                        milestones = EXCLUDED.milestones,
                        total_referrals = EXCLUDED.total_referrals,
                        refreshed_at = NOW()
                """, (
                    laundry_id,
                    json.dumps(recent_activity),
                    json.dumps(leaderboard),
                    json.dumps(milestones),
                    total_referrals,
                ))

        logger.info("⏰ Community board refresh completed for %d laundries", len(active_laundries))
    except Exception as e:
        logger.exception(f"⏰ Community board refresh failed: {e}")


def flush_notification_queue():
    """Flush pending notifications from the quiet-hours queue.

    Runs every 5 minutes. For each pending message whose scheduled_for time
    has passed (i.e. it's now 7 AM or later in that laundry's timezone), send
    the message via the appropriate channel and mark as 'sent'.
    """
    logger.info("⏰ Scheduler: Flushing notification queue...")
    try:
        from app.database import get_db, get_cursor
        from app.services.notification_service import send_sms, send_email

        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                SELECT id, laundry_id, recipient, channel, subject, body
                FROM shop.notification_queue
                WHERE status = 'pending' AND scheduled_for <= NOW()
                ORDER BY created_at ASC
                LIMIT 100
            """)
            rows = cur.fetchall()

        sent_count = 0
        failed_count = 0

        for row in rows:
            msg_id = row["id"]
            channel = row["channel"]
            recipient = row["recipient"]
            body = row["body"]
            subject = row.get("subject")
            success = False

            try:
                if channel == "sms":
                    success = send_sms(recipient, body)
                elif channel == "email":
                    success = send_email(recipient, subject or "Notification", body)
            except Exception as e:
                logger.warning(f"Failed to send queued notification {msg_id}: {e}")

            # Update status
            try:
                from app.database import get_db, get_cursor as gc
                with get_db() as conn:
                    cur = gc(conn)
                    if success:
                        cur.execute("""
                            UPDATE shop.notification_queue
                            SET status = 'sent', sent_at = NOW()
                            WHERE id = %s
                        """, (msg_id,))
                        sent_count += 1
                    else:
                        cur.execute("""
                            UPDATE shop.notification_queue
                            SET status = 'failed'
                            WHERE id = %s
                        """, (msg_id,))
                        failed_count += 1
            except Exception as e:
                logger.warning(f"Failed to update queue status for {msg_id}: {e}")

        if rows:
            logger.info(
                "⏰ Notification queue flush: %d sent, %d failed out of %d pending",
                sent_count, failed_count, len(rows),
            )
        else:
            logger.debug("⏰ Notification queue: nothing pending.")
    except Exception as e:
        logger.exception(f"⏰ Notification queue flush failed: {e}")


def run_credit_expiration():
    """Process credit expiration and send reminder notifications.

    Runs daily at 2 AM CT:
    - Marks credits past expires_at as 'expired'
    - Sends reminder notifications for credits within 7 days of expiry
    """
    logger.info("⏰ Scheduler: Running credit expiration job...")
    try:
        from app.database import get_db, get_cursor

        with get_db() as conn:
            cur = get_cursor(conn)

            # 1. Mark expired credits
            cur.execute("""
                UPDATE shop.reward_credits
                SET status = 'expired'
                WHERE status = 'active'
                  AND expires_at < NOW()
            """)
            expired_count = cur.rowcount
            logger.info(f"⏰ Marked {expired_count} credits as expired")

            # 2. Find credits expiring within 7 days and send reminders
            cur.execute("""
                SELECT rc.id, rc.customer_id, rc.laundry_id, rc.amount, rc.expires_at,
                       c.first_name, c.email, c.phone_number
                FROM shop.reward_credits rc
                JOIN shop.customers c ON c.customer_id = rc.customer_id
                WHERE rc.status = 'active'
                  AND rc.expires_at >= NOW()
                  AND rc.expires_at <= NOW() + interval '7 days'
            """)
            expiring_soon = cur.fetchall()

        # Send reminder notifications (best effort, outside transaction)
        reminder_count = 0
        for credit in expiring_soon:
            try:
                _send_expiration_reminder(credit)
                reminder_count += 1
            except Exception as e:
                logger.warning(
                    "Failed to send expiration reminder for credit %s: %s",
                    credit["id"], str(e)
                )

        logger.info(
            "⏰ Credit expiration completed: %d expired, %d reminders sent",
            expired_count, reminder_count
        )
    except Exception as e:
        logger.exception(f"⏰ Credit expiration job failed: {e}")


def _send_expiration_reminder(credit):
    """Send an expiration reminder notification for a credit about to expire.

    Args:
        credit: dict with customer_id, laundry_id, amount, expires_at,
                first_name, email, phone_number
    """
    from app.services.notification_service import send_email, send_sms_for_tenant

    first_name = credit.get("first_name", "Customer")
    amount = credit.get("amount", 0)
    expires_at = credit.get("expires_at")
    email = credit.get("email")
    phone = credit.get("phone_number")
    laundry_id = credit.get("laundry_id")

    expiry_str = expires_at.strftime("%B %d, %Y") if expires_at else "soon"
    message = (
        f"Hi {first_name}! Your ${amount:.2f} referral reward credit expires on "
        f"{expiry_str}. Use it on your next order before it expires!"
    )

    if email:
        send_email(
            email,
            "Your referral credit is expiring soon!",
            f"<p>{message}</p>",
        )

    if phone:
        send_sms_for_tenant(phone, message, laundry_id)


def _check_and_run_missed_jobs():
    """On startup, check if today's jobs were missed and run them now."""
    now = datetime.now(CT)
    
    # If it's past 6 AM CT and frequency hasn't run today, run it now
    if now.hour >= 6 and not _was_frequency_run_today():
        logger.info("⏰ Startup: Frequency processor missed today — running now...")
        run_frequency_processor()
    
    # Engagement runs at 10 AM — if past 10 AM and we just restarted, run it
    # (engagement is idempotent — won't double-send due to reminder history tracking)
    if now.hour >= 10:
        logger.info("⏰ Startup: Running engagement processor (catch-up)...")
        run_engagement_processor()


def start_scheduler():
    """Start the background scheduler with all jobs."""
    import os
    if os.environ.get("SKIP_SCHEDULER") == "1":
        logger.info("Skipping scheduler (SKIP_SCHEDULER=1)")
        return

    if scheduler.running:
        logger.info("Scheduler already running, skipping start")
        return

    # Frequency processor: daily at 6:00 AM Central Time
    scheduler.add_job(
        run_frequency_processor,
        CronTrigger(hour=6, minute=0, timezone=CT),
        id="frequency_processor",
        name="Process recurring orders (6 AM CT)",
        replace_existing=True,
        misfire_grace_time=7200,  # 2 hours grace period
    )

    # Engagement processor: daily at 10:00 AM Central Time
    scheduler.add_job(
        run_engagement_processor,
        CronTrigger(hour=10, minute=0, timezone=CT),
        id="engagement_processor",
        name="Customer engagement reminders (10 AM CT)",
        replace_existing=True,
        misfire_grace_time=7200,
    )

    # Community board refresh: every 5 minutes
    scheduler.add_job(
        run_community_board_refresh,
        IntervalTrigger(minutes=5),
        id="community_board_refresh",
        name="Refresh community board cache (every 5 min)",
        replace_existing=True,
        misfire_grace_time=300,  # 5 minutes grace period
    )

    # Notification queue flush: every 5 minutes
    scheduler.add_job(
        flush_notification_queue,
        IntervalTrigger(minutes=5),
        id="notification_queue_flush",
        name="Flush quiet-hours notification queue (every 5 min)",
        replace_existing=True,
        misfire_grace_time=300,  # 5 minutes grace period
    )

    # Credit expiration: daily at 2:00 AM Central Time
    scheduler.add_job(
        run_credit_expiration,
        CronTrigger(hour=2, minute=0, timezone=CT),
        id="credit_expiration",
        name="Credit expiration + reminders (2 AM CT)",
        replace_existing=True,
        misfire_grace_time=7200,  # 2 hours grace period
    )

    # Run missed jobs check 30 seconds after startup (gives DB time to connect)
    scheduler.add_job(
        _check_and_run_missed_jobs,
        'date',
        run_date=datetime.now() + timedelta(seconds=30),
        id="startup_catch_up",
        name="Catch up missed jobs on startup",
    )

    scheduler.start()
    logger.info("✅ Background scheduler started with %d jobs", len(scheduler.get_jobs()))
    for job in scheduler.get_jobs():
        logger.info(f"   📋 {job.name} — next run: {job.next_run_time}")
