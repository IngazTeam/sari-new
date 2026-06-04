-- إضافة جدول smtp_settings لإدارة إعدادات SMTP

CREATE TABLE IF NOT EXISTS `smtp_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` INT NOT NULL,
  `provider` ENUM('smtp2go', 'gmail', 'sendgrid', 'aws_ses', 'custom') DEFAULT 'smtp2go' NOT NULL,
  `smtp_host` VARCHAR(255),
  `smtp_port` INT DEFAULT 587,
  `smtp_username` VARCHAR(255),
  `smtp_password` TEXT,
  `smtp_from_email` VARCHAR(255) NOT NULL,
  `smtp_from_name` VARCHAR(255),
  `use_tls` TINYINT DEFAULT 1 NOT NULL,
  `is_active` TINYINT DEFAULT 1 NOT NULL,
  `last_test_at` TIMESTAMP NULL,
  `last_test_status` ENUM('success', 'failed') NULL,
  `last_test_error` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY `smtp_settings_merchant_id_unique` (`merchant_id`),
  FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add 'text' to merchant_knowledge_docs.file_type enum for Smart Intake content
ALTER TABLE `merchant_knowledge_docs`
  MODIFY COLUMN `file_type` ENUM('pdf', 'docx', 'xlsx', 'text') NOT NULL;
