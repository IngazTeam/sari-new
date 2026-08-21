ALTER TABLE `platform_integrations` ADD `webhook_endpoint_id` varchar(48);--> statement-breakpoint
ALTER TABLE `platform_integrations` ADD `webhook_auth_hash` varchar(64);--> statement-breakpoint
ALTER TABLE `zid_webhooks` ADD `payload_hash` varchar(64);--> statement-breakpoint
ALTER TABLE `zid_webhooks` ADD `attempt_count` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `zid_webhooks` ADD `claimed_at` timestamp;--> statement-breakpoint
ALTER TABLE `platform_integrations` ADD CONSTRAINT `platform_integrations_webhook_endpoint_unique` UNIQUE(`webhook_endpoint_id`);--> statement-breakpoint
ALTER TABLE `zid_webhooks` ADD CONSTRAINT `zid_webhooks_merchant_payload_unique` UNIQUE(`merchant_id`,`payload_hash`);