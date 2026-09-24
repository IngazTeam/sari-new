CREATE TABLE booking_capacity_locks (
  merchant_id INT NOT NULL PRIMARY KEY,
  CONSTRAINT fk_booking_capacity_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);
