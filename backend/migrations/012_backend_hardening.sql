-- Migration 012: backend hardening for clustered PM2 workers.
-- Apply once after taking a database backup.

-- Revoke tokens issued before this migration and support server-side JWT versioning.
ALTER TABLE users
    ADD COLUMN token_version INT NOT NULL DEFAULT 0 AFTER active;

-- Schedule rows were previously duplicated by concurrent invoice saves.
DELETE pr_old
FROM payment_reminders pr_old
JOIN payment_reminders pr_keep
  ON pr_old.invoice_meta_id = pr_keep.invoice_meta_id
 AND pr_old.remind_days_before = pr_keep.remind_days_before
 AND pr_old.id > pr_keep.id;

ALTER TABLE payment_reminders
    ADD UNIQUE KEY uq_payment_reminder_schedule (invoice_meta_id, remind_days_before),
    ADD COLUMN claim_token CHAR(36) NULL AFTER active,
    ADD COLUMN claim_expires_at DATETIME NULL AFTER claim_token,
    ADD KEY idx_payment_reminder_claim (claim_expires_at);

-- The Gemini service uses this key for an atomic one-job-per-order claim.
DELETE q_old
FROM gemini_enrichment_queue q_old
JOIN gemini_enrichment_queue q_keep
  ON q_old.order_id = q_keep.order_id
 AND q_old.id > q_keep.id;

ALTER TABLE gemini_enrichment_queue
    ADD UNIQUE KEY uq_gemini_enrichment_order (order_id);

-- notification_log is also used for provider failures that are not tied to an order
-- (for example, an invoice reminder). NULL remains valid under its existing FK.
ALTER TABLE notification_log
    MODIFY COLUMN order_id INT NULL;
