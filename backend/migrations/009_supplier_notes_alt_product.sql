-- Migration 009: Add supplier notes and alternative product fields
-- Safe to run multiple times (uses IF NOT EXISTS checks via information_schema)

SET @dbname = DATABASE();

-- Add supplier_notes column if not exists
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'supplier_notes') = 0,
    'ALTER TABLE orders ADD COLUMN supplier_notes TEXT NULL AFTER notes',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add alternative_product_name column if not exists
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'alternative_product_name') = 0,
    'ALTER TABLE orders ADD COLUMN alternative_product_name VARCHAR(255) NULL AFTER supplier_notes',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add alternative_product_description column if not exists
SET @sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'alternative_product_description') = 0,
    'ALTER TABLE orders ADD COLUMN alternative_product_description TEXT NULL AFTER alternative_product_name',
    'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Migration 009 complete' as result;
