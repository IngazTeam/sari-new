-- Message Delivery Log — tracks every incoming message and its outcome
CREATE TABLE IF NOT EXISTS `message_delivery_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `merchant_id` INT NOT NULL,
  `instance_id` VARCHAR(255),
  `customer_phone` VARCHAR(30) NOT NULL,
  `customer_name` VARCHAR(255),
  `message_type` ENUM('text','voice','image','video','document','other') NOT NULL DEFAULT 'text',
  `status` ENUM('delivered','failed','dropped') NOT NULL,
  `failure_reason` VARCHAR(255),
  `failure_details` TEXT,
  `response_time_ms` INT,
  `source` ENUM('webhook','polling') NOT NULL DEFAULT 'webhook',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_mdl_merchant` (`merchant_id`),
  INDEX `idx_mdl_status` (`status`),
  INDEX `idx_mdl_created` (`created_at`),
  INDEX `idx_mdl_merchant_status` (`merchant_id`, `status`, `created_at`)
);
