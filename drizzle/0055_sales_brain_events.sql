CREATE TABLE `ai_interaction_jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `conversation_id` int NOT NULL,
  `incoming_message_id` int NOT NULL,
  `reply_text` text NOT NULL,
  `state` varchar(24) NOT NULL DEFAULT 'waiting_delivery',
  `attempts` int NOT NULL DEFAULT 0,
  `lease_token` varchar(64) DEFAULT NULL,
  `lease_until` datetime(3) DEFAULT NULL,
  `available_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_error` varchar(80) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ai_interaction_message` (`merchant_id`, `incoming_message_id`),
  KEY `idx_ai_interaction_due` (`state`, `available_at`, `lease_until`),
  CONSTRAINT `fk_ai_interaction_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_interaction_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_interaction_message` FOREIGN KEY (`incoming_message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `sari_learning_signals` ADD COLUMN `source_key` varchar(160) DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `sari_learning_signals` ADD UNIQUE KEY `uq_learning_source` (`merchant_id`, `source_key`, `signal_type`);
--> statement-breakpoint
CREATE TABLE `ai_learning_proposals` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `generation` int NOT NULL,
  `dimension` varchar(30) NOT NULL,
  `insight` text NOT NULL,
  `content_hash` varchar(64) NOT NULL,
  `evidence_count` int NOT NULL DEFAULT 0,
  `confidence` decimal(3,2) NOT NULL,
  `status` varchar(24) NOT NULL DEFAULT 'proposed',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ai_learning_proposal` (`merchant_id`, `dimension`, `content_hash`),
  CONSTRAINT `fk_ai_proposal_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);
