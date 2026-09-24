ALTER TABLE payment_links ADD COLUMN booking_checkout_policy_version INT NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE booking_checkout_attempts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  merchant_id INT NOT NULL,
  booking_id INT NOT NULL,
  payment_link_id INT NOT NULL,
  request_id CHAR(36) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  provider_reference VARCHAR(100) NOT NULL,
  amount_minor INT NOT NULL,
  currency CHAR(3) NOT NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'dispatching',
  payment_id INT NULL,
  failure_code VARCHAR(40) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  active_booking_id INT GENERATED ALWAYS AS (CASE WHEN state IN ('dispatching','unknown','created') THEN booking_id ELSE NULL END) VIRTUAL,
  UNIQUE KEY uq_booking_checkout_request (payment_link_id,request_id),
  UNIQUE KEY uq_booking_checkout_active (active_booking_id),
  UNIQUE KEY uq_booking_checkout_reference (provider_reference),
  CONSTRAINT fk_booking_checkout_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  CONSTRAINT fk_booking_checkout_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_booking_checkout_link FOREIGN KEY (payment_link_id) REFERENCES payment_links(id) ON DELETE CASCADE
);
