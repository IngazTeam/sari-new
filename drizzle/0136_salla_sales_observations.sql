CREATE TABLE IF NOT EXISTS salla_sales_observations (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  store_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  order_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  observed_state ENUM('pending','paid','processing','shipped','delivered','cancelled') NOT NULL,
  provider_status VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  receipt_id INT NOT NULL,
  event_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  first_observed_at DATETIME(3) NOT NULL,
  UNIQUE KEY salla_observation_scope_state (merchant_id,store_id,order_id,observed_state),
  UNIQUE KEY salla_observation_receipt (receipt_id),
  CONSTRAINT salla_observation_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  CONSTRAINT salla_observation_receipt_fk FOREIGN KEY (receipt_id) REFERENCES salla_webhook_receipts(id) ON DELETE CASCADE,
  CONSTRAINT chk_salla_observation_ids CHECK (REGEXP_LIKE(store_id,'^[1-9][0-9]{0,19}$','c') AND REGEXP_LIKE(order_id,'^[1-9][0-9]{0,19}$','c')),
  CONSTRAINT chk_salla_observation_source CHECK (REGEXP_LIKE(event_key,'^[a-f0-9]{64}$','c') AND REGEXP_LIKE(provider_status,'^[a-z_]{1,40}$','c'))
);
