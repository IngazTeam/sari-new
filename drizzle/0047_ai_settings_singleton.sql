UPDATE `ai_settings`
   SET `id` = 1
 WHERE `id` <> 1;
--> statement-breakpoint
ALTER TABLE `ai_settings`
  ADD CONSTRAINT `ai_settings_singleton_id_check` CHECK (`id` = 1);
