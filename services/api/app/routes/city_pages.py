"""
Public city-specific SEO landing pages — no auth required.
Generates "Laundry Pickup & Delivery in [City]" pages for each city
that a tenant services, based on their serviceable_zip_codes.
"""
from fastapi import APIRouter, HTTPException
from app.database import get_db, get_cursor
from app.services.zip_city_mapper import get_cities_for_zip_codes
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{laundry_id}")
async def get_city_pages_index(laundry_id: str):
    """
    Return list of all city landing pages available for this tenant.
    Each city corresponds to a unique URL at /:laundryId/pickup-delivery/:city-slug.
    No authentication required.
    """
    with get_db() as conn:
        cur = get_cursor(conn)

        # Get tenant info
        cur.execute("""
            SELECT laundry_name, street, city, state, zip_code,
                   contact_phone, serviceable_zip_codes, hide_home_address
            FROM shop.laundry_shops WHERE laundry_id = %s
        """, (laundry_id,))
        shop = cur.fetchone()
        if not shop:
            raise HTTPException(status_code=404, detail="Laundry not found")

        laundry_name = shop["laundry_name"] or ""
        zip_codes = shop.get("serviceable_zip_codes") or []
        if isinstance(zip_codes, dict):
            zip_codes = list(zip_codes.keys())

        # Get services for pricing info
        cur.execute("""
            SELECT service_name, price FROM shop.laundry_services
            WHERE laundry_id = %s AND is_active = TRUE
        """, (laundry_id,))
        services = cur.fetchall()

    # Map zip codes to cities
    cities = get_cities_for_zip_codes(zip_codes)

    # Find wash & fold price
    wash_fold_price = None
    for svc in services:
        name = (svc.get("service_name") or "").lower()
        if "wash" in name and "fold" in name:
            wash_fold_price = f"${float(svc['price']):.2f}/lb" if svc.get("price") else None
            break

    city_pages = []
    for city_key, city_data in sorted(cities.items(), key=lambda x: x[1]["city"]):
        city_pages.append({
            "city": city_data["city"],
            "state": city_data["state"],
            "slug": city_data["slug"],
            "zipCodes": city_data["zip_codes"],
            "url": f"/{laundry_id}/pickup-delivery/{city_data['slug']}",
        })

    # Home-based operators: never expose the street publicly — city/state only.
    if shop.get("hide_home_address"):
        laundry_address = f"{shop['city']}, {shop['state']}".strip(", ")
    else:
        laundry_address = f"{shop['street']}, {shop['city']}, {shop['state']} {shop['zip_code']}".strip(", ")

    return {
        "laundryName": laundry_name,
        "laundryAddress": laundry_address,
        "phone": shop.get("contact_phone") or "",
        "washFoldPrice": wash_fold_price,
        "cities": city_pages,
    }


