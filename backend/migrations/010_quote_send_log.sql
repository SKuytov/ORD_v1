-- Migration 010: Quote Send Log
-- Tracks every time a quote email is sent/composed

CREATE TABLE IF NOT EXISTS quote_send_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quote_id INT NOT NULL,
    sent_by INT NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    method ENUM('outlook', 'copy', 'link') NOT NULL DEFAULT 'outlook',
    supplier_email VARCHAR(255),
    notes TEXT,
    FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE,
    FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_quote_send_log_quote_id (quote_id)
);
