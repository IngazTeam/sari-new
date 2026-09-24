ALTER TABLE appointments
  ADD COLUMN calendar_event_reference VARCHAR(40) NULL,
  ADD COLUMN calendar_review_revision INT NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE appointment_calendar_reviews (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  appointment_reference INT NOT NULL,
  actor_user_id INT NOT NULL,
  request_id CHAR(36) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  revision INT NOT NULL,
  action VARCHAR(30) NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  outcome VARCHAR(30) NOT NULL,
  failure_code VARCHAR(40) NULL,
  operator_reason VARCHAR(500) NOT NULL,
  manual_binding TINYINT NOT NULL DEFAULT 0,
  proof_hash CHAR(64) NOT NULL,
  before_state JSON NOT NULL,
  after_state JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_appointment_review_request (merchant_id,request_id),
  UNIQUE KEY uq_appointment_review_revision (merchant_id,appointment_reference,revision),
  CONSTRAINT fk_appointment_review_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);
