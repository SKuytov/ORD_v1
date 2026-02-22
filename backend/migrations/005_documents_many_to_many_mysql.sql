-- Migration 005: Many-to-Many Documents System (MySQL)
-- This allows one document to be linked to multiple orders (invoices, delivery notes, etc.)

USE partpulse_orders;

-- Create junction table for many-to-many relationships
CREATE TABLE IF NOT EXISTS order_documents_link (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    document_id INT NOT NULL,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    linked_by INT NOT NULL,
    UNIQUE KEY unique_order_document (order_id, document_id),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (linked_by) REFERENCES users(id),
    INDEX idx_order_id (order_id),
    INDEX idx_document_id (document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrate existing data from documents to junction table
-- Only migrate if documents table has records
INSERT IGNORE INTO order_documents_link (order_id, document_id, linked_by, linked_at)
SELECT 
    order_id, 
    id, 
    uploaded_by, 
    uploaded_at
FROM documents
WHERE order_id IS NOT NULL;

-- Add description column if it doesn't exist
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS description TEXT AFTER notes;

-- Make order_id nullable (we'll use junction table instead)
ALTER TABLE documents MODIFY order_id INT NULL;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);

-- Verification queries
SELECT 'Migration completed successfully!' AS status;
SELECT COUNT(*) AS total_documents FROM documents;
SELECT COUNT(*) AS total_links FROM order_documents_link;
