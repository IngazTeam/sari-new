CREATE TABLE `whatsapp_connection_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`countryCode` varchar(10) NOT NULL,
	`phoneNumber` varchar(20) NOT NULL,
	`fullNumber` varchar(30) NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`rejectionReason` text,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_connection_requests_id` PRIMARY KEY(`id`)
);
