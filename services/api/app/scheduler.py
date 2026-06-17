"""
Background Scheduler — runs recurring tasks inside the app process.
No dependency on Render cron jobs or external HTTP calls.

Jobs:
- Frequency processor: daily at 6 AM CT (creates recurring orders)
- Engagement processor: daily at 10 AM CT (sends customer reminders)

Safety: On startup, checks if today's jobs were missed and runs them immediately.
"""
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
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
