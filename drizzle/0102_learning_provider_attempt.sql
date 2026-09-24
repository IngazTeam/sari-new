-- Existing jobs retain their state and response. Never guess a historical provider identity.
ALTER TABLE ai_learning_analysis_jobs
 ADD COLUMN ai_reservation_key CHAR(64) NULL,
 ADD UNIQUE KEY uq_learning_ai_reservation (ai_reservation_key);
