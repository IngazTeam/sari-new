ALTER TABLE `zid_orders` MODIFY COLUMN `last_synced_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `zid_orders` ADD `projection_status` enum('pending','paid','processing','shipped','delivered','cancelled') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
UPDATE `zid_orders`
SET `projection_status` = CASE
  WHEN `status` IN ('cancelled', 'refunded') THEN 'cancelled'
  WHEN `status` = 'completed' THEN 'delivered'
  WHEN `status` = 'processing' AND `payment_status` = 'paid' THEN 'paid'
  WHEN `status` = 'processing' THEN 'processing'
  ELSE 'pending'
END;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_merchant_external_unique` UNIQUE(`merchantId`,`sallaOrderId`);
