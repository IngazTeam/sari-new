-- WooCommerce credentials are encrypted by the application/migration script.
-- This migration adds provider ordering metadata and makes the unsupported
-- automatic-sync flags default to disabled.
SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'woocommerce_products'
      AND COLUMN_NAME = 'provider_updated_at') = 0,
  'ALTER TABLE `woocommerce_products` ADD COLUMN `provider_updated_at` TIMESTAMP(3) NULL AFTER `last_sync_at`',
  'SELECT 1'
);--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint

SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'woocommerce_orders'
      AND COLUMN_NAME = 'provider_updated_at') = 0,
  'ALTER TABLE `woocommerce_orders` ADD COLUMN `provider_updated_at` TIMESTAMP(3) NULL AFTER `last_sync_at`',
  'SELECT 1'
);--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint

ALTER TABLE `woocommerce_settings`
  MODIFY COLUMN `auto_sync_products` TINYINT NOT NULL DEFAULT 0,
  MODIFY COLUMN `auto_sync_orders` TINYINT NOT NULL DEFAULT 0;--> statement-breakpoint

UPDATE `woocommerce_settings`
   SET `auto_sync_products` = 0,
       `auto_sync_orders` = 0,
       `auto_sync_customers` = 0;--> statement-breakpoint

-- Existing snapshots are treated as having been observed at their last
-- successful local synchronization. Future imports use provider timestamps.
UPDATE `woocommerce_products`
   SET `provider_updated_at` = `last_sync_at`
 WHERE `provider_updated_at` IS NULL;--> statement-breakpoint

UPDATE `woocommerce_orders`
   SET `provider_updated_at` = `last_sync_at`
 WHERE `provider_updated_at` IS NULL;--> statement-breakpoint

ALTER TABLE `woocommerce_sync_logs`
  MODIFY COLUMN `status` ENUM('running','success','partial','failed') NOT NULL;
