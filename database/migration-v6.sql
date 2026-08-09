-- Migration v6: Full Audit Trail
-- user_login_log + order_assignment_history (idempotent — safe to re-run)
USE partpulse_orders;

-- ─────────────────────────────────────────────────────────────────────────────
-- user_login_log: records every login attempt (success + failure)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_login_log (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NULL,                          -- NULL for failed attempts (unknown user)
    username      VARCHAR(50) NOT NULL,
    name          VARCHAR(100) NULL,
    role          VARCHAR(30) NULL,
    building      VARCHAR(10) NULL,
    success       TINYINT(1) NOT NULL DEFAULT 0,
    failure_reason VARCHAR(100) NULL,                -- 'invalid_password', 'user_not_found', 'inactive'
    ip_address    VARCHAR(45) NULL,                  -- supports IPv6
    user_agent    VARCHAR(500) NULL,
    logged_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id    (user_id),
    INDEX idx_username   (username),
    INDEX idx_logged_at  (logged_at),
    INDEX idx_success    (success)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- order_assignment_history: tracks who assigned/claimed/released orders
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_assignment_history (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    order_id              INT NOT NULL,
    assigned_from_user_id INT NULL,
    assigned_to_user_id   INT NULL,
    assigned_by_user_id   INT NULL,
    assignment_type       ENUM('claim','assign','release','transfer') DEFAULT 'assign',
    reason                VARCHAR(255) NULL,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    INDEX idx_order_id   (order_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- Widen order_history.changed_by and field_name to hold full names
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE order_history
    MODIFY COLUMN changed_by VARCHAR(150) NOT NULL DEFAULT 'system',
    MODIFY COLUMN field_name VARCHAR(100) NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Add last_login_at to users for quick reference
-- ─────────────────────────────────────────────────────────────────────────────
SET @exist_ll := (SELECT COUNT(*) FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='last_login_at');
SET @sql_ll := IF(@exist_ll=0,
    'ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP NULL DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @sql_ll; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- FULLTEXT index for power search (item_description, notes, alt product fields)
-- InnoDB supports FULLTEXT from MySQL 5.6+
-- ─────────────────────────────────────────────────────────────────────────────
SET @exist_ft := (SELECT COUNT(*) FROM information_schema.STATISTICS
                  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders'
                  AND INDEX_NAME='ft_orders_search');
SET @sql_ft := IF(@exist_ft=0,
    'ALTER TABLE orders ADD FULLTEXT INDEX ft_orders_search (item_description, notes, alternative_product_name, alternative_product_description)',
    'SELECT 1');
PREPARE stmt FROM @sql_ft; EXECUTE stmt; DEALLOCATE PREPARE stmt;
