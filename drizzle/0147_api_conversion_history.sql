SET @sari_conversion_history_ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sari_conversions' AND COLUMN_NAME='history_digest')=0,
  'ALTER TABLE `sari_conversions` ADD `history_digest` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL','SELECT 1');
--> statement-breakpoint
PREPARE sari_conversion_history_stmt FROM @sari_conversion_history_ddl;
--> statement-breakpoint
EXECUTE sari_conversion_history_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE sari_conversion_history_stmt;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `api_conversion_observations` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` INT NOT NULL,
  `conversion_id` INT NOT NULL,
  `observed_state` VARCHAR(16) NOT NULL,
  `source_kind` VARCHAR(32) NOT NULL,
  `api_key_id` INT NULL,
  `payload_digest` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `previous_digest` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `observation_digest` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `observed_at` DATETIME(3) NOT NULL,
  UNIQUE KEY `api_conversion_observed_state` (`conversion_id`,`observed_state`),
  KEY `api_conversion_merchant_history` (`merchant_id`,`conversion_id`,`id`),
  CONSTRAINT `fk_api_conversion_observation_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_api_conversion_observation_conversion` FOREIGN KEY (`conversion_id`) REFERENCES `sari_conversions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_api_conversion_observation` CHECK (`observed_state` IN ('pending','completed','cancelled') AND
    ((`source_kind`='api_key_report' AND `api_key_id` IS NOT NULL AND `api_key_id`>0) OR (`source_kind`='internal_unverified' AND `api_key_id` IS NULL)) AND
    REGEXP_LIKE(`payload_digest`,'^[0-9a-f]{64}$','c') AND REGEXP_LIKE(`observation_digest`,'^[0-9a-f]{64}$','c') AND
    (`previous_digest` IS NULL OR REGEXP_LIKE(`previous_digest`,'^[0-9a-f]{64}$','c')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
