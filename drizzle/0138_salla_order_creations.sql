CREATE TABLE IF NOT EXISTS salla_order_creations (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  attempt_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  state ENUM('preparing','dispatching','completed','rejected','review') NOT NULL,
  store_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  connection_id INT NULL,
  local_order_id INT NULL,
  result_json JSON NULL,
  error_code VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY salla_creation_request (merchant_id,request_id),
  UNIQUE KEY salla_creation_order (local_order_id),
  KEY salla_creation_review (merchant_id,state,id),
  CONSTRAINT salla_creation_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  CONSTRAINT chk_salla_creation_state CHECK (
    actor_user_id>0 AND REGEXP_LIKE(request_hash,'^[0-9a-f]{64}$','c')
    AND ((store_id IS NULL AND connection_id IS NULL) OR (store_id IS NOT NULL AND connection_id IS NOT NULL AND connection_id>0 AND REGEXP_LIKE(store_id,'^[1-9][0-9]{0,19}$','c')))
    AND (state NOT IN ('dispatching','completed') OR (store_id IS NOT NULL AND connection_id IS NOT NULL))
    AND ((state='completed' AND local_order_id IS NOT NULL AND local_order_id>0 AND result_json IS NOT NULL)
      OR (state<>'completed' AND local_order_id IS NULL AND result_json IS NULL))
  )
);
