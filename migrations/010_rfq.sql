-- Migration 010: RFQ (Request for Quote) System
-- Compatible with MySQL 5.7+

CREATE TABLE IF NOT EXISTS rfqs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rfq_number VARCHAR(50) NOT NULL UNIQUE,
  supplier_id INT NULL,
  supplier_name VARCHAR(255) NOT NULL,
  created_by_user_id INT NOT NULL,
  status ENUM('draft','sent','response_received','accepted','rejected') NOT NULL DEFAULT 'draft',
  notes TEXT,
  sent_at TIMESTAMP NULL DEFAULT NULL,
  response_due_date DATE NULL,
  response_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rfq_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rfq_id INT NOT NULL,
  order_id INT NOT NULL,
  FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add supplier assignment fields to orders
SET @dbname = DATABASE();
SET @tbl = 'orders';

SET @col = 'assigned_supplier_id';
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME=@tbl AND COLUMN_NAME=@col) = 0,
  CONCAT('ALTER TABLE `', @tbl, '` ADD COLUMN `', @col, '` INT DEFAULT NULL'),
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = 'assigned_supplier_name';
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME=@tbl AND COLUMN_NAME=@col) = 0,
  CONCAT('ALTER TABLE `', @tbl, '` ADD COLUMN `', @col, '` VARCHAR(255) DEFAULT NULL'),
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = 'rfq_id';
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME=@tbl AND COLUMN_NAME=@col) = 0,
  CONCAT('ALTER TABLE `', @tbl, '` ADD COLUMN `', @col, '` INT DEFAULT NULL'),
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
