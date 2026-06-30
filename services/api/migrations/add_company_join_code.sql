-- Migration: Add join_code column to shop.companies
-- Stores a unique alphanumeric join code per company for the onboarding join flow

ALTER TABLE shop.companies
ADD COLUMN IF NOT EXISTS join_code VARCHAR(20) UNIQUE;
