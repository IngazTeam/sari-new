CREATE TABLE ai_sales_playbooks (
  merchant_id INT NOT NULL PRIMARY KEY,
  daily_analysis JSON NULL,
  weekly_analysis JSON NULL,
  daily_updated_at DATETIME(3) NULL,
  weekly_updated_at DATETIME(3) NULL,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
  CONSTRAINT fk_sales_playbook_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);
