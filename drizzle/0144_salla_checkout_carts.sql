CREATE TABLE IF NOT EXISTS salla_checkout_carts (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  attempt_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  state ENUM('preparing','dispatching','ready','rejected','review') NOT NULL,
  snapshot JSON NULL,
  result_json JSON NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_salla_cart_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  UNIQUE KEY salla_cart_request (merchant_id,request_id),
  KEY salla_cart_review (merchant_id,state,id),
  CONSTRAINT chk_salla_cart_state CHECK (
    actor_user_id>0 AND REGEXP_LIKE(request_hash,'^[0-9a-f]{64}$','c')
    AND (state NOT IN ('dispatching','ready') OR snapshot IS NOT NULL)
    AND ((state='ready' AND result_json IS NOT NULL) OR (state<>'ready' AND result_json IS NULL))
  )
);
