SET @sari_test_workspace_ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='testConversations' AND COLUMN_NAME='requestId')=0, 'ALTER TABLE `testConversations` ADD `requestId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE sari_test_workspace_stmt FROM @sari_test_workspace_ddl;
--> statement-breakpoint
EXECUTE sari_test_workspace_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE sari_test_workspace_stmt;
--> statement-breakpoint
SET @sari_test_workspace_ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='testConversations' AND INDEX_NAME='test_session_request')=0, 'ALTER TABLE `testConversations` ADD UNIQUE KEY `test_session_request` (`merchantId`,`requestId`)', 'SELECT 1');
--> statement-breakpoint
PREPARE sari_test_workspace_stmt FROM @sari_test_workspace_ddl;
--> statement-breakpoint
EXECUTE sari_test_workspace_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE sari_test_workspace_stmt;
--> statement-breakpoint
ALTER TABLE `testConversations` MODIFY `dealValue` DECIMAL(12,2) NULL;
--> statement-breakpoint
SET @sari_test_workspace_ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='testMessages' AND COLUMN_NAME='clientMessageId')=0, 'ALTER TABLE `testMessages` ADD `clientMessageId` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL', 'SELECT 1');
--> statement-breakpoint
PREPARE sari_test_workspace_stmt FROM @sari_test_workspace_ddl;
--> statement-breakpoint
EXECUTE sari_test_workspace_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE sari_test_workspace_stmt;
--> statement-breakpoint
SET @sari_test_workspace_ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='testMessages' AND INDEX_NAME='test_message_request')=0, 'ALTER TABLE `testMessages` ADD UNIQUE KEY `test_message_request` (`conversationId`,`clientMessageId`)', 'SELECT 1');
--> statement-breakpoint
PREPARE sari_test_workspace_stmt FROM @sari_test_workspace_ddl;
--> statement-breakpoint
EXECUTE sari_test_workspace_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE sari_test_workspace_stmt;
--> statement-breakpoint
ALTER TABLE `testDeals` MODIFY `dealValue` DECIMAL(12,2) NOT NULL;
