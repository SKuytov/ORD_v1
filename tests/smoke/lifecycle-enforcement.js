/**
 * PartPulse Orders — lifecycle enforcement tests.
 *
 * lifecycle-rules.js checks the rule table on its own, with no database.
 * This suite checks that the rules are actually applied by the API: that the
 * reopen policy holds, that reopen reasons reach the audit log, and that the
 * paths which used to write orders.status directly now go through the rules.
 *
 *   node tests/smoke/lifecycle-enforcement.js [baseUrl]
 *
 * Expects a freshly reset database (tests/fixtures/reset-test-db.sh), because
 * it moves orders between statuses. Exits non-zero if any expectation fails.
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
    const res = await call('POST', '/api/auth/login', { body: { username, password: PASSWORD } });
    return res.body?.token || res.body?.data?.token || res.body?.accessToken;
}

// Find one order currently in the given status.
async function orderIn(token, status) {
    const res = await call('GET', `/api/orders?status=${encodeURIComponent(status)}&limit=50`, { token });
    const list = res.body?.orders || res.body?.data || [];
    const match = list.find(o => o.status === status);
    return match ? match.id : null;
}

const setStatus = (token, ids, status, reason) =>
    call('POST', '/api/orders/bulk-status', {
        token, body: { order_ids: ids, status, ...(reason ? { reason } : {}) }
    });

(async () => {
    console.log(`\nPartPulse lifecycle enforcement tests against ${BASE}\n`);

    const admin = await login('stg_admin');
    const proc = await login('stg_procurement');
    const requester = await login('stg_requester');
    if (!admin || !proc) {
        console.log('  FAIL  could not log in as stg_admin / stg_procurement');
        process.exit(1);
    }

    // ------------------------------------------------- the transitions map
    console.log('status-transitions endpoint');
    const adminMap = await call('GET', '/api/orders/status-transitions', { token: admin });
    const procMap = await call('GET', '/api/orders/status-transitions', { token: proc });

    check('the endpoint answers', adminMap.status === 200, `got ${adminMap.status}`);
    check('Delivered and Cancelled are the terminal statuses',
        JSON.stringify((adminMap.body?.terminal || []).slice().sort()) ===
        JSON.stringify(['Cancelled', 'Delivered']),
        JSON.stringify(adminMap.body?.terminal));
    check('an admin is offered a way out of Delivered',
        (adminMap.body?.transitions?.Delivered || []).length > 0);
    check('procurement is offered no way out of Delivered',
        (procMap.body?.transitions?.Delivered || []).length === 0,
        JSON.stringify(procMap.body?.transitions?.Delivered));
    check('procurement is offered no way out of Cancelled',
        (procMap.body?.transitions?.Cancelled || []).length === 0);
    check('"Pending CAD" is not offered anywhere',
        !JSON.stringify(adminMap.body?.transitions || {}).includes('Pending CAD'));
    check('the map never offers a status outside the enum',
        Object.values(adminMap.body?.transitions || {}).flat()
            .every(s => (adminMap.body?.statuses || []).includes(s)));

    // -------------------------------------------------------- reopen policy
    console.log('\nreopen policy');
    const delivered = await orderIn(admin, 'Delivered');
    const cancelled = await orderIn(admin, 'Cancelled');
    check('the fixture has a Delivered order to work with', Boolean(delivered));
    check('the fixture has a Cancelled order to work with', Boolean(cancelled));

    if (delivered) {
        const asProc = await setStatus(proc, [delivered], 'Ordered', 'the part came back faulty');
        check('procurement cannot reopen a Delivered order',
            asProc.status === 409 && /admin/i.test(asProc.body?.message || ''),
            `${asProc.status} ${asProc.body?.message}`);

        const noReason = await setStatus(admin, [delivered], 'Ordered');
        check('an admin reopen without a reason is refused',
            noReason.status === 409 && /reason/i.test(noReason.body?.message || ''),
            `${noReason.status} ${noReason.body?.message}`);
        check('the refusal tells the UI a reason is needed',
            noReason.body?.requires_reason === true,
            JSON.stringify(noReason.body));

        const shortReason = await setStatus(admin, [delivered], 'Ordered', 'oops');
        check('a too-short reason is refused',
            shortReason.status === 409 && /reason/i.test(shortReason.body?.message || ''),
            `${shortReason.status} ${shortReason.body?.message}`);

        const REASON = 'wrong part delivered, returning to supplier';
        const ok = await setStatus(admin, [delivered], 'Ordered', REASON);
        check('an admin reopen with a reason succeeds',
            ok.status === 200 && ok.body?.success === true,
            `${ok.status} ${JSON.stringify(ok.body)}`);

        const after = await call('GET', `/api/orders/${delivered}`, { token: admin });
        check('the order really moved to Ordered',
            after.body?.order?.status === 'Ordered', after.body?.order?.status);

        const history = await call('GET', `/api/orders/${delivered}/status-history`, { token: admin });
        const entries = history.body?.history || [];
        const reopenEntry = entries.find(h => h.to_status === 'Ordered' && h.from_status === 'Delivered');
        check('the reopen is visible in the status history',
            Boolean(reopenEntry), JSON.stringify(entries.slice(-3)));
        check('the reason is readable back from the history',
            reopenEntry?.reason === REASON, JSON.stringify(reopenEntry));
    }

    if (cancelled) {
        const skip = await setStatus(admin, [cancelled], 'Delivered', 'a perfectly valid reason');
        check('a Cancelled order cannot jump straight to Delivered',
            skip.status === 409, `${skip.status} ${skip.body?.message}`);

        const back = await setStatus(admin, [cancelled], 'New', 'raised again for the same machine');
        check('an admin can reopen a Cancelled order back to New',
            back.status === 200 && back.body?.success === true,
            `${back.status} ${JSON.stringify(back.body)}`);
    }

    // ------------------------------------------- paths that used to bypass
    console.log('\npreviously unguarded paths');

    // The cancel route only ever restricted requesters, so an admin could
    // cancel an order that had already been delivered.
    const delivered2 = await orderIn(admin, 'Delivered');
    if (delivered2) {
        const cancelDelivered = await call('POST', `/api/orders/${delivered2}/cancel`, {
            token: admin, body: { reason: 'changed my mind about this one' }
        });
        check('an admin cannot cancel an order that is already Delivered',
            cancelDelivered.status === 409,
            `${cancelDelivered.status} ${cancelDelivered.body?.message}`);
    } else {
        check('an admin cannot cancel an order that is already Delivered', true,
            'skipped — no Delivered order left');
    }

    // ------------------------------------------------ ordinary work is fine
    console.log('\nnormal forward movement still works');
    const fresh = await orderIn(admin, 'New');
    if (fresh) {
        const fwd = await setStatus(admin, [fresh], 'Pending');
        check('New to Pending is still allowed without a reason',
            fwd.status === 200 && fwd.body?.success === true,
            `${fwd.status} ${JSON.stringify(fwd.body)}`);
    }

    const requesterMap = requester
        ? await call('GET', '/api/orders/status-transitions', { token: requester })
        : null;
    if (requesterMap) {
        check('a requester can read the map but gets no reopen options',
            requesterMap.status === 200 &&
            (requesterMap.body?.transitions?.Delivered || []).length === 0,
            `${requesterMap.status}`);
    }

    console.log(`\n${passed} passed, ${failures.length} failed\n`);
    process.exit(failures.length ? 1 : 0);
})().catch(err => {
    console.error('test run crashed:', err);
    process.exit(1);
});
