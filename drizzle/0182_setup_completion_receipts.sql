SET @sari_setup_ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='setup_wizard_progress' AND COLUMN_NAME='revision')=0, 'ALTER TABLE `setup_wizard_progress` ADD `revision` INT NOT NULL DEFAULT 0', 'SELECT 1');
--> statement-breakpoint
PREPARE sari_setup_stmt FROM @sari_setup_ddl;
--> statement-breakpoint
EXECUTE sari_setup_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE sari_setup_stmt;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `setup_completion_receipts` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` INT NOT NULL,
  `actor_id` INT NOT NULL,
  `request_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `input_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `result` JSON NOT NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_setup_completion_request` (`merchant_id`,`request_id`),
  CONSTRAINT `fk_setup_completion_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
