#!/usr/bin/env bash
#
# Apply the PartPulse migrations in the correct order.
#
#   ./backend/migrations/apply-migrations.sh <database> [mysql args...]
#
# Two files in this folder are superseded and are skipped: 004 uses syntax
# MySQL 8 rejects, and the original 008 was replaced by its _safe and
# _no_triggers variants. A plain glob over the folder hits both and fails.
#
# Every migration from 012 onward is idempotent, so re-running this script is
# safe. Take a backup before running it against production regardless.
#
set -euo pipefail

DB="${1:-}"
if [[ -z "$DB" ]]; then
    echo "usage: $0 <database> [mysql args...]" >&2
    exit 64
fi
shift

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ORDER=(
    002_documents_table.sql
    005_documents_many_to_many_mysql.sql
    006_approval_workflow.sql
    006_create_training_data_table.sql
    007_add_manager_role.sql
    008_order_assignment_system_no_triggers.sql
    008_order_assignment_system_safe.sql
    008_supplier_suggestions.sql
    009_supplier_notes_alt_product.sql
    010_quote_send_log.sql
    011_procurement_lifecycle.sql
    012_backend_hardening.sql
    013_restore_role_enum.sql
)

echo "Applying ${#ORDER[@]} migrations to '$DB'"

for file in "${ORDER[@]}"; do
    path="$HERE/$file"
    if [[ ! -f "$path" ]]; then
        echo "  missing: $file" >&2
        exit 1
    fi
    printf '  %-45s' "$file"
    if mysql "$@" "$DB" < "$path" > /dev/null 2>/tmp/partpulse-migration-error; then
        echo "ok"
    else
        echo "FAILED"
        echo
        cat /tmp/partpulse-migration-error >&2
        exit 1
    fi
done

echo
echo "All migrations applied."
echo "Migration 012 changes token_version, so every user must log in again."
