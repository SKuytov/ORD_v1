-- Migration 002: Order Templates
-- PartPulse World-Class Upgrade

CREATE TABLE IF NOT EXISTS order_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    building VARCHAR(50),
    cost_center_id INT,
    item_description TEXT NOT NULL,
    part_number VARCHAR(100),
    category VARCHAR(100),
    quantity INT DEFAULT 1,
    priority ENUM('Low', 'Normal', 'High', 'Urgent') DEFAULT 'Normal',
    notes TEXT,
    equipment_id VARCHAR(100),
    supplier_id INT,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    active TINYINT(1) DEFAULT 1,
    use_count INT DEFAULT 0,
    INDEX idx_created_by (created_by),
    INDEX idx_active (active),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
