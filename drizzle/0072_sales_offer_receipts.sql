ALTER TABLE sales_offer_attempts
  ADD COLUMN instance_id INT NULL,
  ADD COLUMN provider VARCHAR(20) NULL,
  ADD COLUMN provider_account VARCHAR(100) NULL,
  ADD COLUMN dispatch_text TEXT NULL,
  ADD COLUMN dispatch_started_at DATETIME(3) NULL,
  ADD COLUMN provider_message_id VARCHAR(255) NULL,
  ADD COLUMN reconciled_at DATETIME(3) NULL,
  ADD COLUMN next_reconcile_at DATETIME(3) NULL,
  ADD COLUMN last_reconcile_error VARCHAR(64) NULL,
  ADD KEY idx_offer_reconciliation (next_reconcile_at, id);
