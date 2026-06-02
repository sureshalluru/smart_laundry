"""
order_history.py — read order history for the UI.

Writing is handled automatically by PostgreSQL triggers defined in
order_history_setup.sql — no Lambda code needed for that.

The triggers write to:
  - orders.order_history  (human-readable timeline, read by get_order_history)
  - orders.order_audit_log (structured diff, for internal audit)

The only thing this module needs to do is provide get_order_history
for the UI orderHistory operation.
"""
import logging
import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def log_order_update(laundry_id, order_id, emp_id, update_details):
    """
    No-op — the DB triggers (trg_order_update, trg_order_services, etc.)
    automatically write to orders.order_history and orders.order_audit_log
    on every write. db.set_emp_id(emp_id) must be called before the write
    so the trigger knows which employee made the change.
    """
    pass


def get_order_history(laundry_id, order_id):
    """Fetch order history from orders.order_history for the UI timeline."""
    try:
        cur = db.get_cursor()
        cur.execute("""
            SELECT history_id, emp_id, emp_name, action,
                   field_changed, old_value, new_value,
                   change_summary, changed_at
            FROM   orders.order_history
            WHERE  order_id   = %s
              AND  laundry_id = %s
            ORDER  BY changed_at ASC
        """, (order_id, laundry_id))
        rows = cur.fetchall()

        if not rows:
            return {'message': 'No history found for the given order.'}

        return {
            'orderId': order_id,
            'history': [
                {
                    'historyId':     str(r['history_id']),
                    'employeeId':    r['emp_id'],
                    'employeeName':  r['emp_name'] or 'System',
                    'action':        r['action'],
                    'fieldChanged':  r['field_changed'],
                    'oldValue':      r['old_value'],
                    'newValue':      r['new_value'],
                    'changeSummary': r['change_summary'],
                    'changedAt':     str(r['changed_at']),
                }
                for r in rows
            ]
        }
    except Exception as e:
        logger.exception("get_order_history error")
        return {'message': f"An error occurred: {str(e)}"}
