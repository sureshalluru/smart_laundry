"""Add Uber/delivery service columns to orders table."""
import os
import psycopg2

conn = psycopg2.connect(
    host=os.getenv("DB_HOST", "localhost"),
    port=os.getenv("DB_PORT", "5432"),
    dbname=os.getenv("DB_NAME", "smart_laundry"),
    user=os.getenv("DB_USER", "postgres"),
    password=os.getenv("DB_PASSWORD", ""),
)
conn.autocommit = False
cur = conn.cursor()

columns = [
    "ALTER TABLE orders.orders ADD COLUMN IF NOT EXISTS pickup_service VARCHAR(50) DEFAULT 'LaundryDriver'",
    "ALTER TABLE orders.orders ADD COLUMN IF NOT EXISTS dropoff_service VARCHAR(50) DEFAULT 'LaundryDriver'",
    "ALTER TABLE orders.orders ADD COLUMN IF NOT EXISTS uber_pickup_fee NUMERIC(10,2) DEFAULT NULL",
    "ALTER TABLE orders.orders ADD COLUMN IF NOT EXISTS uber_dropoff_fee NUMERIC(10,2) DEFAULT NULL",
    "ALTER TABLE orders.orders ADD COLUMN IF NOT EXISTS pickup_tracking_url TEXT DEFAULT NULL",
    "ALTER TABLE orders.orders ADD COLUMN IF NOT EXISTS dropoff_tracking_url TEXT DEFAULT NULL",
    "ALTER TABLE orders.orders ADD COLUMN IF NOT EXISTS pickup_status VARCHAR(50) DEFAULT NULL",
    "ALTER TABLE orders.orders ADD COLUMN IF NOT EXISTS dropoff_status VARCHAR(50) DEFAULT NULL",
    "ALTER TABLE orders.orders ADD COLUMN IF NOT EXISTS uber_info JSONB DEFAULT NULL",
]

for sql in columns:
    print(f"  -> {sql.split('ADD COLUMN IF NOT EXISTS ')[1].split(' ')[0]}...")
    cur.execute(sql)

conn.commit()
print("\n✅ All Uber columns added successfully!")
conn.close()
