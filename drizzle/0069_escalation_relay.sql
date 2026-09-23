ALTER TABLE sari_escalation_queue ADD COLUMN source_message_id INT NULL,
  ADD COLUMN handoff_version INT NULL;
--> statement-breakpoint
CREATE TABLE sales_escalation_relays (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  escalation_id INT NOT NULL,
  instance_id INT NOT NULL,
  author_phone VARCHAR(30) NOT NULL,
  quoted_message_id VARCHAR(255) NOT NULL,
  reply_text TEXT NOT NULL,
  ownership_version INT NOT NULL,
  status ENUM('reserved','accepted','unknown','failed','suppressed') NOT NULL DEFAULT 'reserved',
  provider_message_id VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_escalation_relay (merchant_id,escalation_id),
  CONSTRAINT fk_relay_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  CONSTRAINT fk_relay_escalation FOREIGN KEY (escalation_id) REFERENCES sari_escalation_queue(id) ON DELETE CASCADE
);
