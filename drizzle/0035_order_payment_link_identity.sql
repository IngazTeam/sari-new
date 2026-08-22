-- One persisted order may expose only one local checkout bearer link.
-- Run `pnpm preflight:order-payment-link-identity` before this migration;
-- duplicate or identity-drifted legacy rows must be reviewed, never auto-picked.
SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'payment_links'
      AND INDEX_NAME = 'payment_links_order_id_unique') = 0,
  'ALTER TABLE `payment_links` ADD CONSTRAINT `payment_links_order_id_unique` UNIQUE(`order_id`)',
  'SELECT 1'
);--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;
