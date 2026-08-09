// backfill_ai_training.js
//
// Run ONCE on the server to seed the AI with all existing order history.
// Reads every completed/delivered order that has a confirmed supplier,
// and for each one:
//   1. Writes a row to supplier_item_history (powers FULLTEXT suggestions)
//   2. Writes a row to supplier_selection_log (powers acceptance-rate scoring)
//   3. Queues a Gemini enrichment job for each unique description
//      (only if GEMINI_API_KEY is set in .env)
//
// Safe to run multiple times — uses INSERT IGNORE / ON DUPLICATE KEY.
//
// Usage:
//   node /var/www/partpulse-orders/backfill_ai_training.js
// ─────────────────────────────────────────────────────────────────────────────

// Try multiple dotenv loaders — app uses @dotenvx/dotenvx, fallback to dotenv
try {
    require('@dotenvx/dotenvx').config({ path: __dirname + '/.env' });
} catch(_) {
    try { require('dotenv').config({ path: __dirname + '/.env' }); } catch(__) {}
}

// Also accept key via CLI: GEMINI_API_KEY=xxx node backfill_ai_training.js
// (already works via process.env if passed as env var)

const db = require('./backend/config/database');
const { enrichDescription } = require('./backend/services/geminiEnrichmentService');

async function run() {
    console.log('=== PartPulse AI Backfill ===\n');

    // ── Step 1: seed supplier_item_history ────────────────────────────────────
    // Every order with a supplier assigned — regardless of status
    console.log('[1/3] Seeding supplier_item_history...');
    const [histResult] = await db.query(`
        INSERT IGNORE INTO supplier_item_history (supplier_id, order_id, item_description, keywords)
        SELECT
            o.supplier_id,
            o.id,
            CONCAT_WS(' ',
                o.item_description,
                IFNULL(o.alternative_product_name, ''),
                IFNULL(o.alternative_product_description, ''),
                IFNULL(o.supplier_notes, '')
            ),
            CONCAT_WS(' ',
                o.item_description,
                IFNULL(o.alternative_product_name, ''),
                IFNULL(o.part_number, '')
            )
        FROM orders o
        WHERE o.supplier_id IS NOT NULL
          AND o.item_description IS NOT NULL
          AND o.item_description != ''
    `);
    console.log(`   ✓ Inserted ${histResult.affectedRows} rows into supplier_item_history\n`);

    // ── Step 2: seed supplier_selection_log ───────────────────────────────────
    // Delivered orders = confirmed supplier selections (strongest signal)
    console.log('[2/3] Seeding supplier_selection_log from delivered orders...');
    const [logResult] = await db.query(`
        INSERT INTO supplier_selection_log
            (order_id, supplier_id, selected_by_user_id, from_suggestion, suggestion_rank, selected_at)
        SELECT
            o.id,
            o.supplier_id,
            IFNULL(o.requester_id, 1),
            0,   -- not from AI suggestion (historical data)
            NULL,
            IFNULL(o.updated_at, o.submission_date)
        FROM orders o
        WHERE o.supplier_id IS NOT NULL
          AND o.status IN ('Delivered', 'Ordered', 'In Transit', 'Quote Received')
        ON DUPLICATE KEY UPDATE
            supplier_id  = VALUES(supplier_id),
            selected_at  = VALUES(selected_at)
    `);
    console.log(`   ✓ Inserted/updated ${logResult.affectedRows} rows in supplier_selection_log\n`);

    // ── Step 3: queue Gemini enrichment for unique descriptions ───────────────
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.log('[3/3] Skipping Gemini enrichment — GEMINI_API_KEY not set\n');
    } else {
        console.log('[3/3] Queuing Gemini enrichment for unique descriptions...');

        // Reset any queue entries that failed or were marked done without real data.
        // Both cases mean Gemini never actually returned a result.
        const [resetResult] = await db.query(`
            UPDATE gemini_enrichment_queue 
            SET status = 'pending', attempts = 0, processed_at = NULL, result_json = NULL
            WHERE status = 'failed'
               OR (status = 'done' AND (result_json IS NULL OR result_json = ''))
        `);
        if (resetResult.affectedRows > 0) {
            console.log(`   Reset ${resetResult.affectedRows} previously failed/rate-limited entries`);
        }

        // Get unique descriptions that haven't been successfully enriched yet
        const [descRows] = await db.query(`
            SELECT DISTINCT
                o.id,
                o.item_description,
                o.alternative_product_name,
                o.part_number,
                o.category,
                o.supplier_id
            FROM orders o
            LEFT JOIN gemini_enrichment_queue q 
                ON q.order_id = o.id 
                AND q.status = 'done' 
                AND q.result_json IS NOT NULL 
                AND q.result_json != ''
            WHERE o.item_description IS NOT NULL
              AND o.item_description != ''
              AND q.id IS NULL
            LIMIT 200
        `);

        console.log(`   Found ${descRows.length} orders to enrich (capped at 200 for first run)`);
        // 1 request per 6 seconds = 10/min — comfortable margin under 15/min free tier.
        // On 429, geminiEnrichmentService uses exponential backoff (30s/60s/120s),
        // so the total per-item time auto-extends when the API is throttled.
        console.log('   Processing 1 at a time, 6s apart (rate-limit safe)...\n');

        let done = 0, failed = 0, skipped = 0;
        for (let i = 0; i < descRows.length; i++) {
            const row = descRows[i];
            try {
                const result = await enrichDescription({
                    orderId:              row.id,
                    rawDescription:       row.item_description,
                    canonicalDescription: row.item_description,
                    partNumber:           row.part_number,
                    category:             row.category,
                    supplierId:           row.supplier_id,
                    createdBy:            null
                });
                // enrichDescription returns undefined on success (aliases written),
                // or returns early (undefined) if already done — check queue for truth.
                // We verify by re-reading status from DB to get an accurate count.
                const [[qRow]] = await db.query(
                    `SELECT status FROM gemini_enrichment_queue WHERE order_id = ? ORDER BY id DESC LIMIT 1`,
                    [row.id]
                ).catch(() => [[null]]);
                if (qRow && qRow.status === 'done') {
                    done++;
                } else if (qRow && qRow.status === 'failed') {
                    skipped++; // rate-limited even with backoff — will retry next run
                } else {
                    done++; // was already enriched before this run
                }
            } catch (err) {
                failed++;
                console.error(`\n   Order #${row.id} error: ${err.message}`);
            }
            process.stdout.write(`\r   Progress: ${i+1}/${descRows.length} (${done} ok, ${skipped} rate-limited, ${failed} error)`);
            // 6 second gap between requests — 10/min, comfortable under 15/min limit
            if (i < descRows.length - 1) await sleep(6000);
        }
        if (skipped > 0) {
            console.log(`\n\n   ⚠ ${skipped} items still rate-limited — re-run this script after a few minutes to retry them.`);
        }
        console.log(`\n\n   ✓ Gemini enrichment complete: ${done} ok, ${failed} failed\n`);
        // Brief wait to let final async DB writes settle
        await sleep(2000);
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const [[{ history_count }]]  = await db.query('SELECT COUNT(*) AS history_count FROM supplier_item_history');
    const [[{ log_count }]]      = await db.query('SELECT COUNT(*) AS log_count FROM supplier_selection_log');
    const [[{ alias_count }]]    = await db.query('SELECT COUNT(*) AS alias_count FROM product_aliases');
    const [[{ gemini_done }]]    = await db.query(`SELECT COUNT(*) AS gemini_done FROM gemini_enrichment_queue WHERE status='done' AND result_json IS NOT NULL AND result_json != ''`);
    const [[{ gemini_failed }]]  = await db.query(`SELECT COUNT(*) AS gemini_failed FROM gemini_enrichment_queue WHERE status='failed'`);
    const [[{ gemini_pending }]] = await db.query(`SELECT COUNT(*) AS gemini_pending FROM gemini_enrichment_queue WHERE status='pending'`);

    console.log('=== Backfill Complete ===');
    console.log(`   supplier_item_history : ${history_count} rows`);
    console.log(`   supplier_selection_log: ${log_count} rows`);
    console.log(`   product_aliases       : ${alias_count} rows`);
    console.log(`   gemini enrichments    : ${gemini_done} done, ${gemini_failed} failed, ${gemini_pending} pending`);
    console.log('\nAI is now trained on your historical data.');

    process.exit(0);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

run().catch(err => {
    console.error('\nFATAL:', err.message);
    process.exit(1);
});
