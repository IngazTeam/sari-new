-- Historical rows remain explicitly unassigned. Do not infer their store from the current connection.
--> statement-breakpoint
SET @zid_store_ddl = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='zid_orders' AND COLUMN_NAME='zid_store_id'), 'ALTER TABLE `zid_orders` ADD COLUMN `zid_store_id` varchar(20) NOT NULL DEFAULT ''''', 'DO 0');
--> statement-breakpoint
PREPARE zid_store_stmt FROM @zid_store_ddl;
--> statement-breakpoint
EXECUTE zid_store_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE zid_store_stmt;
--> statement-breakpoint
SET @zid_store_ddl = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='zid_order_notification_outbox' AND COLUMN_NAME='zid_store_id'), 'ALTER TABLE `zid_order_notification_outbox` ADD COLUMN `zid_store_id` varchar(20) NOT NULL DEFAULT ''''', 'DO 0');
--> statement-breakpoint
PREPARE zid_store_stmt FROM @zid_store_ddl;
--> statement-breakpoint
EXECUTE zid_store_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE zid_store_stmt;
--> statement-breakpoint
SET @zid_store_ddl = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='zid_orders' AND INDEX_NAME='zid_orders_merchant_store_order_unique'), 'ALTER TABLE `zid_orders` ADD UNIQUE INDEX `zid_orders_merchant_store_order_unique` (`merchant_id`,`zid_store_id`,`zid_order_id`)', 'DO 0');
--> statement-breakpoint
PREPARE zid_store_stmt FROM @zid_store_ddl;
--> statement-breakpoint
EXECUTE zid_store_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE zid_store_stmt;
--> statement-breakpoint
SET @zid_store_ddl = IF(EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='zid_orders' AND INDEX_NAME='zid_orders_merchant_order_unique'), 'ALTER TABLE `zid_orders` DROP INDEX `zid_orders_merchant_order_unique`', 'DO 0');
--> statement-breakpoint
PREPARE zid_store_stmt FROM @zid_store_ddl;
--> statement-breakpoint
EXECUTE zid_store_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE zid_store_stmt;
