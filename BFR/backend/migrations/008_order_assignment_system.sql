-- Migration 008: Order Assignment System & Supplier Suggestions
-- Author: System
-- Date: 2026-02-23
-- Purpose: Add order assignment tracking and supplier metadata for smart suggestions

-- ============================================================================
-- PART 1: Order Assignment Fields
-- ============================================================================

-- Add order assignment tracking columns
ALTER TABLE orders 
ADD COLUMN assigned_to_user_id INT DEFAULT NULL COMMENT 'User currently working on this order',
ADD COLUMN assigned_at TIMESTAMP NULL DEFAULT NULL COMMENT 'When order was claimed',
ADD COLUMN last_activity_at TIMESTAMP NULL DEFAULT NULL COMMENT 'Last edit activity timestamp',
ADD COLUMN assignment_notes TEXT DEFAULT NULL COMMENT 'Notes about assignment/handoff',
ADD INDEX idx_assigned_to (assigned_to_user_id),
ADD FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- PART 2: Supplier Metadata for Smart Suggestions
-- ============================================================================

-- Add supplier specialization and keyword fields
ALTER TABLE suppliers
ADD COLUMN specialization VARCHAR(255) DEFAULT NULL COMMENT 'Primary specialization (e.g., Electronics, Hardware)',
ADD COLUMN keywords TEXT DEFAULT NULL COMMENT 'Comma-separated keywords for matching',
ADD COLUMN category_tags TEXT DEFAULT NULL COMMENT 'Comma-separated category tags',
ADD COLUMN performance_score DECIMAL(3,2) DEFAULT 5.00 COMMENT 'Performance rating 0-10',
ADD COLUMN last_order_date TIMESTAMP NULL DEFAULT NULL COMMENT 'Most recent order date',
ADD COLUMN total_orders INT DEFAULT 0 COMMENT 'Total number of orders placed',
ADD INDEX idx_specialization (specialization),
ADD INDEX idx_performance (performance_score);

-- ============================================================================
-- PART 3: Order Assignment History Table
-- ============================================================================

