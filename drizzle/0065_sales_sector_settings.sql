CREATE TABLE ai_sales_sector_settings (
  merchant_id INT NOT NULL PRIMARY KEY,
  playbook_id VARCHAR(64) NOT NULL,
  revision INT NOT NULL DEFAULT 1,
  updated_by INT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_sales_sector_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);
