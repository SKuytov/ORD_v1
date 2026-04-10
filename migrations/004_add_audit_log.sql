-- Migration 004: Full Audit Trail
-- PartPulse World-Class Upgrade

CREATE TABLE IF NOT EXISTS order_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    action ENUM('created', 'status_change', 'field_edit', 'assignment', 'comment', 'file_upload', 'file_delete', 'template_used', 'recurring_created', 'approval_requested', 'approved', 'rejected') NOT NULL,
    field_name VARCHAR(100) DEFAULT NULL,
    old_value TEXT DEFAULT NULL,
    new_value TEXT DEFAULT NULL,
    performed_by INT NOT NULL,
    performed_by_name VARCHAR(255),
    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45) DEFAULT NULL,
    details JSON DEFAULT NULL,
    INDEX idx_order_id (order_id),
    INDEX idx_performed_by (performed_by),
    INDEX idx_performed_at (performed_at),
    INDEX idx_action (action),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
