-- Automatic WooCommerce synchronization uses six independently registered
-- provider webhooks. The opaque endpoint and HMAC secret are rotated together.
SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'woocommerce_settings'
      AND COLUMN_NAME = 'webhook_endpoint_id') = 0,
  'ALTER TABLE `woocommerce_settings` ADD COLUMN `webhook_endpoint_id` VARCHAR(48) NULL AFTER `consumer_secret`',
  'SELECT 1'
);--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint

SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'woocommerce_settings'
      AND COLUMN_NAME = 'webhook_signing_secret') = 0,
  'ALTER TABLE `woocommerce_settings` ADD COLUMN `webhook_signing_secret` TEXT NULL AFTER `webhook_endpoint_id`',
  'SELECT 1'
);--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint

SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'woocommerce_settings'
      AND INDEX_NAME = 'woocommerce_settings_webhook_endpoint_unique') = 0,
  'ALTER TABLE `woocommerce_settings` ADD UNIQUE KEY `woocommerce_settings_webhook_endpoint_unique` (`webhook_endpoint_id`)',
  'SELECT 1'
);--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `woocommerce_webhook_registrations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `merchant_id` INT NOT NULL,
  `topic` ENUM('product.created','product.updated','product.deleted','order.created','order.updated','order.deleted') NOT NULL,
  `webhook_id` VARCHAR(32) NOT NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `woocommerce_webhook_registrations_topic_unique` (`merchant_id`, `topic`),
  UNIQUE KEY `woocommerce_webhook_registrations_remote_unique` (`merchant_id`, `webhook_id`),
  CONSTRAINT `woocommerce_webhook_registrations_merchant_fk`
    FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `woocommerce_webhook_receipts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `merchant_id` INT NOT NULL,
  `delivery_id` VARCHAR(32) NOT NULL,
  `webhook_id` VARCHAR(32) NOT NULL,
  `topic` ENUM('product.created','product.updated','product.deleted','order.created','order.updated','order.deleted') NOT NULL,
  `resource_id` INT NOT NULL,
  `status` ENUM('pending','processing','completed','failed','manual_review','suppressed') NOT NULL DEFAULT 'pending',
  `attempt_count` INT NOT NULL DEFAULT 0,
  `processing_token` VARCHAR(64) NULL,
  `available_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `claimed_at` TIMESTAMP(3) NULL,
  `processed_at` TIMESTAMP(3) NULL,
  `last_error` VARCHAR(100) NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `woocommerce_webhook_receipts_delivery_unique` (`merchant_id`, `delivery_id`),
  KEY `woocommerce_webhook_receipts_dispatch_idx` (`status`, `available_at`, `id`),
  KEY `woocommerce_webhook_receipts_merchant_idx` (`merchant_id`, `created_at`),
  CONSTRAINT `woocommerce_webhook_receipts_merchant_fk`
    FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);--> statement-breakpoint
