CREATE TABLE `order_tracking_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`oldStatus` varchar(50) NOT NULL,
	`newStatus` varchar(50) NOT NULL,
	`trackingNumber` varchar(255),
	`notificationSent` boolean NOT NULL DEFAULT false,
	`notificationMessage` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_tracking_logs_id` PRIMARY KEY(`id`)
);
