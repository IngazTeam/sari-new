CREATE TABLE sales_followup_policies (
  merchant_id INT NOT NULL PRIMARY KEY,
  enabled TINYINT NOT NULL DEFAULT 1,
  time_zone VARCHAR(64) NOT NULL,
  start_hour INT NOT NULL DEFAULT 8,
  end_hour INT NOT NULL DEFAULT 23,
  weekly_limit INT NOT NULL DEFAULT 3,
  revision INT NOT NULL DEFAULT 1,
  updated_by INT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_followup_policy_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE sales_followup_dispatches (
  followup_id INT NOT NULL PRIMARY KEY,
  merchant_id INT NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  admitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  state ENUM('reserved','accepted','unknown','released') NOT NULL DEFAULT 'reserved',
  settled_at DATETIME(3) NULL,
  CONSTRAINT fk_followup_dispatch_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  KEY idx_followup_dispatch_quota (merchant_id,customer_phone,admitted_at)
);
--> statement-breakpoint
ALTER TABLE sales_followups ADD COLUMN schedule_timezone VARCHAR(64) NULL;
