-- database/migration-v2.sql
-- PartPulse V2 Migration - Procurement Workflow Upgrade
-- Run this on your existing database:
--   mysql -u partpulse_user -p partpulse_orders < database/migration-v2.sql

USE partpulse_orders;

-- 1. Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(50),
    address TEXT,
    website VARCHAR(255),
    notes TEXT,
    active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Quotes table (groups multiple order items into one quote)
CREATE TABLE IF NOT EXISTS quotes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quote_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_id INT,
    status ENUM('Draft', 'Sent to Supplier', 'Received', 'Under Approval', 'Approved', 'Rejected') DEFAULT 'Draft',
    total_amount DECIMAL(12, 2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'EUR',
    valid_until DATE,
    notes TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_quote_number (quote_number),
    INDEX idx_supplier (supplier_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Quote items (links orders to quotes)
CREATE TABLE IF NOT EXISTS quote_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quote_id INT NOT NULL,
    order_id INT NOT NULL,
    unit_price DECIMAL(10, 2) DEFAULT 0.00,
    quantity INT NOT NULL DEFAULT 1,
    total_price DECIMAL(10, 2) DEFAULT 0.00,
    notes TEXT,
    FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    INDEX idx_quote (quote_id),
    INDEX idx_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Expand order statuses and add new columns
ALTER TABLE orders 
    MODIFY COLUMN status ENUM(
        'New', 'Pending', 'Quote Requested', 'Quote Received', 
        'Quote Under Approval', 'Approved', 'Ordered', 
        'In Transit', 'Partially Delivered', 'Delivered', 
        'Cancelled', 'On Hold'
    ) DEFAULT 'New';

-- Add new columns to orders (ignore errors if they already exist)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10, 2) DEFAULT 0.00 AFTER price;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_price DECIMAL(12, 2) DEFAULT 0.00 AFTER unit_price;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS expected_delivery_date DATE AFTER date_needed;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS priority ENUM('Low', 'Normal', 'High', 'Urgent') DEFAULT 'Normal' AFTER notes;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_id INT AFTER supplier;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quote_ref INT AFTER quote_id;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS part_number VARCHAR(100) AFTER item_description;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS category VARCHAR(50) AFTER part_number;

-- Add foreign keys for new columns
ALTER TABLE orders ADD FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE orders ADD FOREIGN KEY (quote_ref) REFERENCES quotes(id) ON DELETE SET NULL;
ALTER TABLE orders ADD INDEX idx_priority (priority);
ALTER TABLE orders ADD INDEX idx_supplier_id (supplier_id);

-- 5. Update existing 'Pending' orders to 'New'
UPDATE orders SET status = 'New' WHERE status = 'Pending';
