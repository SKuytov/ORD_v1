'use strict';
// Unit checks for the lifecycle rules. No server or database needed.

const assert = require('assert');
const {
    STATUSES,
    validateOrderTransition,
    isReopen,
    allowedNextStatuses
} = require('../../backend/utils/orderLifecycle');

let passed = 0;
const failures = [];

function check(name, fn) {
    try { fn(); passed++; }
    catch (error) { failures.push(`${name}: ${error.message}`); }
}

// Everything a delivery needs, so graph rules are tested in isolation.
const READY = {
    hasSupplier: true, hasQuote: true, approvalApproved: true, quoteApproved: true,
    hasPurchaseOrder: true, actualDeliveryDate: '2026-01-01', hasDeliveryProof: true
};
const ADMIN = { ...READY, actorRole: 'admin', reason: 'corrected a mis-recorded delivery' };

// ── the everyday path still works ───────────────────────────────────────────
const HAPPY = [
    ['New', 'Pending'], ['Pending', 'Quote Requested'], ['Quote Requested', 'Quote Received'],
    ['Quote Received', 'Quote Under Approval'], ['Quote Under Approval', 'Approved'],
    ['Approved', 'Ordered'], ['Ordered', 'In Transit'], ['In Transit', 'Partially Delivered'],
    ['Partially Delivered', 'Delivered']
];
for (const [from, to] of HAPPY) {
    check(`${from} -> ${to} is allowed`, () => {
        const r = validateOrderTransition(from, to, READY);
        assert.ok(r.ok, r.message);
    });
}

// ── goods that arrive without an In Transit step ────────────────────────────
check('Ordered -> Delivered is allowed', () => {
    assert.ok(validateOrderTransition('Ordered', 'Delivered', READY).ok);
});

// ── the paths the app itself performs, which used to contradict the rules ───
check('Quote Requested -> New (order taken off a quote)', () => {
    const r = validateOrderTransition('Quote Requested', 'New', READY);
    assert.ok(r.ok, r.message);
});
check('Quote Under Approval -> Quote Requested (re-sent to supplier)', () => {
    const r = validateOrderTransition('Quote Under Approval', 'Quote Requested', READY);
    assert.ok(r.ok, r.message);
});

// ── cancelling and holding ──────────────────────────────────────────────────
for (const from of ['New', 'Pending', 'Quote Requested', 'Quote Received',
    'Quote Under Approval', 'Approved', 'Ordered', 'In Transit', 'Partially Delivered']) {
    check(`${from} -> Cancelled is allowed`, () => {
        assert.ok(validateOrderTransition(from, 'Cancelled', READY).ok);
    });
}
check('On Hold resumes to Ordered without losing progress', () => {
    assert.ok(validateOrderTransition('On Hold', 'Ordered', READY).ok);
});

// ── reopening: the new admin escape hatch ───────────────────────────────────
check('admin with a reason can reopen Delivered', () => {
    const r = validateOrderTransition('Delivered', 'In Transit', ADMIN);
    assert.ok(r.ok, r.message);
    assert.strictEqual(r.isReopen, true, 'should be flagged as a reopen');
});
check('admin with a reason can reopen Cancelled', () => {
    const r = validateOrderTransition('Cancelled', 'Pending', ADMIN);
    assert.ok(r.ok, r.message);
    assert.strictEqual(r.isReopen, true);
});
check('procurement cannot reopen Delivered', () => {
    const r = validateOrderTransition('Delivered', 'In Transit',
        { ...READY, actorRole: 'procurement', reason: 'supplier redelivered the goods' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.requiresRole, 'admin');
});
check('admin cannot reopen without a reason', () => {
    const r = validateOrderTransition('Delivered', 'In Transit', { ...READY, actorRole: 'admin' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.requiresReason, true);
});
check('a token reason is rejected', () => {
    const r = validateOrderTransition('Delivered', 'In Transit',
        { ...READY, actorRole: 'admin', reason: ' x ' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.requiresReason, true);
});
check('reopening does not demand a fresh delivery proof', () => {
    const r = validateOrderTransition('Delivered', 'Ordered',
        { actorRole: 'admin', reason: 'delivery was logged against the wrong order' });
    assert.ok(r.ok, r.message);
});
check('Delivered cannot reopen straight to New even for an admin', () => {
    assert.strictEqual(validateOrderTransition('Delivered', 'New', ADMIN).ok, false);
});
check('Delivered -> Cancelled is still refused', () => {
    assert.strictEqual(validateOrderTransition('Delivered', 'Cancelled', ADMIN).ok, false);
});

// ── prerequisites still bite ────────────────────────────────────────────────
check('Ordered needs a purchase order', () => {
    const r = validateOrderTransition('Approved', 'Ordered', { ...READY, hasPurchaseOrder: false });
    assert.strictEqual(r.ok, false);
    assert.match(r.message, /purchase order/);
});
check('Delivered needs a delivery proof', () => {
    const r = validateOrderTransition('In Transit', 'Delivered', { ...READY, hasDeliveryProof: false });
    assert.strictEqual(r.ok, false);
    assert.match(r.message, /delivery proof/);
});
check('Approved needs an approved approval', () => {
    const r = validateOrderTransition('Quote Under Approval', 'Approved',
        { ...READY, approvalApproved: false });
    assert.strictEqual(r.ok, false);
});

// ── nonsense is still refused ───────────────────────────────────────────────
check('New -> Delivered is refused', () => {
    assert.strictEqual(validateOrderTransition('New', 'Delivered', READY).ok, false);
});
check('an unknown status is refused', () => {
    const r = validateOrderTransition('Pending', 'Pending CAD', READY);
    assert.strictEqual(r.ok, false);
    assert.match(r.message, /Invalid order status/);
});
check('a no-op is accepted', () => {
    assert.ok(validateOrderTransition('Delivered', 'Delivered', {}).ok);
});

// ── helpers used to build the status picker ─────────────────────────────────
check('isReopen identifies terminal moves only', () => {
    assert.strictEqual(isReopen('Delivered', 'In Transit'), true);
    assert.strictEqual(isReopen('Ordered', 'In Transit'), false);
});
check('allowedNextStatuses hides reopens from non-admins', () => {
    assert.deepStrictEqual(allowedNextStatuses('Delivered', { actorRole: 'procurement' }), []);
    assert.ok(allowedNextStatuses('Delivered', { actorRole: 'admin' }).includes('In Transit'));
});
check('every status in the graph is a real status', () => {
    for (const from of STATUSES) {
        for (const to of allowedNextStatuses(from, { actorRole: 'admin' })) {
            assert.ok(STATUSES.includes(to), `${from} -> ${to} is not a real status`);
        }
    }
});

console.log(`\n${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length ? 1 : 0);
