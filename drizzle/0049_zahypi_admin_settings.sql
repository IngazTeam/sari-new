ALTER TABLE `ai_settings`
  ADD COLUMN `text_generation_provider` ENUM('openai', 'zahypi') NULL AFTER `whisper_model`,
  ADD COLUMN `zahypi_api_key` TEXT NULL AFTER `text_generation_provider`,
  ADD COLUMN `zahypi_base_url` VARCHAR(500) NULL AFTER `zahypi_api_key`,
  ADD COLUMN `zahypi_project_id` VARCHAR(128) NULL AFTER `zahypi_base_url`,
  ADD COLUMN `zahypi_model` VARCHAR(128) NULL AFTER `zahypi_project_id`;
