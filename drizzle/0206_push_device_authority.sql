-- Legacy subscriptions remain stored but must be enabled again by a live session.
ALTER TABLE push_subscriptions
  ADD COLUMN actor_user_id INT NULL,
  ADD COLUMN session_hash VARCHAR(64) NULL,
  ADD COLUMN endpoint_hash VARCHAR(64) NULL,
  ADD UNIQUE INDEX uq_push_endpoint_hash (endpoint_hash);
--> statement-breakpoint
-- A committed test marker precedes transport; a repeat can only read its outcome.
ALTER TABLE push_notification_logs
  ADD COLUMN request_id VARCHAR(36) NULL,
  ADD COLUMN request_actor_id INT NULL,
  ADD COLUMN request_hash VARCHAR(64) NULL,
  ADD UNIQUE INDEX uq_push_test_request (request_id);
