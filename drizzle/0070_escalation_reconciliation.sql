ALTER TABLE sales_escalation_relays
  ADD COLUMN review_revision INT NOT NULL DEFAULT 0,
  ADD COLUMN reconciled_at TIMESTAMP NULL,
  ADD COLUMN teaching_recorded_at TIMESTAMP NULL,
  ADD COLUMN next_reconcile_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN last_reconcile_error VARCHAR(60) NULL,
  ADD INDEX idx_relay_reconcile (next_reconcile_at, id);
--> statement-breakpoint
CREATE TABLE sales_escalation_reviews (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  relay_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  revision INT NOT NULL,
  evidence_hash CHAR(64) NOT NULL,
  outcome ENUM('accepted','failed','unresolved') NOT NULL,
  note VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_relay_review (merchant_id, relay_id, revision),
  CONSTRAINT fk_review_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  CONSTRAINT fk_review_relay FOREIGN KEY (relay_id) REFERENCES sales_escalation_relays(id) ON DELETE CASCADE
);
