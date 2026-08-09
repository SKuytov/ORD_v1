# PartPulse Orders — upgrade guide

This is the version of the app now on `main`. It is production's code, plus the
fixes made during this review, verified against a database rebuilt from your
production schema dump.

Read the whole of "Before you start" before touching the production VM.

---

## Before you start

**Two changes in here will log everyone out and will reject some requests that
used to succeed. Neither is a bug.**

1. **Migration 012 adds `users.token_version`.** Existing JWTs no longer
   validate. Every user — you included — has to log in again after deployment.
   Tell people before you do it, not after.

2. **The order lifecycle is now enforced server-side.** Transitions that the API
   previously allowed are now rejected. The permitted moves are listed in
   `backend/controllers/orderController.js`. If someone has a habit of skipping
   a step, they will hit an error. Check the table matches how you actually
   work before you deploy — it is a data question, not a code question.

**Take a database backup first.** `partpulse_backup.sh` is in the repository
root. Migration 012 deletes duplicate rows from `payment_reminders` and
`gemini_enrichment_queue` before adding unique keys to those tables. That
deletion is not reversible without a backup.

---

## Staging first

You said you wanted a separate Ubuntu VM to validate against before touching
production. That is the right call, and the migrations now support it — they
previously did not (see "What changed", item 4).

```bash
# on the staging VM
git clone https://github.com/SKuytov/ORD_v1.git
cd ORD_v1

# restore a copy of production data under a different database name
mysql -u root -p -e "CREATE DATABASE partpulse_staging;"
mysql -u root -p partpulse_staging < /path/to/partpulse_orders.sql

# apply migrations to the staging database
./backend/migrations/apply-migrations.sh partpulse_staging -u root -p
```

Use `apply-migrations.sh`, not a shell glob over the folder. Two files in
`backend/migrations/` are superseded and broken: `004_documents_many_to_many.sql`
uses syntax MySQL 8 rejects, and the original `008_order_assignment_system.sql`
was replaced by its `_safe` and `_no_triggers` variants. A loop over `*.sql`
hits both and dies partway. The script applies the correct thirteen in order.

Point `backend/.env` at `partpulse_staging`, start the app, and work through
the flows you use daily: raise an order, request a quote, approve it, issue a
PO, receive it partially, then fully, and check the financial documents.

There is a test suite in `tests/smoke/`. It needs the app running and the
fixtures loaded:

```bash
mysql -u root -p partpulse_staging < tests/fixtures/seed-test-data.sql
node tests/smoke/api-smoke.js       # 35 checks
node tests/smoke/workflow-e2e.js    # 17 checks
node tests/smoke/concurrency.js     #  8 checks
```

Run them individually. `run-all.sh` works but takes long enough to trip most
timeouts. All 60 pass on this code.

---

## Deploying to production

```bash
# 1. back up
./partpulse_backup.sh

# 2. pull
cd /var/www/partpulse-orders
git fetch origin
git checkout main
git pull origin main

# 3. dependencies
cd backend && npm install --omit=dev && cd ..

# 4. migrations
./backend/migrations/apply-migrations.sh partpulse_orders -u root -p

# 5. reload
pm2 reload partpulse-orders
pm2 logs partpulse-orders --lines 50
```

Then log in yourself and confirm the dashboard, the Approvals tab and one
document download all work before telling anyone else the upgrade is done.

### Rolling back

```bash
git checkout <previous-commit>
pm2 reload partpulse-orders
```

The schema changes are additive apart from the two de-duplications noted above,
so the previous code runs against the migrated schema. If you need the data
back as it was, restore the backup.

---

## Two things to fix on the server, outside the code

**1. `frontend/.env` is being served over HTTP.** You confirmed
`http://100.89.57.33/.env` returns the file. It is reachable only over Tailscale
today, which is what makes this urgent rather than an emergency. Removing the
Express static mount does not fix it, because Nginx serves that directory
directly. In your server block:

```nginx
location ~ /\. {
    deny all;
    return 404;
}
```

Then delete `frontend/.env` from the server and rotate anything that was in it.
Treat those values as disclosed — assume they leaked, because you cannot prove
they did not.

**2. The Nginx `location /uploads` alias bypasses the application.** Uploaded
documents are served by Nginx without ever reaching the app, so the permission
checks in the code do not apply to them. Anyone who can reach the server can
fetch any document if they know or guess the filename. Remove that block and
let the app serve them through its authenticated download route.

Both are deliberately left for you, since you asked to validate on staging
before changing production.

---

## What changed

### 1. `main` now matches production

Production had drifted a long way ahead of the repository — frontend `app.js` is
6,072 lines in production against 2,047 in the old `main`. Every conflict was
resolved in production's favour, so nothing running today changes behaviour
except the fixes listed below.

