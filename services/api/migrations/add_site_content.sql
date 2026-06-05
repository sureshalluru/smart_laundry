-- Migration: Add site_content JSONB column for multi-tenant landing pages
ALTER TABLE shop.laundry_shops ADD COLUMN IF NOT EXISTS site_content JSONB DEFAULT '{}';
