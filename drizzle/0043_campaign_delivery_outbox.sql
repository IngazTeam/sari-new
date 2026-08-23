CREATE TABLE `campaign_delivery_outbox` (
  `id` int AUTO_INCREMENT NOT NULL,
  `campaign_id` int NOT NULL,
  `merchant_id` int NOT NULL,
  `customer_id` int,
  `customer_phone` varchar(20) NOT NULL,
  `status` enum('pending','processing','sent','failed','suppressed','manual_review') NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT 0,
  `processing_token` varchar(64),
  `quota_subscription_id` int,
  `quota_reserved` tinyint NOT NULL DEFAULT 0,
  `available_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `claimed_at` timestamp(3),
  `sent_at` timestamp(3),
  `last_error` varchar(100),
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `campaign_delivery_outbox_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `campaign_delivery_outbox_campaign_phone_unique` UNIQUE(`campaign_id`,`customer_phone`),
  CONSTRAINT `campaign_delivery_outbox_campaign_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE,
  CONSTRAINT `campaign_delivery_outbox_merchant_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `campaign_delivery_outbox_customer_fk` FOREIGN KEY (`customer_id`) REFERENCES `conversations`(`id`) ON DELETE SET NULL,
  INDEX `campaign_delivery_outbox_dispatch_idx` (`status`,`available_at`,`id`),
  INDEX `campaign_delivery_outbox_campaign_status_idx` (`campaign_id`,`status`),
  INDEX `campaign_delivery_outbox_merchant_created_idx` (`merchant_id`,`created_at`),
  CONSTRAINT `campaign_delivery_outbox_attempts_check` CHECK (`attempts` >= 0 AND `attempts` <= 8),
  CONSTRAINT `campaign_delivery_outbox_quota_check` CHECK (`quota_reserved` IN (0,1) AND (`quota_reserved` = 0 OR `quota_subscription_id` IS NOT NULL)),
  CONSTRAINT `campaign_delivery_outbox_processing_check` CHECK (
    (`status` = 'processing' AND `processing_token` IS NOT NULL AND `claimed_at` IS NOT NULL)
    OR (`status` <> 'processing' AND `processing_token` IS NULL)
  )
);
--> statement-breakpoint
CREATE TABLE `campaign_dispatch_rate_limits` (
  `merchant_id` int NOT NULL,
  `window_started_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reserved_count` int NOT NULL DEFAULT 0,
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `campaign_dispatch_rate_limits_pk` PRIMARY KEY(`merchant_id`),
  CONSTRAINT `campaign_dispatch_rate_limits_merchant_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `campaign_dispatch_rate_limits_count_check` CHECK (`reserved_count` >= 0 AND `reserved_count` <= 10)
);
--> statement-breakpoint
ALTER TABLE `campaignLogs`
  ADD COLUMN `campaign_outbox_id` int NULL AFTER `campaignId`,
  ADD CONSTRAINT `campaign_logs_outbox_unique` UNIQUE (`campaign_outbox_id`),
  ADD CONSTRAINT `campaign_logs_outbox_fk` FOREIGN KEY (`campaign_outbox_id`) REFERENCES `campaign_delivery_outbox`(`id`) ON DELETE SET NULL;
