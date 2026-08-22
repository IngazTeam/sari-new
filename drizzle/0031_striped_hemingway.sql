ALTER TABLE `whatsapp_instances` ADD `active_phone_identity_hash` varchar(64);--> statement-breakpoint
UPDATE `whatsapp_instances`
   SET `active_phone_identity_hash` = SHA2(
     CASE
       WHEN LEFT(REGEXP_REPLACE(`phone_number`, '[^0-9]', ''), 2) = '00'
         THEN SUBSTRING(REGEXP_REPLACE(`phone_number`, '[^0-9]', ''), 3)
       ELSE REGEXP_REPLACE(`phone_number`, '[^0-9]', '')
     END,
     256
   )
 WHERE `status` = 'active' AND `phone_number` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsapp_instances` ADD CONSTRAINT `whatsapp_instances_active_phone_identity_unique` UNIQUE(`active_phone_identity_hash`);
