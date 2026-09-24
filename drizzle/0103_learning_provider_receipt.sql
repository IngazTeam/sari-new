-- Only newly acknowledged jobs carry a receipt. Never infer historical provider identities.
ALTER TABLE ai_learning_analysis_jobs ADD COLUMN provider_receipt JSON NULL;
