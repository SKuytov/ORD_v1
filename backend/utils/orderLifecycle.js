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
// flow. Three rules were relaxed after end-to-end testing against production
// data, because the strict version rejected everyday work:
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
//
// Correctness is enforced by the prerequisite checks in
// validateOrderTransition, which read facts from locked database rows. The
// graph only rules out transitions that make no sense in any circumstance.
const TRANSITIONS = Object.freeze({
    'New': new Set(['Pending', 'Quote Requested', 'On Hold', 'Cancelled']),
    'Pending': new Set(['Quote Requested', 'On Hold', 'Cancelled']),
    'Quote Requested': new Set(['Quote Received', 'On Hold', 'Cancelled']),
    'Quote Received': new Set(['Quote Requested', 'Quote Under Approval', 'On Hold', 'Cancelled']),
    'Quote Under Approval': new Set(['Quote Received', 'Approved', 'On Hold', 'Cancelled']),
    'Approved': new Set(['Ordered', 'On Hold', 'Cancelled']),
    'Ordered': new Set(['In Transit', 'Partially Delivered', 'Delivered', 'On Hold', 'Cancelled']),
    'In Transit': new Set(['Partially Delivered', 'Delivered', 'On Hold', 'Cancelled']),
    'Partially Delivered': new Set(['Partially Delivered', 'Delivered', 'On Hold', 'Cancelled']),
    'Delivered': new Set(),
    'Cancelled': new Set(),
    'On Hold': new Set(['Pending', 'Quote Requested', 'Quote Received', 'Quote Under Approval',
        'Approved', 'Ordered', 'In Transit', 'Partially Delivered', 'Cancelled'])
});

function missing(...requirements) {
    return { ok: false, message: `Cannot transition: missing prerequisite ${requirements.join(', ')}` };
}

/**
 * Validates the server-side order lifecycle. Callers provide facts loaded from
 * locked database rows; client input is never used as proof of a prerequisite.
 */
function validateOrderTransition(currentStatus, nextStatus, context = {}) {
    if (!STATUSES.includes(nextStatus)) {
        return { ok: false, message: `Invalid order status: ${nextStatus}` };
    }
    if (currentStatus === nextStatus) return { ok: true };

    if (!TRANSITIONS[currentStatus] || !TRANSITIONS[currentStatus].has(nextStatus)) {
        return { ok: false, message: `Illegal order status transition from ${currentStatus} to ${nextStatus}` };
    }

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

    return { ok: true };
}

module.exports = {
    STATUSES,
    TERMINAL_STATUSES,
    NON_TERMINAL_STATUSES,
    TRANSITIONS,
    validateOrderTransition
};
