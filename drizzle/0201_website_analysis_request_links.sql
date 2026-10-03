ALTER TABLE `website_analysis_jobs` ADD UNIQUE KEY `uq_website_job_scope_id` (`merchant_id`,`id`);
--> statement-breakpoint
CREATE TABLE `website_analysis_request_links` (
 `merchant_id` INT NOT NULL,
 `request_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 `job_pk` INT NOT NULL,
 `actor_id` INT NOT NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`merchant_id`,`request_id`),
 KEY `idx_website_request_job` (`merchant_id`,`job_pk`),
 CONSTRAINT `fk_website_request_job` FOREIGN KEY (`merchant_id`,`job_pk`) REFERENCES `website_analysis_jobs` (`merchant_id`,`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
