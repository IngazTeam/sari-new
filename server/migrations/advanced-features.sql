-- Sari Advanced Features Migration
-- Human Takeover + Smart Groups + Virtual Team

-- 1. Conversations: Human Takeover fields
ALTER TABLE conversations ADD COLUMN human_takeover TINYINT NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN human_takeover_at TIMESTAMP NULL;
ALTER TABLE conversations ADD COLUMN human_expires_at TIMESTAMP NULL;
ALTER TABLE conversations ADD COLUMN current_agent_id INT NULL;
ALTER TABLE conversations ADD COLUMN agent_history TEXT NULL;

-- 2. Bot Settings: Takeover + Group settings
ALTER TABLE bot_settings ADD COLUMN takeover_timeout_minutes INT DEFAULT 15;
ALTER TABLE bot_settings ADD COLUMN takeover_resume_message TEXT NULL;
ALTER TABLE bot_settings ADD COLUMN takeover_commands_enabled TINYINT NOT NULL DEFAULT 1;
ALTER TABLE bot_settings ADD COLUMN group_mode ENUM('disabled','mention_only','keyword_only','private_redirect') NOT NULL DEFAULT 'disabled';
ALTER TABLE bot_settings ADD COLUMN group_keywords TEXT NULL;
ALTER TABLE bot_settings ADD COLUMN group_redirect_message TEXT NULL;

-- 3. Virtual Agents table
CREATE TABLE IF NOT EXISTS virtual_agents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(100) NOT NULL,
  department VARCHAR(100),
  personality_prompt TEXT NOT NULL,
  tone ENUM('friendly','professional','casual','empathetic','persuasive') NOT NULL DEFAULT 'friendly',
  avatar_emoji VARCHAR(10) DEFAULT '👩‍💼',
  is_default TINYINT NOT NULL DEFAULT 0,
  is_active TINYINT NOT NULL DEFAULT 1,
  trigger_keywords TEXT NULL,
  trigger_intents TEXT NULL,
  shift_start VARCHAR(5) NULL,
  shift_end VARCHAR(5) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX virtual_agents_merchant_id_idx (merchant_id),
  FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);
