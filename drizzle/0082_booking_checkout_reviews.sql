ALTER TABLE booking_checkout_attempts ADD COLUMN review_revision INT NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE booking_checkout_reviews (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  attempt_id CHAR(36) NOT NULL,
  revision INT NOT NULL,
  actor_user_id INT NOT NULL,
  charge_id VARCHAR(255) NOT NULL,
  outcome VARCHAR(20) NOT NULL,
  reason VARCHAR(40) NULL,
  provider_status VARCHAR(32) NULL,
  proof_hash CHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_booking_checkout_review_revision (attempt_id,revision),
  CONSTRAINT fk_booking_checkout_review_attempt FOREIGN KEY (attempt_id) REFERENCES booking_checkout_attempts(id) ON DELETE CASCADE
);
