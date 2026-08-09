# Migrations

Apply these against the database you have selected on the connection. None of
the files contain a `USE` statement, so the same file works on staging and on
production:

```bash
mysql -u root -p partpulse_orders < backend/migrations/002_documents_table.sql
```

Use `apply-migrations.sh` rather than a shell glob. A plain
`for f in *.sql; do mysql < "$f"; done` will fail, because two files in this
folder are superseded and no longer valid.

```bash
# staging
./backend/migrations/apply-migrations.sh partpulse_orders

# production, after taking a backup
./backend/migrations/apply-migrations.sh partpulse_orders
```

## Order

| # | File | Notes |
|---|---|---|
| 002 | `002_documents_table.sql` | |
| 004 | `004_documents_many_to_many.sql` | **Superseded — do not apply.** Uses syntax MySQL 8 rejects. Replaced by 005. |
| 005 | `005_documents_many_to_many_mysql.sql` | The MySQL-compatible version of 004. |
| 006 | `006_approval_workflow.sql` | |
| 006 | `006_create_training_data_table.sql` | Independent of the approval workflow despite sharing a number. |
| 007 | `007_add_manager_role.sql` | Pins `users.role`; see the warning below. |
| 008 | `008_order_assignment_system.sql` | **Superseded — do not apply.** Replaced by the `_safe` and `_no_triggers` variants. |
| 008 | `008_order_assignment_system_no_triggers.sql` | |
| 008 | `008_order_assignment_system_safe.sql` | |
| 008 | `008_supplier_suggestions.sql` | |
| 009 | `009_supplier_notes_alt_product.sql` | |
| 010 | `010_quote_send_log.sql` | |
| 011 | `011_procurement_lifecycle.sql` | |
| 012 | `012_backend_hardening.sql` | Adds `token_version`. **Every user must log in again afterwards.** |
| 013 | `013_restore_role_enum.sql` | Restores the `accounting` role that 007 dropped. Must run after 007. |

## Two things to know

**007 pinned the role enum.** It sets `users.role` to
`ENUM('admin','procurement','requester','manager')`. The `accounting` role was
added to production by hand later and never captured in a migration, so a schema
rebuilt from migrations alone rejected every accounting user with
"Data truncated for column 'role'". Migration 013 is the authoritative
definition. If a role is ever added, write a new migration; do not edit an old
one.

**Everything from 012 onward is idempotent.** Each statement is guarded by an
`INFORMATION_SCHEMA` check, so re-applying a file is a no-op rather than a
"Duplicate column" failure halfway through. Earlier files are mostly guarded too.
Verified by applying the whole set three times in a row against a fresh copy of
the production schema.
