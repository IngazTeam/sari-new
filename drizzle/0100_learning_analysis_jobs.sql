-- One durable analysis slot per merchant. A dispatched request is never lease-retried.
CREATE TABLE ai_learning_analysis_jobs (
 merchant_id INT NOT NULL PRIMARY KEY,
 source_digest CHAR(64) NOT NULL,
 source_ids JSON NOT NULL,
 claim_token CHAR(36) NOT NULL,
 state VARCHAR(16) NOT NULL,
 lease_until DATETIME(3) NULL,
 response_json JSON NULL,
 response_hash CHAR(64) NULL,
 failure_code VARCHAR(40) NULL,
 generation INT NULL,
 proposal_count INT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 CONSTRAINT chk_learning_job_state CHECK (state IN ('reserved','dispatched','responded','applied','stale','invalid','uncertain')),
 CONSTRAINT fk_learning_job_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);
