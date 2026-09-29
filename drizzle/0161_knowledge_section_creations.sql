CREATE TABLE IF NOT EXISTS `knowledge_section_creations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `merchant_id` int NOT NULL,
  `request_id` varchar(36) NOT NULL,
  `input_hash` varchar(64) NOT NULL,
  `section_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `knowledge_section_creations_id` PRIMARY KEY (`id`),
  CONSTRAINT `uq_section_creation_request` UNIQUE (`merchant_id`, `request_id`),
  CONSTRAINT `section_creation_merchant_fk` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `knowledge_section_creations` (`merchant_id`, `request_id`, `input_hash`, `section_id`, `created_at`)
SELECT `merchant_id`, JSON_UNQUOTE(JSON_EXTRACT(`provenance`, '$.manualRequestId')),
  JSON_UNQUOTE(JSON_EXTRACT(`provenance`, '$.manualInputHash')), `id`, `created_at`
FROM `knowledge_sections`
WHERE JSON_UNQUOTE(JSON_EXTRACT(`provenance`, '$.manualRequestId')) REGEXP '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
  AND JSON_UNQUOTE(JSON_EXTRACT(`provenance`, '$.manualInputHash')) REGEXP '^[a-f0-9]{64}$'
ON DUPLICATE KEY UPDATE `request_id` = VALUES(`request_id`);
