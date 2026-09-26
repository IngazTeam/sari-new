CREATE TABLE IF NOT EXISTS `ai_sales_staff_replies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `actor_user_id` int NOT NULL,
  `conversation_id` int NOT NULL,
  `request_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `instance_id` int NOT NULL,
  `ownership_version` int NOT NULL,
  `customer_phone` varchar(64) NOT NULL,
  `reply_text` text NOT NULL,
  `basis` json NULL,
  `basis_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `status` enum('reserved','accepted','failed','suppressed') NOT NULL DEFAULT 'reserved',
  `provider_message_id` varchar(255) NULL,
  `projected_message_id` int NULL,
  `next_reconcile_at` datetime(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_staff_reply_request` (`merchant_id`,`request_id`),
  KEY `idx_staff_reply_conversation` (`merchant_id`,`conversation_id`,`id`),
  KEY `idx_staff_reply_recovery` (`next_reconcile_at`,`id`),
  CONSTRAINT `fk_staff_reply_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
SET @staff_dashboard_ddl = IF(EXISTS(SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='ck_staff_acceptance_source' AND CHECK_CLAUSE LIKE '%dashboard_text%'), 'DO 0', 'ALTER TABLE `ai_sales_staff_acceptances` DROP CHECK `ck_staff_acceptance_source`, ADD CONSTRAINT `ck_staff_acceptance_source` CHECK (`source_kind` IN (''escalation_relay'',''dashboard_text''))');
--> statement-breakpoint
PREPARE staff_dashboard_stmt FROM @staff_dashboard_ddl;
--> statement-breakpoint
EXECUTE staff_dashboard_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE staff_dashboard_stmt;
