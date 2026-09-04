"""
Migration/Seed: Insert initial FAQ templates into shop.faq_templates.
Populates the global FAQ template library with 23 researched templates
across 6 categories. Uses supported tokens from faq_token_resolver.py.

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
    {
        "question": "Do you offer add-ons like hang-dry or hypoallergenic detergent?",
        "answer_template": (
            "Yes! {{shop_name}} offers optional add-ons to tailor your wash — such as hang-drying "
            "delicate items, an extra rinse, fabric softener, or hypoallergenic/fragrance-free "
            "detergent. Just select the extras you'd like when you place your order, and we'll "
            "take care of the rest. Call {{phone}} or stop by {{address}} if you have a special "
            "request."
        ),
        "slug": "do-you-offer-wash-and-fold-add-ons",
        "category": "Wash & Fold",
        "display_order": 5,
    },
    {
        "question": "Can I add a tip for the team?",
        "answer_template": (
            "Absolutely, and it's always appreciated but never required. When you order with "
            "{{shop_name}} you can add a tip as a percentage or a fixed amount, and your tip "
            "carries over on recurring orders so you don't have to set it each time. One hundred "
            "percent of your tip supports the team that cleans and cares for your laundry."
        ),
        "slug": "can-i-add-a-tip",
        "category": "Wash & Fold",
        "display_order": 6,
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
    {
        "question": "Is there a delivery fee?",
        "answer_template": (
            "{{shop_name}} keeps delivery pricing simple and transparent. Depending on your "
            "distance from us, delivery may be included or carry a small fee, and any fee is "
            "always shown before you confirm your order — no surprises. Nearby addresses often "
            "qualify for free or reduced delivery. Questions about your address? Call {{phone}} "
            "or schedule online to see your exact total."
        ),
        "slug": "is-there-a-delivery-fee",
        "category": "Pickup & Delivery",
        "display_order": 3,
    },
    {
        "question": "How do I schedule a recurring pickup?",
        "answer_template": (
            "Setting up recurring laundry with {{shop_name}} is easy. When you place an order "
            "online, choose a recurring schedule — weekly, bi-weekly, or monthly — and we'll "
            "automatically create each pickup on your chosen day and notify you beforehand. "
            "It's the effortless way to never think about laundry day again. Call {{phone}} or "
            "book online to get started."
        ),
        "slug": "how-do-i-schedule-a-recurring-pickup",
        "category": "Pickup & Delivery",
        "display_order": 4,
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
    # -----------------------------------------------------------------------
    # Category: Commercial Laundry Services (display_order 0-5)
    # -----------------------------------------------------------------------
    {
        "question": "Do you offer commercial laundry services for businesses?",
        "answer_template": (
            "Yes! {{shop_name}} provides professional commercial laundry services for "
            "businesses of all sizes — including hotels, Airbnbs, restaurants, spas, salons, "
            "gyms, and medical offices. We handle linens, towels, uniforms, tablecloths, and "
            "more with consistent quality and fast turnaround. Contact us at {{phone}} to "
            "set up a commercial account."
        ),
        "slug": "do-you-offer-commercial-laundry-services-for-businesses",
        "category": "Commercial Laundry Services",
        "display_order": 0,
    },
    {
        "question": "How does commercial laundry pricing work?",
        "answer_template": (
            "{{shop_name}} offers competitive per-pound pricing for commercial accounts, "
            "with volume discounts for regular pickups. Businesses on a recurring schedule "
            "receive priority turnaround and invoiced billing (Net 30). Our commercial wash "
            "and fold starts at {{price_wash_fold}}. Contact us at {{phone}} for a custom "
            "quote based on your volume and frequency."
        ),
        "slug": "how-does-commercial-laundry-pricing-work",
        "category": "Commercial Laundry Services",
        "display_order": 1,
    },
    {
        "question": "Do you provide laundry service for Airbnb and vacation rentals?",
        "answer_template": (
            "Absolutely! {{shop_name}} is the go-to laundry partner for Airbnb hosts and "
            "vacation rental managers. We wash, dry, and fold sheets, towels, and linens "
            "between guest turnovers — often with same-day or next-day service. Schedule "
            "recurring pickups or request on-demand service. We serve {{delivery_areas}} "
            "and surrounding areas. Call {{phone}} to get started."
        ),
        "slug": "do-you-provide-laundry-service-for-airbnb-and-vacation-rentals",
        "category": "Commercial Laundry Services",
        "display_order": 2,
    },
    {
        "question": "Can you handle hotel and restaurant linens?",
        "answer_template": (
            "Yes! {{shop_name}} handles large-volume linen service for hotels, restaurants, "
            "and catering businesses. We process sheets, duvet covers, tablecloths, napkins, "
            "kitchen towels, and uniforms. Our commercial-grade machines handle heavy loads "
            "efficiently, and we offer scheduled pickup and delivery to keep your business "
            "running smoothly. Visit us at {{address}} or call {{phone}}."
        ),
        "slug": "can-you-handle-hotel-and-restaurant-linens",
        "category": "Commercial Laundry Services",
        "display_order": 3,
    },
    {
        "question": "Do you offer recurring pickup schedules for businesses?",
        "answer_template": (
            "Yes! {{shop_name}} offers flexible recurring pickup schedules — daily, weekly, "
            "or bi-weekly — tailored to your business needs. Our commercial accounts get "
            "priority processing, invoiced billing, and a dedicated service coordinator. "
            "Whether you're a spa needing daily towel service or a restaurant with weekly "
            "tablecloth pickups, we've got you covered. Call {{phone}} to set up your schedule."
        ),
        "slug": "do-you-offer-recurring-pickup-schedules-for-businesses",
        "category": "Commercial Laundry Services",
        "display_order": 4,
    },
    {
        "question": "What types of businesses use your commercial laundry service?",
        "answer_template": (
            "{{shop_name}} proudly serves a wide range of businesses including: Airbnb & "
            "vacation rental hosts, hotels and motels, restaurants and cafes, spas and salons, "
            "gyms and fitness studios, medical and dental offices, daycare centers, and "
            "corporate offices. Any business that needs clean linens, towels, or uniforms "
            "on a reliable schedule — we can help. Contact {{phone}} for a free consultation."
        ),
        "slug": "what-types-of-businesses-use-your-commercial-laundry-service",
        "category": "Commercial Laundry Services",
        "display_order": 5,
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
