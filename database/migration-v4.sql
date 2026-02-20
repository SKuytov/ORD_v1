-- Migration v4: Cost Centers
-- Run: mysql -u partpulse_user -p partpulse_orders < database/migration-v4.sql

CREATE TABLE IF NOT EXISTS cost_centers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    building_code VARCHAR(20) NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT DEFAULT NULL,
    active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_building_cc (building_code, code),
    INDEX idx_building (building_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add cost_center_id to orders
ALTER TABLE orders ADD COLUMN cost_center_id INT DEFAULT NULL AFTER building;
ALTER TABLE orders ADD INDEX idx_cost_center (cost_center_id);

-- Seed example cost centers
INSERT IGNORE INTO cost_centers (building_code, code, name) VALUES
    ('CT', 'CC-CT-PROD', 'CT Production'),
    ('CT', 'CC-CT-MAINT', 'CT Maintenance'),
    ('CT', 'CC-CT-QC', 'CT Quality Control'),
    ('CB', 'CC-CB-PROD', 'CB Production'),
    ('CB', 'CC-CB-MAINT', 'CB Maintenance'),
    ('WW', 'CC-WW-PROD', 'WW Production'),
    ('WW', 'CC-WW-MAINT', 'WW Maintenance'),
    ('PS', 'CC-PS-PROD', 'PS Production'),
    ('PS', 'CC-PS-MAINT', 'PS Maintenance'),
    ('LT', 'CC-LT-PROD', 'LT Production'),
    ('LT', 'CC-LT-MAINT', 'LT Maintenance'),
    ('CBP', 'CC-CBP-PROD', 'CBP Production'),
    ('CBP', 'CC-CBP-MAINT', 'CBP Maintenance');
