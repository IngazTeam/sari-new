ALTER TABLE `extracted_faqs` ADD `external_id` varchar(100);--> statement-breakpoint
ALTER TABLE `extracted_faqs` ADD `sync_source` enum('extracted','api') DEFAULT 'extracted' NOT NULL;--> statement-breakpoint
ALTER TABLE `extracted_faqs` ADD `source_status` enum('active','archived') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `extracted_faqs` ADD CONSTRAINT `uq_extracted_faq_source` UNIQUE(`merchant_id`,`sync_source`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_extracted_faq_bot` ON `extracted_faqs` (`merchant_id`,`source_status`,`is_active`,`use_in_bot`,`id`);
