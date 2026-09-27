CREATE TABLE IF NOT EXISTS `ai_sales_staff_reviews` (
  `id` int NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `reviewer_user_id` int NOT NULL,
  `author_user_id` int NOT NULL,
  `conversation_id` int NOT NULL,
  `source_kind` enum('text','voice') NOT NULL,
  `source_id` int NOT NULL,
  `request_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `request_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `snapshot` json NOT NULL,
  `snapshot_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_staff_review_request` (`merchant_id`,`request_id`),
  KEY `idx_staff_review_history` (`merchant_id`,`source_kind`,`id`),
  CONSTRAINT `fk_staff_review_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);
