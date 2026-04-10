// backend/controllers/claimController.js
const db = require('../config/database');
const { createNotification } = require('./notificationController');

/**
 * Claim an order. Sets claimed_by_user_id = current user.
 * Fails with 409 if already claimed by someone else.
 */
exports.claimOrder = async (req, res) => {
    try {
        const orderId = parseInt(req.params.id, 10);

        const [orders] = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const order = orders[0];

        // Check if already claimed by someone else
        if (order.claimed_by_user_id && order.claimed_by_user_id !== req.user.id) {
            // Check auto-release
            if (order.claimed_at) {
                const hoursElapsed = (Date.now() - new Date(order.claimed_at).getTime()) / (1000 * 60 * 60);
                if (hoursElapsed >= (order.claim_auto_release_hours || 4)) {
                    // Auto-release: claim is stale, allow new claim
                    // Notify old claimer
                    createNotification(
                        order.claimed_by_user_id,
                        'claim_released',
                        'Claim Auto-Released',
                        `Your claim on Order #${orderId} was auto-released due to inactivity.`,
                        orderId,
                        `/orders/${orderId}`
                    ).catch(() => {});
                } else {
                    const [claimer] = await db.query('SELECT name FROM users WHERE id = ?', [order.claimed_by_user_id]);
                    return res.status(409).json({
                        success: false,
                        message: `Order is already claimed by ${claimer[0]?.name || 'another user'}`,
                        claimed_by: claimer[0]?.name,
                        claimed_at: order.claimed_at
                    });
                }
            } else {
                const [claimer] = await db.query('SELECT name FROM users WHERE id = ?', [order.claimed_by_user_id]);
                return res.status(409).json({
                    success: false,
                    message: `Order is already claimed by ${claimer[0]?.name || 'another user'}`,
                    claimed_by: claimer[0]?.name,
                    claimed_at: order.claimed_at
                });
            }
        }

        await db.query(
            'UPDATE orders SET claimed_by_user_id = ?, claimed_at = NOW(), help_requested = FALSE, help_request_note = NULL WHERE id = ?',
            [req.user.id, orderId]
        );

        // Notify procurement colleagues
        const [procUsers] = await db.query(
            "SELECT id FROM users WHERE (role IN ('procurement','admin') OR JSON_CONTAINS(roles, '\"procurement\"')) AND id != ? AND active = 1",
            [req.user.id]
        );
        for (const u of procUsers) {
            createNotification(
                u.id,
                'order_claimed',
                'Order Claimed',
                `${req.user.name || req.user.username} claimed Order #${orderId}`,
                orderId,
                `/orders/${orderId}`
            ).catch(() => {});
        }

        res.json({ success: true, message: 'Order claimed successfully' });
    } catch (error) {
        console.error('Claim order error:', error);
        res.status(500).json({ success: false, message: 'Failed to claim order' });
    }
};

/**
 * Release a claim. Only the claimer or Super Admin can release.
 */
exports.releaseOrder = async (req, res) => {
    try {
        const orderId = parseInt(req.params.id, 10);

        const [orders] = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const order = orders[0];

        // Only claimer or super admin can release
        if (!req.user.is_super_admin && order.claimed_by_user_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Only the claimer or Super Admin can release this order' });
        }

        await db.query(
            'UPDATE orders SET claimed_by_user_id = NULL, claimed_at = NULL, help_requested = FALSE, help_request_note = NULL WHERE id = ?',
            [orderId]
        );

        res.json({ success: true, message: 'Order claim released' });
    } catch (error) {
        console.error('Release order error:', error);
        res.status(500).json({ success: false, message: 'Failed to release order' });
    }
};

/**
 * Request help on a claimed order.
 * Sets help_requested=true and sends notifications.
 */
exports.requestHelp = async (req, res) => {
    try {
        const orderId = parseInt(req.params.id, 10);
        const { note } = req.body;

        const [orders] = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const order = orders[0];

        // Must be claimed by current user
        if (order.claimed_by_user_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'You can only request help on orders you have claimed' });
        }

        await db.query(
            'UPDATE orders SET help_requested = TRUE, help_request_note = ? WHERE id = ?',
            [note || null, orderId]
        );

        // Notify manager + all procurement users
        const [notifyUsers] = await db.query(
            "SELECT id FROM users WHERE (role IN ('procurement','admin','manager') OR JSON_CONTAINS(roles, '\"procurement\"') OR JSON_CONTAINS(roles, '\"manager\"')) AND id != ? AND active = 1",
            [req.user.id]
        );
        for (const u of notifyUsers) {
            createNotification(
                u.id,
                'help_requested',
                'Help Requested',
                `${req.user.name || req.user.username} needs help with Order #${orderId}${note ? ': ' + note.substring(0, 100) : ''}`,
                orderId,
                `/orders/${orderId}`
            ).catch(() => {});
        }

        res.json({ success: true, message: 'Help requested' });
    } catch (error) {
        console.error('Request help error:', error);
        res.status(500).json({ success: false, message: 'Failed to request help' });
    }
};
