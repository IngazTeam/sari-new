UPDATE `sari_api_keys`
SET `permissions` = JSON_OBJECT(
  'version', 1,
  'scopes', JSON_ARRAY(
    'merchant:read', 'brain:read', 'brain:test', 'brain:write',
    'products:read', 'products:write', 'faqs:read', 'faqs:write',
    'conversations:read', 'analytics:read', 'trainees:write', 'settings:write',
    'integrations:read', 'integrations:write', 'conversions:read', 'conversions:write',
    'instances:read', 'instances:write'
  )
);--> statement-breakpoint
ALTER TABLE `sari_api_keys` MODIFY COLUMN `permissions` text NOT NULL;
