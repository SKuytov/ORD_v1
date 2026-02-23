-- Supplier Product Catalog Schema - MySQL Version
-- Run this to add supplier catalog functionality to your MySQL database

CREATE TABLE IF NOT EXISTS supplier_products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id INT NOT NULL,
    
    -- Product Information
    category VARCHAR(255) NOT NULL,
    part_number VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    manufacturer VARCHAR(255),
    brand_name VARCHAR(255) NOT NULL,
    
    -- Pricing and Delivery
    unit_price DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'EUR',
    lead_time_days INT NOT NULL,
    min_order_qty INT DEFAULT 1,
    stock_status VARCHAR(50) NOT NULL,
    
    -- Additional Information
    image_url TEXT,
    datasheet_url TEXT,
    keywords TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign key constraint
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
    
    -- Unique constraint: one part number per supplier
    UNIQUE KEY unique_supplier_part (supplier_id, part_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Indexes for fast searching
CREATE INDEX idx_supplier_products_supplier ON supplier_products(supplier_id);
CREATE INDEX idx_supplier_products_category ON supplier_products(category);
CREATE INDEX idx_supplier_products_brand ON supplier_products(brand_name);
CREATE INDEX idx_supplier_products_part_number ON supplier_products(part_number);

-- Full-text search indexes for MySQL
CREATE FULLTEXT INDEX idx_supplier_products_description ON supplier_products(description);
CREATE FULLTEXT INDEX idx_supplier_products_keywords ON supplier_products(keywords);
CREATE FULLTEXT INDEX idx_supplier_products_part ON supplier_products(part_number);
CREATE FULLTEXT INDEX idx_supplier_products_brand_search ON supplier_products(brand_name);

-- Combined full-text index for comprehensive search
CREATE FULLTEXT INDEX idx_supplier_products_search_all ON supplier_products(description, part_number, keywords, brand_name);

-- Sample data (optional - remove if not needed)
-- Note: Change supplier_id to match your actual supplier IDs
INSERT IGNORE INTO supplier_products (
    supplier_id, category, part_number, description, manufacturer, brand_name,
    unit_price, currency, lead_time_days, min_order_qty, stock_status,
    keywords
) VALUES 
    (1, 'Bearings', 'BRG-6205-2RS', 'Deep groove ball bearing 6205 2RS, sealed both sides', 'SKF', 'SKF', 12.50, 'EUR', 5, 1, 'In Stock', 'bearing, ball bearing, 6205, sealed'),
    (1, 'Bearings', 'BRG-6206-2RS', 'Deep groove ball bearing 6206 2RS, sealed both sides', 'SKF', 'SKF', 14.75, 'EUR', 5, 1, 'In Stock', 'bearing, ball bearing, 6206, sealed'),
    (1, 'Motors', 'MOT-3PH-5.5KW', '3-phase electric motor 5.5kW 1450rpm', 'Siemens', 'Siemens', 450.00, 'EUR', 10, 1, 'Made to Order', 'motor, electric, 3-phase, 5.5kW');

-- View to get supplier catalog with supplier information
CREATE OR REPLACE VIEW v_supplier_catalog AS
SELECT 
    sp.*,
    s.name as supplier_name,
    s.email as supplier_email,
    s.phone as supplier_phone,
    s.is_active as supplier_active
FROM supplier_products sp
INNER JOIN suppliers s ON sp.supplier_id = s.id;

-- Add comments (MySQL 8.0+ supports column comments)
ALTER TABLE supplier_products 
    COMMENT = 'Product catalog for each supplier - enables AI-powered supplier suggestions';
