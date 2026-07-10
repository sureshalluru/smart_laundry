"""
Migration/Seed: Insert initial FAQ templates into shop.faq_templates.
Populates the global FAQ template library with 17 researched templates
across 5 categories. Uses supported tokens from faq_token_resolver.py.

Safe to run multiple times (idempotent) — skips insert if slug already exists.
"""
import logging
from app.database import get_db, get_cursor

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# FAQ template data: 17 templates across 5 categories
# ---------------------------------------------------------------------------
FAQ_TEMPLATES = [
    # -----------------------------------------------------------------------
    # Category: Laundromat General (display_order 0-4)
    # -----------------------------------------------------------------------
    {
        "question": "What are your hours of operation?",
        "answer_template": (
            "{{shop_name}} is open {{hours}}. We maintain consistent hours to make "
            "laundry day convenient for your schedule. Stop by at {{address}} during "
            "any of our operating hours — our machines and friendly staff are ready "
            "to help. Call us at {{phone}} if you need to confirm holiday hours."
        ),
        "slug": "what-are-your-hours-of-operation",
        "category": "Laundromat General",
        "display_order": 0,
    },
    {
        "question": "Do you accept credit cards?",
        "answer_template": (
            "Yes! {{shop_name}} accepts all major credit cards, debit cards, and cash "
            "for both self-service machines and drop-off services. We want to make "
            "payment as easy as possible so you can focus on getting your laundry done. "
            "Visit us at {{address}} and pay however works best for you."
        ),
        "slug": "do-you-accept-credit-cards",
        "category": "Laundromat General",
        "display_order": 1,
    },
    {
        "question": "Do you have free WiFi?",
        "answer_template": (
            "Yes, {{shop_name}} offers complimentary WiFi for all customers while they "
            "wait. Whether you need to catch up on emails, stream your favorite show, or "
            "get some work done, we have you covered. Enjoy a comfortable wait with free "
            "high-speed internet at {{address}}."
        ),
        "slug": "do-you-have-free-wifi",
        "category": "Laundromat General",
        "display_order": 2,
    },
    {
        "question": "Do you have attendants on site?",
        "answer_template": (
            "Yes, {{shop_name}} has trained staff available during operating hours to "
            "assist with machine operation, answer questions, and ensure a clean and safe "
            "environment. Our attendants are happy to help first-time visitors get started. "
            "Visit us at {{address}} or call {{phone}} with any questions."
        ),
        "slug": "do-you-have-attendants-on-site",
        "category": "Laundromat General",
        "display_order": 3,
    },
    {
        "question": "Can I use my own detergent?",
        "answer_template": (
            "Absolutely! You're welcome to bring your own detergent, fabric softener, "
            "or pods when using our self-service machines at {{shop_name}}. We also sell "
            "popular detergent brands on-site if you forget yours. Stop by {{address}} "
            "and wash your way."
        ),
        "slug": "can-i-use-my-own-detergent",
        "category": "Laundromat General",
        "display_order": 4,
    },
    # -----------------------------------------------------------------------
    # Category: Wash & Fold (display_order 0-4)
    # -----------------------------------------------------------------------
    {
        "question": "How much does wash and fold cost per pound?",
        "answer_template": (
            "Our wash and fold service at {{shop_name}} starts at {{price_wash_fold}}. "
            "This includes sorting, washing with premium detergent, drying, and neatly "
            "folding your garments. We offer competitive pricing and consistent quality "
            "for every load. Call {{phone}} or stop by {{address}} to get started."
        ),
        "slug": "how-much-does-wash-and-fold-cost-per-pound",
        "category": "Wash & Fold",
        "display_order": 0,
    },
    {
        "question": "Do you separate laundry by color?",
        "answer_template": (
            "Yes! At {{shop_name}}, we carefully sort all garments by color and fabric "
            "type to prevent color bleeding and ensure the best wash results. Whites, "
            "darks, and colors are always washed separately. Trust us to treat your "
            "clothes with care — visit us at {{address}}."
        ),
        "slug": "do-you-separate-laundry-by-color",
        "category": "Wash & Fold",
        "display_order": 1,
    },
    {
        "question": "What is the turnaround time for wash and fold?",
        "answer_template": (
            "Most wash and fold orders at {{shop_name}} are ready within 24 hours. "
            "We process your laundry the same day it's received and notify you as soon "
            "as it's ready for pickup. Need it faster? Ask about our same-day service. "
            "Drop off at {{address}} or call {{phone}} to schedule."
        ),
        "slug": "what-is-the-turnaround-time-for-wash-and-fold",
        "category": "Wash & Fold",
        "display_order": 2,
    },
    {
        "question": "Do you offer same-day wash and fold service?",
        "answer_template": (
            "Yes! {{shop_name}} offers same-day turnaround for orders dropped off "
            "before noon. We understand that sometimes you need your laundry back fast, "
            "and our team works efficiently to make that happen. Drop off early at "
            "{{address}} and pick up clean, folded clothes by end of day."
        ),
        "slug": "do-you-offer-same-day-wash-and-fold-service",
        "category": "Wash & Fold",
        "display_order": 3,
    },
    {
        "question": "What items are included in wash and fold service?",
        "answer_template": (
            "Our wash and fold service at {{shop_name}} includes everyday clothing, "
            "towels, sheets, bedding, socks, and undergarments. Items are washed, dried, "
            "and neatly folded at {{price_wash_fold}}. Delicate or specialty items may "
            "require separate handling. Visit us at {{address}} or call {{phone}} for details."
        ),
        "slug": "what-items-are-included-in-wash-and-fold-service",
        "category": "Wash & Fold",
        "display_order": 4,
    },
    # -----------------------------------------------------------------------
    # Category: Pickup & Delivery (display_order 0-2)
    # -----------------------------------------------------------------------
    {
        "question": "Do you offer laundry pickup and delivery?",
        "answer_template": (
            "Yes! {{shop_name}} offers convenient laundry pickup and delivery service "
            "right to your door. We currently serve {{delivery_areas}} and surrounding "
            "neighborhoods. Schedule a pickup online or call us at {{phone}} to get "
            "started — we'll handle the rest."
        ),
        "slug": "do-you-offer-laundry-pickup-and-delivery",
        "category": "Pickup & Delivery",
        "display_order": 0,
    },
    {
        "question": "How much does pickup and delivery cost?",
        "answer_template": (
            "Our pickup and delivery service is priced at {{price_wash_fold}} with free "
            "delivery on orders over 15 lbs. There's no extra charge for the convenience "
            "of doorstep service on qualifying orders. {{shop_name}} makes it easy to get "
            "fresh laundry without leaving home. Call {{phone}} to schedule your first pickup."
        ),
        "slug": "how-much-does-pickup-and-delivery-cost",
        "category": "Pickup & Delivery",
        "display_order": 1,
    },
    {
        "question": "What areas do you deliver to?",
        "answer_template": (
            "{{shop_name}} currently delivers to {{delivery_areas}} in {{city}}, {{state}} "
            "and surrounding areas. We're always expanding our service area to reach more "
            "customers. If your zip code isn't listed, give us a call at {{phone}} — we "
            "may still be able to accommodate your location."
        ),
        "slug": "what-areas-do-you-deliver-to",
        "category": "Pickup & Delivery",
        "display_order": 2,
    },
    # -----------------------------------------------------------------------
    # Category: Comforter & Bedding (display_order 0-1)
    # -----------------------------------------------------------------------
    {
        "question": "Can I wash my comforter here?",
        "answer_template": (
            "Absolutely! {{shop_name}} has large-capacity machines perfect for comforters, "
            "duvets, and quilts. Our professional comforter wash service is available for "
            "{{price_comforter}}, and we handle everything from washing to fluff-drying. "
            "Bring your bulky items to {{address}} or call {{phone}} for drop-off details."
        ),
        "slug": "can-i-wash-my-comforter-here",
        "category": "Comforter & Bedding",
        "display_order": 0,
    },
    {
        "question": "What size machines do you have for large items?",
        "answer_template": (
            "{{shop_name}} has commercial-grade machines ranging from 20 to 80 pounds, "
            "perfect for comforters, sleeping bags, large blankets, and other bulky items. "
            "Our extra-large machines easily handle king-size comforters and heavy bedding. "
            "Visit us at {{address}} and our attendants will help you pick the right machine."
        ),
        "slug": "what-size-machines-do-you-have-for-large-items",
        "category": "Comforter & Bedding",
        "display_order": 1,
    },
    # -----------------------------------------------------------------------
    # Category: General Clothing Care (display_order 0-1)
    # -----------------------------------------------------------------------
    {
        "question": "What is the difference between dry cleaning and wash and fold?",
        "answer_template": (
            "Dry cleaning at {{shop_name}} uses chemical solvents instead of water to "
            "clean delicate fabrics like suits, silk, and wool — starting at "
            "{{price_dry_clean}}. Wash and fold ({{price_wash_fold}}) uses water-based "
            "washing for everyday items like t-shirts, jeans, and towels. Not sure which "
            "service you need? Bring your items to {{address}} and our staff will recommend "
            "the best option."
        ),
        "slug": "what-is-the-difference-between-dry-cleaning-and-wash-and-fold",
        "category": "General Clothing Care",
        "display_order": 0,
    },
    {
        "question": "How do you handle delicate items?",
        "answer_template": (
            "At {{shop_name}}, delicate items like silk, lace, and embroidered garments "
            "receive special attention. We use gentle wash cycles, mesh garment bags, and "
            "low-heat drying to protect your most treasured pieces. For high-end delicates, "
            "we recommend our dry cleaning service. Visit us at {{address}} or call "
            "{{phone}} to discuss your garment care needs."
        ),
        "slug": "how-do-you-handle-delicate-items",
        "category": "General Clothing Care",
        "display_order": 1,
    },
]


def run():
    """
    Insert FAQ templates into shop.faq_templates.
    Idempotent — uses ON CONFLICT (slug) DO NOTHING to skip existing entries.
    """
    with get_db() as conn:
        cur = get_cursor(conn)

        inserted_count = 0
        skipped_count = 0

        for template in FAQ_TEMPLATES:
            cur.execute("""
                INSERT INTO shop.faq_templates
                    (question, answer_template, slug, category, display_order, is_active)
                VALUES (%s, %s, %s, %s, %s, TRUE)
                ON CONFLICT (slug) DO NOTHING
            """, (
                template["question"],
                template["answer_template"],
                template["slug"],
                template["category"],
                template["display_order"],
            ))

            if cur.rowcount > 0:
                inserted_count += 1
            else:
                skipped_count += 1

        logger.info(
            f"FAQ template seed complete: {inserted_count} inserted, "
            f"{skipped_count} already existed (skipped)."
        )
