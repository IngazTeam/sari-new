CREATE TABLE IF NOT EXISTS salla_effect_reviews (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  reviewer_user_id INT NOT NULL,
  effect_id INT NOT NULL,
  order_id INT NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  snapshot JSON NOT NULL,
  snapshot_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY salla_effect_review_request (merchant_id,request_id),
  KEY salla_effect_review_history (merchant_id,order_id,id),
  CONSTRAINT salla_effect_review_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);
