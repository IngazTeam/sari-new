CREATE TABLE booking_operation_audits (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  booking_reference INT NOT NULL,
  actor_user_id INT NOT NULL,
  request_id CHAR(36) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  operation VARCHAR(20) NOT NULL,
  before_state JSON NOT NULL,
  after_state JSON NULL,
  changed_fields JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_booking_operation_request (merchant_id,request_id),
  KEY idx_booking_operation_history (merchant_id,booking_reference,id),
  CONSTRAINT fk_booking_operation_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);
