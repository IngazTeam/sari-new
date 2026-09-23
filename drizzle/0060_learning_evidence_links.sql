CREATE TABLE ai_learning_evidence_links (
  proposal_id BIGINT UNSIGNED NOT NULL,
  signal_id INT NOT NULL,
  merchant_id INT NOT NULL,
  relation VARCHAR(16) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (proposal_id, signal_id, relation),
  KEY idx_evidence_merchant (merchant_id, proposal_id),
  CONSTRAINT fk_evidence_proposal FOREIGN KEY (proposal_id) REFERENCES ai_learning_proposals(id) ON DELETE CASCADE,
  CONSTRAINT fk_evidence_signal FOREIGN KEY (signal_id) REFERENCES sari_learning_signals(id) ON DELETE CASCADE,
  CONSTRAINT fk_evidence_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);
