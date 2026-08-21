-- Fail before any persistent DDL if legacy identities would violate the new unique constraints.
-- Temporary PRIMARY KEY inserts deliberately reject duplicates without mutating user data.
CREATE TEMPORARY TABLE `_sari_users_openid_preflight` (`value` varchar(64) PRIMARY KEY);--> statement-breakpoint
INSERT INTO `_sari_users_openid_preflight` (`value`)
SELECT `openId` FROM `users`;--> statement-breakpoint
DROP TEMPORARY TABLE `_sari_users_openid_preflight`;--> statement-breakpoint
CREATE TEMPORARY TABLE `_sari_users_email_preflight` (`value` varchar(320) PRIMARY KEY);--> statement-breakpoint
INSERT INTO `_sari_users_email_preflight` (`value`)
SELECT LOWER(TRIM(`email`)) FROM `users` WHERE `email` IS NOT NULL AND TRIM(`email`) <> '';--> statement-breakpoint
DROP TEMPORARY TABLE `_sari_users_email_preflight`;--> statement-breakpoint
UPDATE `users` SET `email` = NULL WHERE `email` IS NOT NULL AND TRIM(`email`) = '';--> statement-breakpoint
UPDATE `users` SET `email` = LOWER(TRIM(`email`)) WHERE `email` IS NOT NULL;--> statement-breakpoint

CREATE TABLE `consent_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`subject_reference_hash` varchar(64) NOT NULL,
	`consent_type` enum('terms','privacy','marketing') NOT NULL,
	`granted` tinyint NOT NULL,
	`document_version` varchar(32) NOT NULL,
	`document_url` varchar(255) NOT NULL,
	`source` varchar(50) NOT NULL DEFAULT 'signup',
	`ip_hash` varchar(64),
	`user_agent_hash` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`withdrawn_at` timestamp,
	CONSTRAINT `consent_receipts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `data_subject_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`subject_reference_hash` varchar(64) NOT NULL,
	`request_type` enum('access','export','correction','deletion','withdraw_consent','objection') NOT NULL,
	`status` enum('pending','processing','completed','rejected','requires_review','failed') NOT NULL DEFAULT 'pending',
	`requested_at` timestamp NOT NULL DEFAULT (now()),
	`due_at` timestamp NOT NULL,
	`processing_scheduled_at` timestamp,
	`completed_at` timestamp,
	`rejection_reason` text,
	`request_metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `data_subject_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `legal_retention_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subject_reference_hash` varchar(64) NOT NULL,
	`record_type` enum('invoice','payment','legacy_payment') NOT NULL,
	`source_record_id` int NOT NULL,
	`record_date` timestamp NOT NULL,
	`amount` decimal(12,2),
	`currency` varchar(10),
	`status` varchar(32),
	`encrypted_payload` text NOT NULL,
	`retain_until` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `legal_retention_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `legal_retention_source_unique` UNIQUE(`record_type`,`source_record_id`)
);
--> statement-breakpoint
DROP INDEX `users_openId_unique` ON `users`;--> statement-breakpoint
ALTER TABLE `users` ADD `account_status` enum('active','deletion_pending','anonymized') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `deletion_requested_at` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `deleted_at` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_open_id_unique` UNIQUE(`openId`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `consent_receipts` ADD CONSTRAINT `consent_receipts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `data_subject_requests` ADD CONSTRAINT `data_subject_requests_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `consent_receipts_user_type_idx` ON `consent_receipts` (`user_id`,`consent_type`);--> statement-breakpoint
CREATE INDEX `consent_receipts_subject_idx` ON `consent_receipts` (`subject_reference_hash`);--> statement-breakpoint
CREATE INDEX `data_subject_requests_user_idx` ON `data_subject_requests` (`user_id`);--> statement-breakpoint
CREATE INDEX `data_subject_requests_status_due_idx` ON `data_subject_requests` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `data_subject_requests_processing_idx` ON `data_subject_requests` (`status`,`processing_scheduled_at`);--> statement-breakpoint
CREATE INDEX `data_subject_requests_subject_idx` ON `data_subject_requests` (`subject_reference_hash`);--> statement-breakpoint
CREATE INDEX `legal_retention_subject_idx` ON `legal_retention_records` (`subject_reference_hash`);--> statement-breakpoint
CREATE INDEX `legal_retention_until_idx` ON `legal_retention_records` (`retain_until`);
