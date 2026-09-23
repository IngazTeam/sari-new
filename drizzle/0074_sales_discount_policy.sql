ALTER TABLE bot_settings ADD COLUMN auto_discount_revision INT NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE sales_offer_attempts ADD COLUMN issuance_authorization JSON NULL;
--> statement-breakpoint
CREATE TABLE sales_discount_policy_changes (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  revision INT NOT NULL,
  evidence_hash CHAR(64) NOT NULL,
  before_policy JSON NOT NULL,
  after_policy JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_discount_policy_revision (merchant_id,revision),
  CONSTRAINT fk_discount_policy_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);
