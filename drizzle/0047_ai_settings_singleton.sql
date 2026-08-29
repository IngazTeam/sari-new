CREATE TABLE IF NOT EXISTS `ai_settings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `openai_api_key` TEXT NULL,
  `model` VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
  `whisper_model` VARCHAR(100) NOT NULL DEFAULT 'whisper-1',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `monthly_budget_limit` DECIMAL(10,2) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `ai_usage_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `merchant_id` INT NULL,
  `request_type` ENUM('chat', 'whisper', 'embedding') NOT NULL,
  `model` VARCHAR(100) NOT NULL,
  `prompt_tokens` INT NULL DEFAULT 0,
  `completion_tokens` INT NULL DEFAULT 0,
  `total_tokens` INT NULL DEFAULT 0,
  `audio_duration_sec` INT NULL,
  `estimated_cost` DECIMAL(10,6) NULL DEFAULT 0,
  `duration_ms` INT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_usage_merchant` (`merchant_id`),
  KEY `idx_usage_created` (`created_at`),
  KEY `idx_usage_type` (`request_type`),
  CONSTRAINT `ai_usage_logs_merchant_fk`
    FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE SET NULL
);--> statement-breakpoint

INSERT IGNORE INTO `ai_settings` (`id`, `model`, `whisper_model`, `is_active`)
VALUES (1, 'gpt-4o-mini', 'whisper-1', TRUE);--> statement-breakpoint

UPDATE `ai_settings`
   SET `id` = 1
 WHERE `id` <> 1;--> statement-breakpoint

ALTER TABLE `ai_settings`
  ADD CONSTRAINT `ai_settings_singleton_id_check` CHECK (`id` = 1);
