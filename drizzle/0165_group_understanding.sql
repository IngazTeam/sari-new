CREATE TABLE `ai_group_understanding` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` int NOT NULL,
  `instance_id` int NOT NULL,
  `inbound_id` bigint unsigned NOT NULL,
  `event_key` char(64) NOT NULL,
  `basis_hash` char(64) NOT NULL,
  `decision_json` json NOT NULL,
  `conversation_id` int NULL,
  `incoming_message_id` int NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_group_inbound` (`merchant_id`,`inbound_id`),
  UNIQUE KEY `uq_group_message` (`merchant_id`,`incoming_message_id`),
  CONSTRAINT `fk_group_understanding_owner` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);
