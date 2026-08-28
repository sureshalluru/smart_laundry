"""
Dump production database schema to a file.
Run: python dump_schema.py
Reads DATABASE_URL from .env or environment.
Outputs: schema_dump.txt (paste this back to me)
"""
import os
import sys

# Load .env if present
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip())

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: Set DATABASE_URL in .env or environment")
    sys.exit(1)

import psycopg

conn = psycopg.connect(DATABASE_URL)
cur = conn.cursor()

output = []

# 1. All schemas
cur.execute("SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('shop','orders','routes','tracking','chat','public') ORDER BY schema_name")
output.append("=== SCHEMAS ===")
for row in cur.fetchall():
    output.append(row[0])

# 2. All tables with columns
output.append("\n=== TABLES & COLUMNS ===")
cur.execute("""
    SELECT table_schema, table_name, column_name, data_type, 
           column_default, is_nullable, character_maximum_length,
           udt_name
    FROM information_schema.columns 
    WHERE table_schema IN ('shop', 'orders', 'routes', 'tracking', 'chat', 'public')
    ORDER BY table_schema, table_name, ordinal_position
""")
current_table = None
for row in cur.fetchall():
    schema, table, col, dtype, default, nullable, max_len, udt = row
    full_table = f"{schema}.{table}"
    if full_table != current_table:
        output.append(f"\n--- {full_table} ---")
        current_table = full_table
    type_str = udt if udt else dtype
    if max_len:
        type_str += f"({max_len})"
    parts = [f"  {col}: {type_str}"]
    if default:
        parts.append(f"DEFAULT {default}")
    if nullable == "NO":
        parts.append("NOT NULL")
    output.append(" ".join(parts))

# 3. All enum types
output.append("\n\n=== ENUM TYPES ===")
cur.execute("""
    SELECT n.nspname, t.typname, e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname IN ('shop', 'orders', 'routes', 'tracking', 'chat', 'public')
    ORDER BY n.nspname, t.typname, e.enumsortorder
""")
current_enum = None
for row in cur.fetchall():
    schema, name, label = row
    full_name = f"{schema}.{name}"
    if full_name != current_enum:
        output.append(f"\n{full_name}:")
        current_enum = full_name
    output.append(f"  - {label}")

# 4. Primary keys and unique constraints
output.append("\n\n=== PRIMARY KEYS ===")
cur.execute("""
    SELECT tc.table_schema, tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema IN ('shop', 'orders', 'routes', 'tracking', 'chat', 'public')
    ORDER BY tc.table_schema, tc.table_name, kcu.ordinal_position
""")
for row in cur.fetchall():
    output.append(f"  {row[0]}.{row[1]} PK: {row[2]}")

conn.close()

# Write to file
out_path = os.path.join(os.path.dirname(__file__), "schema_dump.txt")
with open(out_path, "w", encoding="utf-8") as f:
    f.write("\n".join(output))

print(f"Done! Schema dumped to: {out_path}")
print(f"({len(output)} lines)")