@router.get("/{laundry_id}/{city_slug}")
async def get_city_page_detail(laundry_id: str, city_slug: str):
    """
    Return data for a specific city landing page.
    Contains SEO-optimized content specific to that city.
    No authentication required.
    """
    with get_db() as conn:
        cur = get_cursor(conn)

        # Get tenant info
        cur.execute("""
            SELECT laundry_name, street, city, state, zip_code,
                   contact_phone, serviceable_zip_codes, hide_home_address
            FROM shop.laundry_shops WHERE laundry_id = %s
        """, (laundry_id,))
        shop = cur.fetchone()
        if not shop:
            raise HTTPException(status_code=404, detail="Laundry not found")

        laundry_name = shop["laundry_name"] or ""
        zip_codes = shop.get("serviceable_zip_codes") or []
        if isinstance(zip_codes, dict):
            zip_codes = list(zip_codes.keys())

        # Get services for pricing
        cur.execute("""
            SELECT service_name, price FROM shop.laundry_services
            WHERE laundry_id = %s AND is_active = TRUE
        """, (laundry_id,))
        services = cur.fetchall()

        # Get delivery time slots for hours
        cur.execute("""
            SELECT day_of_week, start_time, end_time
            FROM shop.delivery_time_slots
            WHERE laundry_id = %s ORDER BY id
        """, (laundry_id,))
        delivery_slots = cur.fetchall()

    # Map zip codes to cities and find the requested one
    cities = get_cities_for_zip_codes(zip_codes)

    target_city = None
    for city_key, city_data in cities.items():
        if city_data["slug"] == city_slug:
            target_city = city_data
            break

    if not target_city:
        raise HTTPException(status_code=404, detail="City page not found")

    city_name = target_city["city"]
    state = target_city["state"]
    city_zips = target_city["zip_codes"]

    # Build pricing info
    pricing = []
    wash_fold_price = None
    for svc in services:
        name = svc.get("service_name", "")
        price = svc.get("price")
        if price:
            pricing.append({"service": name, "price": f"${float(price):.2f}"})
            if "wash" in name.lower() and "fold" in name.lower():
                wash_fold_price = f"${float(price):.2f}/lb"

    # Build delivery hours summary
    delivery_hours = ""
    if delivery_slots:
        day_times = {}
        for slot in delivery_slots:
            day = slot.get("day_of_week", "")
            start = str(slot.get("start_time", ""))[:5]
            end = str(slot.get("end_time", ""))[:5]
            day_times[day] = f"{start} - {end}"
        if day_times:
            delivery_hours = ", ".join(f"{d}: {t}" for d, t in day_times.items())

    # Generate SEO content
    page_title = f"Laundry Pickup & Delivery in {city_name}, {state} | {laundry_name}"
    meta_description = (
        f"{laundry_name} offers professional laundry pickup and delivery service in "
        f"{city_name}, {state}. Starting at {wash_fold_price or 'competitive rates'}. "
        f"Free pickup from zip codes {', '.join(city_zips[:3])}{'...' if len(city_zips) > 3 else ''}. "
        f"Schedule online today!"
    )[:160]

    # Hero content
    hero_headline = f"Laundry Pickup & Delivery in {city_name}"
    hero_subtext = (
        f"Skip the laundromat — {laundry_name} picks up your dirty laundry and delivers "
        f"it back fresh, clean, and folded. Serving {city_name}, {state} and surrounding areas."
    )

    # Main body content (SEO-rich)
    body_content = (
        f"Looking for convenient laundry pickup and delivery in {city_name}? "
        f"{laundry_name} provides professional wash and fold service right to your door. "
        f"We serve the following zip codes in {city_name}: {', '.join(city_zips)}.\n\n"
        f"Our wash and fold service starts at just {wash_fold_price or 'affordable rates'} per pound. "
        f"Simply schedule a pickup, leave your bag outside, and we'll return your laundry "
        f"clean, fresh, and neatly folded — typically within 24 hours.\n\n"
        f"Whether you're a busy professional, a family juggling schedules, or anyone who'd "
        f"rather spend time on what matters, our {city_name} laundry delivery service "
        f"is here to help. No more driving to the laundromat, no more waiting around — "
        f"just fresh laundry delivered to your doorstep."
    )

    hide_address = bool(shop.get("hide_home_address"))

    # JSON-LD structured data (crawlable). For home-based operators, use a
    # Service schema with only the served area — never emit the street address.
    if hide_address:
        json_ld = {
            "@context": "https://schema.org",
            "@type": "Service",
            "name": laundry_name,
            "description": f"Professional laundry pickup and delivery service in {city_name}, {state}",
            "provider": {"@type": "LocalBusiness", "name": laundry_name},
            "areaServed": [
                {"@type": "City", "name": city_name}
            ],
            "serviceType": "Laundry Pickup and Delivery",
        }
        if shop.get("contact_phone"):
            json_ld["provider"]["telephone"] = shop["contact_phone"]
    else:
        json_ld = {
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": laundry_name,
            "description": f"Professional laundry pickup and delivery service in {city_name}, {state}",
            "address": {
                "@type": "PostalAddress",
                "streetAddress": shop.get("street") or "",
                "addressLocality": shop.get("city") or city_name,
                "addressRegion": state,
                "postalCode": shop.get("zip_code") or "",
            },
            "telephone": shop.get("contact_phone") or "",
            "areaServed": [
                {"@type": "City", "name": city_name}
            ],
            "serviceType": "Laundry Pickup and Delivery",
        }

    # Adjacent city pages for navigation
    all_city_slugs = sorted(cities.keys())
    current_idx = all_city_slugs.index(city_name.lower().strip()) if city_name.lower().strip() in all_city_slugs else -1
    adjacent = {"prev": None, "next": None}
    if current_idx > 0:
        prev_city = cities[all_city_slugs[current_idx - 1]]
        adjacent["prev"] = {"slug": prev_city["slug"], "city": prev_city["city"]}
    if current_idx >= 0 and current_idx < len(all_city_slugs) - 1:
        next_city = cities[all_city_slugs[current_idx + 1]]
        adjacent["next"] = {"slug": next_city["slug"], "city": next_city["city"]}

    return {
        "city": city_name,
        "state": state,
        "slug": city_slug,
        "zipCodes": city_zips,
        "laundryName": laundry_name,
        "laundryAddress": (
            f"{shop['city']}, {shop['state']}".strip(", ")
            if hide_address
            else f"{shop['street']}, {shop['city']}, {shop['state']} {shop['zip_code']}".strip(", ")
        ),
        "phone": shop.get("contact_phone") or "",
        "pageTitle": page_title,
        "metaDescription": meta_description,
        "heroHeadline": hero_headline,
        "heroSubtext": hero_subtext,
        "bodyContent": body_content,
        "pricing": pricing,
        "washFoldPrice": wash_fold_price,
        "deliveryHours": delivery_hours,
        "jsonLd": json_ld,
        "adjacentCities": adjacent,
    }
