CREATE TABLE `campaignLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`customerId` int,
	`customerPhone` varchar(20) NOT NULL,
	`customerName` varchar(255),
	`status` enum('success','failed','pending') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaignLogs_id` PRIMARY KEY(`id`)
);
