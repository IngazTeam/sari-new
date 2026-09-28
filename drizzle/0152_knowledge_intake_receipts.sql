ALTER TABLE `merchant_knowledge_docs`
  ADD COLUMN `intake_request_id` varchar(36) NULL,
  ADD UNIQUE KEY `uq_knowledge_doc_intake` (`merchant_id`, `intake_request_id`);
--> statement-breakpoint
CREATE TABLE `knowledge_intake_receipts` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` int NOT NULL,
  `request_id` varchar(36) NOT NULL,
  `input_hash` char(64) NOT NULL,
  `document_id` int NULL,
  `content_type` enum('document','products','custom') NOT NULL,
  `state` enum('processing','completed','empty','uncertain') NOT NULL,
  `outcome` json NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_knowledge_intake_request` (`merchant_id`, `request_id`),
  KEY `idx_knowledge_intake_state` (`merchant_id`, `state`),
  CONSTRAINT `fk_knowledge_intake_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_knowledge_intake_document` FOREIGN KEY (`document_id`) REFERENCES `merchant_knowledge_docs` (`id`) ON DELETE SET NULL
);
