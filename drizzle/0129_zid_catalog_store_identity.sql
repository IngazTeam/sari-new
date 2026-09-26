-- Preserve unknown historical identity. No store inference, product deletion or activation.
--> statement-breakpoint
SET @zid_catalog_ddl = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='zid_products' AND COLUMN_NAME='zid_store_id'), 'ALTER TABLE `zid_products` ADD COLUMN `zid_store_id` varchar(20) NOT NULL DEFAULT ''''', 'DO 0');
--> statement-breakpoint
PREPARE zid_catalog_stmt FROM @zid_catalog_ddl;
--> statement-breakpoint
EXECUTE zid_catalog_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE zid_catalog_stmt;
--> statement-breakpoint
SET @zid_catalog_ddl = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='zid_products' AND COLUMN_NAME='track_inventory'), 'ALTER TABLE `zid_products` ADD COLUMN `track_inventory` tinyint NOT NULL DEFAULT 1', 'DO 0');
--> statement-breakpoint
PREPARE zid_catalog_stmt FROM @zid_catalog_ddl;
--> statement-breakpoint
EXECUTE zid_catalog_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE zid_catalog_stmt;
--> statement-breakpoint
SET @zid_catalog_ddl = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='zid_products' AND COLUMN_NAME='has_variants'), 'ALTER TABLE `zid_products` ADD COLUMN `has_variants` tinyint NOT NULL DEFAULT 0', 'DO 0');
--> statement-breakpoint
PREPARE zid_catalog_stmt FROM @zid_catalog_ddl;
--> statement-breakpoint
EXECUTE zid_catalog_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE zid_catalog_stmt;
--> statement-breakpoint
ALTER TABLE `zid_products` MODIFY COLUMN `last_synced_at` timestamp(3) NULL DEFAULT NULL, MODIFY COLUMN `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
--> statement-breakpoint
SET @zid_catalog_ddl = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='zid_products' AND INDEX_NAME='zid_products_merchant_store_product_unique'), 'ALTER TABLE `zid_products` ADD UNIQUE INDEX `zid_products_merchant_store_product_unique` (`merchant_id`,`zid_store_id`,`zid_product_id`)', 'DO 0');
--> statement-breakpoint
PREPARE zid_catalog_stmt FROM @zid_catalog_ddl;
--> statement-breakpoint
EXECUTE zid_catalog_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE zid_catalog_stmt;
--> statement-breakpoint
SET @zid_catalog_ddl = IF(EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='zid_products' AND INDEX_NAME='zid_products_merchant_product_unique'), 'ALTER TABLE `zid_products` DROP INDEX `zid_products_merchant_product_unique`', 'DO 0');
--> statement-breakpoint
PREPARE zid_catalog_stmt FROM @zid_catalog_ddl;
--> statement-breakpoint
EXECUTE zid_catalog_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE zid_catalog_stmt;
