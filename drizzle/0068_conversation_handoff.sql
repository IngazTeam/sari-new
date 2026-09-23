ALTER TABLE conversations ADD COLUMN handoff_version INT NOT NULL DEFAULT 0,
  ADD COLUMN automation_after_message_id INT NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE messages ADD COLUMN sender_type ENUM('customer','assistant','merchant','unknown') NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
UPDATE messages SET sender_type='customer' WHERE direction='incoming';
