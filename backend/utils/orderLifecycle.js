'use strict';

const STATUSES = Object.freeze([
    'New',
    'Pending',
    'Quote Requested',
    'Quote Received',
    'Quote Under Approval',
    'Approved',
    'Ordered',
    'In Transit',
    'Partially Delivered',
    'Delivered',
    'Cancelled',
    'On Hold'
]);

const TERMINAL_STATUSES = new Set(['Delivered', 'Cancelled']);
const NON_TERMINAL_STATUSES = new Set(STATUSES.filter(status => !TERMINAL_STATUSES.has(status)));

// The graph below describes how procurement actually runs, not an idealised
// flow. Several rules were relaxed after testing against production data,
// because the strict version rejected everyday work:
//
//  1. Goods frequently arrive without anyone marking `In Transit`, so `Ordered`
//     may go straight to `Partially Delivered` or `Delivered`. The delivery
//     prerequisites below still require a purchase order, a delivery date and a
//     proof document, so nothing is actually skipped.
//  2. An order can be cancelled at any point before it is delivered. A supplier
//     can pull out after a quote is approved, and the admin must be able to
//     record that instead of leaving the order stuck.
//  3. `On Hold` resumes into any non-terminal stage. A hold is a pause, not a
//     reset to `Pending`, and forcing it back to `Pending` destroyed the
//     order's real progress.
//  4. An order returns to `New` when it is taken off a quote. quoteController
//     has always done this; the graph previously had no route into `New` at
//     all, so the code and the rules contradicted each other.
//  5. `Quote Under Approval` can go back to `Quote Requested`. Re-sending the
//     request email to a supplier does exactly this.
//
// Correctness is enforced by the prerequisite checks in
// validateOrderTransition, which read facts from locked database rows. The
// graph only rules out transitions that make no sense in any circumstance.
const TRANSITIONS = Object.freeze({
    'New': new Set(['Pending', 'Quote Requested', 'On Hold', 'Cancelled']),
    'Pending': new Set(['New', 'Quote Requested', 'On Hold', 'Cancelled']),
    'Quote Requested': new Set(['New', 'Quote Received', 'On Hold', 'Cancelled']),
    'Quote Received': new Set(['New', 'Quote Requested', 'Quote Under Approval', 'On Hold', 'Cancelled']),
    'Quote Under Approval': new Set(['New', 'Quote Requested', 'Quote Received', 'Approved', 'On Hold', 'Cancelled']),
    'Approved': new Set(['Ordered', 'On Hold', 'Cancelled']),
    'Ordered': new Set(['In Transit', 'Partially Delivered', 'Delivered', 'On Hold', 'Cancelled']),
    'In Transit': new Set(['Partially Delivered', 'Delivered', 'On Hold', 'Cancelled']),
    'Partially Delivered': new Set(['Partially Delivered', 'Delivered', 'On Hold', 'Cancelled']),
    'Delivered': new Set(),
    'Cancelled': new Set(),
    'On Hold': new Set(['New', 'Pending', 'Quote Requested', 'Quote Received', 'Quote Under Approval',
        'Approved', 'Ordered', 'In Transit', 'Partially Delivered', 'Cancelled'])
});

// Reopening a terminal order.
//
// `Delivered` and `Cancelled` are end states: the normal graph above has no way
// out of either, and that is correct for everyday use. But mistakes happen —
// a delivery gets confirmed against the wrong order, or an order is cancelled
// and the supplier delivers anyway — and without a route back the only remedy
// was editing the database by hand.
//
// An admin may reopen a terminal order into one of the stages below, and only
// with a written reason, which the caller must record in order_history. No
// other role can do this.
const REOPEN_TRANSITIONS = Object.freeze({
    'Delivered': new Set(['Ordered', 'In Transit', 'Partially Delivered']),
    'Cancelled': new Set(['New', 'Pending', 'Quote Requested', 'Quote Received',
        'Quote Under Approval', 'Approved', 'Ordered', 'In Transit', 'Partially Delivered'])
});

const REOPEN_ROLES = new Set(['admin']);
const MIN_REOPEN_REASON_LENGTH = 5;

function missing(...requirements) {
    return { ok: false, message: `Cannot transition: missing prerequisite ${requirements.join(', ')}` };
}

