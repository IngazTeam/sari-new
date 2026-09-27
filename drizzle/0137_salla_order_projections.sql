CREATE TABLE IF NOT EXISTS salla_order_projections (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  store_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  external_order_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  local_order_id INT NOT NULL,
  connection_id INT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY salla_projection_scope (merchant_id,store_id,external_order_id),
  UNIQUE KEY salla_projection_local (local_order_id),
  CONSTRAINT salla_projection_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  CONSTRAINT salla_projection_order_fk FOREIGN KEY (local_order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT chk_salla_projection_ids CHECK (connection_id>0 AND REGEXP_LIKE(store_id,'^[1-9][0-9]{0,19}$','c') AND REGEXP_LIKE(external_order_id,'^[1-9][0-9]{0,19}$','c'))
);
--> statement-breakpoint
SET @salla_scope_index_sql = IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='salla_webhook_receipts' AND INDEX_NAME='idx_salla_receipt_order_scope'), 'SELECT 1', 'CREATE INDEX idx_salla_receipt_order_scope ON salla_webhook_receipts(merchant_id,salla_store_id,resource_id,event_type,status)');
--> statement-breakpoint
PREPARE salla_scope_index_stmt FROM @salla_scope_index_sql;
--> statement-breakpoint
EXECUTE salla_scope_index_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE salla_scope_index_stmt;
