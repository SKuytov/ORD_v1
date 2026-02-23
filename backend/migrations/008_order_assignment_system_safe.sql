-- ============================================================================
-- Phase 4: Order Assignment System - SAFE MIGRATION
-- This version checks for existing structures before creating them
-- ============================================================================

-- Add assignment columns to orders table (only if they don't exist)
SET @query = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'orders' 
     AND COLUMN_NAME = 'assigned_to_user_id') = 0,
    'ALTER TABLE orders ADD COLUMN assigned_to_user_id INT NULL COMMENT "User currently assigned to process this order";',
    'SELECT "Column assigned_to_user_id already exists" AS info;'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'orders' 
     AND COLUMN_NAME = 'assigned_at') = 0,
    'ALTER TABLE orders ADD COLUMN assigned_at DATETIME NULL COMMENT "When order was assigned";',
    'SELECT "Column assigned_at already exists" AS info;'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'orders' 
     AND COLUMN_NAME = 'last_activity_at') = 0,
    'ALTER TABLE orders ADD COLUMN last_activity_at DATETIME NULL COMMENT "Last time order was edited (for auto-release)";',
    'SELECT "Column last_activity_at already exists" AS info;'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'orders' 
     AND COLUMN_NAME = 'assignment_notes') = 0,
    'ALTER TABLE orders ADD COLUMN assignment_notes TEXT NULL COMMENT "Notes about assignment";',
    'SELECT "Column assignment_notes already exists" AS info;'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add foreign key (only if it doesn't exist)
SET @query = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'orders' 
     AND CONSTRAINT_NAME = 'fk_orders_assigned_user') = 0,
    'ALTER TABLE orders ADD CONSTRAINT fk_orders_assigned_user FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL;',
    'SELECT "Foreign key fk_orders_assigned_user already exists" AS info;'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add indices (only if they don't exist)
SET @query = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'orders' 
     AND INDEX_NAME = 'idx_assigned_to') = 0,
    'ALTER TABLE orders ADD INDEX idx_assigned_to (assigned_to_user_id);',
    'SELECT "Index idx_assigned_to already exists" AS info;'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'orders' 
     AND INDEX_NAME = 'idx_last_activity') = 0,
    'ALTER TABLE orders ADD INDEX idx_last_activity (last_activity_at);',
    'SELECT "Index idx_last_activity already exists" AS info;'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create order_assignment_history table (only if it doesn't exist)
CREATE TABLE IF NOT EXISTS order_assignment_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    assigned_from_user_id INT NULL COMMENT 'Previous assignee (NULL if was unassigned)',
    assigned_to_user_id INT NULL COMMENT 'New assignee (NULL if releasing)',
    assigned_by_user_id INT NULL COMMENT 'Who performed the action',
    assignment_type ENUM('claim', 'release', 'reassign', 'auto_release') NOT NULL,
    reason TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_from_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    
    INDEX idx_order_id (order_id),
    INDEX idx_assignment_type (assignment_type),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Tracks order assignment history';

-- Create supplier_item_history table for Phase 5 (only if it doesn't exist)
CREATE TABLE IF NOT EXISTS supplier_item_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    supplier_id INT NOT NULL,
    item_description TEXT NOT NULL,
    part_number VARCHAR(100),
    category VARCHAR(100),
    keywords TEXT COMMENT 'Extracted keywords for matching',
    match_quality ENUM('exact', 'good', 'fair', 'manual') DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
    
    INDEX idx_supplier_id (supplier_id),
    INDEX idx_category (category),
    INDEX idx_part_number (part_number),
    FULLTEXT idx_keywords (keywords, item_description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Learning data for supplier suggestions';

-- Add supplier metadata columns for Phase 5 (only if they don't exist)
SET @query = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'suppliers' 
     AND COLUMN_NAME = 'specialization') = 0,
    'ALTER TABLE suppliers ADD COLUMN specialization VARCHAR(200) NULL COMMENT "Primary category/specialization";',
    'SELECT "Column specialization already exists" AS info;'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'suppliers' 
     AND COLUMN_NAME = 'keywords') = 0,
    'ALTER TABLE suppliers ADD COLUMN keywords TEXT NULL COMMENT "Searchable keywords for matching";',
    'SELECT "Column keywords already exists" AS info;'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'suppliers' 
     AND COLUMN_NAME = 'category_tags') = 0,
    'ALTER TABLE suppliers ADD COLUMN category_tags VARCHAR(500) NULL COMMENT "Comma-separated category tags";',
    'SELECT "Column category_tags already exists" AS info;'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'suppliers' 
     AND COLUMN_NAME = 'performance_score') = 0,
    'ALTER TABLE suppliers ADD COLUMN performance_score DECIMAL(3,1) DEFAULT 5.0 COMMENT "Performance rating 0-10";',
    'SELECT "Column performance_score already exists" AS info;'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'suppliers' 
     AND COLUMN_NAME = 'total_orders') = 0,
    'ALTER TABLE suppliers ADD COLUMN total_orders INT DEFAULT 0 COMMENT "Total orders placed with this supplier";',
    'SELECT "Column total_orders already exists" AS info;'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @query = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'suppliers' 
     AND COLUMN_NAME = 'last_order_date') = 0,
    'ALTER TABLE suppliers ADD COLUMN last_order_date DATETIME NULL COMMENT "Most recent order date";',
    'SELECT "Column last_order_date already exists" AS info;'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_orders_update_activity;

