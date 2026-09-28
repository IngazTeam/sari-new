CREATE TABLE `knowledge_intake_reviews` (
  `review_id` varchar(36) NOT NULL,
  `merchant_id` int NOT NULL,
  `input_hash` char(64) NOT NULL,
  `analysis` json NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NOT NULL,
  PRIMARY KEY (`review_id`),
  KEY `idx_knowledge_review_merchant` (`merchant_id`, `expires_at`),
  CONSTRAINT `fk_knowledge_review_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `knowledge_intake_receipts`
  ADD COLUMN `review_id` varchar(36) NULL,
  ADD COLUMN `review_snapshot` json NULL;
