CREATE TABLE IF NOT EXISTS loyalty_action_receipts (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 merchant_id INT NOT NULL,
 actor_id INT NOT NULL,
 request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 result_json JSON NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_loyalty_request (merchant_id,request_key),
 CONSTRAINT fk_loyalty_receipt_merchant FOREIGN KEY (merchant_id) REFERENCES merchants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
