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

# The rebuild is delegated to reset-test-db.sh so that the runner and a manual
# reset cannot drift apart. That script also passes --force when loading the
# schema: the production dump carries DEFINER clauses a test user cannot apply,
# and without --force mysql stops at the first one, skipping every later
# ALTER TABLE ... ADD PRIMARY KEY and leaving the foreign-key migrations to fail
# with a misleading errno 150.
echo "==> rebuilding $DB from $(basename "$SCHEMA")"
sudo -n env SMOKE_SEED="$SEED" "$ROOT/tests/fixtures/reset-test-db.sh" "$SCHEMA" "$DB"

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

# Pure rule checks — no server, no database.
echo
echo "==> lifecycle-rules"
node "$ROOT/tests/smoke/lifecycle-rules.js" || status=1

# Each suite gets a freshly rebuilt database, because they all move orders
# between statuses and the seed fixture is insert-only, so it cannot simply be
# re-applied on top of itself.
for suite in api-smoke workflow-e2e concurrency lifecycle-enforcement; do
    echo
    echo "==> $suite"
    sudo -n env SMOKE_SEED="$SEED" "$ROOT/tests/fixtures/reset-test-db.sh" "$SCHEMA" "$DB" > /dev/null
    node "$ROOT/tests/smoke/$suite.js" || status=1
done

pkill -f "node server.js" 2>/dev/null || true
exit "$status"
