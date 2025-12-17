ALTER TABLE `messages` MODIFY COLUMN `messageType` enum('text','voice','image','document') NOT NULL DEFAULT 'text';--> statement-breakpoint
ALTER TABLE `messages` ADD `mediaUrl` varchar(500);--> statement-breakpoint
ALTER TABLE `messages` ADD `aiwResponse` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `isFromCustomer` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `externalId` varchar(255);--> statement-breakpoint
ALTER TABLE `messages` DROP COLUMN `aiResponse`;