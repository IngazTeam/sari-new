ALTER TABLE appointments
  ADD COLUMN calendar_sync_state ENUM('none','creating','create_unknown','synced','cancelling','cancel_unknown','cancelled','legacy') NOT NULL DEFAULT 'none',
  ADD COLUMN calendar_integration_id INT NULL,
  ADD COLUMN calendar_target_id VARCHAR(255) NULL,
  ADD COLUMN calendar_identity_hash CHAR(64) NULL,
  ADD INDEX idx_appointment_capacity (merchant_id, appointment_date, status);
--> statement-breakpoint
-- Existing events have no verified account/calendar binding. Do not guess it.
UPDATE appointments SET calendar_sync_state='legacy' WHERE google_event_id IS NOT NULL;
