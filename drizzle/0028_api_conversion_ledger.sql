ALTER TABLE `sari_conversions` ADD `idempotency_key` varchar(100);--> statement-breakpoint
ALTER TABLE `sari_conversions` ADD CONSTRAINT `uq_sari_conversion_source_key` UNIQUE(`merchant_id`,`source`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_sari_conversion_summary` ON `sari_conversions` (`merchant_id`,`status`,`action_type`,`created_at`);
