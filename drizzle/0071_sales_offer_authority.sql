CREATE TABLE sales_offer_limits (
  merchant_id INT NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  last_issued_at DATETIME(3) NULL,
  last_share_at DATETIME(3) NULL,
  PRIMARY KEY (merchant_id, customer_phone),
  CONSTRAINT fk_offer_limit_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE sales_offer_attempts (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  merchant_id INT NOT NULL,
  conversation_id INT NOT NULL,
  source_message_id INT NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  kind ENUM('issue','share') NOT NULL,
  state ENUM('issued','reserved','dispatching','accepted','unknown','cancelled') NOT NULL,
  discount_code_id INT NOT NULL,
  evidence JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_offer_source (merchant_id, source_message_id, kind),
  KEY idx_offer_customer (merchant_id, customer_phone, created_at),
  CONSTRAINT fk_offer_attempt_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);
