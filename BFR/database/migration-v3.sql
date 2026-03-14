-- database/migration-v3.sql
-- PartPulse V3 Migration - Buildings master data
-- Run on existing DB:
--   mysql -u partpulse_user -p partpulse_orders < database/migration-v3.sql

USE partpulse_orders;

-- Buildings master table (codes are used in users.building and orders.building)
CREATE TABLE IF NOT EXISTS buildings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_code (code),
    INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed initial buildings (safe if already present)
INSERT IGNORE INTO buildings (code, name, description, active) VALUES
('CT', 'CT', 'CT building', 1),
('CB', 'CB', 'CB building', 1),
('WW', 'WW', 'WW building', 1),
('PS', 'PS', 'PS building', 1),
('LT', 'LT', 'LT building', 1);
