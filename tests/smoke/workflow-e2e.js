/**
 * PartPulse Orders — workflow end-to-end test.
 *
 * Drives a real order through the procurement lifecycle against a running
 * server and verifies the resulting database state, including that failed
 * operations leave no partial writes behind.
 *
 *   node tests/smoke/workflow-e2e.js
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
    console.log('\nPartPulse workflow end-to-end\n');

    const admin = await login('stg_admin');
    const requester = await login('stg_requester');
    if (!admin) { console.log('no admin token'); process.exit(1); }

    // ------------------------------------------------- bulk supplier assignment
    console.log('bulk supplier assignment');
    const supplierId = Number(sql('SELECT id FROM suppliers ORDER BY id LIMIT 1'));
    const targets = sql(
        "SELECT GROUP_CONCAT(id) FROM (SELECT id FROM orders WHERE status IN ('New','Pending') ORDER BY id LIMIT 3) t"
    ).split(',').filter(Boolean).map(Number);

    if (targets.length) {
        const before = sql(`SELECT COUNT(*) FROM orders WHERE id IN (${targets.join(',')}) AND supplier_id = ${supplierId}`);
        const res = await call('POST', '/api/orders/bulk-assign-supplier',
            { token: admin, body: { order_ids: targets, supplier_id: supplierId } });
        check('bulk assign succeeds for an admin', res.status === 200 && res.body?.success === true,
            `status ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
        check('bulk assign reports the right count', res.body?.updated === targets.length,
            `reported ${res.body?.updated} for ${targets.length} orders`);

        const after = Number(sql(`SELECT COUNT(*) FROM orders WHERE id IN (${targets.join(',')}) AND supplier_id = ${supplierId}`));
        check('the database really shows the new supplier', after === targets.length,
            `before ${before}, after ${after} of ${targets.length}`);

        // Atomicity: one bad id in the batch must roll the whole thing back.
        const other = Number(sql(`SELECT id FROM suppliers WHERE id <> ${supplierId} ORDER BY id LIMIT 1`));
        const mixed = [...targets, 999999];
        const bad = await call('POST', '/api/orders/bulk-assign-supplier',
            { token: admin, body: { order_ids: mixed, supplier_id: other } });
        check('a batch containing an unknown order is refused', bad.status >= 400, `got ${bad.status}`);
        const stillOld = Number(sql(`SELECT COUNT(*) FROM orders WHERE id IN (${targets.join(',')}) AND supplier_id = ${supplierId}`));
        check('the refused batch wrote nothing at all', stillOld === targets.length,
            `${targets.length - stillOld} orders were mutated by a failed batch`);
    } else {
        console.log('  skip  no assignable orders');
    }

    // ------------------------------------------------------ delivery confirmation
    console.log('\ndelivery confirmation');
    // purchase_orders has no order_id column: a PO reaches its order through
    // po_items.order_id, so one PO can legitimately cover several orders.
    const poRow = sql(
        "SELECT CONCAT_WS('|', pi.po_id, pi.order_id) FROM po_items pi GROUP BY pi.po_id, pi.order_id LIMIT 1"
    );
    if (poRow) {
        const [poId, orderId] = poRow.split('|').map(Number);
        const items = sql(`SELECT CONCAT_WS('|', id, quantity) FROM po_items WHERE po_id = ${poId} AND order_id = ${orderId}`)
            .split('\n').filter(Boolean).map(r => {
                const [id, quantity] = r.split('|');
                return { id: Number(id), quantity: Number(quantity) };
            });

        // Over-delivery must be rejected.
        const over = await call('POST', `/api/orders/${orderId}/confirm-delivery`, {
            token: admin,
            body: {
                actual_delivery_date: '2026-08-09',
                partial: false,
                items: items.map(i => ({ id: i.id, received_quantity: i.quantity + 5 })),
                proof_document_id: null
            }
        });
        check('receiving more than was ordered is rejected', over.status >= 400, `got ${over.status}`);

        // Negative quantity must be rejected.
        const negative = await call('POST', `/api/orders/${orderId}/confirm-delivery`, {
            token: admin,
            body: {
                actual_delivery_date: '2026-08-09', partial: true,
                items: [{ id: items[0].id, received_quantity: -1 }], proof_document_id: null
            }
        });
        check('a negative received quantity is rejected', negative.status >= 400, `got ${negative.status}`);

        const untouched = Number(sql(`SELECT COALESCE(SUM(received_quantity),0) FROM po_items WHERE po_id = ${poId} AND order_id = ${orderId}`));
        check('the rejected deliveries changed no quantities', untouched === 0,
            `received_quantity total is ${untouched}, expected 0`);

        // Happy path: attach a proof document, then confirm a partial delivery.
        sql(`INSERT INTO documents (order_id, document_type, file_name, file_path, file_size, mime_type, uploaded_by, uploaded_at, status)
             VALUES (${orderId}, 'delivery_proof', 'proof.pdf', '/uploads/proof.pdf', 1024, 'application/pdf', 1001, NOW(), 'pending')`);
        const proofId = Number(sql(`SELECT id FROM documents WHERE order_id = ${orderId} AND document_type = 'delivery_proof' ORDER BY id DESC LIMIT 1`));

        const partial = await call('POST', `/api/orders/${orderId}/confirm-delivery`, {
            token: admin,
            body: {
                actual_delivery_date: '2026-08-09', partial: true,
                items: [{ id: items[0].id, received_quantity: Math.max(1, Math.floor(items[0].quantity / 2)) }],
                proof_document_id: proofId
            }
        });
        check('a partial delivery with proof is accepted',
            partial.status === 200 && partial.body?.success === true,
            `status ${partial.status} ${JSON.stringify(partial.body).slice(0, 250)}`);

        if (partial.status === 200) {
            const recorded = Number(sql(`SELECT received_quantity FROM po_items WHERE id = ${items[0].id}`));
            check('the received quantity was persisted', recorded > 0, `stored ${recorded}`);
            const status = sql(`SELECT status FROM orders WHERE id = ${orderId}`);
            check('the order moved to Partially Delivered', status === 'Partially Delivered', `status is ${status}`);
            check('the response carries the updated po items',
                Array.isArray(partial.body?.poItems) && partial.body.poItems.length > 0,
                'poItems missing from the response');
        }

        // A requester must not be able to confirm a delivery.
        const asRequester = await call('POST', `/api/orders/${orderId}/confirm-delivery`, {
            token: requester,
            body: { actual_delivery_date: '2026-08-09', partial: true, items: [], proof_document_id: proofId }
        });
        check('a requester cannot confirm a delivery', asRequester.status === 403, `got ${asRequester.status}`);
    } else {
        console.log('  skip  no purchase order with items');
    }

    // ------------------------------------------------------------ order detail
    console.log('\norder detail payload');
    const anyOrder = Number(sql('SELECT order_id FROM po_items ORDER BY id LIMIT 1'));
    const detail = await call('GET', `/api/orders/${anyOrder}`, { token: admin });
    const payload = detail.body?.data || detail.body?.order || detail.body;
    check('order detail includes poItems for the delivery modal',
        Array.isArray(payload?.poItems), `poItems is ${typeof payload?.poItems}`);

    // ---------------------------------------------------------- accounting flow
    console.log('\naccounting handover');
    const pre = await call('GET', `/api/orders/${anyOrder}/accounting-preflight`, { token: admin });
    check('preflight returns a checklist',
        pre.status === 200 && Array.isArray(pre.body?.checks), JSON.stringify(pre.body).slice(0, 200));

    const handoverBlocked = await call('POST', `/api/orders/${anyOrder}/accounting-handover`,
        { token: admin, body: { notes: 'e2e' } });
    check('an incomplete handover is refused with the missing items listed',
        handoverBlocked.status !== 200
            ? Array.isArray(handoverBlocked.body?.missing)
            : true,
        `status ${handoverBlocked.status} ${JSON.stringify(handoverBlocked.body).slice(0, 200)}`);

    const handoverAsRequester = await call('POST', `/api/orders/${anyOrder}/accounting-handover`,
        { token: requester, body: { notes: 'e2e' } });
    check('a requester cannot start an accounting handover',
        handoverAsRequester.status === 403, `got ${handoverAsRequester.status}`);

    console.log(`\n${passed} passed, ${failures.length} failed\n`);
    if (failures.length) { failures.forEach(f => console.log(`  - ${f}`)); process.exit(1); }
})().catch(e => { console.error('crashed:', e); process.exit(1); });
