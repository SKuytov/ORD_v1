-- Migration v5: CAD workflow + template orders + quote_send_log
USE partpulse_orders;

-- Create quote_send_log table if it doesn't exist (required for RFQ email tracking)
CREATE TABLE IF NOT EXISTS quote_send_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quote_id INT NOT NULL,
    sent_by INT NOT NULL,
    method VARCHAR(20) DEFAULT 'smtp',
    supplier_email VARCHAR(255),
    notes TEXT,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_quote_id (quote_id),
    INDEX idx_sent_at (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add quote_number to quotes if not present
SET @exist_qnum := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='quotes' AND COLUMN_NAME='quote_number');
SET @sql_qnum := IF(@exist_qnum=0, 'ALTER TABLE quotes ADD COLUMN quote_number VARCHAR(50) UNIQUE', 'SELECT 1');
PREPARE stmt FROM @sql_qnum; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add quote_ref to orders if not present (links order to its quote)
SET @exist_qref := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='quote_ref');
SET @sql_qref := IF(@exist_qref=0, 'ALTER TABLE orders ADD COLUMN quote_ref INT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql_qref; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add unit_price / total_price / expected_delivery_date / supplier_notes to orders if missing
SET @exist_up := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='unit_price');
SET @sql_up := IF(@exist_up=0, 'ALTER TABLE orders ADD COLUMN unit_price DECIMAL(12,2) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql_up; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist_tp := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='total_price');
SET @sql_tp := IF(@exist_tp=0, 'ALTER TABLE orders ADD COLUMN total_price DECIMAL(12,2) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql_tp; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist_edd := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='expected_delivery_date');
SET @sql_edd := IF(@exist_edd=0, 'ALTER TABLE orders ADD COLUMN expected_delivery_date DATE DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql_edd; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist_sn := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='supplier_notes');
SET @sql_sn := IF(@exist_sn=0, 'ALTER TABLE orders ADD COLUMN supplier_notes TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql_sn; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add cad_review_required if not exists (safe for MySQL 5.7)
SET @exist_cad := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='cad_review_required');
SET @sql_cad := IF(@exist_cad=0, 'ALTER TABLE orders ADD COLUMN cad_review_required TINYINT(1) DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql_cad; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist_cads := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='cad_status');
SET @sql_cads := IF(@exist_cads=0, "ALTER TABLE orders ADD COLUMN cad_status ENUM('not_required','pending','in_progress','done') DEFAULT 'not_required'", 'SELECT 1');
PREPARE stmt FROM @sql_cads; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist_tmpl := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='is_template');
SET @sql_tmpl := IF(@exist_tmpl=0, 'ALTER TABLE orders ADD COLUMN is_template TINYINT(1) DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql_tmpl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist_tname := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='template_name');
SET @sql_tname := IF(@exist_tname=0, 'ALTER TABLE orders ADD COLUMN template_name VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql_tname; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- BUG FIX: Add 'delivery_proof' to documents.document_type ENUM
-- The frontend sends documentType='delivery_proof' but the live
-- ENUM only contained: quote_request, quote_pdf, proforma_invoice,
-- purchase_order, invoice, delivery_note, signed_delivery_note,
-- packing_list, customs_declaration, intrastat_declaration, other
-- ============================================================
ALTER TABLE documents MODIFY COLUMN document_type ENUM(
    'quote_request',
    'quote_pdf',
    'proforma_invoice',
    'purchase_order',
    'invoice',
    'delivery_note',
    'delivery_proof',
    'signed_delivery_note',
    'packing_list',
    'customs_declaration',
    'intrastat_declaration',
    'specification',
    'cad_drawing',
    'other'
) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other';
