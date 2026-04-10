-- Migration 006: Saved Filter Presets & User Preferences
-- PartPulse World-Class Upgrade

CREATE TABLE IF NOT EXISTS user_preferences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    theme ENUM('dark', 'light') DEFAULT 'dark',
    row_density ENUM('compact', 'comfortable', 'spacious') DEFAULT 'comfortable',
    visible_columns JSON DEFAULT NULL,
    default_filter_preset_id INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
