"""
Dynamic sitemap.xml and robots.txt generation for SEO.
Generates tenant-specific sitemaps listing all indexable pages:
- Landing page (site)
- FAQ index + individual FAQ pages
- City pickup & delivery pages
"""
from fastapi import APIRouter, Query
from fastapi.responses import Response
from app.database import get_db, get_cursor
from app.services.zip_city_mapper import get_cities_for_zip_codes
from datetime import datetime
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/sitemap.xml")
async def get_sitemap(laundryId: str = Query(None)):
    """
    Generate sitemap.xml for a tenant.
    If laundryId is provided, generates for that tenant.
    If not provided, generates a sitemap index for all tenants.
    """
    if laundryId:
        xml = _generate_tenant_sitemap(laundryId)
    else:
        xml = _generate_sitemap_index()

    return Response(content=xml, media_type="application/xml")


@router.get("/robots.txt")
async def get_robots(laundryId: str = Query(None)):
    """
    Serve dynamic robots.txt that references the sitemap.
    """
    # Determine base URL from the request context
    # For now use a generic reference; tenants on custom domains
    # should configure their DNS to point here
    sitemap_url = f"/api/sitemap.xml?laundryId={laundryId}" if laundryId else "/api/sitemap.xml"

    robots = f"""User-agent: *
Disallow: /user/
Disallow: /login
Disallow: /platform-admin
Disallow: /onboard
Disallow: /api/

Allow: /*/faq
Allow: /*/faq/
Allow: /*/pickup-delivery/
Allow: /*/site

Sitemap: {sitemap_url}
"""
    return Response(content=robots, media_type="text/plain")


def _generate_tenant_sitemap(laundry_id: str) -> str:
    """Generate sitemap XML for a specific tenant."""
    today = datetime.now().strftime('%Y-%m-%d')
    urls = []

    with get_db() as conn:
        cur = get_cursor(conn)

        # Get tenant info
        cur.execute("""
            SELECT laundry_name, user_domain, serviceable_zip_codes
            FROM shop.laundry_shops WHERE laundry_id = %s
        """, (laundry_id,))
        shop = cur.fetchone()
        if not shop:
            return _empty_sitemap()

        # Determine base URL
        user_domain = shop.get("user_domain")
        if user_domain and user_domain.startswith("http"):
            base_url = user_domain.rstrip("/")
        elif user_domain:
            base_url = f"https://{user_domain}"
        else:
            base_url = f"https://www.smartlaundrybasket.ai/{laundry_id}"

        # 1. Landing page (highest priority)
        urls.append({
            "loc": f"{base_url}/site" if "smartlaundrybasket" in base_url else base_url,
            "priority": "1.0",
            "changefreq": "weekly",
        })

        # 2. FAQ index page
        urls.append({
            "loc": f"{base_url}/faq",
            "priority": "0.8",
            "changefreq": "weekly",
        })

        # 3. Individual FAQ pages
        cur.execute("""
            SELECT slug, updated_at FROM shop.tenant_faqs
            WHERE laundry_id = %s AND is_enabled = TRUE
            ORDER BY category, display_order
        """, (laundry_id,))
        faqs = cur.fetchall()

        for faq in faqs:
            last_mod = faq["updated_at"].strftime('%Y-%m-%d') if faq.get("updated_at") else today
            urls.append({
                "loc": f"{base_url}/faq/{faq['slug']}",
                "lastmod": last_mod,
                "priority": "0.7",
                "changefreq": "monthly",
            })

        # 4. City pickup & delivery pages
        zip_codes = shop.get("serviceable_zip_codes") or []
        if isinstance(zip_codes, dict):
            zip_codes = list(zip_codes.keys())

        cities = get_cities_for_zip_codes(zip_codes)
        for city_key, city_data in sorted(cities.items()):
            urls.append({
                "loc": f"{base_url}/pickup-delivery/{city_data['slug']}",
                "priority": "0.8",
                "changefreq": "monthly",
            })

    return _build_sitemap_xml(urls, today)


def _generate_sitemap_index() -> str:
    """Generate a sitemap index listing all tenant sitemaps."""
    today = datetime.now().strftime('%Y-%m-%d')

    with get_db() as conn:
        cur = get_cursor(conn)
        cur.execute("SELECT laundry_id FROM shop.laundry_shops ORDER BY laundry_id")
        shops = cur.fetchall()

    sitemaps = []
    for shop in shops:
        lid = shop["laundry_id"]
        sitemaps.append(f"""  <sitemap>
    <loc>/api/sitemap.xml?laundryId={lid}</loc>
    <lastmod>{today}</lastmod>
  </sitemap>""")

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{chr(10).join(sitemaps)}
</sitemapindex>"""


def _build_sitemap_xml(urls: list, today: str) -> str:
    """Build sitemap XML from a list of URL entries."""
    url_entries = []
    for u in urls:
        entry = f"  <url>\n    <loc>{u['loc']}</loc>\n"
        if u.get("lastmod"):
            entry += f"    <lastmod>{u['lastmod']}</lastmod>\n"
        else:
            entry += f"    <lastmod>{today}</lastmod>\n"
        if u.get("changefreq"):
            entry += f"    <changefreq>{u['changefreq']}</changefreq>\n"
        if u.get("priority"):
            entry += f"    <priority>{u['priority']}</priority>\n"
        entry += "  </url>"
        url_entries.append(entry)

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{chr(10).join(url_entries)}
</urlset>"""


def _empty_sitemap() -> str:
    """Return an empty but valid sitemap."""
    return """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>"""
