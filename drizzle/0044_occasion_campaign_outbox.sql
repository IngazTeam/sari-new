ALTER TABLE `occasion_campaigns`
  MODIFY COLUMN `status` enum('pending','sent','sending','completed','failed') NOT NULL DEFAULT 'pending';
--> statement-breakpoint
UPDATE `occasion_campaigns` SET `status` = 'completed' WHERE `status` = 'sent';
--> statement-breakpoint
ALTER TABLE `occasion_campaigns`
  MODIFY COLUMN `status` enum('pending','sending','completed','failed') NOT NULL DEFAULT 'pending',
  ADD COLUMN `campaign_id` int NULL AFTER `merchantId`,
  ADD CONSTRAINT `occasion_campaigns_campaign_unique` UNIQUE (`campaign_id`),
  ADD CONSTRAINT `occasion_campaigns_merchant_type_year_unique` UNIQUE (`merchantId`,`occasionType`,`year`),
  ADD CONSTRAINT `occasion_campaigns_campaign_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE SET NULL,
  ADD INDEX `occasion_campaigns_dispatch_idx` (`status`,`enabled`,`occasionType`,`year`,`id`),
  ADD CONSTRAINT `occasion_campaigns_enabled_check` CHECK (`enabled` IN (0,1)),
  ADD CONSTRAINT `occasion_campaigns_discount_check` CHECK (`discountPercentage` >= 5 AND `discountPercentage` <= 50);
