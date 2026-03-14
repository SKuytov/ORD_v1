-- backend/migrations/011_procurement_lifecycle.sql
-- PartPulse Orders v3.0 - Procurement Lifecycle Tables
-- Idempotent: safe to run multiple times

-- 1. quote_responses: records supplier replies to quote requests
CREATE TABLE IF NOT EXISTS quote_responses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    quote_id INT NOT NULL,
    quote_item_id INT,          -- links to specific item (NULL = whole-quote response)
    order_id INT,               -- which order this response is for
    responded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    recorded_by INT NOT NULL,   -- procurement user who recorded it
    -- Supplier response details
    unit_price DECIMAL(12,4),
    total_price DECIMAL(12,4),
    currency VARCHAR(10) DEFAULT 'EUR',
    promised_delivery_date DATE,
    lead_time_days INT,         -- supplier's quoted lead time
    availability ENUM('in_stock','available','on_order','unavailable','partial') DEFAULT 'available',
    moq INT,                    -- minimum order quantity
    -- Response quality
    has_alternative TINYINT(1) DEFAULT 0,
    alternative_description TEXT,
    alternative_unit_price DECIMAL(12,4),
    -- Notes & docs
    supplier_notes TEXT,
    internal_notes TEXT,
    response_document_id INT,   -- attached quote doc from supplier
    -- Status
    status ENUM('pending','accepted','rejected','negotiating','countered') DEFAULT 'pending',
    FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE,
    FOREIGN KEY (quote_item_id) REFERENCES quote_items(id) ON DELETE SET NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY (recorded_by) REFERENCES users(id),
    INDEX idx_quote_id (quote_id),
    INDEX idx_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. purchase_orders: POs generated after quote approval
CREATE TABLE IF NOT EXISTS purchase_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    po_number VARCHAR(50) NOT NULL UNIQUE,  -- PO-YYYY-XXXXX format
    quote_id INT,
    supplier_id INT NOT NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- PO details
    currency VARCHAR(10) DEFAULT 'EUR',
    total_amount DECIMAL(12,2),
    delivery_address TEXT,
    payment_terms VARCHAR(255),
    notes TEXT,
    -- Status
    status ENUM('draft','sent','confirmed','partially_delivered','delivered','cancelled') DEFAULT 'draft',
    sent_at TIMESTAMP NULL,
    confirmed_at TIMESTAMP NULL,
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    -- Accounting
    invoice_expected TINYINT(1) DEFAULT 1,
    invoice_received TINYINT(1) DEFAULT 0,
    FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE SET NULL,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_quote_id (quote_id),
    INDEX idx_supplier_id (supplier_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. po_items: line items on a PO
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
    INDEX idx_po_id (po_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. invoices: tracks invoices from suppliers
CREATE TABLE IF NOT EXISTS invoices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    invoice_number VARCHAR(100),            -- supplier's invoice number
    po_id INT,
    quote_id INT,
    supplier_id INT NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    received_by INT NOT NULL,
    -- Invoice details
    invoice_date DATE,
    due_date DATE,
    currency VARCHAR(10) DEFAULT 'EUR',
    amount DECIMAL(12,2),
    vat_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2),
    -- Accounting handoff
    status ENUM('received','verified','sent_to_accounting','booked','paid','disputed') DEFAULT 'received',
    sent_to_accounting_at TIMESTAMP NULL,
    sent_to_accounting_by INT,
    accounting_notes TEXT,
    booking_reference VARCHAR(255),  -- reference from accounting system
    paid_at TIMESTAMP NULL,
    -- Document
    document_id INT,                 -- attached invoice document
    notes TEXT,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
    FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE SET NULL,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (received_by) REFERENCES users(id),
    FOREIGN KEY (sent_to_accounting_by) REFERENCES users(id),
    INDEX idx_po_id (po_id),
    INDEX idx_quote_id (quote_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Add po_id and invoice_id to orders for unified tracking
-- (idempotent)
ALTER TABLE orders 
    ADD COLUMN IF NOT EXISTS po_id INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS po_number VARCHAR(50) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS invoice_id INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS delivery_confirmed_at TIMESTAMP NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS delivery_confirmed_by INT DEFAULT NULL;

SELECT 'Migration 011 completed' as Status;
