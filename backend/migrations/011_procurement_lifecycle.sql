-- backend/migrations/011_procurement_lifecycle.sql
-- PartPulse Orders v3.0 - Procurement Lifecycle Tables
-- Idempotent: safe to run multiple times
-- Fixed: uses INFORMATION_SCHEMA checks instead of ADD COLUMN IF NOT EXISTS

USE partpulse_orders;

-- ============================================================
-- 1. quote_responses: records supplier replies to quote requests
-- ============================================================
CREATE TABLE IF NOT EXISTS quote_responses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    quote_id INT NOT NULL,
    quote_item_id INT,
    order_id INT,
    responded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    recorded_by INT NOT NULL,
    unit_price DECIMAL(12,4),
    total_price DECIMAL(12,4),
    currency VARCHAR(10) DEFAULT 'EUR',
    promised_delivery_date DATE,
    lead_time_days INT,
    availability ENUM('in_stock','available','on_order','unavailable','partial') DEFAULT 'available',
    moq INT,
    has_alternative TINYINT(1) DEFAULT 0,
    alternative_description TEXT,
    alternative_unit_price DECIMAL(12,4),
    supplier_notes TEXT,
    internal_notes TEXT,
    response_document_id INT,
    status ENUM('pending','accepted','rejected','negotiating','countered') DEFAULT 'pending',
    FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE,
    FOREIGN KEY (quote_item_id) REFERENCES quote_items(id) ON DELETE SET NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (recorded_by) REFERENCES users(id),
    INDEX idx_qr_quote_id (quote_id),
    INDEX idx_qr_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 2. purchase_orders
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    po_number VARCHAR(50) NOT NULL UNIQUE,
    quote_id INT,
    supplier_id INT NOT NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    currency VARCHAR(10) DEFAULT 'EUR',
    total_amount DECIMAL(12,2),
    delivery_address TEXT,
    payment_terms VARCHAR(255),
    notes TEXT,
    status ENUM('draft','sent','confirmed','partially_delivered','delivered','cancelled') DEFAULT 'draft',
    sent_at TIMESTAMP NULL,
    confirmed_at TIMESTAMP NULL,
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    invoice_expected TINYINT(1) DEFAULT 1,
    invoice_received TINYINT(1) DEFAULT 0,
    FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE SET NULL,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_po_quote_id (quote_id),
    INDEX idx_po_supplier_id (supplier_id),
    INDEX idx_po_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 3. po_items: line items on a PO
-- ============================================================
CREATE TABLE IF NOT EXISTS po_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    po_id INT NOT NULL,
    order_id INT,
    quote_item_id INT,
    item_description TEXT NOT NULL,
    part_number VARCHAR(255),
    quantity INT NOT NULL,
    unit_price DECIMAL(12,4),
    total_price DECIMAL(12,4),
    currency VARCHAR(10) DEFAULT 'EUR',
    received_quantity INT DEFAULT 0,
    status ENUM('pending','partial','received','cancelled') DEFAULT 'pending',
    notes TEXT,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (quote_item_id) REFERENCES quote_items(id) ON DELETE SET NULL,
    INDEX idx_poi_po_id (po_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 4. invoices
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    invoice_number VARCHAR(100),
    po_id INT,
    quote_id INT,
    supplier_id INT NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    received_by INT NOT NULL,
    invoice_date DATE,
    due_date DATE,
    currency VARCHAR(10) DEFAULT 'EUR',
    amount DECIMAL(12,2),
    vat_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2),
    status ENUM('received','verified','sent_to_accounting','booked','paid','disputed') DEFAULT 'received',
    sent_to_accounting_at TIMESTAMP NULL,
    sent_to_accounting_by INT,
    accounting_notes TEXT,
    booking_reference VARCHAR(255),
    paid_at TIMESTAMP NULL,
    document_id INT,
    notes TEXT,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
    FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE SET NULL,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (received_by) REFERENCES users(id),
    FOREIGN KEY (sent_to_accounting_by) REFERENCES users(id),
    INDEX idx_inv_po_id (po_id),
    INDEX idx_inv_quote_id (quote_id),
    INDEX idx_inv_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 5. Add new columns to orders table (idempotent via INFORMATION_SCHEMA)
-- NOTE: ADD COLUMN IF NOT EXISTS is NOT supported in MySQL 8.0 ALTER TABLE.
-- Using prepared statements with INFORMATION_SCHEMA checks instead.
-- ============================================================

-- po_id
SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND COLUMN_NAME = 'po_id'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE orders ADD COLUMN po_id INT DEFAULT NULL',
    'SELECT "orders.po_id already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- po_number
SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND COLUMN_NAME = 'po_number'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE orders ADD COLUMN po_number VARCHAR(50) DEFAULT NULL',
    'SELECT "orders.po_number already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- invoice_id
SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND COLUMN_NAME = 'invoice_id'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE orders ADD COLUMN invoice_id INT DEFAULT NULL',
    'SELECT "orders.invoice_id already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- delivery_confirmed_at
SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND COLUMN_NAME = 'delivery_confirmed_at'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE orders ADD COLUMN delivery_confirmed_at TIMESTAMP NULL DEFAULT NULL',
    'SELECT "orders.delivery_confirmed_at already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- delivery_confirmed_by
SET @col_exists := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orders'
      AND COLUMN_NAME = 'delivery_confirmed_by'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE orders ADD COLUMN delivery_confirmed_by INT DEFAULT NULL',
    'SELECT "orders.delivery_confirmed_by already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Migration 011 completed successfully!' AS Status;
