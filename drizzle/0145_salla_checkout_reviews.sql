CREATE TABLE IF NOT EXISTS `salla_checkout_reviews` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` INT NOT NULL,
  `reviewer_user_id` INT NOT NULL,
  `review_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `request_digest` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `snapshot` JSON NOT NULL,
  `snapshot_digest` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `salla_checkout_review_once` (`merchant_id`,`review_id`),
  KEY `salla_checkout_review_history` (`merchant_id`,`id`),
  CONSTRAINT `fk_salla_checkout_review_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_salla_checkout_review` CHECK (`reviewer_user_id` > 0 AND
    REGEXP_LIKE(`request_digest`,'^[0-9a-f]{64}$','c') AND REGEXP_LIKE(`snapshot_digest`,'^[0-9a-f]{64}$','c'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
