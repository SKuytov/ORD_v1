-- Migration 011: CAD Documentation Workflow
-- Compatible with MySQL 5.7+

SET @dbname = DATABASE();
SET @tbl = 'orders';

SET @col = 'requires_cad';
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME=@tbl AND COLUMN_NAME=@col) = 0,
  CONCAT('ALTER TABLE `', @tbl, '` ADD COLUMN `', @col, '` TINYINT(1) NOT NULL DEFAULT 0'),
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = 'cad_assigned_to_user_id';
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME=@tbl AND COLUMN_NAME=@col) = 0,
  CONCAT('ALTER TABLE `', @tbl, '` ADD COLUMN `', @col, '` INT DEFAULT NULL'),
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = 'cad_status';
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME=@tbl AND COLUMN_NAME=@col) = 0,
  CONCAT('ALTER TABLE `', @tbl, '` ADD COLUMN `', @col, '` ENUM(\'not_started\',\'in_progress\',\'review_needed\',\'approved\',\'delivered\') DEFAULT NULL'),
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS cad_log_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  user_id INT NOT NULL,
  entry_type ENUM('progress','question','reply','status_change','file_ref') NOT NULL,
  content TEXT NOT NULL,
  addressed_to_user_id INT DEFAULT NULL,
  parent_entry_id INT DEFAULT NULL,
  is_answered TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
