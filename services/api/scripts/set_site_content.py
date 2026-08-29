"""
One-off admin script: merge keys into a laundry's site_content JSONB.

site_content drives the public marketing site (hero headline/subheadline,
trust badges, and optional section hide-flags). This script merges the keys
you pass into the existing site_content without clobbering the rest.

Supported keys (all optional):
  --headline "..."          hero headline (may include <span>...</span> accent)
  --subheadline "..."       hero subheadline
  --badges "A|B|C"          trust badges, pipe-separated (empty string clears)
  --hide-howitworks         hide the How-It-Works section
  --hide-pricing            hide the Pricing section
  --hide-location           hide the Location section
  --hide-about              hide the About section
  --show-howitworks / --show-pricing / --show-location / --show-about
                            re-enable a previously hidden section
  --status                  read-only: print current site_content and exit

Absent hide-flags leave the section rendering as before (default behavior).

Usage (run from services/api so `app` is importable):
    python -m scripts.set_site_content <laundry_id> --status
    python -m scripts.set_site_content 1003 --badges "Free Pickup & Delivery|Eco-Friendly|Locally Owned" \
        --headline "Concierge Laundry, <span>Picked Up & Delivered</span>" \
        --hide-howitworks

Example for Fetch & Fold Concierge (1003), pickup-delivery-only:
    python -m scripts.set_site_content 1003 \
        --badges "Free Pickup & Delivery|Eco-Friendly Options|Locally Owned" \
        --headline "Concierge Wash & Fold, <span>Delivered</span>" \
        --subheadline "We pick up, wash, fold, and deliver — no storefront visit needed."
"""
import json
import sys

from app.database import get_db, get_cursor


HIDE_FLAGS = {
    "--hide-howitworks": ("hideHowItWorks", True),
    "--hide-pricing": ("hidePricing", True),
    "--hide-location": ("hideLocation", True),
    "--hide-about": ("hideAbout", True),
    "--show-howitworks": ("hideHowItWorks", False),
    "--show-pricing": ("hidePricing", False),
    "--show-location": ("hideLocation", False),
    "--show-about": ("hideAbout", False),
}


def _get_arg_value(args, flag):
    """Return the value following `flag`, or None if not present."""
    if flag in args:
        idx = args.index(flag)
        if idx + 1 < len(args):
            return args[idx + 1]
    return None


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)

    laundry_id = args[0]
    status_only = "--status" in args

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute(
            "SELECT laundry_id, laundry_name, site_content FROM shop.laundry_shops WHERE laundry_id = %s",
            (laundry_id,),
        )
        shop = cur.fetchone()
        if not shop:
            print(f"ERROR: No laundry found with laundry_id = {laundry_id!r}")
            sys.exit(2)

        current = shop["site_content"] or {}
        if isinstance(current, str):
            current = json.loads(current)

        print(f"Laundry: {shop['laundry_name']} ({shop['laundry_id']})")
        print("Current site_content keys:", sorted(current.keys()))

        if status_only:
            print("\nCurrent site_content:")
            print(json.dumps(current, indent=2))
            print("\n(--status: no changes made)")
            return

        updates = {}

        headline = _get_arg_value(args, "--headline")
        if headline is not None:
            updates["headline"] = headline

        subheadline = _get_arg_value(args, "--subheadline")
        if subheadline is not None:
            updates["subheadline"] = subheadline

        badges = _get_arg_value(args, "--badges")
        if badges is not None:
            updates["trustBadges"] = [b.strip() for b in badges.split("|") if b.strip()]

        for flag, (key, value) in HIDE_FLAGS.items():
            if flag in args:
                updates[key] = value

        if not updates:
            print("\nNothing to update. Pass at least one key (see --help/docstring).")
            return

        merged = {**current, **updates}
        cur.execute(
            "UPDATE shop.laundry_shops SET site_content = %s, updated_at = NOW() WHERE laundry_id = %s",
            (json.dumps(merged), laundry_id),
        )

        print("\nApplied updates:")
        print(json.dumps(updates, indent=2))
        print("\nsite_content saved.")


if __name__ == "__main__":
    main()
