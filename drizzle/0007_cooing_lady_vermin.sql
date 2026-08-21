ALTER TABLE `data_subject_requests` ADD `resolution_notes` text;--> statement-breakpoint
ALTER TABLE `data_subject_requests` ADD `handled_by_user_id` int;--> statement-breakpoint
ALTER TABLE `data_subject_requests` ADD CONSTRAINT `data_subject_requests_handled_by_user_id_users_id_fk` FOREIGN KEY (`handled_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;