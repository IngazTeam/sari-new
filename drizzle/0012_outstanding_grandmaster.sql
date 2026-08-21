ALTER TABLE `merchants` ADD `provision_idempotency_hash` varchar(64);--> statement-breakpoint
ALTER TABLE `merchants` ADD `provision_payload_hash` varchar(64);--> statement-breakpoint
ALTER TABLE `merchants` ADD CONSTRAINT `merchants_platform_provision_unique` UNIQUE(`integration_source`,`provision_idempotency_hash`);