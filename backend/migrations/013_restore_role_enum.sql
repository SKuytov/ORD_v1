-- 013_restore_role_enum.sql
--
-- Migration 007 pinned users.role to ENUM('admin','procurement','requester','manager').
-- The 'accounting' role was added to production later by hand and never captured
-- in a migration, so production and the migration history disagree.
--
-- On the production database this migration changes nothing, because the column
-- already carries all five values. It matters when the schema is rebuilt from
-- the migrations alone — a new staging VM, a disaster-recovery restore, or CI.
-- In that case 007 was the last word on the column, every accounting user failed
-- to insert with "Data truncated for column 'role'", and the accounting screens
-- were unusable.
--
-- Keep this file as the single authoritative definition of the enum. If a new
-- role is ever added, add another migration rather than editing an old one.

ALTER TABLE users
    MODIFY COLUMN role ENUM('admin', 'procurement', 'requester', 'manager', 'accounting') NOT NULL;

SELECT 'Migration 013 complete: users.role accepts all five roles' AS Status;
