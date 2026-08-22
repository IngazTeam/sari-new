DELETE older
FROM `zid_settings` AS older
INNER JOIN `zid_settings` AS newer
  ON newer.`merchant_id` = older.`merchant_id`
 AND newer.`id` > older.`id`;--> statement-breakpoint
INSERT IGNORE INTO `platform_integrations` (
  `merchant_id`, `platform_type`, `store_name`, `store_url`, `access_token`,
  `refresh_token`, `is_active`, `settings`, `last_sync_at`, `created_at`, `updated_at`
)
SELECT
  `merchant_id`,
  'zid',
  `store_name`,
  `store_url`,
  `manager_token`,
  `refresh_token`,
  1,
  JSON_OBJECT(
    'autoSync', JSON_EXTRACT('true', '$'),
    'syncProducts', JSON_EXTRACT(IF(`auto_sync_products` = 1, 'true', 'false'), '$'),
    'syncOrders', JSON_EXTRACT(IF(`auto_sync_orders` = 1, 'true', 'false'), '$'),
    'syncCustomers', JSON_EXTRACT(IF(`auto_sync_customers` = 1, 'true', 'false'), '$'),
    'managerToken', `access_token`,
    'storeId', `store_id`,
    'tokenExpiresAt', IF(
      `token_expires_at` IS NULL,
      NULL,
      DATE_FORMAT(`token_expires_at`, '%Y-%m-%dT%H:%i:%s.000Z')
    )
  ),
  NULLIF(GREATEST(
    COALESCE(`last_product_sync`, '1970-01-01 00:00:00'),
    COALESCE(`last_order_sync`, '1970-01-01 00:00:00'),
    COALESCE(`last_customer_sync`, '1970-01-01 00:00:00')
  ), '1970-01-01 00:00:00'),
  `created_at`,
  `updated_at`
FROM `zid_settings`
WHERE `is_active` = 1
  AND NULLIF(TRIM(`manager_token`), '') IS NOT NULL
  AND NULLIF(TRIM(`access_token`), '') IS NOT NULL;--> statement-breakpoint
ALTER TABLE `zid_settings` ADD CONSTRAINT `zid_settings_merchant_unique` UNIQUE(`merchant_id`);
