ALTER TABLE sales_quotations
  ADD COLUMN external_provider VARCHAR(20) NULL,
  ADD COLUMN external_snapshot JSON NULL,
  ADD COLUMN execution_state ENUM('ready', 'processing', 'succeeded', 'unknown') NULL,
  ADD COLUMN external_result JSON NULL;
