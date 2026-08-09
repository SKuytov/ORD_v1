'use strict';

// One place where every order status change is validated and recorded.
//
// Before this existed, five files wrote `orders.status` directly and only two
// of them checked the lifecycle rules. The rules therefore covered roughly a
// fifth of the code that could change a status, which made them decorative:
// the same move was legal or illegal depending on which screen you used.
//
// Two entry points:
//
//   applyStatusChange   - one order, one target. Throws if the move is illegal.
//                         Use for a deliberate action on a specific order.
//   applyStatusChangeToMany - several orders swept to one target, as when a
//                         quote is approved or a PO is raised. Applies the
//                         legal moves and reports the rest rather than failing
//                         the whole request.
//
// The sweep deliberately does not throw. A purchase order covering eight orders
// should not be rejected outright because one of them was already cancelled;
// the correct behaviour is to move the seven and say so. No illegal write
// happens either way, which is what enforcement has to mean here.

const { validateOrderTransition } = require('./orderLifecycle');

class StatusTransitionError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'StatusTransitionError';
        this.statusCode = 409;
        Object.assign(this, details);
    }
}

/**
 * Reads the facts the lifecycle rules need, from the database rather than from
 * anything the client sent.
 */
async function getLifecycleContext(connection, order, overrides = {}) {
    let quote = null;
    let purchaseOrder = null;
    if (order.quote_ref) {
        [[quote]] = await connection.query('SELECT id, status FROM quotes WHERE id = ?', [order.quote_ref]);
    }
    if (order.po_id) {
        [[purchaseOrder]] = await connection.query(
            'SELECT id, actual_delivery_date FROM purchase_orders WHERE id = ?',
            [order.po_id]
        );
    }
    const [[proof]] = await connection.query(
        `SELECT d.id
         FROM documents d
         LEFT JOIN order_documents_link odl ON odl.document_id = d.id AND odl.order_id = ?
         WHERE (d.order_id = ? OR odl.order_id IS NOT NULL)
           AND d.document_type IN ('delivery_proof', 'signed_delivery_note')
         LIMIT 1`,
        [order.id, order.id]
    );
    return {
        hasSupplier: Boolean(order.supplier_id),
        hasQuote: Boolean(quote),
        quoteApproved: quote?.status === 'Approved',
        approvalApproved: order.approval_status === 'approved',
        hasPurchaseOrder: Boolean(purchaseOrder),
        actualDeliveryDate: purchaseOrder?.actual_delivery_date || null,
        hasDeliveryProof: Boolean(proof),
        ...overrides
    };
}

function actorName(actor) {
    if (!actor) return 'system';
    return actor.name || actor.username || `user:${actor.id}`;
}

async function recordStatusChange(connection, orderId, from, to, actor, reason) {
    await connection.query(
        `INSERT INTO order_history (order_id, changed_by, field_name, old_value, new_value)
         VALUES (?, ?, 'status', ?, ?)`,
        [orderId, actorName(actor), from == null ? null : String(from), String(to)]
    );
    // orders_audit_log.changed_by is an INT and NOT NULL, so it is only written
    // when a real user id is available. A reason is always worth keeping.
    if (actor && Number.isInteger(Number(actor.id))) {
        await connection.query(
            `INSERT INTO orders_audit_log (order_id, field_name, old_value, new_value, changed_by, changed_at, reason)
             VALUES (?, 'status', ?, ?, ?, NOW(), ?)`,
            [orderId, from == null ? null : String(from), String(to), Number(actor.id), reason || null]
        );
    }
}

/**
 * Move one order to `nextStatus`.
 *
 * Locks the row, validates, writes the new status and records the change.
 * Throws StatusTransitionError (409) when the move is not allowed.
 *
 * @param {object}  connection  an open transaction
 * @param {number}  orderId
 * @param {string}  nextStatus
 * @param {object}  actor       req.user
 * @param {object}  options     { reason, contextOverrides, extraSet, extraParams }
 * @returns {Promise<{changed: boolean, from: string, to: string, isReopen: boolean}>}
 */
async function applyStatusChange(connection, orderId, nextStatus, actor, options = {}) {
    const { reason = null, contextOverrides = {}, extraSet = '', extraParams = [] } = options;

    const [[order]] = await connection.query(
        'SELECT id, status, supplier_id, quote_ref, po_id, approval_status FROM orders WHERE id = ? FOR UPDATE',
        [orderId]
    );
    if (!order) {
        throw new StatusTransitionError('Order not found', { statusCode: 404 });
    }
    if (order.status === nextStatus) {
        return { changed: false, from: order.status, to: nextStatus, isReopen: false };
    }

    const context = await getLifecycleContext(connection, order, contextOverrides);
    const verdict = validateOrderTransition(order.status, nextStatus, {
        ...context,
        actorRole: actor?.role,
        reason
    });
    if (!verdict.ok) {
        throw new StatusTransitionError(verdict.message, {
            orderId,
            currentStatus: order.status,
            requestedStatus: nextStatus,
            requiresReason: verdict.requiresReason || false,
            requiresRole: verdict.requiresRole || null
        });
    }

    const setClause = ['status = ?', 'updated_at = NOW()'].concat(extraSet ? [extraSet] : []).join(', ');
    await connection.query(
        `UPDATE orders SET ${setClause} WHERE id = ?`,
        [nextStatus, ...extraParams, orderId]
    );
    await recordStatusChange(connection, orderId, order.status, nextStatus, actor, reason);

    return { changed: true, from: order.status, to: nextStatus, isReopen: Boolean(verdict.isReopen) };
}

/**
 * Move several orders to the same target, skipping the ones that cannot move.
 *
 * Used where the old code ran a single sweeping UPDATE across every order on a
 * quote or purchase order.
 *
 * @returns {Promise<{updated: number[], skipped: Array<{orderId, currentStatus, reason}>}>}
 */
async function applyStatusChangeToMany(connection, orderIds, nextStatus, actor, options = {}) {
    const updated = [];
    const skipped = [];
    for (const orderId of orderIds) {
        try {
            const result = await applyStatusChange(connection, orderId, nextStatus, actor, options);
            if (result.changed) updated.push(orderId);
        } catch (error) {
            if (error instanceof StatusTransitionError) {
                skipped.push({
                    orderId,
                    currentStatus: error.currentStatus || null,
                    reason: error.message
                });
            } else {
                throw error;
            }
        }
    }
    return { updated, skipped };
}

module.exports = {
    StatusTransitionError,
    getLifecycleContext,
    recordStatusChange,
    applyStatusChange,
    applyStatusChangeToMany
};
