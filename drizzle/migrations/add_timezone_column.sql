-- Migration: Add timezone column to merchants table
-- Run on production BEFORE deploying the new code
-- Default: 'Asia/Riyadh' — all existing merchants keep Saudi timezone

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Riyadh';

-- Verify
SELECT id, businessName, timezone FROM merchants LIMIT 5;
