-- =============================================
-- Migration: Advanced Product Options
-- Date: 2026-05-12
-- =============================================

-- 1. Add new columns to products table
ALTER TABLE products
  ADD COLUMN category_id INT NULL AFTER category,
  ADD COLUMN sku VARCHAR(100) NULL AFTER stock,
  ADD COLUMN barcode VARCHAR(100) NULL AFTER sku,
  ADD COLUMN compare_at_price INT NULL AFTER barcode,
  ADD COLUMN cost_price INT NULL AFTER compare_at_price,
  ADD COLUMN weight VARCHAR(20) NULL AFTER cost_price,
  ADD COLUMN track_inventory TINYINT NOT NULL DEFAULT 1 AFTER weight,
  ADD COLUMN low_stock_alert INT DEFAULT 5 AFTER track_inventory,
  ADD COLUMN images TEXT NULL AFTER low_stock_alert,
  ADD COLUMN tags TEXT NULL AFTER images,
  ADD COLUMN product_type ENUM('physical','digital','service') DEFAULT 'physical' AFTER tags,
  ADD COLUMN status ENUM('active','draft','archived') NOT NULL DEFAULT 'active' AFTER product_type,
  ADD COLUMN has_variants TINYINT NOT NULL DEFAULT 0 AFTER status;

-- 2. Create product_categories table
CREATE TABLE IF NOT EXISTS product_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  merchant_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  name_en VARCHAR(100) NULL,
  parent_id INT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
  INDEX idx_cat_merchant (merchant_id)
);

-- 3. Create product_options table
CREATE TABLE IF NOT EXISTS product_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  merchant_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  name_en VARCHAR(100) NULL,
  `values` TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_option_product (product_id)
);

-- 4. Create product_variants table
CREATE TABLE IF NOT EXISTS product_variants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  merchant_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100) NULL,
  price INT NULL,
  compare_at_price INT NULL,
  cost_price INT NULL,
  stock INT DEFAULT 0,
  barcode VARCHAR(100) NULL,
  weight VARCHAR(20) NULL,
  image_url VARCHAR(500) NULL,
  options TEXT NULL,
  is_active TINYINT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_variant_product (product_id),
  INDEX idx_variant_merchant (merchant_id)
);
