CREATE TABLE IF NOT EXISTS `order_notification_authorizations` (
 `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 `notification_id` INT NOT NULL,
 `merchant_id` INT NOT NULL,
 `order_id` INT NOT NULL,
 `actor_id` INT NOT NULL,
 `receipt_id` INT NOT NULL,
 `event_key` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `request_key` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `contract_digest` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `reviewed_contract` JSON NOT NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY `uq_order_notice_authorization` (`notification_id`),
 UNIQUE KEY `uq_order_notice_authorization_event` (`merchant_id`,`event_key`),
 UNIQUE KEY `uq_order_notice_authorization_request` (`merchant_id`,`request_key`),
 KEY `idx_order_notice_authorization_scope` (`merchant_id`,`order_id`,`id`),
 CONSTRAINT `fk_order_notice_authorization_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `order_notifications` ADD COLUMN `claim_token` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;
