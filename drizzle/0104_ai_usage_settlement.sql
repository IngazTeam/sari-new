-- Existing reservations retain their amounts and state. Never invent historical usage.
ALTER TABLE ai_usage_reservations
 ADD COLUMN usage_prompt_tokens BIGINT UNSIGNED NULL,
 ADD COLUMN usage_completion_tokens BIGINT UNSIGNED NULL,
 ADD COLUMN usage_received_at DATETIME(3) NULL,
 ADD COLUMN settlement_token CHAR(36) NULL,
 ADD COLUMN settlement_lease_until DATETIME(3) NULL,
 ADD COLUMN settlement_next_at DATETIME(3) NULL,
 ADD COLUMN settlement_attempts INT UNSIGNED NOT NULL DEFAULT 0,
 ADD COLUMN settlement_last_error VARCHAR(40) NULL,
 ADD KEY idx_ai_settlement_due (state,settlement_next_at,reservation_key),
 ADD CONSTRAINT chk_ai_usage_receipt CHECK (
   (usage_prompt_tokens IS NULL AND usage_completion_tokens IS NULL AND usage_received_at IS NULL)
   OR (usage_prompt_tokens IS NOT NULL AND usage_completion_tokens IS NOT NULL AND usage_received_at IS NOT NULL
     AND usage_prompt_tokens<=9007199254740991 AND usage_completion_tokens<=9007199254740991)
 );
