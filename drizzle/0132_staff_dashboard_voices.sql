CREATE TABLE IF NOT EXISTS `ai_sales_staff_voices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `actor_user_id` int NOT NULL,
  `conversation_id` int NOT NULL,
  `request_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `instance_id` int NOT NULL,
  `ownership_version` int NOT NULL,
  `customer_phone` varchar(64) NOT NULL,
  `compatibility` boolean NOT NULL DEFAULT false,
  `compatibility_result` json NULL,
  `intent` json NULL,
  `intent_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `media_url` text NULL,
  `basis` json NULL,
  `basis_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `status` enum('reserved','accepted') NOT NULL DEFAULT 'reserved',
  `provider_message_id` varchar(255) NULL,
  `projected_message_id` int NULL,
  `next_reconcile_at` datetime(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_staff_voice_request` (`merchant_id`,`request_id`),
  KEY `idx_staff_voice_conversation` (`merchant_id`,`conversation_id`,`id`),
  KEY `idx_staff_voice_recovery` (`next_reconcile_at`,`id`),
  CONSTRAINT `fk_staff_voice_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
SET @staff_voice_ddl = IF(EXISTS(SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='ck_staff_acceptance_source' AND CHECK_CLAUSE LIKE '%dashboard_voice%'), 'DO 0', 'ALTER TABLE `ai_sales_staff_acceptances` DROP CHECK `ck_staff_acceptance_source`, ADD CONSTRAINT `ck_staff_acceptance_source` CHECK (`source_kind` IN (''escalation_relay'',''dashboard_text'',''dashboard_voice''))');
--> statement-breakpoint
PREPARE staff_voice_stmt FROM @staff_voice_ddl;
--> statement-breakpoint
EXECUTE staff_voice_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE staff_voice_stmt;
