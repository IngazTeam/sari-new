ALTER TABLE `sales_quotations` MODIFY `status` ENUM('sent','viewed','accepted','rejected','expired','draft') NOT NULL DEFAULT 'sent';
--> statement-breakpoint
SET @sari_quote_ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sales_quotations' AND COLUMN_NAME='tax_basis_points')=0, 'ALTER TABLE `sales_quotations` ADD `tax_basis_points` INT NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE sari_quote_stmt FROM @sari_quote_ddl;
--> statement-breakpoint
EXECUTE sari_quote_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE sari_quote_stmt;
--> statement-breakpoint
SET @sari_quote_ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sales_targets' AND COLUMN_NAME='revision')=0, 'ALTER TABLE `sales_targets` ADD `revision` INT NOT NULL DEFAULT 1', 'SELECT 1');
--> statement-breakpoint
PREPARE sari_quote_stmt FROM @sari_quote_ddl;
--> statement-breakpoint
EXECUTE sari_quote_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE sari_quote_stmt;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `quotation_action_receipts` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` INT NOT NULL,
  `request_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `action` ENUM('create','status','target') NOT NULL,
  `input_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `actor_id` INT NOT NULL,
  `result` JSON NOT NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_quotation_action_request` (`merchant_id`,`request_id`),
  CONSTRAINT `fk_quotation_action_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`id`) ON DELETE CASCADE
);
