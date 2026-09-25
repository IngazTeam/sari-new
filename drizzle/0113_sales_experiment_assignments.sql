CREATE TABLE `ai_sales_experiment_assignments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `protocol_id` bigint unsigned NOT NULL,
  `launch_id` bigint unsigned NOT NULL,
  `customer_key` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `arm` varchar(16) NOT NULL,
  `conversation_reference` int NOT NULL,
  `message_reference` int NOT NULL,
  `observation_ends_at` datetime(3) NOT NULL,
  `assignment_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `snapshot` json NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_assignment_customer` (`merchant_id`,`protocol_id`,`customer_key`),
  UNIQUE KEY `uq_sales_assignment_source` (`protocol_id`,`message_reference`),
  KEY `idx_sales_assignment_overlap` (`merchant_id`,`customer_key`,`observation_ends_at`),
  CONSTRAINT `ck_sales_assignment_arm` CHECK (`arm` IN ('baseline','candidate')),
  CONSTRAINT `fk_sales_assignment_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sales_assignment_protocol` FOREIGN KEY (`protocol_id`) REFERENCES `ai_sales_experiment_protocols` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sales_assignment_launch` FOREIGN KEY (`launch_id`) REFERENCES `ai_sales_experiment_launches` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
-- Conversation/message references deliberately survive source deletion: the denominator must not shrink.
CREATE TABLE `ai_sales_experiment_assignment_conversations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `protocol_id` bigint unsigned NOT NULL,
  `conversation_reference` int NOT NULL,
  `customer_key` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `assignment_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_assignment_conversation` (`merchant_id`,`protocol_id`,`conversation_reference`),
  CONSTRAINT `fk_sales_assignment_chat_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sales_assignment_chat_protocol` FOREIGN KEY (`protocol_id`) REFERENCES `ai_sales_experiment_protocols` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sales_assignment_chat_assignment` FOREIGN KEY (`assignment_id`) REFERENCES `ai_sales_experiment_assignments` (`id`) ON DELETE CASCADE
);
