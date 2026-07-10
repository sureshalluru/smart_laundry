"""
ZIP code to city mapping service.
Maps US zip codes to their primary city names for generating
city-specific SEO landing pages.

Uses the uszipcode library if available, otherwise falls back to a
curated mapping for known serviceable areas.
"""
import logging

logger = logging.getLogger(__name__)

# Curated fallback mapping for known service areas
# (Used when uszipcode library is not installed)
KNOWN_ZIP_CITIES = {
    # Austin/Round Rock area (Laundry 1)
    "78664": "Round Rock",
    "78665": "Round Rock",
    "78681": "Round Rock",
    "78660": "Pflugerville",
    "78653": "Manor",
    "78724": "Austin",
    "78725": "Austin",
    "78723": "Austin",
    "78721": "Austin",
    "78702": "Austin",
    "78741": "Austin",
    "78745": "Austin",
    "78748": "Austin",
    "78749": "Austin",
    "78750": "Austin",
    "78751": "Austin",
    "78752": "Austin",
    "78753": "Austin",
    "78754": "Austin",
    "78756": "Austin",
    "78757": "Austin",
    "78758": "Austin",
    "78759": "Austin",
    "78726": "Austin",
    "78727": "Austin",
    "78728": "Cedar Park",
    "78729": "Austin",
    "78613": "Cedar Park",
    "78641": "Leander",
    "78717": "Austin",
    "78634": "Hutto",
    "76574": "Taylor",
    "78626": "Georgetown",
    "78628": "Georgetown",
    "78633": "Georgetown",
    # San Marcos / Hays area (Laundry 11)
    "78666": "San Marcos",
    "78640": "Kyle",
    "78610": "Buda",
    "78737": "Austin",
    "78739": "Austin",
    "78736": "Austin",
    "78735": "Austin",
    "78746": "Austin",
    "78747": "Austin",
}


def get_cities_for_zip_codes(zip_codes: list) -> dict:
    """
    Given a list of zip codes, return a mapping of city_slug -> city_info.
    
    Returns:
        Dict mapping city slug to:
        {
            "city": "Austin",
            "state": "TX",
            "slug": "austin",
            "zip_codes": ["78724", "78725", ...]
        }
    
    Cities are deduplicated — if multiple zip codes map to the same city,
    they're grouped under one entry.
    """
    cities = {}  # city_name -> {city, state, slug, zip_codes}
    
    for zip_code in zip_codes:
        zip_str = str(zip_code).strip()
        city_name = KNOWN_ZIP_CITIES.get(zip_str)
        
        if not city_name:
            # Try uszipcode if available
            try:
                from uszipcode import SearchEngine
                search = SearchEngine()
                result = search.by_zipcode(zip_str)
                if result and result.major_city:
                    city_name = result.major_city
            except ImportError:
                pass
            except Exception as e:
                logger.debug(f"uszipcode lookup failed for {zip_str}: {e}")
        
        if not city_name:
            continue
        
        # Normalize city name for grouping
        city_key = city_name.lower().strip()
        
        if city_key not in cities:
            slug = city_key.replace(" ", "-").replace(".", "")
            cities[city_key] = {
                "city": city_name,
                "state": "TX",  # Default; could be derived from zip lookup
                "slug": slug,
                "zip_codes": [],
            }
        
        if zip_str not in cities[city_key]["zip_codes"]:
            cities[city_key]["zip_codes"].append(zip_str)
    
    return cities
