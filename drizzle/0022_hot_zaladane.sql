CREATE TABLE `testConversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`endedAt` timestamp,
	`messageCount` int NOT NULL DEFAULT 0,
	`hasDeal` boolean NOT NULL DEFAULT false,
	`dealValue` int,
	`dealMarkedAt` timestamp,
	`satisfactionRating` int,
	`npsScore` int,
	`wasCompleted` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `testConversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `testDeals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`merchantId` int NOT NULL,
	`dealValue` int NOT NULL,
	`timeToConversion` int,
	`messageCount` int NOT NULL,
	`markedAt` timestamp NOT NULL DEFAULT (now()),
	`wasCompleted` boolean NOT NULL DEFAULT false,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `testDeals_id` PRIMARY KEY(`id`),
	CONSTRAINT `testDeals_conversationId_unique` UNIQUE(`conversationId`)
);
--> statement-breakpoint
CREATE TABLE `testMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`sender` enum('user','sari') NOT NULL,
	`content` text NOT NULL,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`responseTime` int,
	`rating` enum('positive','negative'),
	`ratedAt` timestamp,
	`productsRecommended` text,
	`wasClicked` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `testMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `testMetricsDaily` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantId` int NOT NULL,
	`date` date NOT NULL,
	`totalConversations` int NOT NULL DEFAULT 0,
	`totalDeals` int NOT NULL DEFAULT 0,
	`conversionRate` int NOT NULL DEFAULT 0,
	`totalRevenue` int NOT NULL DEFAULT 0,
	`avgDealValue` int NOT NULL DEFAULT 0,
	`avgResponseTime` int NOT NULL DEFAULT 0,
	`avgConversationLength` int NOT NULL DEFAULT 0,
	`avgTimeToConversion` int NOT NULL DEFAULT 0,
	`totalMessages` int NOT NULL DEFAULT 0,
	`positiveRatings` int NOT NULL DEFAULT 0,
	`negativeRatings` int NOT NULL DEFAULT 0,
	`satisfactionRate` int NOT NULL DEFAULT 0,
	`completedConversations` int NOT NULL DEFAULT 0,
	`engagementRate` int NOT NULL DEFAULT 0,
	`returningUsers` int NOT NULL DEFAULT 0,
	`productClicks` int NOT NULL DEFAULT 0,
	`completedOrders` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `testMetricsDaily_id` PRIMARY KEY(`id`)
);
