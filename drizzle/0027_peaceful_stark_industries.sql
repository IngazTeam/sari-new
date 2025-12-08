CREATE TABLE `rewards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`referralId` int NOT NULL,
	`rewardType` enum('discount_10','free_month','analytics_upgrade') NOT NULL,
	`status` enum('pending','claimed','expired') NOT NULL DEFAULT 'pending',
	`claimedAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rewards_id` PRIMARY KEY(`id`)
);