DELIMITER $$
CREATE TRIGGER trg_orders_update_activity
BEFORE UPDATE ON orders
FOR EACH ROW
BEGIN
    -- Update last_activity_at when order is edited
    IF (OLD.status != NEW.status 
        OR OLD.supplier_id != NEW.supplier_id 
        OR OLD.price != NEW.price
        OR OLD.notes != NEW.notes) THEN
        SET NEW.last_activity_at = NOW();
    END IF;
END$$
DELIMITER ;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_supplier_item_learning;

DELIMITER $$
CREATE TRIGGER trg_supplier_item_learning
AFTER UPDATE ON orders
FOR EACH ROW
BEGIN
    -- Log supplier-item match when supplier is assigned
    IF (OLD.supplier_id IS NULL AND NEW.supplier_id IS NOT NULL) 
       OR (OLD.supplier_id != NEW.supplier_id AND NEW.supplier_id IS NOT NULL) THEN
        
        INSERT INTO supplier_item_history 
        (order_id, supplier_id, item_description, part_number, category, keywords, match_quality)
        VALUES (
            NEW.id,
            NEW.supplier_id,
            NEW.item_description,
            NEW.part_number,
            NEW.category,
            CONCAT_WS(' ', NEW.item_description, NEW.part_number, NEW.category),
            'manual'
        );
        
        -- Update supplier statistics
        UPDATE suppliers 
        SET total_orders = total_orders + 1,
            last_order_date = NOW()
        WHERE id = NEW.supplier_id;
    END IF;
END$$
DELIMITER ;

-- Create or replace views
DROP VIEW IF EXISTS v_my_assigned_orders;
CREATE VIEW v_my_assigned_orders AS
SELECT 
    o.*,
    u.name as assigned_to_name,
    u.username as assigned_to_username,
    TIMESTAMPDIFF(MINUTE, o.last_activity_at, NOW()) as minutes_since_activity
FROM orders o
LEFT JOIN users u ON o.assigned_to_user_id = u.id
WHERE o.assigned_to_user_id IS NOT NULL;

DROP VIEW IF EXISTS v_unassigned_orders;
CREATE VIEW v_unassigned_orders AS
SELECT o.*
FROM orders o
WHERE o.assigned_to_user_id IS NULL
AND o.status IN ('New', 'Pending', 'Quote Requested', 'Quote Received')
ORDER BY 
    CASE o.priority 
        WHEN 'Urgent' THEN 1
        WHEN 'High' THEN 2
        WHEN 'Normal' THEN 3
        WHEN 'Low' THEN 4
    END,
    o.submission_date ASC;

-- Populate historical data from existing orders (only if supplier_item_history is empty)
INSERT IGNORE INTO supplier_item_history 
(order_id, supplier_id, item_description, part_number, category, keywords, match_quality)
SELECT 
    o.id,
    o.supplier_id,
    o.item_description,
    o.part_number,
    o.category,
    CONCAT_WS(' ', o.item_description, o.part_number, o.category),
    'manual'
FROM orders o
WHERE o.supplier_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM supplier_item_history sih WHERE sih.order_id = o.id
);

-- Update supplier statistics
UPDATE suppliers s
SET 
    total_orders = (SELECT COUNT(*) FROM orders WHERE supplier_id = s.id),
    last_order_date = (SELECT MAX(submission_date) FROM orders WHERE supplier_id = s.id)
WHERE EXISTS (SELECT 1 FROM orders WHERE supplier_id = s.id);

SELECT 'Phase 4 migration completed successfully!' AS status;
