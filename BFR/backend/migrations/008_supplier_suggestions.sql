-- Migration 008: Phase 1 - Smart Supplier Suggestions
-- This table logs which suppliers were selected for which orders to improve future suggestions

CREATE TABLE IF NOT EXISTS supplier_selection_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    supplier_id INT NOT NULL,
    selected_by_user_id INT NOT NULL,
    from_suggestion BOOLEAN DEFAULT FALSE COMMENT 'Was this supplier selected from the suggestions?',
    suggestion_rank INT NULL COMMENT 'If from suggestion, what rank was it (1, 2, or 3)?',
    selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
    FOREIGN KEY (selected_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    UNIQUE KEY unique_order_selection (order_id),
    KEY idx_supplier_learning (supplier_id, order_id),
    KEY idx_selected_at (selected_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add specialization field to suppliers table (safe: checks if column exists first)
SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'suppliers' 
    AND COLUMN_NAME = 'specialization'
);

SET @query = IF(
    @col_exists = 0,
    'ALTER TABLE suppliers ADD COLUMN specialization VARCHAR(200) NULL COMMENT "Supplier specialization/expertise area" AFTER notes',
    'SELECT "Column specialization already exists" AS message'
);

PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index on suppliers.specialization for faster matching (safe: checks if index exists first)
SET @idx_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'suppliers' 
    AND INDEX_NAME = 'idx_specialization'
);

SET @query = IF(
    @idx_exists = 0,
    'ALTER TABLE suppliers ADD INDEX idx_specialization (specialization)',
    'SELECT "Index idx_specialization already exists" AS message'
);

PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
