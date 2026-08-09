#!/usr/bin/env bash
#
# PartPulse Orders — full verification run.
#
# Rebuilds a throwaway database from the production schema dump, seeds it,
# starts the API, and runs every smoke suite against it. Intended for the
# staging VM and for CI; it never touches production.
#
#   ./tests/smoke/run-all.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${SMOKE_DB:-partpulse_smoke}"
SCHEMA="${SMOKE_SCHEMA:?set SMOKE_SCHEMA to the schema dump path}"
SEED="${SMOKE_SEED:-$ROOT/tests/fixtures/seed-test-data.sql}"
PORT="${SMOKE_PORT:-3000}"

echo "==> rebuilding $DB from $(basename "$SCHEMA")"
sudo -n mysql -e "DROP DATABASE IF EXISTS \`$DB\`; CREATE DATABASE \`$DB\`;"
sudo -n mysql "$DB" < "$SCHEMA"

for migration in "$ROOT"/backend/migrations/*.sql; do
    sudo -n mysql "$DB" < "$migration" 2>/dev/null || echo "    skipped $(basename "$migration")"
done

echo "==> seeding"
sudo -n mysql "$DB" < "$SEED" >/dev/null

echo "==> starting the API on port $PORT"
pkill -f "node server.js" 2>/dev/null || true
sleep 1
(cd "$ROOT/backend" && DB_NAME="$DB" PORT="$PORT" node server.js > /tmp/smoke-app.log 2>&1 &)

for _ in $(seq 1 30); do
    if curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1; then break; fi
    sleep 1
done
curl -sf "http://localhost:$PORT/api/health" >/dev/null || { echo "server never became healthy"; tail -20 /tmp/smoke-app.log; exit 1; }

status=0
for suite in api-smoke workflow-e2e concurrency; do
    echo
    echo "==> $suite"
    node "$ROOT/tests/smoke/$suite.js" || status=1
done

pkill -f "node server.js" 2>/dev/null || true
exit "$status"
