CREATE TABLE `merchant_directive_actions` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` int NOT NULL,
  `event_key` char(64) NOT NULL,
  `source_digest` char(64) NOT NULL,
  `basis_hash` char(64) NOT NULL,
  `conversation_id` int NOT NULL,
  `intent` varchar(20) NOT NULL,
  `context_json` json NOT NULL,
  `decision_json` json NOT NULL,
  `result_json` json NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_merchant_directive_event` (`merchant_id`,`event_key`),
  CONSTRAINT `fk_merchant_directive_owner` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);
