-- database/migration-v5.sql
-- PartPulse V5 Migration - Supplier Notes & Alternative Product Fields
-- Run on existing DB:
--   mysql -u partpulse_user -p partpulse_orders < database/migration-v5.sql

USE partpulse_orders;

-- Add supplier notes (internal procurement notes about supplier for this order)
ALTER TABLE orders ADD COLUMN supplier_notes TEXT DEFAULT NULL AFTER notes;

-- Add alternative product fields (procurement can suggest alternatives)
ALTER TABLE orders ADD COLUMN alternative_product_name VARCHAR(255) DEFAULT NULL AFTER supplier_notes;
ALTER TABLE orders ADD COLUMN alternative_product_description TEXT DEFAULT NULL AFTER alternative_product_name;
