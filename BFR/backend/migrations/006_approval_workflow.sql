-- Migration 006: Phase 3 - Approval Workflow
-- Run: mysql -u partpulse_user -p'410010Kuyto-' partpulse_orders < backend/migrations/006_approval_workflow.sql

USE partpulse_orders;

-- ========================================
-- 1. Add Manager Role Support
-- ========================================

-- Check if 'manager' role needs to be added to users table enum
-- Note: MySQL doesn't support ALTER ENUM directly, so we check first
SET @check_role := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'partpulse_orders' 
    AND TABLE_NAME = 'users' 
    AND COLUMN_NAME = 'role' 
    AND COLUMN_TYPE LIKE '%manager%');

-- If manager role doesn't exist, we need to modify the enum
-- This is manual step if needed: ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'procurement', 'requester', 'manager') NOT NULL;

-- ========================================
-- 2. Create Approvals Table
-- ========================================

CREATE TABLE IF NOT EXISTS approvals (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    quote_document_id INT,
    requested_by INT NOT NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_to INT, -- Manager user ID
    status ENUM('pending', 'approved', 'rejected', 'cancelled') DEFAULT 'pending',
    approved_by INT,
    approved_at TIMESTAMP NULL,
    comments TEXT,
    rejection_reason TEXT,
    estimated_cost DECIMAL(10,2),
    supplier_id INT,
    priority ENUM('Low', 'Normal', 'High', 'Urgent') DEFAULT 'Normal',
    
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (quote_document_id) REFERENCES documents(id) ON DELETE SET NULL,
    FOREIGN KEY (requested_by) REFERENCES users(id),
    FOREIGN KEY (assigned_to) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    
    INDEX idx_status (status),
    INDEX idx_order_id (order_id),
    INDEX idx_assigned_to (assigned_to),
    INDEX idx_requested_at (requested_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================
-- 3. Create Approval History Table (Audit Trail)
-- ========================================

CREATE TABLE IF NOT EXISTS approval_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    approval_id INT NOT NULL,
    action ENUM('created', 'approved', 'rejected', 'cancelled', 'reassigned', 'commented') NOT NULL,
    performed_by INT NOT NULL,
    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    comments TEXT,
    metadata JSON,
    
    FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE,
    FOREIGN KEY (performed_by) REFERENCES users(id),
    
    INDEX idx_approval_id (approval_id),
    INDEX idx_performed_at (performed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================
-- 4. Create Communications Table
-- ========================================

CREATE TABLE IF NOT EXISTS communications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    direction ENUM('outgoing', 'incoming') NOT NULL,
    type ENUM('quote_request', 'quote_received', 'po_sent', 'approval_sent', 'delivery_confirmation', 'general', 'reminder', 'issue') NOT NULL,
    subject VARCHAR(500),
    body TEXT,
    recipient_email VARCHAR(255),
    sender_email VARCHAR(255),
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_by INT,
    supplier_id INT,
    attachments JSON, -- Array of document IDs or file paths
    status ENUM('draft', 'sent', 'delivered', 'failed', 'read') DEFAULT 'sent',
    metadata JSON, -- Additional data like email message ID, etc.
    
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (sent_by) REFERENCES users(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    
    INDEX idx_order_id (order_id),
    INDEX idx_type (type),
    INDEX idx_sent_at (sent_at),
    INDEX idx_supplier_id (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================
-- 5. Add Approval Fields to Orders Table
-- ========================================

-- Check and add approval_status column
SET @check_approval_status := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'partpulse_orders' 
    AND TABLE_NAME = 'orders' 
    AND COLUMN_NAME = 'approval_status');

SET @sql_approval_status := IF(@check_approval_status = 0,
    'ALTER TABLE orders ADD COLUMN approval_status ENUM(\'not_required\', \'pending\', \'approved\', \'rejected\') DEFAULT \'not_required\'',
    'SELECT "approval_status column already exists"');

PREPARE stmt FROM @sql_approval_status;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Check and add approved_by column
SET @check_approved_by := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'partpulse_orders' 
    AND TABLE_NAME = 'orders' 
    AND COLUMN_NAME = 'approved_by');

SET @sql_approved_by := IF(@check_approved_by = 0,
    'ALTER TABLE orders ADD COLUMN approved_by INT NULL, ADD FOREIGN KEY (approved_by) REFERENCES users(id)',
    'SELECT "approved_by column already exists"');

PREPARE stmt FROM @sql_approved_by;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Check and add approved_at column
SET @check_approved_at := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'partpulse_orders' 
    AND TABLE_NAME = 'orders' 
    AND COLUMN_NAME = 'approved_at');

SET @sql_approved_at := IF(@check_approved_at = 0,
    'ALTER TABLE orders ADD COLUMN approved_at TIMESTAMP NULL',
    'SELECT "approved_at column already exists"');

PREPARE stmt FROM @sql_approved_at;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ========================================
-- 6. Add Email Notification Settings to Users
-- ========================================

-- Check and add notification_email column
SET @check_notif_email := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'partpulse_orders' 
    AND TABLE_NAME = 'users' 
    AND COLUMN_NAME = 'notification_email');

SET @sql_notif_email := IF(@check_notif_email = 0,
    'ALTER TABLE users ADD COLUMN notification_email VARCHAR(255) NULL',
    'SELECT "notification_email column already exists"');

PREPARE stmt FROM @sql_notif_email;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Check and add email_notifications_enabled column
SET @check_email_enabled := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'partpulse_orders' 
    AND TABLE_NAME = 'users' 
    AND COLUMN_NAME = 'email_notifications_enabled');

SET @sql_email_enabled := IF(@check_email_enabled = 0,
    'ALTER TABLE users ADD COLUMN email_notifications_enabled BOOLEAN DEFAULT TRUE',
    'SELECT "email_notifications_enabled column already exists"');

PREPARE stmt FROM @sql_email_enabled;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ========================================
-- 7. Create Indexes for Performance
-- ========================================

-- Approval status index on orders
CREATE INDEX IF NOT EXISTS idx_orders_approval_status ON orders(approval_status);

-- ========================================
-- 8. Insert Sample Manager User (Optional)
-- ========================================

-- Uncomment to create a sample manager user
/*
INSERT INTO users (username, password_hash, name, email, role, building, active, notification_email, email_notifications_enabled)
VALUES (
    'manager',
    '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQR', -- Change this to proper bcrypt hash
    'Sample Manager',
    'manager@partpulse.eu',
    'manager',
    NULL,
    1,
    'manager@partpulse.eu',
    1
) ON DUPLICATE KEY UPDATE username=username;
*/

-- ========================================
-- Migration Complete
-- ========================================

SELECT 'Phase 3: Approval Workflow Migration Completed Successfully!' as Status;
SELECT 'Next Step: Manually update users table role enum to include manager if needed' as Note;
