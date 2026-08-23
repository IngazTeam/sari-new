UPDATE `notification_templates`
   SET `status` = 'paid'
 WHERE `status` = 'confirmed';
--> statement-breakpoint
ALTER TABLE `notification_templates`
  ADD CONSTRAINT `uq_notification_template_merchant_status` UNIQUE (`merchant_id`,`status`);
--> statement-breakpoint
ALTER TABLE `order_notifications`
  ADD COLUMN `reviewed_at` timestamp(3) NULL AFTER `claimed_at`,
  ADD COLUMN `reviewed_by_user_id` int NULL AFTER `reviewed_at`,
  ADD CONSTRAINT `order_notifications_reviewed_by_user_id_users_id_fk`
    FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  ADD INDEX `idx_order_notification_merchant_health` (`merchant_id`,`delivery_status`,`created_at`,`id`);
