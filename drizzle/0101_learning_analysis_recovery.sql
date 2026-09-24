ALTER TABLE ai_learning_analysis_jobs
 ADD COLUMN recovery_token CHAR(36) NULL,
 ADD COLUMN recovery_lease_until DATETIME(3) NULL,
 ADD COLUMN recovery_next_at DATETIME(3) NULL,
 ADD COLUMN recovery_attempts INT UNSIGNED NOT NULL DEFAULT 0,
 ADD COLUMN recovery_last_error VARCHAR(40) NULL,
 ADD COLUMN recovered_at DATETIME(3) NULL,
 ADD KEY idx_learning_recovery_due (state,recovery_next_at,merchant_id);
--> statement-breakpoint
-- Only already-saved responses are eligible. Never re-dispatch an uncertain request.
UPDATE ai_learning_analysis_jobs SET recovery_next_at=UTC_TIMESTAMP(3) WHERE state='responded';
