-- Migration 012: backend hardening for clustered PM2 workers.
-- Apply once after taking a database backup.
--
-- Every statement below is guarded so the file can be re-applied safely. That
-- matters because the staging VM is rebuilt from these migrations, and a
-- migration that fails halfway on a second run leaves the schema in an
-- indeterminate state.
--
-- No `USE` statement: this runs against whichever database the client selects,
-- so the same file serves staging and production.

-- Revoke tokens issued before this migration and support server-side JWT versioning.
SET @has_token_version := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'token_version');
SET @sql := IF(@has_token_version = 0,
    'ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0 AFTER active',
    'SELECT "users.token_version already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Schedule rows were previously duplicated by concurrent invoice saves.
DELETE pr_old
FROM payment_reminders pr_old
JOIN payment_reminders pr_keep
  ON pr_old.invoice_meta_id = pr_keep.invoice_meta_id
 AND pr_old.remind_days_before = pr_keep.remind_days_before
 AND pr_old.id > pr_keep.id;

SET @has_pr_unique := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_reminders'
      AND INDEX_NAME = 'uq_payment_reminder_schedule');
SET @sql := IF(@has_pr_unique = 0,
    'ALTER TABLE payment_reminders ADD UNIQUE KEY uq_payment_reminder_schedule (invoice_meta_id, remind_days_before)',
    'SELECT "uq_payment_reminder_schedule already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_claim_token := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_reminders' AND COLUMN_NAME = 'claim_token');
SET @sql := IF(@has_claim_token = 0,
    'ALTER TABLE payment_reminders ADD COLUMN claim_token CHAR(36) NULL AFTER active',
    'SELECT "payment_reminders.claim_token already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_claim_expires := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_reminders' AND COLUMN_NAME = 'claim_expires_at');
SET @sql := IF(@has_claim_expires = 0,
    'ALTER TABLE payment_reminders ADD COLUMN claim_expires_at DATETIME NULL AFTER claim_token',
    'SELECT "payment_reminders.claim_expires_at already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_claim_idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_reminders'
      AND INDEX_NAME = 'idx_payment_reminder_claim');
SET @sql := IF(@has_claim_idx = 0,
    'ALTER TABLE payment_reminders ADD KEY idx_payment_reminder_claim (claim_expires_at)',
    'SELECT "idx_payment_reminder_claim already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- The Gemini service uses this key for an atomic one-job-per-order claim.
DELETE q_old
FROM gemini_enrichment_queue q_old
JOIN gemini_enrichment_queue q_keep
  ON q_old.order_id = q_keep.order_id
 AND q_old.id > q_keep.id;

SET @has_gemini_unique := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gemini_enrichment_queue'
      AND INDEX_NAME = 'uq_gemini_enrichment_order');
SET @sql := IF(@has_gemini_unique = 0,
    'ALTER TABLE gemini_enrichment_queue ADD UNIQUE KEY uq_gemini_enrichment_order (order_id)',
    'SELECT "uq_gemini_enrichment_order already exists"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- notification_log is also used for provider failures that are not tied to an order
-- (for example, an invoice reminder). NULL remains valid under its existing FK.
ALTER TABLE notification_log
    MODIFY COLUMN order_id INT NULL;

SELECT 'Migration 012 complete' AS Status;
