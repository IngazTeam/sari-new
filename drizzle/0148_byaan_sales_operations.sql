CREATE TABLE IF NOT EXISTS `byaan_sales_operations` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` INT NOT NULL,
  `request_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `request_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `operation_kind` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `authority_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `attempt_token` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `state` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `result_json` JSON NULL,
  `result_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `byaan_sales_request` (`merchant_id`,`request_id`),
  CONSTRAINT `fk_byaan_sales_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_byaan_sales_operation` CHECK (
    `operation_kind` IN ('enrollment','payment') AND
    REGEXP_LIKE(`request_id`,'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$','c') AND
    REGEXP_LIKE(`attempt_token`,'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$','c') AND
    REGEXP_LIKE(`request_hash`,'^[0-9a-f]{64}$','c') AND REGEXP_LIKE(`authority_hash`,'^[0-9a-f]{64}$','c') AND
    ((`state` IN ('preparing','dispatching') AND `result_json` IS NULL AND `result_hash` IS NULL) OR
     (`state` IN ('reported','not_sent','unknown') AND `result_json` IS NOT NULL AND `result_hash` IS NOT NULL AND
       REGEXP_LIKE(`result_hash`,'^[0-9a-f]{64}$','c')))
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
