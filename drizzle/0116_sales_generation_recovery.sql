ALTER TABLE `ai_sales_experiment_generations`
  ADD COLUMN `provider_receipt` json NULL,
  ADD COLUMN `provider_receipt_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN `recovery_token` char(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN `recovery_lease_until` datetime(3) NULL,
  ADD COLUMN `recovery_next_at` datetime(3) NULL,
  ADD COLUMN `recovery_attempts` int unsigned NOT NULL DEFAULT 0,
  ADD COLUMN `recovery_last_error` varchar(64) NULL,
  ADD INDEX `idx_sales_generation_recovery` (`state`, `recovery_next_at`);