Three older pull requests (#2, #3, #4, all from April) were closed as superseded
rather than merged. They were written against the old, much smaller codebase and
merging them would have regressed live behaviour. Their branches still exist.

### 2. Five defects that only appeared against a real database

These were found by running against your actual schema with real data shapes.
Syntax checks and code review had passed all five.

- **The SPA catch-all returned `index.html` with status 200 for any unmatched
  path.** A mistyped API call got HTML that then failed to parse as JSON, and
  `/uploads` appeared to be a public route. Unmatched `/api/*` paths now return
  a real 404.
- **The lifecycle table rejected ordinary work.** Ordered → Delivered without an
  In Transit step, cancelling after approval, and resuming from On Hold were all
  blocked. All three are legitimate and now permitted.
- **A Delivered order could be confirmed delivered a second time,** overwriting
  the recorded quantities and dates. Now rejected.
- **Order status was derived from every item on the purchase order** rather than
  from the items belonging to that order. Because one PO can cover several
  orders — `purchase_orders` has no `order_id`, the link is through
  `po_items.order_id` — a fully received order stayed stuck at "Partially
  Delivered" whenever it shared a PO with an outstanding one.
- **Migration 007 pinned `users.role` to a list that omits `accounting`.** That
  role was added to production by hand and never captured in a migration, so any
  schema rebuilt from migrations rejected every accounting login with "Data
  truncated for column 'role'". This would have hit your new staging VM on day
  one. `013_restore_role_enum.sql` is now the authoritative definition.

### 3. Two defects the merge itself introduced

Four files merged without a conflict marker and silently took `main`'s version.
Three of those were wrong, and a clean `git merge` would have shipped them:

- `quoteController.js` ended up with **two definitions each** of
  `getQuoteEmailData`, `logQuoteSend` and `getQuoteSendLog`. In JavaScript the
  later definition wins, so main's older copies replaced production's — losing
  the transaction wrapping the send log and the `cost_centers` join. Silent: the
  file parses, the routes resolve, and the endpoints respond.
- `approvals.js` and `approval-submission.js` took main's rewrite, which renders
  into an element with id `approvalsTableBody`. Production's `index.html`, which
  we kept, has `approvalsTable` and no such tbody — **the Approvals tab would
  have rendered nothing at all.**

All three files were reverted to production's versions.

### 4. The migrations were only safe against production

Four migrations began with `USE partpulse_orders`. Applying one to a staging
database silently altered **production** instead — exactly the trap your
staging-first plan was meant to avoid. The `USE` statements are gone and every
`INFORMATION_SCHEMA` guard now uses `DATABASE()`, so a migration acts on
whichever database the client selected.

Two further problems in the same area:

- `006` created its index with `CREATE INDEX IF NOT EXISTS`, which is MariaDB
  syntax and a parse error on MySQL 8. An earlier attempt to fix it used a bare
  `CREATE INDEX`, which then failed with "Duplicate key name" on any re-run.
  It now uses the guarded pattern already used elsewhere in that file.
- `012` was not re-runnable at all.

Everything from 012 onward is now idempotent. Verified by applying the full set
three times consecutively against a fresh copy of your production schema:
13 applied, 0 failed, on every pass.

### 5. Access control and cost centres

Merged from the review branches: the access-control fixes (#6), the cost-centre
column corrections (#7), and the workflow-enforcement endpoints (#8).

---

## Known issues, not fixed

**PO number allocation has a race.** Two PM2 workers can pick the same
`po_number` simultaneously. `po_number` carries a unique index, so a duplicate
cannot be written — the losing worker gets a constraint error instead of
retrying cleanly. The user sees a failure and retries successfully. It is
annoying, not corrupting, which is why it was left alone. The fix is a retry
loop or a dedicated sequence table.

**`database/seed-users.js` contains default passwords** (`Admin123!`, `Proc123!`,
`Tech123!`). None of those accounts exist in your production database, so
nothing is exposed today. But the file will happily create them if it is ever
run against production. Treat it as development-only, or delete it.

**Dead files are still in the repository.** `backend/utils/emailService---.js`,
`backend/utils/emailService-------------.js`, `backend/utils/emailService.js.save`,
`backend/server-.js` and `ecosystem.config.js.save` are editor backups. Nothing
references them and they do not run. They are kept because you said production
is the source of truth and removing files was not part of this pass — but they
are safe to delete whenever you want, and worth deleting, because a stale
`emailService` copy next to the real one is a trap for whoever reads this code
next.

**The five restored frontend files are not wired in.** At your request,
`procurement-workspace.js`, `procurement-workspace.css`, `supplier-ai.js`,
`partpulse-mobile.css` and `partpulse-design-upgrade.css` were restored rather
than left deleted. `index.html` does not reference any of them, so they do not
execute and cannot affect the running app. If you ever do wire
`procurement-workspace.js` in, note that it defines `escHtml` and `showToast`,
which already exist elsewhere — you will get a collision and will need to rename
one side first.

---

## Verification

Against a MySQL database rebuilt from your production schema dump, with the app
running under Node 18:

| Suite | Checks | Result |
|---|---|---|
| `tests/smoke/api-smoke.js` | 35 | pass |
| `tests/smoke/workflow-e2e.js` | 17 | pass |
| `tests/smoke/concurrency.js` | 8 | pass |
| **Total** | **60** | **0 failures** |

Also checked: every `.js` file in `backend/` and `frontend/` parses; every
script and stylesheet referenced by `index.html` resolves to a file that exists;
no controller defines the same export twice; the full migration set applies
three times in a row without error.

Test accounts created by `tests/fixtures/seed-test-data.sql` are `stg_admin`,
`stg_procurement`, `stg_requester`, `stg_requester2`, `stg_manager` and
`stg_accounting`, password `StagingTest!2026`. **Log in with the username, not
the email address.** The fixture splits its twenty orders 12/8 between the two
requester accounts so that per-user scoping is actually exercised rather than
assumed.
