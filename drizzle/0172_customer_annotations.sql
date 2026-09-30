CREATE TABLE IF NOT EXISTS `customer_workspace_tags` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` INT NOT NULL,
  `customer_key` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `revision` INT UNSIGNED NOT NULL DEFAULT 0,
  `tags` JSON NOT NULL,
  `updated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_customer_workspace_tags` (`merchant_id`,`customer_key`),
  CONSTRAINT `fk_customer_workspace_tags_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `customer_workspace_notes` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` INT NOT NULL,
  `customer_key` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `actor_id` INT NOT NULL,
  `content` VARCHAR(2000) NOT NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `idx_customer_workspace_notes` (`merchant_id`,`customer_key`,`id`),
  CONSTRAINT `fk_customer_workspace_notes_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `customer_annotation_receipts` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` INT NOT NULL,
  `actor_id` INT NOT NULL,
  `request_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `input_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `result` JSON NOT NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_customer_annotation_request` (`merchant_id`,`request_id`),
  CONSTRAINT `fk_customer_annotation_receipt_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
