-- Inspect with `pnpm preflight:salla-webhook-identity` before migrating to find
-- duplicates. A full passing preflight is required after migration, token
-- encryption and store-identity backfill, before the new code is enabled.
SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'salla_connections' AND COLUMN_NAME = 'salla_store_id') = 0,
  'ALTER TABLE `salla_connections` ADD COLUMN `salla_store_id` VARCHAR(32) NULL AFTER `merchantId`',
  'SELECT 1'
);--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint

SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'salla_connections'
      AND INDEX_NAME = 'salla_connections_merchantId_unique' AND NON_UNIQUE = 1) > 0,
  IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'salla_connections'
        AND INDEX_NAME = 'salla_connections_merchantId_unique_tmp') = 0,
    'ALTER TABLE `salla_connections` ADD UNIQUE INDEX `salla_connections_merchantId_unique_tmp` (`merchantId`)',
    'SELECT 1'
  ),
  'SELECT 1'
);--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint

SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'salla_connections'
      AND INDEX_NAME = 'salla_connections_merchantId_unique' AND NON_UNIQUE = 1) > 0,
  'ALTER TABLE `salla_connections` DROP INDEX `salla_connections_merchantId_unique`',
  'SELECT 1'
);--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint

SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'salla_connections'
      AND INDEX_NAME = 'salla_connections_merchantId_unique' AND NON_UNIQUE = 0) = 0,
  'ALTER TABLE `salla_connections` ADD UNIQUE INDEX `salla_connections_merchantId_unique` (`merchantId`)',
  'SELECT 1'
);--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint

SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'salla_connections'
      AND INDEX_NAME = 'salla_connections_merchantId_unique_tmp') > 0,
  'ALTER TABLE `salla_connections` DROP INDEX `salla_connections_merchantId_unique_tmp`',
  'SELECT 1'
);--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint

SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'salla_connections'
      AND INDEX_NAME = 'salla_connections_store_id_unique') = 0,
  'ALTER TABLE `salla_connections` ADD UNIQUE INDEX `salla_connections_store_id_unique` (`salla_store_id`)',
  'SELECT 1'
);--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `salla_webhook_receipts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `merchant_id` INT NOT NULL,
  `salla_store_id` VARCHAR(32) NOT NULL,
  `event_key` VARCHAR(64) NOT NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `resource_id` VARCHAR(32) NOT NULL,
  `status` ENUM('pending','processing','completed','failed','manual_review') NOT NULL DEFAULT 'pending',
  `attempt_count` INT NOT NULL DEFAULT 0,
  `effect_applied` TINYINT NOT NULL DEFAULT 0,
  `notification_required` TINYINT NOT NULL DEFAULT 0,
  `notification_status` VARCHAR(16) NULL,
  `processing_token` VARCHAR(64) NULL,
  `available_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `claimed_at` TIMESTAMP(3) NULL,
  `processed_at` TIMESTAMP(3) NULL,
  `last_error` VARCHAR(100) NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `salla_webhook_receipts_event_unique` (`event_key`),
  KEY `salla_webhook_receipts_dispatch_idx` (`status`, `available_at`, `id`),
  KEY `salla_webhook_receipts_merchant_idx` (`merchant_id`, `created_at`),
  KEY `salla_webhook_receipts_store_idx` (`salla_store_id`),
  CONSTRAINT `salla_webhook_receipts_merchant_fk`
    FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);
