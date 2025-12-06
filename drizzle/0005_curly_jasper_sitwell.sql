CREATE TABLE `payment_gateways` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gateway` enum('tap','paypal') NOT NULL,
	`isEnabled` boolean NOT NULL DEFAULT false,
	`publicKey` text,
	`secretKey` text,
	`webhookSecret` text,
	`testMode` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payment_gateways_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_gateways_gateway_unique` UNIQUE(`gateway`)
);
