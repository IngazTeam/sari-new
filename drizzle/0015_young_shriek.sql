DELETE older
  FROM `platform_integrations` older
  INNER JOIN `platform_integrations` newer
    ON newer.`merchant_id` = older.`merchant_id`
   AND newer.`platform_type` = older.`platform_type`
   AND newer.`id` > older.`id`;--> statement-breakpoint
ALTER TABLE `platform_integrations` ADD CONSTRAINT `platform_integrations_merchant_type_unique` UNIQUE(`merchant_id`,`platform_type`);
