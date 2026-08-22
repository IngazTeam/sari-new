ALTER TABLE `whatsapp_instances`
  ADD `active_primary_merchant_id` int GENERATED ALWAYS AS (CASE WHEN `status` = 'active' AND `is_primary` = 1 THEN `merchant_id` ELSE NULL END) STORED,
  ADD CONSTRAINT `whatsapp_instances_active_primary_merchant_unique` UNIQUE(`active_primary_merchant_id`),
  ADD CONSTRAINT `whatsapp_instances_primary_requires_active_check` CHECK (`is_primary` IN (0, 1) AND (`is_primary` = 0 OR `status` = 'active'));
