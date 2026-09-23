CREATE TABLE sales_margin_policies (
  merchant_id INT NOT NULL PRIMARY KEY,
  enabled TINYINT NOT NULL DEFAULT 0,
  min_percent INT NOT NULL DEFAULT 0,
  revision INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_margin_policy_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE sales_margin_policy_changes (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  revision INT NOT NULL,
  evidence_hash CHAR(64) NOT NULL,
  before_policy JSON NOT NULL,
  after_policy JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_margin_policy_revision (merchant_id,revision),
  CONSTRAINT fk_margin_change_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);
