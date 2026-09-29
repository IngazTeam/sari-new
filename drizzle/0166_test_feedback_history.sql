SET @sari_test_feedback_ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='testMessages' AND COLUMN_NAME='replySource')=0, 'ALTER TABLE `testMessages` ADD `replySource` ENUM(''model'',''guardrail'') NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE sari_test_feedback_stmt FROM @sari_test_feedback_ddl;
--> statement-breakpoint
EXECUTE sari_test_feedback_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE sari_test_feedback_stmt;
--> statement-breakpoint
SET @sari_test_feedback_ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='testMessages' AND COLUMN_NAME='ratingRevision')=0, 'ALTER TABLE `testMessages` ADD `ratingRevision` INT NOT NULL DEFAULT 0', 'SELECT 1');
--> statement-breakpoint
PREPARE sari_test_feedback_stmt FROM @sari_test_feedback_ddl;
--> statement-breakpoint
EXECUTE sari_test_feedback_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE sari_test_feedback_stmt;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `test_message_feedback` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` int NOT NULL,
  `request_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `message_id` int NOT NULL,
  `reviewer_id` int NOT NULL,
  `expected_revision` int NOT NULL,
  `revision` int NOT NULL,
  `previous_rating` enum('positive','negative') NULL,
  `rating` enum('positive','negative') NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_test_feedback_request` (`merchant_id`,`request_id`),
  KEY `idx_test_feedback_message` (`message_id`,`revision`),
  CONSTRAINT `fk_test_feedback_message` FOREIGN KEY (`message_id`) REFERENCES `testMessages` (`id`) ON DELETE CASCADE
);
