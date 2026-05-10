-- Migration: Add AI Settings and Usage Logs tables

CREATE TABLE IF NOT EXISTS ai_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  openai_api_key TEXT,
  model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
  whisper_model VARCHAR(100) NOT NULL DEFAULT 'whisper-1',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  monthly_budget_limit DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT,
  request_type ENUM('chat', 'whisper', 'embedding') NOT NULL,
  model VARCHAR(100) NOT NULL,
  prompt_tokens INT DEFAULT 0,
  completion_tokens INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  audio_duration_sec INT,
  estimated_cost DECIMAL(10,6) DEFAULT 0,
  duration_ms INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_usage_merchant (merchant_id),
  INDEX idx_usage_created (created_at),
  INDEX idx_usage_type (request_type),
  FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE SET NULL
);

-- Insert default settings record
INSERT INTO ai_settings (model, whisper_model, is_active) VALUES ('gpt-4o-mini', 'whisper-1', TRUE);
