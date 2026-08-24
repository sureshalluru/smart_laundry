"""
Demo login routes — bypasses normal auth for demo/prospect access.
Issues valid JWT tokens for pre-seeded demo accounts.
Reads actual customer/employee data from DB to ensure token matches seeded data.
"""
from fastapi import APIRouter, HTTPException
from app.auth import create_access_token, create_refresh_token
from app.database import get_db, get_cursor

router = APIRouter()

DEMO_LAUNDRY_ID = 999
DEMO_CUSTOMER_ID = "demo-customer-001"
DEMO_EMPLOYEE_ID = "DEMO01"


@router.post("/customer-login")
async def demo_customer_login():
    """
    Issue a valid JWT for the demo customer.
    No credentials required — reads actual seeded data from DB.
    """
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT customer_id, phone_number, email, first_name, last_name
            FROM shop.customers WHERE customer_id = %s
        """, (DEMO_CUSTOMER_ID,))
        customer = cur.fetchone()

    if not customer:
        raise HTTPException(status_code=404, detail="Demo customer not found. Run: python -m scripts.seed_demo_data")

    token_data = {
        "sub": customer["customer_id"],
        "phone": customer["phone_number"],
        "email": customer["email"] or "",
        "role": "customer",
        "name": f"{customer['first_name']} {customer['last_name']}".strip(),
        "laundryId": str(DEMO_LAUNDRY_ID),
    }

    return {
        "status": "success",
        "accessToken": create_access_token(token_data),
        "refreshToken": create_refresh_token(token_data),
        "user": token_data,
    }


@router.post("/admin-login")
async def demo_admin_login():
    """
    Issue a valid JWT for the demo admin employee.
    No credentials required — reads actual seeded data from DB.
    """
    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT emp_id, first_name, last_name, role
            FROM shop.employees WHERE emp_id = %s AND laundry_id = %s
        """, (DEMO_EMPLOYEE_ID, DEMO_LAUNDRY_ID))
        emp = cur.fetchone()

    if not emp:
        raise HTTPException(status_code=404, detail="Demo employee not found. Run: python -m scripts.seed_demo_data")

    token_data = {
        "sub": emp["emp_id"],
        "role": emp["role"] or "Admin",
        "laundryId": DEMO_LAUNDRY_ID,
        "name": f"{emp['first_name']} {emp['last_name']}".strip(),
    }

    return {
        "status": "success",
        "accessToken": create_access_token(token_data),
        "refreshToken": create_refresh_token(token_data),
        "user": token_data,
    }
