-- Add Google Analytics 4 fields to ai_settings
ALTER TABLE ai_settings ADD COLUMN ga_property_id VARCHAR(50) DEFAULT NULL;
ALTER TABLE ai_settings ADD COLUMN ga_service_account_json TEXT DEFAULT NULL;
ALTER TABLE ai_settings ADD COLUMN ga_enabled BOOLEAN NOT NULL DEFAULT FALSE;
