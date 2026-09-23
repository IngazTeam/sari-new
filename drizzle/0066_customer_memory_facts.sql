ALTER TABLE customer_profiles ADD COLUMN memory_forget_before_message_id INT NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE customer_memory_facts (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  profile_id INT NOT NULL,
  merchant_id INT NOT NULL,
  field_key VARCHAR(40) NOT NULL,
  value_json JSON NULL,
  source_kind ENUM('explicit','inferred') NOT NULL,
  source_message_id INT NOT NULL,
  conversation_id INT NOT NULL,
  observed_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  deleted TINYINT NOT NULL DEFAULT 0,
  revision INT NOT NULL DEFAULT 1,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_memory_profile FOREIGN KEY (profile_id) REFERENCES customer_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_memory_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  UNIQUE KEY uq_memory_profile_field (profile_id, field_key),
  KEY idx_memory_merchant (merchant_id, profile_id)
);
