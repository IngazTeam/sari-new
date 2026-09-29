CREATE TABLE `merchant_teaching_drafts` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` int NOT NULL,
  `instance_id` int NOT NULL,
  `author_phone` varchar(20) NOT NULL,
  `version` int NOT NULL,
  `status` varchar(20) NOT NULL,
  `fragments_json` json NOT NULL,
  `last_inbound_id` int NOT NULL,
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_teaching_draft_scope` (`merchant_id`,`instance_id`,`author_phone`),
  CONSTRAINT `fk_teaching_draft_owner` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `merchant_teaching_turns` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` int NOT NULL,
  `event_key` char(64) NOT NULL,
  `source_digest` char(64) NOT NULL,
  `source_json` json NOT NULL,
  `context_json` json NOT NULL,
  `decision_json` json NOT NULL,
  `result_json` json NOT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_teaching_turn_event` (`merchant_id`,`event_key`),
  KEY `idx_teaching_turn_window` (`merchant_id`,`created_at`),
  CONSTRAINT `fk_teaching_turn_owner` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);
