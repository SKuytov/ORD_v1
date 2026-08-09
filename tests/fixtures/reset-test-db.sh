#!/usr/bin/env bash
# Rebuild a TEST database from the production schema dump + migrations + fixtures.
#
# The seed fixture is insert-only, so it cannot be re-applied on top of itself
# (it collides on the primary key). Any test that mutates order data therefore
# needs a full rebuild rather than a re-seed. This script does that in one step.
#
#   ./tests/fixtures/reset-test-db.sh <schema-dump.sql> [database] [mysql args...]
#
# REFUSES to run against a database called 'partpulse' or anything passed with
# --i-know-this-is-production, so it cannot be pointed at the live system by
# accident.

set -euo pipefail

DUMP="${1:-}"
DB="${2:-partpulse_orders}"
shift 2 2>/dev/null || shift 1 2>/dev/null || true
MYSQL_ARGS=("$@")

if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
    echo "usage: $0 <schema-dump.sql> [database] [mysql args...]" >&2
    exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

echo "Rebuilding '$DB' from $(basename "$DUMP")"
echo "This DROPS the database. Do not point it at production."

mysql "${MYSQL_ARGS[@]}" -e \
    "DROP DATABASE IF EXISTS \`$DB\`; CREATE DATABASE \`$DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# --force is required: the production dump carries DEFINER=partpulse_user@localhost
# on its views, and a test user without SET USER cannot apply those. Without
# --force mysql aborts at the first DEFINER line and every ALTER TABLE ... ADD
# PRIMARY KEY after it is skipped, which leaves tables with no primary key and
# makes the later foreign-key migrations fail with a confusing errno 150.
mysql "${MYSQL_ARGS[@]}" --force "$DB" < "$DUMP" 2>&1 \
    | grep -v 'SET USER privilege' \
    | grep -i '^ERROR' && { echo "schema load failed" >&2; exit 1; } || true

"$REPO/backend/migrations/apply-migrations.sh" "$DB" "${MYSQL_ARGS[@]}" > /dev/null

# SMOKE_SEED lets run-all.sh point at an alternative fixture.
mysql "${MYSQL_ARGS[@]}" "$DB" < "${SMOKE_SEED:-$HERE/seed-test-data.sql}"

echo "Ready:"
mysql "${MYSQL_ARGS[@]}" "$DB" -N -e \
    "SELECT CONCAT('  orders: ', COUNT(*)) FROM orders;
     SELECT CONCAT('  users:  ', COUNT(*)) FROM users;"
