ALTER TABLE `order_notifications`
  ADD COLUMN `event_key` varchar(64) NULL AFTER `merchant_id`,
  ADD COLUMN `delivery_status` enum('pending','processing','sent','failed','manual_review','suppressed') NULL AFTER `error`,
  ADD COLUMN `attempts` int NOT NULL DEFAULT 0 AFTER `delivery_status`,
  ADD COLUMN `available_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER `attempts`,
  ADD COLUMN `claimed_at` timestamp(3) NULL AFTER `available_at`,
  ADD COLUMN `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) AFTER `created_at`;
--> statement-breakpoint
UPDATE `order_notifications`
   SET `delivery_status` = CASE WHEN `sent` = 1 THEN 'sent' ELSE 'suppressed' END
 WHERE `delivery_status` IS NULL;
--> statement-breakpoint
ALTER TABLE `order_notifications`
  MODIFY COLUMN `delivery_status` enum('pending','processing','sent','failed','manual_review','suppressed') NOT NULL DEFAULT 'pending',
  ADD CONSTRAINT `uq_order_notification_event` UNIQUE (`merchant_id`,`event_key`),
  ADD INDEX `idx_order_notification_dispatch` (`delivery_status`,`available_at`,`id`);
