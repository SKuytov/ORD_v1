/**
 * PartPulse Orders — concurrency test.
 *
 * Production runs PM2 in cluster mode with two workers, so any check that reads
 * a row and then writes it can interleave. This fires simultaneous requests at
 * the endpoints where a race would corrupt data and asserts that exactly one
 * request wins.
 *
 *   node tests/smoke/concurrency.js
 */

const { execFileSync } = require('child_process');

const BASE = 'http://localhost:3000';
const PASSWORD = 'StagingTest!2026';

let passed = 0;
const failures = [];

function check(name, condition, detail) {
    if (condition) { passed++; console.log(`  pass  ${name}`); }
    else { failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

function sql(query) {
    return execFileSync('sudo', ['-n', 'mysql', '-N', '-B', 'partpulse_orders', '-e', query])
        .toString().trim();
}

async function call(method, path, { token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${BASE}${path}`, {
        method, headers, body: body ? JSON.stringify(body) : undefined
    });
    let json = null;
    try { json = await res.json(); } catch { /* not json */ }
    return { status: res.status, body: json };
}

async function login(username) {
    const r = await call('POST', '/api/auth/login', { body: { username, password: PASSWORD } });
    return r.body?.token;
}

(async () => {
    console.log('\nPartPulse concurrency\n');
    const admin = await login('stg_admin');
    if (!admin) { console.log('no admin token'); process.exit(1); }

    // --------------------------------------------------- double approval race
    console.log('approval double-submit');
    const pendingId = sql("SELECT id FROM approvals WHERE status = 'pending' ORDER BY id LIMIT 1");
    if (pendingId) {
        const attempts = await Promise.all(Array.from({ length: 8 }, () =>
            call('PUT', `/api/approvals/${pendingId}/approve`, { token: admin, body: { comments: 'race' } })
        ));
        const wins = attempts.filter(a => a.status === 200 && a.body?.success === true).length;
        check('only one of eight simultaneous approvals succeeds', wins === 1, `${wins} succeeded`);

        const rows = Number(sql(`SELECT COUNT(*) FROM approvals WHERE id = ${pendingId} AND status = 'approved'`));
        check('the approval is recorded exactly once', rows === 1, `${rows} approved rows`);
    } else {
        console.log('  skip  no pending approval');
    }

    // ------------------------------------------------ duplicate delivery race
    console.log('\ndelivery double-submit');
    const row = sql("SELECT CONCAT_WS('|', pi.po_id, pi.order_id, pi.id, pi.quantity) FROM po_items pi WHERE pi.received_quantity = 0 LIMIT 1");
    if (row) {
        const [, orderId, itemId, quantity] = row.split('|').map(Number);
        sql(`UPDATE orders SET status = 'Ordered' WHERE id = ${orderId}`);
        sql(`INSERT INTO documents (order_id, document_type, file_name, file_path, file_size, mime_type, uploaded_by, uploaded_at, status)
             VALUES (${orderId}, 'delivery_proof', 'race.pdf', '/uploads/race.pdf', 512, 'application/pdf', 1001, NOW(), 'pending')`);
        const proofId = Number(sql(`SELECT id FROM documents WHERE order_id = ${orderId} ORDER BY id DESC LIMIT 1`));

        const payload = {
            actual_delivery_date: '2026-08-09', partial: false,
            items: [{ id: itemId, received_quantity: quantity }], proof_document_id: proofId
        };
        const results = await Promise.all(Array.from({ length: 6 }, () =>
            call('POST', `/api/orders/${orderId}/confirm-delivery`, { token: admin, body: payload })
        ));
        const ok = results.filter(r => r.status === 200).length;
        check('concurrent delivery confirmations do not all succeed', ok <= 1, `${ok} succeeded`);

        const received = Number(sql(`SELECT received_quantity FROM po_items WHERE id = ${itemId}`));
        check('the received quantity was not double counted', received <= quantity,
            `received ${received} against an ordered quantity of ${quantity}`);
    } else {
        console.log('  skip  no unreceived po item');
    }

    // -------------------------------------------- concurrent bulk assignment
    console.log('\nbulk assignment under load');
    const ids = sql("SELECT GROUP_CONCAT(id) FROM (SELECT id FROM orders WHERE status IN ('New','Pending') LIMIT 3) t");
    if (ids) {
        const orderIds = ids.split(',').map(Number);
        const suppliers = sql('SELECT GROUP_CONCAT(id) FROM (SELECT id FROM suppliers LIMIT 2) t').split(',').map(Number);
        const both = await Promise.all(suppliers.map(sid =>
            call('POST', '/api/orders/bulk-assign-supplier', { token: admin, body: { order_ids: orderIds, supplier_id: sid } })
        ));
        check('competing bulk assignments both return a definite answer',
            both.every(r => typeof r.status === 'number' && r.status < 500),
            both.map(r => r.status).join(','));

        const distinct = Number(sql(`SELECT COUNT(DISTINCT supplier_id) FROM orders WHERE id IN (${orderIds.join(',')})`));
        check('the batch is not left split between two suppliers', distinct === 1,
            `${distinct} different suppliers across the batch`);
    } else {
        console.log('  skip  no assignable orders');
    }

    // ------------------------------------------------- PO number uniqueness
    console.log('\npurchase order numbering');
    const dupes = Number(sql(`SELECT COUNT(*) FROM (
        SELECT po_number FROM purchase_orders GROUP BY po_number HAVING COUNT(*) > 1
    ) t`));
    check('no duplicate PO numbers exist', dupes === 0, `${dupes} duplicated numbers`);

    const unique = sql(`SELECT COUNT(*) FROM information_schema.statistics
        WHERE table_schema = 'partpulse_orders' AND table_name = 'purchase_orders'
          AND column_name = 'po_number' AND non_unique = 0`);
    check('po_number is protected by a unique index', Number(unique) > 0,
        'without a unique index two workers can allocate the same PO number');

    console.log(`\n${passed} passed, ${failures.length} failed\n`);
    if (failures.length) { failures.forEach(f => console.log(`  - ${f}`)); process.exit(1); }
})().catch(e => { console.error('crashed:', e); process.exit(1); });
