-- database/schema.sql
-- PartPulse Order Management System Database Schema

CREATE DATABASE IF NOT EXISTS partpulse_orders 
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE partpulse_orders;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role ENUM('admin', 'procurement', 'requester') NOT NULL,
    building VARCHAR(10),
    active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_role (role),
    INDEX idx_building (building)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    building VARCHAR(10) NOT NULL,
    item_description TEXT NOT NULL,
    quantity INT NOT NULL,
    date_needed DATE NOT NULL,
    notes TEXT,
    requester_id INT NOT NULL,
    requester_name VARCHAR(100) NOT NULL,
    requester_email VARCHAR(100) NOT NULL,
    status ENUM('Pending', 'Quote Requested', 'Quote Received', 
                'Ordered', 'In Transit', 'Delivered', 'Cancelled') 
                DEFAULT 'Pending',
    supplier VARCHAR(100),
    quote_id VARCHAR(50),
    price DECIMAL(10, 2) DEFAULT 0.00,
    assigned_to VARCHAR(50),
    submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_id) REFERENCES users(id),
    INDEX idx_building (building),
    INDEX idx_status (status),
    INDEX idx_assigned_to (assigned_to),
    INDEX idx_submission_date (submission_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Order files table
CREATE TABLE IF NOT EXISTS order_files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(100),
    file_size INT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    INDEX idx_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Order history table (for tracking changes)
CREATE TABLE IF NOT EXISTS order_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    changed_by VARCHAR(50) NOT NULL,
    field_name VARCHAR(50) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    INDEX idx_order_id (order_id),
    INDEX idx_changed_at (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- NOTE: Default user passwords need to be generated with bcrypt.
-- Run this on your server after npm install:
--   node -e "const bcrypt = require('bcrypt'); bcrypt.hash('Admin123!', 10).then(h => console.log(h));"
-- Then insert users with the generated hashes.

-- Placeholder inserts with dummy hashes (REPLACE hashes after generating real ones)
INSERT INTO users (username, password_hash, name, email, role, building) VALUES
('admin', '$2b$10$PLACEHOLDER_GENERATE_REAL_HASH_WITH_BCRYPT', 
 'Admin User', 'admin@partpulse.eu', 'admin', NULL),
('procurement1', '$2b$10$PLACEHOLDER_GENERATE_REAL_HASH_WITH_BCRYPT', 
 'Procurement User 1', 'proc1@partpulse.eu', 'procurement', NULL),
('procurement2', '$2b$10$PLACEHOLDER_GENERATE_REAL_HASH_WITH_BCRYPT', 
 'Procurement User 2', 'proc2@partpulse.eu', 'procurement', NULL),
('tech.ct', '$2b$10$PLACEHOLDER_GENERATE_REAL_HASH_WITH_BCRYPT', 
 'CT Head Technician', 'tech.ct@partpulse.eu', 'requester', 'CT'),
('tech.cb', '$2b$10$PLACEHOLDER_GENERATE_REAL_HASH_WITH_BCRYPT', 
 'CB Head Technician', 'tech.cb@partpulse.eu', 'requester', 'CB'),
('tech.ww', '$2b$10$PLACEHOLDER_GENERATE_REAL_HASH_WITH_BCRYPT', 
 'WW Head Technician', 'tech.ww@partpulse.eu', 'requester', 'WW'),
('tech.ps', '$2b$10$PLACEHOLDER_GENERATE_REAL_HASH_WITH_BCRYPT', 
 'PS Head Technician', 'tech.ps@partpulse.eu', 'requester', 'PS'),
('tech.lt', '$2b$10$PLACEHOLDER_GENERATE_REAL_HASH_WITH_BCRYPT', 
 'LT Head Technician', 'tech.lt@partpulse.eu', 'requester', 'LT');
