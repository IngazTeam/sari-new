-- Preserve legacy attempts without inventing an author/time basis. Safe to resume after partial DDL.
SET @staff_acceptance_ddl = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sales_escalation_relays' AND COLUMN_NAME='staff_basis'), 'ALTER TABLE `sales_escalation_relays` ADD COLUMN `staff_basis` json NULL', 'DO 0');
--> statement-breakpoint
PREPARE staff_acceptance_stmt FROM @staff_acceptance_ddl;
--> statement-breakpoint
EXECUTE staff_acceptance_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE staff_acceptance_stmt;
--> statement-breakpoint
SET @staff_acceptance_ddl = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sales_escalation_relays' AND COLUMN_NAME='staff_basis_digest'), 'ALTER TABLE `sales_escalation_relays` ADD COLUMN `staff_basis_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NULL', 'DO 0');
--> statement-breakpoint
PREPARE staff_acceptance_stmt FROM @staff_acceptance_ddl;
--> statement-breakpoint
EXECUTE staff_acceptance_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE staff_acceptance_stmt;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_sales_staff_acceptances` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `source_kind` varchar(24) NOT NULL,
  `source_id` int NOT NULL,
  `customer_key` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `outbox_id` bigint unsigned NOT NULL,
  `provider_message_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `acceptance_digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `snapshot` json NOT NULL,
  `acceptance_observed_at` datetime(3) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_staff_acceptance_source` (`merchant_id`,`source_kind`,`source_id`),
  UNIQUE KEY `uq_staff_acceptance_outbox` (`merchant_id`,`outbox_id`),
  UNIQUE KEY `uq_staff_acceptance_receipt` (`merchant_id`,`provider_message_digest`),
  KEY `idx_staff_acceptance_customer` (`merchant_id`,`customer_key`,`acceptance_observed_at`),
  CONSTRAINT `ck_staff_acceptance_source` CHECK (`source_kind` = 'escalation_relay'),
  CONSTRAINT `fk_staff_acceptance_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);
