CREATE TABLE booking_payment_link_renewals (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  booking_id INT NOT NULL,
  payment_link_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  prior_expires_at DATETIME(3) NOT NULL,
  renewed_expires_at DATETIME(3) NOT NULL,
  evidence_hash CHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_booking_link_renewal_evidence (payment_link_id,evidence_hash),
  KEY idx_booking_link_renewal_booking (booking_id,id),
  CONSTRAINT fk_booking_link_renewal_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  CONSTRAINT fk_booking_link_renewal_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_booking_link_renewal_link FOREIGN KEY (payment_link_id) REFERENCES payment_links(id) ON DELETE CASCADE
);
