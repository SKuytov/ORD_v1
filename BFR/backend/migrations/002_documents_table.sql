-- Migration: Add documents table for comprehensive document management
-- Phase 1: Document Management System
-- Created: 2026-02-22

CREATE TABLE IF NOT EXISTS documents (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    document_type ENUM(
        'quote_request',
        'quote_pdf',
        'proforma_invoice',
        'purchase_order',
        'invoice',
        'delivery_note',
        'signed_delivery_note',
        'packing_list',
        'customs_declaration',
        'intrastat_declaration',
        'other'
    ) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INT NOT NULL,
    mime_type VARCHAR(100),
    uploaded_by INT NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Metadata stored as JSON for flexibility
    metadata JSON COMMENT 'Store supplier info, invoice numbers, amounts, dates, etc.',
    
    -- Action tracking
    requires_action BOOLEAN DEFAULT FALSE COMMENT 'Does this document need follow-up?',
    action_deadline DATE COMMENT 'When does action need to be completed?',
    action_notes TEXT COMMENT 'What action is required?',
    
    -- Processing status
    status ENUM('pending', 'processed', 'sent_to_accounting', 'archived') DEFAULT 'pending',
    processed_at TIMESTAMP NULL,
    processed_by INT NULL,
    
    -- Notes
    notes TEXT COMMENT 'Additional notes about this document',
    
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id),
    FOREIGN KEY (processed_by) REFERENCES users(id),
    
    INDEX idx_order_id (order_id),
    INDEX idx_document_type (document_type),
    INDEX idx_status (status),
    INDEX idx_action_deadline (action_deadline),
    INDEX idx_uploaded_at (uploaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table for tracking EU deliveries and Intrastat compliance
CREATE TABLE IF NOT EXISTS eu_deliveries (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    supplier_id INT,
    supplier_country VARCHAR(2) NOT NULL COMMENT 'ISO 2-letter country code',
    
    -- Delivery tracking
    delivery_date DATE NOT NULL,
    delivery_confirmed_by INT,
    delivery_confirmed_at TIMESTAMP NULL,
    
    -- Intrastat compliance (14-day deadline from delivery)
    intrastat_deadline DATE NOT NULL COMMENT 'Auto-calculated: delivery_date + 14 days',
    intrastat_declared BOOLEAN DEFAULT FALSE,
    intrastat_declared_date DATE NULL,
    intrastat_declared_by INT NULL,
    
    -- Delivery note return tracking
    delivery_note_signed BOOLEAN DEFAULT FALSE COMMENT 'Has delivery note been signed and returned?',
    delivery_note_returned_date DATE NULL,
    
    -- Financial details for Intrastat
    invoice_number VARCHAR(100),
    invoice_amount DECIMAL(10,2),
    invoice_currency VARCHAR(3) DEFAULT 'EUR',
    
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (delivery_confirmed_by) REFERENCES users(id),
    FOREIGN KEY (intrastat_declared_by) REFERENCES users(id),
    
    INDEX idx_order_id (order_id),
    INDEX idx_supplier_country (supplier_country),
    INDEX idx_delivery_date (delivery_date),
    INDEX idx_intrastat_deadline (intrastat_deadline),
    INDEX idx_intrastat_declared (intrastat_declared)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table for email communication tracking
CREATE TABLE IF NOT EXISTS communications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    direction ENUM('outgoing', 'incoming') NOT NULL,
    communication_type ENUM(
        'quote_request',
        'quote_received',
        'quote_follow_up',
        'po_sent',
        'approval_request',
        'approval_received',
        'delivery_confirmation',
        'invoice_received',
        'general'
    ) NOT NULL,
    
    subject VARCHAR(500),
    body TEXT,
    
    -- Recipient/sender info
    from_email VARCHAR(255),
    to_email VARCHAR(255),
    cc_email TEXT COMMENT 'Comma-separated CC emails',
    
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_by INT COMMENT 'User who sent/logged this communication',
    
    -- Attachments reference
    has_attachments BOOLEAN DEFAULT FALSE,
    attachment_count INT DEFAULT 0,
    
    notes TEXT,
    
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (sent_by) REFERENCES users(id),
    
    INDEX idx_order_id (order_id),
    INDEX idx_direction (direction),
    INDEX idx_communication_type (communication_type),
    INDEX idx_sent_at (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add supplier country fields (safe method - checks if column exists)
SET @dbname = DATABASE();
SET @tablename = 'suppliers';
SET @columnname = 'country';
SET @preparedStatement = (
    SELECT IF(
        COUNT(*) = 0,
        CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(2) COMMENT "ISO 2-letter country code" AFTER address;'),
        'SELECT "Column country already exists" AS Info;'
    )
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
);
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add is_eu column
SET @columnname = 'is_eu';
SET @preparedStatement = (
    SELECT IF(
        COUNT(*) = 0,
        CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' BOOLEAN DEFAULT FALSE COMMENT "Is supplier in EU?" AFTER country;'),
        'SELECT "Column is_eu already exists" AS Info;'
    )
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
);
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add index for quick EU supplier lookup (safe method)
SET @indexname = 'idx_is_eu';
SET @preparedStatement = (
    SELECT IF(
        COUNT(*) = 0,
        CONCAT('CREATE INDEX ', @indexname, ' ON ', @tablename, '(is_eu);'),
        'SELECT "Index idx_is_eu already exists" AS Info;'
    )
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND INDEX_NAME = @indexname
);
PREPARE createIndexIfNotExists FROM @preparedStatement;
EXECUTE createIndexIfNotExists;
DEALLOCATE PREPARE createIndexIfNotExists;