-- Track assignment changes for audit trail
CREATE TABLE IF NOT EXISTS order_assignment_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    assigned_from_user_id INT DEFAULT NULL COMMENT 'Previous assignee (NULL if unassigned)',
    assigned_to_user_id INT DEFAULT NULL COMMENT 'New assignee (NULL if released)',
    assigned_by_user_id INT NOT NULL COMMENT 'Who made the assignment change',
    assignment_type ENUM('claim', 'assign', 'release', 'reassign', 'auto_release') NOT NULL,
    reason VARCHAR(500) DEFAULT NULL COMMENT 'Reason for assignment change',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_from_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    INDEX idx_order_assignment (order_id),
    INDEX idx_assigned_to_history (assigned_to_user_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- PART 4: Supplier-Item Matching History (for ML/suggestions)
-- ============================================================================

-- Track which suppliers were used for which items (learning data)
CREATE TABLE IF NOT EXISTS supplier_item_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id INT NOT NULL,
    order_id INT NOT NULL,
    item_description TEXT NOT NULL,
    category VARCHAR(255) DEFAULT NULL,
    part_number VARCHAR(255) DEFAULT NULL,
    match_quality ENUM('excellent', 'good', 'acceptable', 'poor') DEFAULT 'good',
    delivery_rating INT DEFAULT NULL COMMENT '1-5 stars',
    price_rating INT DEFAULT NULL COMMENT '1-5 stars',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    
    INDEX idx_supplier_learning (supplier_id),
    INDEX idx_category (category),
    INDEX idx_created_at (created_at),
    FULLTEXT INDEX ft_item_description (item_description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- PART 5: Auto-populate supplier history from existing orders
-- ============================================================================

-- Populate supplier_item_history with existing order data
INSERT INTO supplier_item_history (supplier_id, order_id, item_description, category, part_number, match_quality)
SELECT 
    o.supplier_id,
    o.id,
    o.item_description,
    o.category,
    o.part_number,
    CASE 
        WHEN o.status IN ('Delivered', 'Approved') THEN 'excellent'
        WHEN o.status IN ('Ordered', 'In Transit') THEN 'good'
        ELSE 'acceptable'
    END as match_quality
FROM orders o
WHERE o.supplier_id IS NOT NULL
ON DUPLICATE KEY UPDATE id=id; -- Prevents re-insertion if run multiple times

-- Update supplier statistics
UPDATE suppliers s
SET 
    total_orders = (
        SELECT COUNT(*) 
        FROM orders o 
        WHERE o.supplier_id = s.id
    ),
    last_order_date = (
        SELECT MAX(o.submission_date) 
        FROM orders o 
        WHERE o.supplier_id = s.id
    );

-- ============================================================================
-- PART 6: Trigger to update last_activity_at automatically
-- ============================================================================

DROP TRIGGER IF EXISTS trg_orders_update_activity;

DELIMITER $$

CREATE TRIGGER trg_orders_update_activity
BEFORE UPDATE ON orders
FOR EACH ROW
BEGIN
    -- Update last_activity_at whenever order is modified (if assigned)
    IF NEW.assigned_to_user_id IS NOT NULL THEN
        SET NEW.last_activity_at = CURRENT_TIMESTAMP;
    END IF;
    
    -- Update supplier statistics when supplier is assigned
    IF NEW.supplier_id IS NOT NULL AND (OLD.supplier_id IS NULL OR OLD.supplier_id != NEW.supplier_id) THEN
        -- Insert into learning history
        INSERT INTO supplier_item_history (supplier_id, order_id, item_description, category, part_number)
        VALUES (NEW.supplier_id, NEW.id, NEW.item_description, NEW.category, NEW.part_number)
        ON DUPLICATE KEY UPDATE supplier_id = NEW.supplier_id;
        
        -- Update supplier stats
        UPDATE suppliers 
        SET total_orders = total_orders + 1,
            last_order_date = CURRENT_TIMESTAMP
        WHERE id = NEW.supplier_id;
    END IF;
END$$

DELIMITER ;

-- ============================================================================
-- PART 7: Helper Views for Procurement Dashboard
-- ============================================================================

-- View: My assigned orders (for quick access)
CREATE OR REPLACE VIEW v_my_assigned_orders AS
SELECT 
    o.*,
    u.name as assigned_to_name,
    u.username as assigned_to_username,
    s.name as supplier_name,
    TIMESTAMPDIFF(MINUTE, o.last_activity_at, NOW()) as minutes_since_activity
FROM orders o
LEFT JOIN users u ON o.assigned_to_user_id = u.id
LEFT JOIN suppliers s ON o.supplier_id = s.id
WHERE o.assigned_to_user_id IS NOT NULL;

-- View: Unassigned orders needing attention
CREATE OR REPLACE VIEW v_unassigned_orders AS
SELECT 
    o.*,
    s.name as supplier_name,
    DATEDIFF(NOW(), o.submission_date) as days_pending
FROM orders o
LEFT JOIN suppliers s ON o.supplier_id = s.id
WHERE o.assigned_to_user_id IS NULL
AND o.status IN ('New', 'Pending', 'Quote Requested')
ORDER BY 
    CASE o.priority 
        WHEN 'Urgent' THEN 1
        WHEN 'High' THEN 2
        WHEN 'Normal' THEN 3
        WHEN 'Low' THEN 4
    END,
    o.submission_date ASC;

-- ============================================================================
-- PART 8: Add comments to tables for documentation
-- ============================================================================

ALTER TABLE orders COMMENT = 'Purchase orders with assignment tracking';
ALTER TABLE order_assignment_history COMMENT = 'Audit trail of order ownership changes';
ALTER TABLE supplier_item_history COMMENT = 'Learning data for supplier suggestions';

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Summary of changes:
-- ✅ Added order assignment tracking (assigned_to_user_id, assigned_at, last_activity_at)
-- ✅ Added supplier metadata fields (specialization, keywords, performance_score)
-- ✅ Created order_assignment_history table for audit trail
-- ✅ Created supplier_item_history table for smart suggestions
-- ✅ Added triggers to auto-update activity timestamps
-- ✅ Created helpful views for procurement dashboard
-- ✅ Populated historical data from existing orders
