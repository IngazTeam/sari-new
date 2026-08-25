CREATE TABLE `whatsapp_disconnect_incidents` (
  `id` bigint unsigned AUTO_INCREMENT NOT NULL,
  `merchant_id` int NOT NULL,
  `instance_id` int NOT NULL,
  `detected_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `alerts_sent` tinyint unsigned NOT NULL DEFAULT 0,
  `next_alert_at` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_alert_at` timestamp(3) NULL,
  `resolved_at` timestamp(3) NULL,
  `open_instance_id` int GENERATED ALWAYS AS (
    CASE WHEN `resolved_at` IS NULL THEN `instance_id` ELSE NULL END
  ) STORED,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `whatsapp_disconnect_incidents_id` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_disconnect_incidents_merchant_id_merchants_id_fk`
    FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `whatsapp_disconnect_instance_fk`
    FOREIGN KEY (`instance_id`) REFERENCES `whatsapp_instances`(`id`) ON DELETE CASCADE,
  CONSTRAINT `whatsapp_disconnect_alert_count_check`
    CHECK (`alerts_sent` >= 0 AND `alerts_sent` <= 2),
  CONSTRAINT `uq_whatsapp_disconnect_open_instance` UNIQUE (`open_instance_id`),
  INDEX `idx_whatsapp_disconnect_due` (`resolved_at`, `next_alert_at`, `id`),
  INDEX `idx_whatsapp_disconnect_merchant` (`merchant_id`, `detected_at`, `id`)
);
