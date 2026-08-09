-- Migration 007: Add Manager Role to Users Table
-- Run: mysql -u partpulse_user -p'410010Kuyto-' partpulse_orders < backend/migrations/007_add_manager_role.sql

-- Deliberately no `USE partpulse_orders;` here. This migration runs against
-- whichever database the client selects, so the same file can be applied to the
-- staging database and to production. With the USE statement in place, running
-- this against staging silently altered the production database instead.
-- Update users table to add 'manager' role to the enum
ALTER TABLE users 
MODIFY COLUMN role ENUM('admin', 'procurement', 'requester', 'manager') NOT NULL;

SELECT 'Manager role added to users table successfully!' as Status;
