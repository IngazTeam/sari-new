CREATE TABLE IF NOT EXISTS `product_editor_receipts` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` INT NOT NULL,
  `actor_id` INT NOT NULL,
  `request_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `input_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `result` JSON NOT NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_product_editor_request` (`merchant_id`,`request_id`),
  CONSTRAINT `fk_product_editor_receipt_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
