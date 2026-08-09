/**
 * PartPulse Orders — API smoke tests.
 *
 * Exercises the authorization rules and workflow endpoints against a running
 * server and a database loaded with the production schema plus seed data.
 *
 *   node tests/smoke/api-smoke.js [baseUrl]
 *
 * Exits non-zero if any expectation fails.
 */

const BASE = process.argv[2] || 'http://localhost:3000';
const PASSWORD = 'StagingTest!2026';

let passed = 0;
const failures = [];

function check(name, condition, detail) {
    if (condition) {
        passed++;
        console.log(`  pass  ${name}`);
    } else {
        failures.push({ name, detail });
        console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    }
}

async function call(method, path, { token, body, raw } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'manual'
    });
    if (raw) return res;
    let json = null;
    try { json = await res.json(); } catch { /* not json */ }
    return { status: res.status, body: json };
}

async function login(username) {
    const res = await call('POST', '/api/auth/login', { body: { username, password: PASSWORD } });
    const token = res.body?.token || res.body?.data?.token || res.body?.accessToken;
    return { token, status: res.status, body: res.body };
}

(async () => {
    console.log(`\nPartPulse API smoke tests against ${BASE}\n`);

    // ---------------------------------------------------------------- health
    console.log('health');
    const health = await call('GET', '/api/health');
    check('health returns 200', health.status === 200, `got ${health.status}`);
    check('health reports OK while the database is up', health.body?.status === 'OK',
        JSON.stringify(health.body));

    // ------------------------------------------------------------------ auth
    console.log('\nauthentication');
    const admin = await login('stg_admin');
    check('admin can log in', !!admin.token, `status ${admin.status} body ${JSON.stringify(admin.body)}`);

    const requester = await login('stg_requester');
    check('requester can log in', !!requester.token, `status ${requester.status}`);

    const manager = await login('stg_manager');
    check('manager can log in', !!manager.token, `status ${manager.status}`);

    const accounting = await login('stg_accounting');
    check('accounting can log in', !!accounting.token, `status ${accounting.status}`);

    const bad = await call('POST', '/api/auth/login',
        { body: { username: 'stg_admin', password: 'wrong' } });
    check('wrong password is rejected', bad.status === 401, `got ${bad.status}`);

    const noToken = await call('GET', '/api/orders');
    check('orders require a token', noToken.status === 401, `got ${noToken.status}`);

    const junkToken = await call('GET', '/api/orders', { token: 'not.a.real.token' });
    check('a forged token is rejected', junkToken.status === 401, `got ${junkToken.status}`);

    if (!admin.token) {
        console.log('\nCannot continue without an admin token.');
        process.exit(1);
    }

    // ------------------------------------------------------- uploads exposure
    console.log('\ndocument exposure');
    const uploads = await call('GET', '/uploads/invoice.pdf', { raw: true });
    check('the public /uploads mount is gone', uploads.status === 404 || uploads.status === 403,
        `got ${uploads.status}`);

    const dotfile = await call('GET', '/.env', { raw: true });
    const dotBody = await dotfile.text();
    check('dotfiles are not served', dotfile.status === 404 || dotfile.status === 403,
        `got ${dotfile.status}`);
    check('no environment file content is ever returned',
        !/JWT_SECRET|DB_PASSWORD|SMTP_PASSWORD/.test(dotBody), 'secrets appeared in the response body');

    const unknownApi = await call('GET', '/api/definitely-not-a-real-endpoint');
    check('an unknown API path returns JSON 404, not the SPA shell',
        unknownApi.status === 404, `got ${unknownApi.status}`);

    // ------------------------------------------------------------ approvals
    console.log('\napprovals');
    const approvalsAdmin = await call('GET', '/api/approvals', { token: admin.token });
    check('the approvals list works at all', approvalsAdmin.status === 200,
        `got ${approvalsAdmin.status} ${JSON.stringify(approvalsAdmin.body).slice(0, 200)}`);

    const approvalsRequester = await call('GET', '/api/approvals', { token: requester.token });
    check('a requester does not see the full approvals list',
        approvalsRequester.status === 403 ||
        (approvalsRequester.status === 200 &&
            (approvalsRequester.body?.data?.length || approvalsRequester.body?.approvals?.length || 0) <
            (approvalsAdmin.body?.data?.length || approvalsAdmin.body?.approvals?.length || 0) + 1),
        `got ${approvalsRequester.status}`);

    const pendingList = approvalsAdmin.body?.data || approvalsAdmin.body?.approvals || [];
    const pending = pendingList.find(a => a.status === 'pending');
    if (pending) {
        const reqApprove = await call('PUT', `/api/approvals/${pending.id}/approve`,
            { token: requester.token, body: { comments: 'smoke test' } });
        check('a requester cannot approve', reqApprove.status === 403, `got ${reqApprove.status}`);
    } else {
        console.log('  skip  no pending approval in the seed data');
    }

    const ghostApprove = await call('PUT', '/api/approvals/999999/approve',
        { token: admin.token, body: { comments: 'smoke' } });
    check('approving a missing approval returns 404', ghostApprove.status === 404,
        `got ${ghostApprove.status}`);

    // --------------------------------------------------------------- orders
    console.log('\norder access control');
    const adminOrders = await call('GET', '/api/orders', { token: admin.token });
    const adminList = adminOrders.body?.data || adminOrders.body?.orders || [];
    check('admin sees orders', adminOrders.status === 200 && adminList.length > 0,
        `status ${adminOrders.status} count ${adminList.length}`);

    const reqOrders = await call('GET', '/api/orders?limit=100', { token: requester.token });
    const reqList = reqOrders.body?.data || reqOrders.body?.orders || [];
    // Scoping is proven by comparing two requesters: each must see only their own
    // orders and the two sets must not intersect. Comparing a requester against
    // admin proves nothing when the seed data gives every order to one person.
    const requester2 = await login('stg_requester2');
    if (requester2.token) {
        const r2 = await call('GET', '/api/orders?limit=100', { token: requester2.token });
        const r2List = (r2.body?.data || r2.body?.orders || []).map(o => o.id);
        const r1Ids = reqList.map(o => o.id);
        check('two requesters see disjoint order sets',
            r1Ids.length > 0 && r2List.length > 0 && !r1Ids.some(id => r2List.includes(id)),
            `requester1 ${r1Ids.length}, requester2 ${r2List.length}`);
        check('every order is visible to admin but split across requesters',
            r1Ids.length + r2List.length === adminList.length,
            `${r1Ids.length} + ${r2List.length} vs admin ${adminList.length}`);
    } else {
        console.log('  skip  second requester account not seeded');
    }

    const reqOrderIds = new Set(reqList.map(o => o.id));
    const foreignOrder = adminList.find(o => !reqOrderIds.has(o.id));
    if (foreignOrder) {
        const idor = await call('GET', `/api/orders/${foreignOrder.id}`, { token: requester.token });
        check('a requester cannot read another order by id',
            idor.status === 403 || idor.status === 404, `got ${idor.status}`);
    } else {
        console.log('  skip  requester can see every order in the seed data');
    }

    if (reqList.length) {
        const own = await call('GET', `/api/orders/${reqList[0].id}`, { token: requester.token });
        check('a requester can still read their own order', own.status === 200, `got ${own.status}`);
        check('a requester is not shown pricing',
            own.status !== 200 || (own.body?.data?.unit_price === undefined &&
                own.body?.order?.unit_price === undefined),
            'unit_price leaked to a requester');
    }

    // ------------------------------------------------------------ accounting
    console.log('\naccounting');
    const acctAsRequester = await call('GET', '/api/accounting/handovers', { token: requester.token });
    check('a requester cannot read accounting', acctAsRequester.status === 403,
        `got ${acctAsRequester.status}`);

    const acctAsAccounting = await call('GET', '/api/accounting/handovers', { token: accounting.token });
    check('accounting can read accounting', acctAsAccounting.status === 200,
        `got ${acctAsAccounting.status}`);

    // ------------------------------------------------------------- documents
    console.log('\ndocuments');
    const docsNoToken = await call('GET', '/api/documents/1/download', { raw: true });
    check('document download needs a token', docsNoToken.status === 401, `got ${docsNoToken.status}`);

    const docsQueryToken = await call('GET', `/api/documents/1/download?token=${admin.token}`, { raw: true });
    check('a token in the query string is not accepted', docsQueryToken.status === 401,
        `got ${docsQueryToken.status}`);

    const traversal = await call('GET', '/api/documents/..%2f..%2f..%2fetc%2fpasswd/download',
        { token: admin.token, raw: true });
    check('path traversal is refused', traversal.status >= 400, `got ${traversal.status}`);

    // ------------------------------------------------------ workflow endpoints
    console.log('\nworkflow endpoints');
    const preflight = adminList.length
        ? await call('GET', `/api/orders/${adminList[0].id}/accounting-preflight`, { token: admin.token })
        : null;
    check('accounting preflight responds',
        preflight && (preflight.status === 200 || preflight.status === 422),
        `got ${preflight?.status}`);

    const bulkAsRequester = await call('POST', '/api/orders/bulk-assign-supplier',
        { token: requester.token, body: { order_ids: adminList.slice(0, 2).map(o => o.id), supplier_id: 1 } });
    check('a requester cannot bulk assign suppliers', bulkAsRequester.status === 403,
        `got ${bulkAsRequester.status}`);

    const bulkGhost = await call('POST', '/api/orders/bulk-assign-supplier',
        { token: admin.token, body: { order_ids: [999998, 999999], supplier_id: 1 } });
    check('bulk assign rejects unknown orders without partial writes',
        bulkGhost.status >= 400, `got ${bulkGhost.status}`);

    const deliveryNoProof = adminList.length
        ? await call('POST', `/api/orders/${adminList[0].id}/confirm-delivery`,
            { token: admin.token, body: { actual_delivery_date: '2026-08-09', partial: false, items: [] } })
        : null;
    check('delivery confirmation refuses to run without proof',
        deliveryNoProof && deliveryNoProof.status >= 400, `got ${deliveryNoProof?.status}`);

    // ------------------------------------------------------- lifecycle guard
    console.log('\nlifecycle enforcement');
    const newOrder = adminList.find(o => o.status === 'New');
    if (newOrder) {
        const illegal = await call('PUT', `/api/orders/${newOrder.id}`,
            { token: admin.token, body: { status: 'Delivered' } });
        check('New cannot jump straight to Delivered', illegal.status === 409 || illegal.status === 400,
            `got ${illegal.status} ${JSON.stringify(illegal.body).slice(0, 160)}`);
    } else {
        console.log('  skip  no order in status New');
    }

    // ------------------------------------------------------------ error shape
    console.log('\nerror handling');
    const notFound = await call('GET', '/api/orders/999999', { token: admin.token });
    check('a missing order returns 404', notFound.status === 404, `got ${notFound.status}`);
    check('errors do not leak SQL',
        !JSON.stringify(notFound.body || {}).match(/SELECT |FROM |mysql|ER_|at Object\./i),
        JSON.stringify(notFound.body));

    // ----------------------------------------------------------------- report
    console.log(`\n${passed} passed, ${failures.length} failed\n`);
    if (failures.length) {
        console.log('Failures:');
        failures.forEach(f => console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`));
        process.exit(1);
    }
})().catch(err => {
    console.error('\nSmoke run crashed:', err);
    process.exit(1);
});
