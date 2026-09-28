CREATE TABLE IF NOT EXISTS scheduled_reports (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  report_type ENUM('daily','weekly','monthly','custom') NOT NULL,
  schedule_day INT NOT NULL DEFAULT 0,
  schedule_time VARCHAR(5) NOT NULL DEFAULT '09:00',
  delivery_method ENUM('email','whatsapp','both') NOT NULL DEFAULT 'email',
  recipient_email VARCHAR(320) NULL,
  recipient_phone VARCHAR(32) NULL,
  include_conversations BOOLEAN NOT NULL DEFAULT TRUE,
  include_orders BOOLEAN NOT NULL DEFAULT TRUE,
  include_revenue BOOLEAN NOT NULL DEFAULT TRUE,
  include_products BOOLEAN NOT NULL DEFAULT TRUE,
  include_customers BOOLEAN NOT NULL DEFAULT TRUE,
  include_appointments BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_sent_at DATETIME NULL,
  next_send_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_scheduled_report_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  KEY idx_scheduled_report_merchant (merchant_id, created_at),
  KEY idx_scheduled_report_due (is_active, next_send_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS whatsapp_auto_notifications (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  trigger_type VARCHAR(64) NOT NULL,
  message_template TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  delay_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_auto_notification_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  KEY idx_auto_notification_trigger (merchant_id, trigger_type, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS integration_stats (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  platform VARCHAR(64) NOT NULL,
  stat_date DATE NOT NULL,
  sync_count INT UNSIGNED NOT NULL DEFAULT 0,
  success_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_sync_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_integration_stat_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  UNIQUE KEY uq_integration_stat_day (merchant_id, platform, stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS integration_errors (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  platform VARCHAR(64) NOT NULL,
  error_type VARCHAR(100) NOT NULL,
  error_message TEXT NULL,
  error_details TEXT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_integration_error_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  KEY idx_integration_error_merchant (merchant_id, resolved, created_at),
  KEY idx_integration_error_platform (merchant_id, platform, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
