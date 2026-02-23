-- backend/migrations/006_create_training_data_table.sql
-- Create dedicated table for AI training data (separate from production orders)

CREATE TABLE IF NOT EXISTS training_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    item_description VARCHAR(500) NOT NULL,
    building VARCHAR(20),
    cost_center VARCHAR(100),
    supplier_id INT NOT NULL,
    source_file VARCHAR(255),
    source_sheet VARCHAR(100),
    import_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_item_desc (item_description(255)),
    INDEX idx_supplier (supplier_id),
    INDEX idx_building (building),
    
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
