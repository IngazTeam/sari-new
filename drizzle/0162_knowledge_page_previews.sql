CREATE TABLE IF NOT EXISTS `knowledge_page_previews` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `merchant_id` int NOT NULL,
  `preview_id` varchar(36) NOT NULL,
  `url` varchar(1000) NOT NULL,
  `title` varchar(500) NOT NULL,
  `content` text,
  `analysis` json,
  `content_hash` varchar(64) NOT NULL,
  `page_id` int,
  `section_id` int,
  `expires_at` datetime(3) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `uq_page_preview` UNIQUE (`merchant_id`, `preview_id`),
  INDEX `idx_page_preview_expiry` (`merchant_id`, `expires_at`),
  CONSTRAINT `page_preview_merchant_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE CASCADE
);
