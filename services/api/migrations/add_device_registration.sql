-- Migration: Device registration + login security for admin

-- Device registration codes (one per laundry, set by owner)
ALTER TABLE shop.laundry_shops
ADD COLUMN IF NOT EXISTS device_registration_code VARCHAR(50) DEFAULT 'SETUP2024';

-- Registered devices
CREATE TABLE IF NOT EXISTS shop.registered_devices (
    device_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    laundry_id VARCHAR(50) NOT NULL,
    device_fingerprint VARCHAR(200) NOT NULL,
    device_name VARCHAR(200),
    registered_by VARCHAR(100),
    registered_at TIMESTAMP DEFAULT NOW(),
    last_login_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(laundry_id, device_fingerprint)
);

-- Login attempts (for rate limiting)
CREATE TABLE IF NOT EXISTS shop.login_attempts (
    attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    laundry_id VARCHAR(50) NOT NULL,
    device_fingerprint VARCHAR(200),
    ip_address VARCHAR(50),
    emp_id VARCHAR(100),
    success BOOLEAN DEFAULT FALSE,
    attempted_at TIMESTAMP DEFAULT NOW()
);

-- Index for rate limiting lookups
CREATE INDEX IF NOT EXISTS idx_login_attempts_device ON shop.login_attempts(device_fingerprint, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_registered_devices_laundry ON shop.registered_devices(laundry_id, device_fingerprint);
