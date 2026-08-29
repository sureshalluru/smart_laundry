"""
One-off admin script: toggle the hide_home_address privacy flag for a laundry.

When hide_home_address is TRUE, the shop's street address is never shown on any
client-facing surface (website, booking portal, SEO city pages, public API, AI
chat) — only city/state and the service area are public. The street stays stored
internally for driver routing and account verification.

Usage (run from services/api so `app` is importable):
    python -m scripts.set_hide_home_address <laundry_id>            # hide (default)
    python -m scripts.set_hide_home_address <laundry_id> --show     # un-hide
    python -m scripts.set_hide_home_address <laundry_id> --status   # read-only check

Examples:
    python -m scripts.set_hide_home_address 12
    python -m scripts.set_hide_home_address 12 --show
    python -m scripts.set_hide_home_address 12 --status
"""
import sys

from app.database import get_db, get_cursor


def _fetch_shop(cur, laundry_id: str):
    cur.execute(
        """
        SELECT laundry_id, laundry_name, street, city, state, zip_code,
               COALESCE(hide_home_address, FALSE) AS hide_home_address
        FROM shop.laundry_shops
        WHERE laundry_id = %s
        """,
        (laundry_id,),
    )
    return cur.fetchone()


def main():
    args = [a for a in sys.argv[1:]]
    if not args:
        print(__doc__)
        sys.exit(1)

    laundry_id = args[0]
    status_only = "--status" in args
    # Default action is to HIDE; --show flips it off.
    hide = not ("--show" in args)

    with get_db() as conn:
        cur = get_cursor(conn)

        shop = _fetch_shop(cur, laundry_id)
        if not shop:
            print(f"ERROR: No laundry found with laundry_id = {laundry_id!r}")
            sys.exit(2)

        addr = f"{shop['street']}, {shop['city']}, {shop['state']} {shop['zip_code']}"
        print("Laundry found:")
        print(f"  laundry_id        : {shop['laundry_id']}")
        print(f"  name              : {shop['laundry_name']}")
        print(f"  street (internal) : {addr}")
        print(f"  hide_home_address : {shop['hide_home_address']} (current)")

        if status_only:
            print("\n(--status: no changes made)")
            return

        if shop["hide_home_address"] == hide:
            print(f"\nNo change needed — hide_home_address is already {hide}.")
            return

        cur.execute(
            "UPDATE shop.laundry_shops SET hide_home_address = %s WHERE laundry_id = %s",
            (hide, laundry_id),
        )

        updated = _fetch_shop(cur, laundry_id)
        print(f"\nUpdated hide_home_address -> {updated['hide_home_address']}")
        if hide:
            print(f"Public surfaces will now show only: {shop['city']}, {shop['state']}")
        else:
            print(f"Public surfaces will now show the full address: {addr}")


if __name__ == "__main__":
    main()
