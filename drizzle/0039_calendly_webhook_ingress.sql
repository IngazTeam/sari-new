-- Calendly webhook subscriptions use an opaque callback locator and a unique
-- signing key. Inspect legacy connections before applying; reconnecting them
-- is required because merchant-id callback URLs are intentionally retired.
SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_integrations'
      AND COLUMN_NAME = 'webhook_signing_secret') = 0,
  'ALTER TABLE `platform_integrations` ADD COLUMN `webhook_signing_secret` TEXT NULL AFTER `webhook_auth_hash`',
  'SELECT 1'
);--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint

SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_integrations'
      AND COLUMN_NAME = 'webhook_subscription_uri') = 0,
  'ALTER TABLE `platform_integrations` ADD COLUMN `webhook_subscription_uri` VARCHAR(500) NULL AFTER `webhook_signing_secret`',
  'SELECT 1'
);--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `calendly_appointments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `merchant_id` INT NOT NULL,
  `integration_id` INT NOT NULL,
  `event_uri` VARCHAR(500) NOT NULL,
  `invitee_uri` VARCHAR(500) NOT NULL,
  `event_name` VARCHAR(255) NOT NULL,
  `customer_name` VARCHAR(255) NOT NULL,
  `customer_email` VARCHAR(320) NULL,
  `customer_phone` VARCHAR(50) NULL,
  `start_at` TIMESTAMP(3) NOT NULL,
  `end_at` TIMESTAMP(3) NOT NULL,
  `status` ENUM('active','cancelled') NOT NULL DEFAULT 'active',
  `location` VARCHAR(500) NULL,
  `provider_updated_at` TIMESTAMP(3) NOT NULL,
  `cancelled_at` TIMESTAMP(3) NULL,
  `notification_sent_at` TIMESTAMP(3) NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `calendly_appointments_invitee_unique` (`merchant_id`, `invitee_uri`),
  KEY `calendly_appointments_event_idx` (`merchant_id`, `event_uri`),
  KEY `calendly_appointments_upcoming_idx` (`merchant_id`, `status`, `start_at`),
  CONSTRAINT `calendly_appointments_merchant_fk`
    FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `calendly_appointments_integration_fk`
    FOREIGN KEY (`integration_id`) REFERENCES `platform_integrations` (`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `calendly_webhook_receipts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `merchant_id` INT NOT NULL,
  `integration_id` INT NOT NULL,
  `event_key` VARCHAR(64) NOT NULL,
  `event_type` ENUM('invitee.created','invitee.canceled') NOT NULL,
  `event_uri` VARCHAR(500) NOT NULL,
  `invitee_uri` VARCHAR(500) NOT NULL,
  `signature_timestamp` INT NOT NULL,
  `status` ENUM('pending','processing','completed','failed','manual_review') NOT NULL DEFAULT 'pending',
  `attempt_count` INT NOT NULL DEFAULT 0,
  `effect_applied` TINYINT NOT NULL DEFAULT 0,
  `notification_required` TINYINT NOT NULL DEFAULT 0,
  `processing_token` VARCHAR(64) NULL,
  `available_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `claimed_at` TIMESTAMP(3) NULL,
  `processed_at` TIMESTAMP(3) NULL,
  `last_error` VARCHAR(100) NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `calendly_webhook_receipts_event_unique` (`merchant_id`, `event_key`),
  KEY `calendly_webhook_receipts_dispatch_idx` (`status`, `available_at`, `id`),
  KEY `calendly_webhook_receipts_merchant_idx` (`merchant_id`, `created_at`),
  CONSTRAINT `calendly_webhook_receipts_merchant_fk`
    FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `calendly_webhook_receipts_integration_fk`
    FOREIGN KEY (`integration_id`) REFERENCES `platform_integrations` (`id`) ON DELETE CASCADE
);
