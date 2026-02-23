-- Supplier Product Catalog Schema
-- Run this to add supplier catalog functionality to your database

CREATE TABLE IF NOT EXISTS supplier_products (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    
    -- Product Information
    category VARCHAR(255) NOT NULL,
    part_number VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    manufacturer VARCHAR(255),
    brand_name VARCHAR(255) NOT NULL,
    
    -- Pricing and Delivery
    unit_price DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'EUR',
    lead_time_days INTEGER NOT NULL,
    min_order_qty INTEGER DEFAULT 1,
    stock_status VARCHAR(50) NOT NULL,
    
    -- Additional Information
    image_url TEXT,
    datasheet_url TEXT,
    keywords TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint: one part number per supplier
    UNIQUE(supplier_id, part_number)
);

-- Indexes for fast searching
CREATE INDEX idx_supplier_products_supplier ON supplier_products(supplier_id);
CREATE INDEX idx_supplier_products_category ON supplier_products(category);
CREATE INDEX idx_supplier_products_brand ON supplier_products(brand_name);
CREATE INDEX idx_supplier_products_part_number ON supplier_products(part_number);

-- Full-text search index for description, keywords, and part number
CREATE INDEX idx_supplier_products_search ON supplier_products 
    USING gin(to_tsvector('english', 
        COALESCE(description, '') || ' ' || 
        COALESCE(part_number, '') || ' ' || 
        COALESCE(keywords, '') || ' ' ||
        COALESCE(brand_name, '')
    ));

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_supplier_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_supplier_products_updated_at
    BEFORE UPDATE ON supplier_products
    FOR EACH ROW
    EXECUTE FUNCTION update_supplier_products_updated_at();

-- Sample data (optional - remove if not needed)
INSERT INTO supplier_products (
    supplier_id, category, part_number, description, manufacturer, brand_name,
    unit_price, currency, lead_time_days, min_order_qty, stock_status,
    keywords
) VALUES 
    (1, 'Bearings', 'BRG-6205-2RS', 'Deep groove ball bearing 6205 2RS, sealed both sides', 'SKF', 'SKF', 12.50, 'EUR', 5, 1, 'In Stock', 'bearing, ball bearing, 6205, sealed'),
    (1, 'Bearings', 'BRG-6206-2RS', 'Deep groove ball bearing 6206 2RS, sealed both sides', 'SKF', 'SKF', 14.75, 'EUR', 5, 1, 'In Stock', 'bearing, ball bearing, 6206, sealed'),
    (1, 'Motors', 'MOT-3PH-5.5KW', '3-phase electric motor 5.5kW 1450rpm', 'Siemens', 'Siemens', 450.00, 'EUR', 10, 1, 'Made to Order', 'motor, electric, 3-phase, 5.5kW')
ON CONFLICT (supplier_id, part_number) DO NOTHING;

-- View to get supplier catalog with supplier information
CREATE OR REPLACE VIEW v_supplier_catalog AS
SELECT 
    sp.*,
    s.name as supplier_name,
    s.email as supplier_email,
    s.phone as supplier_phone,
    s.is_active as supplier_active
FROM supplier_products sp
JOIN suppliers s ON sp.supplier_id = s.id;

COMMENT ON TABLE supplier_products IS 'Product catalog for each supplier - enables AI-powered supplier suggestions';
COMMENT ON COLUMN supplier_products.brand_name IS 'Important for AI training to suggest appropriate suppliers';
COMMENT ON COLUMN supplier_products.keywords IS 'Comma-separated search terms for better product matching';
