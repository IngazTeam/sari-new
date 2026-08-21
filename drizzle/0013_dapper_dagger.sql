-- Fail before persistent DDL when legacy memberships would violate the new
-- one-user-per-merchant invariant. No membership is silently discarded.
CREATE TEMPORARY TABLE `_sari_member_identity_preflight` (
  `merchant_id` int NOT NULL,
  `user_id` int NOT NULL,
  PRIMARY KEY (`merchant_id`, `user_id`)
);--> statement-breakpoint
INSERT INTO `_sari_member_identity_preflight` (`merchant_id`, `user_id`)
SELECT `merchant_id`, `user_id` FROM `merchant_members`;--> statement-breakpoint
DROP TEMPORARY TABLE `_sari_member_identity_preflight`;--> statement-breakpoint
-- Legacy links exposed raw bearer values and lack a recipient HMAC. Revoke
-- pending links explicitly, then digest every historical token before adding
-- the unique token constraint. Owners can issue fresh safe invitations.
UPDATE `merchant_invitations` SET `status` = 'revoked' WHERE `status` = 'pending';--> statement-breakpoint
UPDATE `merchant_invitations` SET `token` = SHA2(`token`, 256);--> statement-breakpoint
DROP INDEX `idx_invitation_token` ON `merchant_invitations`;--> statement-breakpoint
ALTER TABLE `merchant_invitations` ADD `recipient_hash` varchar(64);--> statement-breakpoint
ALTER TABLE `merchant_invitations` ADD `accepted_by_user_id` int;--> statement-breakpoint
ALTER TABLE `merchant_invitations` ADD CONSTRAINT `merchant_invitations_token_unique` UNIQUE(`token`);--> statement-breakpoint
ALTER TABLE `merchant_invitations` ADD CONSTRAINT `merchant_invitations_pending_recipient_unique` UNIQUE(`merchant_id`,`recipient_hash`);--> statement-breakpoint
ALTER TABLE `merchant_members` ADD CONSTRAINT `merchant_members_identity_unique` UNIQUE(`merchant_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `merchant_invitations` ADD CONSTRAINT `merchant_invitations_accepted_by_user_id_users_id_fk` FOREIGN KEY (`accepted_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
