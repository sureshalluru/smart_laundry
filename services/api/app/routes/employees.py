"""
Employee routes — replaces EmployeeService + validateEmployeeCredentials Lambdas.
NOTE: These currently use DynamoDB in production. For the migration,
we'll store employees in PostgreSQL instead.
"""
from fastapi import APIRouter, Depends, Query, Body
from typing import Optional
from app.database import get_db, get_cursor
from app.auth import get_current_user
import logging
import random

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/list")
async def list_employees(
    laundryId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """List all employees for a laundry."""
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT emp_id, laundry_id, first_name, last_name, joining_date,
                   role, email, phone, avg_rating, passcode
            FROM shop.employees WHERE laundry_id = %s AND is_active = TRUE
        """, (laundryId,))
        rows = cur.fetchall()

        # Only include passcode if requester is Admin
        is_admin = current_user.get("role") == "Admin"

        employees = [
            {
                "employeeId": r["emp_id"],
                "laundryId": r["laundry_id"],
                "fullName": f"{r['first_name']} {r['last_name']}".strip(),
                "joiningDate": str(r["joining_date"]) if r["joining_date"] else None,
                "role": r["role"],
                "contact": {
                    "email": r["email"],
                    "phone": r["phone"],
                },
                "avgRating": float(r["avg_rating"] or 0),
                **({"passcode": r["passcode"]} if is_admin else {}),
            }
            for r in rows
        ]
    return {"body": {"status": "success", "employees": employees}}


@router.post("/create")
async def create_employee(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Create a new employee."""
    # TODO: Port from EmployeeService createEmployee
    return {"body": {"message": "TODO: implement createEmployee"}}


@router.post("/validate-credentials")
async def validate_credentials(
    body: dict = Body(...),
):
    """Validate employee ID and passcode. No auth required (this IS the auth)."""
    laundry_id = body.get("laundryId", "")
    emp_id = body.get("empId", "")
    passcode = body.get("passcode", "")

    if not laundry_id or not emp_id or not passcode:
        return {"body": {"isValidated": False, "error": "Missing required parameters: laundryId, empId, or passcode"}}

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT emp_id, laundry_id, role, passcode, first_name, last_name
            FROM shop.employees
            WHERE emp_id = %s AND laundry_id = %s AND is_active = TRUE
        """, (emp_id, laundry_id))
        emp = cur.fetchone()

        if not emp or emp["passcode"] != passcode:
            return {"body": {"isValidated": False, "empId": emp_id, "role": None, "error": "Invalid credentials"}}

        full_name = f"{emp['first_name']} {emp['last_name']}".strip()
        return {"body": {"isValidated": True, "empId": emp["emp_id"], "role": emp["role"], "fullName": full_name}}


@router.post("/validate-pin")
async def validate_pin(
    body: dict = Body(...),
):
    """Validate employee by passcode + laundryId only (no empId required).
    This IS the auth mechanism for the mobile PIN flow."""
    laundry_id = body.get("laundryId", "")
    passcode = body.get("passcode", "")

    if not laundry_id or not passcode:
        return {"body": {"isValidated": False, "error": "Missing required parameters: laundryId or passcode"}}

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT emp_id, role, passcode, first_name, last_name
            FROM shop.employees
            WHERE passcode = %s AND laundry_id = %s AND is_active = TRUE
        """, (passcode, laundry_id))
        rows = cur.fetchall()

        if not rows:
            return {"body": {"isValidated": False, "error": "Invalid PIN"}}

        if len(rows) > 1:
            return {"body": {"isValidated": False, "error": "Multiple employees share this PIN. Please use Employee ID login instead."}}

        emp = rows[0]
        full_name = f"{emp['first_name']} {emp['last_name']}".strip()
        return {"body": {"isValidated": True, "empId": emp["emp_id"], "role": emp["role"], "fullName": full_name}}


@router.delete("/delete")
async def delete_employee(
    employeeId: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Soft-delete an employee."""
    # TODO: Port from EmployeeService deleteEmployee
    return {"body": {"message": "TODO: implement deleteEmployee"}}
