"""
Audit logging service.
Tracks admin actions for debugging and accountability.
"""
import json
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)


def log_action(laundry_id: str, action: str, entity_type: str = None,
               entity_id: str = None, changes: dict = None,
               performed_by: str = None, ip_address: str = None):
    """
    Log an admin action to the audit trail.
    
    Args:
        laundry_id: Which laundry this action belongs to
        action: What happened (e.g., "update_services", "change_order_status")
        entity_type: What was changed (e.g., "service", "order", "settings")
        entity_id: ID of the changed entity
        changes: Dict of what changed (e.g., {"price": {"old": 1.75, "new": 2.00}})
        performed_by: Who did it (empId or "system")
        ip_address: Request IP
    """
    try:
        with get_db() as conn:
            cur = get_cursor(conn)
            cur.execute("""
                INSERT INTO shop.audit_log (laundry_id, action, entity_type, entity_id, changes, performed_by, ip_address)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                laundry_id, action, entity_type, entity_id,
                json.dumps(changes) if changes else None,
                performed_by, ip_address
            ))
    except Exception as e:
        logger.warning(f"Audit log failed: {e}")
