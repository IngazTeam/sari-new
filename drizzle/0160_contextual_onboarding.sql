CREATE TABLE `merchant_onboarding_sessions` (
  `merchant_id` int NOT NULL PRIMARY KEY,
  `version` int NOT NULL,
  `status` varchar(20) NOT NULL,
  `field_key` varchar(50) DEFAULT NULL,
  `instance_id` int NOT NULL,
  `recipient` varchar(20) NOT NULL,
  `delivery_key` varchar(100) NOT NULL,
  `prompt_text` text NOT NULL,
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `fk_onboarding_session_owner` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `merchant_onboarding_events` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` int NOT NULL,
  `event_key` char(64) NOT NULL,
  `source_digest` char(64) NOT NULL,
  `basis_hash` char(64) NOT NULL,
  `source_json` json NOT NULL,
  `decision_json` json NOT NULL,
  `result_json` json NOT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_onboarding_event` (`merchant_id`,`event_key`),
  CONSTRAINT `fk_onboarding_event_owner` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `merchant_onboarding_answers`
  ADD COLUMN `verified_event_key` char(64) DEFAULT NULL,
  ADD COLUMN `answer_digest` char(64) DEFAULT NULL;
