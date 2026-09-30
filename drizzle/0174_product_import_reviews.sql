CREATE TABLE IF NOT EXISTS `product_import_reviews` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` INT NOT NULL,
  `actor_id` INT NOT NULL,
  `review_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `input_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `digest` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `preview` JSON NOT NULL,
  `receipt` JSON NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` TIMESTAMP(3) NOT NULL,
  UNIQUE KEY `uq_product_import_review` (`merchant_id`,`review_id`),
  KEY `idx_product_import_expiry` (`merchant_id`,`expires_at`),
  CONSTRAINT `fk_product_import_review_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
