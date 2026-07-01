-- Migration: Add mobile order workflow columns
-- Adds processing_image_url and fold_image_url to orders.orders
-- Note: weight_image_url and last_updated_by already exist

-- Add processing_image_url for storing the processing phase photo
ALTER TABLE orders.orders
ADD COLUMN IF NOT EXISTS processing_image_url TEXT DEFAULT NULL;

-- Add fold_image_url for storing the fold-complete phase photo
ALTER TABLE orders.orders
ADD COLUMN IF NOT EXISTS fold_image_url TEXT DEFAULT NULL;
