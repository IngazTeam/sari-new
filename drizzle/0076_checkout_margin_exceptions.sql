CREATE TABLE checkout_margin_exceptions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  order_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  evidence_hash CHAR(64) NOT NULL,
  assessment JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_margin_exception_order (order_id),
  KEY idx_margin_exception_merchant (merchant_id,order_id),
  CONSTRAINT fk_margin_exception_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  CONSTRAINT fk_margin_exception_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
