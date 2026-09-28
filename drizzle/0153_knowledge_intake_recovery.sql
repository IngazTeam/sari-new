ALTER TABLE `knowledge_intake_receipts`
  ADD COLUMN `execution_token` char(36) NULL,
  ADD COLUMN `lease_expires_at` timestamp NULL,
  ADD COLUMN `recovered_at` timestamp NULL;
