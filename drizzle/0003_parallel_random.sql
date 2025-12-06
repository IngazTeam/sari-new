CREATE TABLE `planChangeLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`planId` int NOT NULL,
	`changedBy` int NOT NULL,
	`fieldName` varchar(100) NOT NULL,
	`oldValue` text,
	`newValue` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `planChangeLogs_id` PRIMARY KEY(`id`)
);
