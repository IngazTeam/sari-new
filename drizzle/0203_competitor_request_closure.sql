ALTER TABLE `competitor_analysis_jobs`
 MODIFY `competitor_id` INT NULL,
 MODIFY `state` ENUM('running','completed','failed','interrupted','closed') NOT NULL DEFAULT 'running',
 ADD CONSTRAINT `ck_competitor_job_reference` CHECK ((`state` = 'closed' AND `competitor_id` IS NULL) OR (`state` <> 'closed' AND `competitor_id` IS NOT NULL));
