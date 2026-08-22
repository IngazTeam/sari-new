-- Run `pnpm preflight:tap-order-effects` first. The code deploy must not accept
-- order-payment webhooks until both columns are visible through schema readiness.
SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'payment_status') = 0,
  'ALTER TABLE `orders` ADD COLUMN `payment_status` ENUM(''unpaid'',''paid'',''refunded'') NOT NULL DEFAULT ''unpaid'' AFTER `status`',
  'SELECT 1'
);--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint

SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_payments' AND COLUMN_NAME = 'last_webhook_status') = 0,
  'ALTER TABLE `order_payments` ADD COLUMN `last_webhook_status` VARCHAR(32) NULL AFTER `last_webhook_at`',
  'SELECT 1'
);--> statement-breakpoint
PREPARE sari_migration_stmt FROM @ddl;--> statement-breakpoint
EXECUTE sari_migration_stmt;--> statement-breakpoint
DEALLOCATE PREPARE sari_migration_stmt;--> statement-breakpoint

-- Deterministic compatibility projection for rows completed before the atomic
-- state writer. No link counters or fulfillment states are rewritten here.
UPDATE `orders` o
   SET o.`payment_status` = CASE
     WHEN EXISTS (
       SELECT 1 FROM `order_payments` p
        WHERE p.`order_id` = o.`id` AND p.`merchant_id` = o.`merchantId` AND p.`status` = 'refunded'
     ) THEN 'refunded'
     WHEN EXISTS (
       SELECT 1 FROM `order_payments` p
        WHERE p.`order_id` = o.`id` AND p.`merchant_id` = o.`merchantId` AND p.`status` = 'captured'
     ) OR o.`status` = 'paid' THEN 'paid'
     ELSE 'unpaid'
   END;
