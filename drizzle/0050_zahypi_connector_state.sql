CREATE TABLE IF NOT EXISTS `zahypi_connector_credentials` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` VARCHAR(64) NOT NULL,
  `generation` INT UNSIGNED NOT NULL,
  `base_url` VARCHAR(512) NOT NULL,
  `model` VARCHAR(128) NOT NULL,
  `api_key_ciphertext` TEXT NOT NULL,
  `api_key_hash` CHAR(64) NOT NULL,
  `api_key_prefix` VARCHAR(16) NOT NULL,
  `task_types_json` TEXT NOT NULL,
  `task_types_hash` CHAR(64) NOT NULL,
  `status` ENUM('active', 'superseded', 'revoked') NOT NULL DEFAULT 'active',
  `active_slot` TINYINT GENERATED ALWAYS AS (
    CASE WHEN `status` = 'active' THEN 1 ELSE NULL END
  ) STORED,
  `activated_at` DATETIME(3) NOT NULL,
  `superseded_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `zahypi_connector_project_generation_unique` (`project_id`, `generation`),
  UNIQUE KEY `zahypi_connector_one_active_unique` (`project_id`, `active_slot`),
  KEY `zahypi_connector_status_idx` (`project_id`, `status`, `generation`),
  CONSTRAINT `zahypi_connector_generation_check` CHECK (`generation` > 0),
  CONSTRAINT `zahypi_connector_api_key_hash_check` CHECK (`api_key_hash` REGEXP '^[0-9a-f]{64}$'),
  CONSTRAINT `zahypi_connector_task_types_hash_check` CHECK (`task_types_hash` REGEXP '^[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS `zahypi_connector_receipts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` VARCHAR(64) NOT NULL,
  `action` ENUM('bootstrap', 'verify') NOT NULL,
  `idempotency_key` VARCHAR(128) NOT NULL,
  `body_hash` CHAR(64) NOT NULL,
  `status` ENUM('pending', 'completed') NOT NULL DEFAULT 'pending',
  `response_status` SMALLINT UNSIGNED NULL,
  `response_json` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `zahypi_connector_receipt_unique` (`project_id`, `action`, `idempotency_key`),
  KEY `zahypi_connector_receipt_created_idx` (`project_id`, `created_at`),
  CONSTRAINT `zahypi_connector_body_hash_check` CHECK (`body_hash` REGEXP '^[0-9a-f]{64}$'),
  CONSTRAINT `zahypi_connector_receipt_response_check` CHECK (
    (`status` = 'pending' AND `response_status` IS NULL AND `response_json` IS NULL AND `completed_at` IS NULL)
    OR
    (`status` = 'completed' AND `response_status` BETWEEN 200 AND 599 AND `response_json` IS NOT NULL AND `completed_at` IS NOT NULL)
  )
);
