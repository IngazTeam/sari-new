ALTER TABLE `knowledge_intake_receipts`
  ADD COLUMN `document_result` JSON NULL,
  ADD COLUMN `source_document_id` INT NULL,
  ADD CONSTRAINT `fk_intake_source_document` FOREIGN KEY (`source_document_id`) REFERENCES `merchant_knowledge_docs` (`id`) ON DELETE SET NULL,
  ADD INDEX `idx_intake_source_document` (`merchant_id`, `source_document_id`);
