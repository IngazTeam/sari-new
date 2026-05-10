-- Migration: Add merchant_knowledge_docs table
-- This table stores uploaded business profile documents and their extracted text content

CREATE TABLE IF NOT EXISTS merchant_knowledge_docs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type ENUM('pdf', 'docx') NOT NULL,
  file_url TEXT,
  file_size INT NOT NULL,
  extracted_text LONGTEXT,
  extraction_status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending' NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_merchant_knowledge (merchant_id),
  FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
);