/**
 * Validates the server-side order lifecycle. Callers provide facts loaded from
 * locked database rows; client input is never used as proof of a prerequisite.
 *
 * Reopening a Delivered or Cancelled order additionally requires
 * `context.actorRole === 'admin'` and a non-empty `context.reason`. When this
 * returns `{ ok: true, isReopen: true }` the caller must write the reason to
 * order_history alongside the status change.
 */
function validateOrderTransition(currentStatus, nextStatus, context = {}) {
    if (!STATUSES.includes(nextStatus)) {
        return { ok: false, message: `Invalid order status: ${nextStatus}` };
    }
    if (currentStatus === nextStatus) return { ok: true };

    const isTerminal = TERMINAL_STATUSES.has(currentStatus);

    if (isTerminal) {
        const reopenTargets = REOPEN_TRANSITIONS[currentStatus];
        if (!reopenTargets || !reopenTargets.has(nextStatus)) {
            return { ok: false, message: `Illegal order status transition from ${currentStatus} to ${nextStatus}` };
        }
        if (!REOPEN_ROLES.has(context.actorRole)) {
            return {
                ok: false,
                requiresRole: 'admin',
                message: `Only an admin can reopen a ${currentStatus} order`
            };
        }
        const reason = typeof context.reason === 'string' ? context.reason.trim() : '';
        if (reason.length < MIN_REOPEN_REASON_LENGTH) {
            return {
                ok: false,
                requiresReason: true,
                message: `Reopening a ${currentStatus} order requires a reason of at least ${MIN_REOPEN_REASON_LENGTH} characters`
            };
        }
    } else if (!TRANSITIONS[currentStatus] || !TRANSITIONS[currentStatus].has(nextStatus)) {
        return { ok: false, message: `Illegal order status transition from ${currentStatus} to ${nextStatus}` };
    }

    // Prerequisite checks.
    //
    // These are deliberately skipped when reopening. An admin correcting a
    // mis-recorded delivery is restoring a state the order previously held, and
    // demanding a fresh delivery proof to undo a delivery is circular.
    if (!isTerminal) {
        if (nextStatus === 'Quote Requested' && !context.hasSupplier) {
            return missing('an assigned supplier');
        }
        if (nextStatus === 'Quote Under Approval' && !context.hasQuote) {
            return missing('a linked quote');
        }
        if (nextStatus === 'Approved') {
            if (!context.hasQuote) return missing('a linked quote');
            if (!context.approvalApproved) return missing('an approved approval');
        }
        if (nextStatus === 'Ordered') {
            if (!context.hasQuote) return missing('a linked quote');
            if (!context.quoteApproved) return missing('an approved quote');
            if (!context.hasPurchaseOrder) return missing('a purchase order');
        }
        if (nextStatus === 'In Transit' && !context.hasPurchaseOrder) {
            return missing('a purchase order');
        }
        if (nextStatus === 'Partially Delivered' || nextStatus === 'Delivered') {
            if (!context.hasPurchaseOrder) return missing('a purchase order');
            if (!context.actualDeliveryDate) return missing('an actual delivery date');
            if (!context.hasDeliveryProof) return missing('a delivery proof');
        }
    }

    return isTerminal ? { ok: true, isReopen: true } : { ok: true };
}

/**
 * True when moving out of `currentStatus` is a reopen and therefore needs an
 * admin and a reason. Lets callers ask for the reason up front instead of
 * failing the request first.
 */
function isReopen(currentStatus, nextStatus) {
    return TERMINAL_STATUSES.has(currentStatus)
        && currentStatus !== nextStatus
        && Boolean(REOPEN_TRANSITIONS[currentStatus]?.has(nextStatus));
}

/**
 * The statuses reachable from `currentStatus`, for building a status picker
 * that only offers moves which can actually succeed.
 */
function allowedNextStatuses(currentStatus, { actorRole } = {}) {
    const base = [...(TRANSITIONS[currentStatus] || [])];
    if (TERMINAL_STATUSES.has(currentStatus) && REOPEN_ROLES.has(actorRole)) {
        return [...(REOPEN_TRANSITIONS[currentStatus] || [])];
    }
    return base;
}

module.exports = {
    STATUSES,
    TERMINAL_STATUSES,
    NON_TERMINAL_STATUSES,
    TRANSITIONS,
    REOPEN_TRANSITIONS,
    REOPEN_ROLES,
    validateOrderTransition,
    isReopen,
    allowedNextStatuses
};
