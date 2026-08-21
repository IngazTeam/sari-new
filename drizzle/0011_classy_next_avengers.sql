-- The legacy route never had a working browser destination and stored bearer tokens in plaintext.
-- Invalidate those records instead of attempting to preserve unsafe, externally unusable links.
DELETE FROM `email_verification_tokens`;--> statement-breakpoint
ALTER TABLE `email_verification_tokens` MODIFY COLUMN `email` varchar(320) NOT NULL;--> statement-breakpoint
ALTER TABLE `email_verification_tokens` MODIFY COLUMN `token` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `email_verification_tokens` ADD `request_ip_hash` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` timestamp;--> statement-breakpoint
-- Existing production customers predate verification tracking; grandfather them to avoid a rollout lockout.
-- Every account created by the new application code starts unverified until it consumes a one-time link.
UPDATE `users` SET `email_verified_at` = COALESCE(`createdAt`, NOW()) WHERE `email` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `email_verification_user_time_idx` ON `email_verification_tokens` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_verification_ip_time_idx` ON `email_verification_tokens` (`request_ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_verification_expiry_idx` ON `email_verification_tokens` (`expires_at`);
