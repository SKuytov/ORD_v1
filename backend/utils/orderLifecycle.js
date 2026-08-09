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

const TRANSITIONS = Object.freeze({
    'New': new Set(['Pending', 'Quote Requested', 'On Hold', 'Cancelled']),
    'Pending': new Set(['Quote Requested', 'On Hold', 'Cancelled']),
    'Quote Requested': new Set(['Quote Received', 'On Hold', 'Cancelled']),
    'Quote Received': new Set(['Quote Under Approval', 'On Hold']),
    'Quote Under Approval': new Set(['Approved', 'On Hold']),
    'Approved': new Set(['Ordered', 'On Hold']),
    'Ordered': new Set(['In Transit', 'On Hold']),
    'In Transit': new Set(['Partially Delivered', 'Delivered', 'On Hold']),
    'Partially Delivered': new Set(['Partially Delivered', 'Delivered', 'On Hold']),
    'Delivered': new Set(),
    'Cancelled': new Set(),
    'On Hold': new Set(['Pending', 'Cancelled'])
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
