CREATE TABLE IF NOT EXISTS `website_import_reviews` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `merchant_id` int NOT NULL,
  `preview_id` varchar(36) NOT NULL,
  `proposal` json NOT NULL,
  `basis` json NOT NULL,
  `basis_hash` varchar(64) NOT NULL,
  `warnings` json NOT NULL,
  `receipt` json,
  `decision_hash` varchar(64),
  `after_hash` varchar(64),
  `expires_at` datetime(3) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_website_import_preview` (`merchant_id`, `preview_id`),
  KEY `idx_website_import_expiry` (`merchant_id`, `expires_at`),
  CONSTRAINT `website_import_merchant_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);
