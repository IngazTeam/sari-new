CREATE TABLE appointment_creation_requests (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  request_id CHAR(36) NOT NULL,
  actor_user_id INT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  appointment_reference INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_appointment_creation_request (merchant_id,request_id),
  UNIQUE KEY uq_appointment_creation_reference (merchant_id,appointment_reference),
  CONSTRAINT fk_appointment_creation_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);
