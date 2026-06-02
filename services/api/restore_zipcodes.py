"""
Run this script to restore zip codes for Laundry 1.
Usage: python restore_zipcodes.py
"""
import psycopg
import json

conn = psycopg.connect(
    host="smart-laundry.cpy626ke6rm6.us-east-1.rds.amazonaws.com",
    port=5432,
    dbname="smart_laundry",
    user="smart_laundry",
    password="tNxSN6rX6eB0LTHlSDff"
)
cur = conn.cursor()

# Combined: all zip codes from laundry test + additional Austin/Round Rock area
zip_codes = sorted(set([
    # From laundry test (your existing list)
    "78665", "78634", "78727", "78641", "78613", "78660", "76574",
    "78626", "78642", "74075", "29708", "78633", "78627", "78628", "76578",
    # Additional Round Rock / Austin area
    "78664", "78681", "78717", "78728", "78729",
    "78750", "78753", "78758", "78759", "78615",
]))

cur.execute(
    "UPDATE shop.laundry_shops SET serviceable_zip_codes = %s::jsonb WHERE laundry_id = '1'",
    (json.dumps(zip_codes),)
)
conn.commit()

# Verify
cur.execute("SELECT serviceable_zip_codes FROM shop.laundry_shops WHERE laundry_id = '1'")
result = cur.fetchone()[0]
print(f"Done. Restored {len(result)} zip codes for Laundry 1:")
print(result)

conn.close()
