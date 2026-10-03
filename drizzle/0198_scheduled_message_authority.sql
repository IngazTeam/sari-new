CREATE TABLE IF NOT EXISTS `scheduled_message_authorizations` (
 `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `grant_key` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `scheduled_message_id` INT NOT NULL,
 `merchant_id` INT NOT NULL,
 `actor_id` INT NOT NULL,
 `active` TINYINT NULL DEFAULT 1,
 `review_revision` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `contract_digest` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `reviewed_contract` JSON NOT NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `revoked_at` DATETIME(3) NULL,
 UNIQUE KEY `uq_scheduled_grant_key` (`grant_key`),
 UNIQUE KEY `uq_scheduled_active_grant` (`scheduled_message_id`,`active`),
 KEY `idx_scheduled_grant_scope` (`merchant_id`,`scheduled_message_id`,`id`),
 CONSTRAINT `fk_scheduled_grant_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
 CONSTRAINT `chk_scheduled_grant_active` CHECK ((`active`=1 AND `active` IS NOT NULL AND `revoked_at` IS NULL) OR (`active` IS NULL AND `revoked_at` IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `scheduled_message_occurrences` (
 `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `merchant_id` INT NOT NULL,
 `scheduled_message_id` INT NOT NULL,
 `authorization_id` INT NOT NULL,
 `due_at` DATETIME(3) NOT NULL,
 `expires_at` DATETIME(3) NOT NULL,
 `campaign_id` INT NULL,
 `campaign_digest` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY `uq_scheduled_occurrence` (`scheduled_message_id`,`due_at`),
 UNIQUE KEY `uq_scheduled_occurrence_campaign` (`campaign_id`),
 KEY `idx_scheduled_occurrence_scope` (`merchant_id`,`scheduled_message_id`,`id`),
 CONSTRAINT `fk_scheduled_occurrence_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
 CONSTRAINT `chk_scheduled_occurrence_campaign` CHECK ((`campaign_id` IS NULL AND `campaign_digest` IS NULL) OR (`campaign_id` IS NOT NULL AND `campaign_digest` IS NOT NULL)),
 CONSTRAINT `chk_scheduled_occurrence_window` CHECK (`expires_at`>`due_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `scheduled_message_action_receipts` (
 `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `merchant_id` INT NOT NULL,
 `actor_id` INT NOT NULL,
 `request_key` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `request_digest` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 `state` ENUM('saved','cancelled') NOT NULL,
 `result_json` JSON NOT NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY `uq_scheduled_action_request` (`merchant_id`,`request_key`),
 CONSTRAINT `fk_scheduled_action_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
 CONSTRAINT `chk_scheduled_action_digest` CHECK (`state`='cancelled' OR `request_digest` IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `campaigns` ADD COLUMN `scheduled_message_occurrence_id` INT NULL,
 ADD UNIQUE KEY `uq_campaign_scheduled_occurrence` (`scheduled_message_occurrence_id`);
