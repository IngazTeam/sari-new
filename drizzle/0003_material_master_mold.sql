ALTER TABLE `business_templates` ADD `business_type` enum('store','services','both') NOT NULL;--> statement-breakpoint
ALTER TABLE `business_templates` DROP COLUMN `businessType`;