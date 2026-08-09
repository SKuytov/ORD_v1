// Check queue status + reset failed/rate-limited entries
try {
    require('@dotenvx/dotenvx').config({ path: __dirname + '/.env' });
} catch(_) {
    try { require('dotenv').config({ path: __dirname + '/.env' }); } catch(__) {}
}
const db = require('./backend/config/database');

async function check() {
    const [[stats]] = await db.query(`
        SELECT 
            SUM(status='pending') AS pending,
            SUM(status='done')    AS done,
            SUM(status='failed')  AS failed
        FROM gemini_enrichment_queue
    `);
    console.log('Queue stats:', stats);

    // Reset all "done" entries that produced 0 aliases (i.e. were 429'd)
    // We detect them: done but result_json IS NULL or contains error
    const [reset] = await db.query(`
        UPDATE gemini_enrichment_queue 
        SET status = 'pending', attempts = 0, processed_at = NULL
        WHERE status = 'done' 
          AND (result_json IS NULL OR result_json = '' OR result_json LIKE '%429%' OR result_json LIKE '%RESOURCE_EXHAUSTED%')
    `);
    console.log('Reset', reset.affectedRows, 'rate-limited entries back to pending');

    const [[after]] = await db.query(`
        SELECT 
            SUM(status='pending') AS pending,
            SUM(status='done')    AS done,
            SUM(status='failed')  AS failed
        FROM gemini_enrichment_queue
    `);
    console.log('Queue after reset:', after);

    const [[{aliases}]] = await db.query('SELECT COUNT(*) AS aliases FROM product_aliases');
    console.log('product_aliases rows:', aliases);

    process.exit(0);
}
check().catch(e => { console.error(e.message); process.exit(1); });
