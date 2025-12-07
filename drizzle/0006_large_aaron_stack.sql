CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoice_number` varchar(50) NOT NULL,
	`payment_id` int NOT NULL,
	`merchant_id` int NOT NULL,
	`subscription_id` int,
	`amount` int NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'SAR',
	`status` enum('draft','sent','paid','cancelled') NOT NULL DEFAULT 'paid',
	`pdf_path` text,
	`pdf_url` text,
	`email_sent` boolean NOT NULL DEFAULT false,
	`email_sent_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_invoice_number_unique` UNIQUE(`invoice_number`)
);
