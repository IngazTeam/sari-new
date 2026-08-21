-- Fail before persistent DDL when legacy ownership is ambiguous. The operator must
-- resolve duplicate domains/instance IDs explicitly; this migration never chooses a winner.
CREATE TEMPORARY TABLE `_sari_byaan_domain_preflight` (`value` varchar(255) PRIMARY KEY);--> statement-breakpoint
INSERT INTO `_sari_byaan_domain_preflight` (`value`)
SELECT LOWER(TRIM(`tenant_domain`)) FROM `byaan_connections`;--> statement-breakpoint
DROP TEMPORARY TABLE `_sari_byaan_domain_preflight`;--> statement-breakpoint
CREATE TEMPORARY TABLE `_sari_whatsapp_instance_preflight` (`value` varchar(255) PRIMARY KEY);--> statement-breakpoint
INSERT INTO `_sari_whatsapp_instance_preflight` (`value`)
SELECT `instance_id` FROM `whatsapp_instances`;--> statement-breakpoint
DROP TEMPORARY TABLE `_sari_whatsapp_instance_preflight`;--> statement-breakpoint
UPDATE `byaan_connections` SET `tenant_domain` = LOWER(TRIM(`tenant_domain`));--> statement-breakpoint

CREATE TABLE `byaan_outbox` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`event_key` varchar(36) NOT NULL,
	`event_type` enum('subscription.activated','subscription.deactivated') NOT NULL,
	`tenant_domain` varchar(255) NOT NULL,
	`payload` text NOT NULL,
	`signing_secret` text NOT NULL,
	`status` enum('pending','processing','delivered','failed') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`available_at` timestamp NOT NULL DEFAULT (now()),
	`last_attempt_at` timestamp,
	`delivered_at` timestamp,
	`last_error` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `byaan_outbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_byaan_outbox_event` UNIQUE(`event_key`)
);
--> statement-breakpoint
CREATE TABLE `byaan_webhook_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`delivery_id` varchar(36) NOT NULL,
	`request_path` varchar(255) NOT NULL,
	`payload_hash` varchar(64) NOT NULL,
	`received_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `byaan_webhook_receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_byaan_delivery_id` UNIQUE(`delivery_id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_message_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchant_id` int NOT NULL,
	`message_id` int,
	`instance_id` int,
	`provider` enum('green_api','meta_cloud','mock') NOT NULL,
	`provider_message_id` varchar(255),
	`idempotency_key` varchar(100) NOT NULL,
	`direction` enum('incoming','outgoing') NOT NULL,
	`status` enum('received','queued','sent','delivered','read','failed') NOT NULL,
	`error_code` varchar(100),
	`error_details` text,
	`status_updated_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_message_deliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_whatsapp_delivery_idempotency` UNIQUE(`idempotency_key`),
	CONSTRAINT `uq_whatsapp_provider_message` UNIQUE(`provider`,`provider_message_id`)
);
--> statement-breakpoint
DROP INDEX `idx_byaan_domain` ON `byaan_connections`;--> statement-breakpoint
ALTER TABLE `byaan_connections` MODIFY COLUMN `webhook_secret` text;--> statement-breakpoint
ALTER TABLE `byaan_connections` MODIFY COLUMN `sync_status` enum('pending_verification','active','syncing','error','paused') DEFAULT 'pending_verification';--> statement-breakpoint
ALTER TABLE `byaan_connections` MODIFY COLUMN `is_active` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `sari_platform_keys` MODIFY COLUMN `key_value` text NOT NULL;--> statement-breakpoint
ALTER TABLE `byaan_connections` ADD `verification_token_hash` varchar(64);--> statement-breakpoint
ALTER TABLE `byaan_connections` ADD `verification_expires_at` timestamp;--> statement-breakpoint
ALTER TABLE `byaan_connections` ADD `verified_at` timestamp;--> statement-breakpoint
ALTER TABLE `whatsapp_instances` ADD `provider` enum('green_api','meta_cloud','mock') DEFAULT 'green_api' NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsapp_instances` ADD `provider_account_id` varchar(255);--> statement-breakpoint
ALTER TABLE `whatsapp_instances` ADD `phone_number_id` varchar(255);--> statement-breakpoint
ALTER TABLE `whatsapp_instances` ADD `webhook_token_hash` varchar(64);--> statement-breakpoint
ALTER TABLE `byaan_connections` ADD CONSTRAINT `uq_byaan_domain` UNIQUE(`tenant_domain`);--> statement-breakpoint
ALTER TABLE `whatsapp_instances` ADD CONSTRAINT `uq_whatsapp_instance_id` UNIQUE(`instance_id`);--> statement-breakpoint
ALTER TABLE `byaan_outbox` ADD CONSTRAINT `byaan_outbox_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `byaan_webhook_receipts` ADD CONSTRAINT `byaan_webhook_receipts_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_message_deliveries` ADD CONSTRAINT `whatsapp_message_deliveries_merchant_id_merchants_id_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_message_deliveries` ADD CONSTRAINT `whatsapp_message_deliveries_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_message_deliveries` ADD CONSTRAINT `whatsapp_message_deliveries_instance_id_whatsapp_instances_id_fk` FOREIGN KEY (`instance_id`) REFERENCES `whatsapp_instances`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_byaan_outbox_dispatch` ON `byaan_outbox` (`status`,`available_at`);--> statement-breakpoint
CREATE INDEX `idx_byaan_receipt_merchant_date` ON `byaan_webhook_receipts` (`merchant_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `idx_whatsapp_delivery_merchant_status` ON `whatsapp_message_deliveries` (`merchant_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_whatsapp_provider_phone_id` ON `whatsapp_instances` (`provider`,`phone_number_id`);
