1-- Migration: Add per-bag pricing support
-- Adds bag_price column to laundry_shops and pricing_type to orders

-- Add bag_price to laundry_shops (configurable per shop, default $30)
ALTER TABLE shop.laundry_shops
ADD COLUMN IF NOT EXISTS bag_price NUMERIC(10,2) DEFAULT 30.00;

-- Add pricing_type to orders to distinguish per-bag vs per-pound orders
ALTER TABLE orders.orders
ADD COLUMN IF NOT EXISTS pricing_type VARCHAR(20) DEFAULT 'per_pound';

-- Update existing orders to be per_pound (they all are)
UPDATE orders.orders SET pricing_type = 'per_pound' WHERE pricing_type IS NULL;
