SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'payment_transactions'
      AND COLUMN_NAME = 'checkout_attempt_id') = 0,
  'ALTER TABLE `payment_transactions` ADD COLUMN `checkout_attempt_id` VARCHAR(36) NULL AFTER `tap_response`',
  'SELECT 1'
);--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint

-- A new nullable column leaves legacy rows untouched. Any non-null duplicate
-- introduced by a partially deployed writer makes the UNIQUE DDL fail closed.
SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'payment_transactions'
      AND INDEX_NAME = 'payment_transactions_merchant_attempt_unique') = 0,
  'ALTER TABLE `payment_transactions` ADD CONSTRAINT `payment_transactions_merchant_attempt_unique` UNIQUE(`merchant_id`, `checkout_attempt_id`)',
  'SELECT 1'
);--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint
