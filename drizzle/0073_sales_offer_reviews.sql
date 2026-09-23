ALTER TABLE sales_offer_attempts
  ADD COLUMN review_revision INT NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE sales_offer_reviews (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  attempt_id VARCHAR(36) NOT NULL,
  actor_user_id INT NOT NULL,
  revision INT NOT NULL,
  evidence_hash CHAR(64) NOT NULL,
  outcome ENUM('recorded','accepted_unprojected','failed','unresolved') NOT NULL,
  delivery_state VARCHAR(20) NOT NULL,
  note VARCHAR(1000) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_offer_review (merchant_id, attempt_id, revision),
  CONSTRAINT fk_offer_review_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  CONSTRAINT fk_offer_review_attempt FOREIGN KEY (attempt_id) REFERENCES sales_offer_attempts(id) ON DELETE CASCADE
);
