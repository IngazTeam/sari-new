ALTER TABLE sales_quotations
  ADD COLUMN execution_attempt_id VARCHAR(36) NULL,
  ADD COLUMN execution_started_at DATETIME(3) NULL,
  ADD COLUMN external_order_key VARCHAR(140) NULL,
  ADD COLUMN external_reconciliation JSON NULL,
  ADD COLUMN projection_pending TINYINT NOT NULL DEFAULT 0,
  ADD UNIQUE INDEX uq_quote_external_order (merchant_id, external_provider, external_order_key),
  ADD INDEX idx_quote_reconciliation (merchant_id, external_provider, execution_state, id);
