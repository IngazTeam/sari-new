CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`sallaOrderId` varchar(100),
	`orderNumber` varchar(100),
	`customerPhone` varchar(20) NOT NULL,
	`customerName` varchar(255) NOT NULL,
	`customerEmail` varchar(255),
	`address` text,
	`city` varchar(100),
	`items` text NOT NULL,
	`totalAmount` int NOT NULL,
	`discountCode` varchar(50),
	`status` enum('pending','paid','processing','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
	`paymentUrl` text,
	`trackingNumber` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `salla_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`storeUrl` varchar(255) NOT NULL,
	`accessToken` text NOT NULL,
	`syncStatus` enum('active','syncing','error','paused') NOT NULL DEFAULT 'active',
	`lastSyncAt` timestamp,
	`syncErrors` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `salla_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `salla_connections_merchantId_unique` UNIQUE(`merchantId`)
);
--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`syncType` enum('full_sync','stock_sync','single_product') NOT NULL,
	`status` enum('success','failed','in_progress') NOT NULL,
	`itemsSynced` int NOT NULL DEFAULT 0,
	`errors` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `sync_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `products` ADD `sallaProductId` varchar(100);--> statement-breakpoint
ALTER TABLE `products` ADD `lastSyncedAt` timestamp;