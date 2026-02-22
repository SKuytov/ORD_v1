-- Migration 004: Many-to-Many Documents System
-- This allows one document to be linked to multiple orders (invoices, delivery notes, etc.)

-- Drop old single-order documents table
DROP TABLE IF EXISTS order_documents;

-- Create new documents table (no direct order_id, stored independently)
CREATE TABLE documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_type TEXT,
    uploaded_by TEXT NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    document_type TEXT DEFAULT 'general' -- 'invoice', 'delivery_note', 'quote', 'technical', 'photo', 'general'
);

-- Create junction table for many-to-many relationship
CREATE TABLE order_documents_link (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    document_id INTEGER NOT NULL,
    linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    linked_by TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    UNIQUE(order_id, document_id) -- Prevent duplicate links
);

-- Create indexes for performance
CREATE INDEX idx_order_documents_link_order ON order_documents_link(order_id);
CREATE INDEX idx_order_documents_link_document ON order_documents_link(document_id);
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_uploaded_at ON documents(uploaded_at DESC);
