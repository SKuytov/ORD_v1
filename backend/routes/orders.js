// backend/routes/orders.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const supplierSuggestionsController = require('../controllers/supplierSuggestionsController');
const supplierGroupController          = require('../controllers/supplierGroupController');
const descriptionCorrectionController  = require('../controllers/descriptionCorrectionController');
const accountingController = require('../controllers/accountingController');
const db = require('../config/database');
const { withTransaction } = require('../utils/withTransaction');
const { validateOrderTransition } = require('../utils/orderLifecycle');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { enrichBuildingManager } = require('../middleware/buildingManagerMiddleware');
const upload = require('../middleware/upload');
const {
    requireOrderAccess,
    requireBodyOrderAccess,
    getManagedBuildingCodes,
    canAccessOrder
} = require('../middleware/authz');

// Accounting is a financial role rather than an order-viewer role in authz.
// Resolve the order through the shared access layer first; its documented
// financial scope is limited to these accounting endpoints.
function requireAccountingWorkflowOrderAccess(paramName = 'orderId') {
    return async (req, res, next) => {
        try {
            const access = await canAccessOrder(req.params[paramName], req.user);
            if (access.reason === 'not_found') {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }
            if (access.allowed || req.user.role === 'accounting') {
                req.order = access.order;
                return next();
            }
            return res.status(403).json({ success: false, message: 'Access denied' });
        } catch (error) {
            next(error);
        }
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: ALL static/named routes MUST appear before /:id routes
// otherwise Express will match e.g. /todays-actions as { id: 'todays-actions' }
// ─────────────────────────────────────────────────────────────────────────────

// Get order statistics (admin and procurement)
router.get('/stats/overview',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    orderController.getOrderStats
);

// ⭐ Get suggestion statistics (admin)
router.get('/stats/suggestions',
    authenticateToken,
    authorizeRoles('admin'),
    supplierSuggestionsController.getSuggestionStats
);

// ⭐ Log supplier selection for learning
router.post('/supplier-selection-log',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    requireBodyOrderAccess('orderId'),
    supplierSuggestionsController.logSupplierSelection
);

// ⭐ POST /api/orders/auto-suggest-suppliers — AI supplier suggestions for multiple orders at once
router.post('/auto-suggest-suppliers', authenticateToken, authorizeRoles('admin', 'procurement'), requireBodyOrderAccess('order_ids'), async (req, res) => {
    try {
        const { order_ids } = req.body;
        if (!order_ids || !order_ids.length) return res.status(400).json({ success: false, message: 'order_ids required' });

        const db = require('../config/database');
        const supplierAI = require('../supplier-ai');

        const results = {};
        for (const orderId of order_ids) {
            try {
                const suggestions = await supplierAI.getSupplierSuggestions(orderId);
                results[orderId] = suggestions.slice(0, 3);
            } catch (e) {
                results[orderId] = [];
            }
        }
        res.json({ success: true, suggestions: results });
    } catch (err) {
        console.error('auto-suggest-suppliers error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ⭐ POST /api/orders/bulk-status — update status for multiple orders at once
router.post('/bulk-status', authenticateToken, authorizeRoles('admin', 'procurement'), requireBodyOrderAccess('order_ids'), async (req, res) => {
    const { order_ids: rawOrderIds, status } = req.body || {};
    const orderIds = [...new Set((rawOrderIds || []).map(Number))];
    if (!orderIds.length || orderIds.length !== rawOrderIds?.length || !status) {
        return res.status(400).json({ success: false, message: 'order_ids and status required' });
    }
    try {
        const updated = await withTransaction(db, async connection => {
            const [orders] = await connection.query(
                'SELECT * FROM orders WHERE id IN (?) ORDER BY id ASC FOR UPDATE',
                [orderIds]
            );
            if (orders.length !== orderIds.length) {
                const found = new Set(orders.map(order => Number(order.id)));
                const error = new Error('One or more orders no longer exist');
                error.status = 404;
                error.offendingOrders = orderIds.filter(id => !found.has(id));
                throw error;
            }
            for (const order of orders) {
                let quote = null;
                let po = null;
                if (order.quote_ref) [[quote]] = await connection.query('SELECT id, status FROM quotes WHERE id = ?', [order.quote_ref]);
                if (order.po_id) [[po]] = await connection.query('SELECT id, actual_delivery_date FROM purchase_orders WHERE id = ?', [order.po_id]);
                const [[proof]] = await connection.query(
                    `SELECT d.id FROM documents d
                     LEFT JOIN order_documents_link odl ON odl.document_id = d.id AND odl.order_id = ?
                     WHERE (d.order_id = ? OR odl.order_id IS NOT NULL)
                       AND d.document_type IN ('delivery_proof', 'signed_delivery_note') LIMIT 1`,
                    [order.id, order.id]
                );
                const lifecycle = validateOrderTransition(order.status, status, {
                    hasSupplier: Boolean(order.supplier_id),
                    hasQuote: Boolean(quote),
                    quoteApproved: quote?.status === 'Approved',
                    approvalApproved: order.approval_status === 'approved',
                    hasPurchaseOrder: Boolean(po),
                    actualDeliveryDate: po?.actual_delivery_date || null,
                    hasDeliveryProof: Boolean(proof)
                });
                if (!lifecycle.ok) {
                    const error = new Error(lifecycle.message);
                    error.status = 409;
                    error.offendingOrders = [order.id];
                    throw error;
                }
            }
            for (const order of orders) {
                await connection.query('UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?', [status, order.id]);
                if (order.status !== status) {
                    await connection.query(
                        `INSERT INTO order_history (order_id, changed_by, field_name, old_value, new_value)
                         VALUES (?, ?, 'status', ?, ?)`,
                        [order.id, req.user.name || req.user.username, order.status, status]
                    );
                    await connection.query(
                        `INSERT INTO orders_audit_log (order_id, field_name, old_value, new_value, changed_by, reason)
                         VALUES (?, 'status', ?, ?, ?, 'Bulk status update')`,
                        [order.id, order.status, status, req.user.id]
                    );
                }
            }
            return orders.length;
        });
        res.json({ success: true, updated, message: `${updated} orders updated to ${status}` });
    } catch (err) {
        if (err.status && err.status < 500) {
            return res.status(err.status).json({
                success: false,
                message: err.message,
                ...(err.offendingOrders ? { offending_orders: err.offendingOrders } : {})
            });
        }
        console.error('bulk-status error:', err);
        res.status(500).json({ success: false, message: 'Failed to update order statuses' });
    }
});

// Atomic supplier assignment. Unlike the legacy bulk-status route, this
// endpoint validates the whole selection before making any mutation.
router.post('/bulk-assign-supplier',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    orderController.bulkAssignSupplier
);

// ⭐ GET /api/orders/todays-actions — procurement dashboard: what needs action today
// MUST be before /:id to avoid Express matching 'todays-actions' as an ID
router.get('/todays-actions', authenticateToken, authorizeRoles('admin', 'procurement'), async (req, res) => {
    try {
        const db = require('../config/database');

        // Overdue orders (past date_needed, not delivered/cancelled)
        const [overdue] = await db.query(`
            SELECT id, item_description, building, date_needed, status, priority, supplier_id,
                   (SELECT name FROM suppliers WHERE id = orders.supplier_id) as supplier_name
            FROM orders
            WHERE date_needed < CURDATE() AND status NOT IN ('Delivered','Cancelled')
            ORDER BY date_needed ASC LIMIT 20
        `);

        // Awaiting supplier response (sent >2 days ago, no reply yet)
        const [awaitingResponse] = await db.query(`
            SELECT o.id, o.item_description, o.building, q.quote_number, q.created_at as sent_at,
                   s.name as supplier_name, s.email as supplier_email,
                   DATEDIFF(NOW(), q.created_at) as days_waiting
            FROM orders o
            JOIN quotes q ON o.quote_ref = q.id
            LEFT JOIN suppliers s ON q.supplier_id = s.id
            WHERE o.status = 'Quote Requested' AND q.status = 'Sent to Supplier'
              AND DATEDIFF(NOW(), q.created_at) > 2
            ORDER BY days_waiting DESC LIMIT 20
        `);

        // New unprocessed orders (>1 day old, still New)
        const [newUnprocessed] = await db.query(`
            SELECT id, item_description, building, priority, submission_date,
                   DATEDIFF(NOW(), submission_date) as days_old
            FROM orders WHERE status = 'New' AND DATEDIFF(NOW(), submission_date) >= 1
            ORDER BY priority DESC, submission_date ASC LIMIT 20
        `);

        // In transit — expected delivery today or overdue
        const [arrivalToday] = await db.query(`
            SELECT o.id, o.item_description, o.building, o.expected_delivery_date,
                   s.name as supplier_name
            FROM orders o
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            WHERE o.status = 'In Transit' AND o.expected_delivery_date <= CURDATE()
            ORDER BY o.expected_delivery_date ASC LIMIT 20
        `);

        // Quotes received but no price entered yet
        const [quotesNoPrice] = await db.query(`
            SELECT o.id, o.item_description, o.building, q.quote_number,
                   s.name as supplier_name
            FROM orders o
            JOIN quotes q ON o.quote_ref = q.id
            LEFT JOIN suppliers s ON q.supplier_id = s.id
            WHERE o.status = 'Quote Received' AND (o.unit_price IS NULL OR o.unit_price = 0)
            ORDER BY q.created_at ASC LIMIT 20
        `);

        res.json({
            success: true,
            overdue,
            awaitingResponse,
            newUnprocessed,
            arrivalToday,
            quotesNoPrice
        });
    } catch (err) {
        console.error('todays-actions error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ⭐ POST /api/orders/trigger-daily-digest — manually trigger daily digest email (admin only)
router.post('/trigger-daily-digest', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const db = require('../config/database');
        const emailService = require('../utils/emailService');

        const [orders] = await db.query(`
            SELECT o.*, s.name as supplier_name FROM orders o
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            WHERE o.status NOT IN ('Delivered','Cancelled')
            ORDER BY o.priority DESC, o.date_needed ASC
        `);

        await emailService.sendDailyDigest({
            orders,
            recipientEmail: req.user.email || process.env.SMTP_USER,
            recipientName: req.user.name || 'Admin'
        });

        res.json({ success: true, message: 'Daily digest sent' });
    } catch (err) {
        console.error('trigger-daily-digest error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ORDER TEMPLATES — must be before /:id
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/orders/templates — list templates for current user's building
router.get('/templates', authenticateToken, async (req, res) => {
    const db = require('../config/database');
    try {
        const building = req.user.building;
        const role = req.user.role;
        // Admins/procurement see all templates; managers and requesters are building-scoped.
        let rows;
        if (role === 'admin' || role === 'procurement') {
            [rows] = await db.query(
                `SELECT id, template_name, item_description, part_number, category, quantity, priority, notes, building
                 FROM orders WHERE is_template = 1 ORDER BY id DESC LIMIT 50`
            );
        } else if (role === 'manager') {
            const managedBuildings = await getManagedBuildingCodes(req.user.id);
            if (!managedBuildings.length) {
                rows = [];
            } else {
                [rows] = await db.query(
                    `SELECT id, template_name, item_description, part_number, category, quantity, priority, notes, building
                     FROM orders WHERE is_template = 1 AND building IN (?) ORDER BY id DESC LIMIT 50`,
                    [managedBuildings]
                );
            }
        } else {
            [rows] = await db.query(
                `SELECT id, template_name, item_description, part_number, category, quantity, priority, notes, building
                 FROM orders WHERE is_template = 1 AND building = ? ORDER BY id DESC LIMIT 50`,
                [building]
            );
        }
        res.json({ success: true, templates: rows });
    } catch (e) {
        console.error('GET /templates error:', e);
        res.status(500).json({ success: false, message: 'Failed to load templates' });
    }
});

// POST /api/orders/templates — save current form as template
router.post('/templates', authenticateToken, async (req, res) => {
    const db = require('../config/database');
    try {
        const { template_name, item_description, part_number, category, quantity, priority, notes } = req.body;
        if (!template_name || !item_description) {
            return res.status(400).json({ success: false, message: 'Template name and item description are required' });
        }
        const building = req.user.building;
        const [result] = await db.query(
            `INSERT INTO orders (building, item_description, part_number, category, quantity, priority, notes,
             requester_id, requester_name, requester_email, status, is_template, template_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Template', 1, ?)`,
            [building, item_description, part_number || null, category || null,
             quantity || 1, priority || 'Normal', notes || null,
             req.user.id, req.user.name, req.user.email, template_name]
        );
        // Audit: log template creation
        const db2 = require('../config/database');
        await db2.query(
            `INSERT INTO order_history (order_id, field_name, old_value, new_value, changed_by, changed_at)
             VALUES (?, 'is_template', '0', '1', ?, NOW())`,
            [result.insertId, req.user.name || req.user.username]
        );

        res.json({ success: true, id: result.insertId, message: `Template "${template_name}" saved` });
    } catch (e) {
        console.error('POST /templates error:', e);
        res.status(500).json({ success: false, message: 'Failed to save template' });
    }
});

// DELETE /api/orders/templates/:id
router.delete('/templates/:id', authenticateToken, requireOrderAccess(), async (req, res) => {
    const db = require('../config/database');
    try {
        const [rows] = await db.query('SELECT requester_id FROM orders WHERE id = ? AND is_template = 1', [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Template not found' });
        // Only owner or admin can delete
        if (rows[0].requester_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'procurement') {
            return res.status(403).json({ success: false, message: 'Not allowed' });
        }
        await db.query('DELETE FROM orders WHERE id = ? AND is_template = 1', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Failed to delete template' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ⭐ NEW: GET /api/orders/by-supplier
// Returns all active orders grouped by supplier, with AI suggestions for unassigned.
// Admin and procurement only.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/by-supplier',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    supplierGroupController.getOrdersBySupplier
);

// ─────────────────────────────────────────────────────────────────────────────
// ⭐ NEW: GET /api/orders/building-manager-status
// Called by frontend after login to detect if user is a building manager.
// Returns { success, isBuildingManager, buildingCode, buildingName }
// MUST be before /:id routes.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/building-manager-status',
    authenticateToken,
    enrichBuildingManager,
    orderController.getBuildingManagerStatus
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orders/:id/cancel — requester self-cancellation with audit trail
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/cancel', authenticateToken, requireOrderAccess(), authorizeRoles('admin', 'procurement', 'requester', 'manager'), async (req, res) => {
    const db = require('../config/database');
    try {
        const orderId = parseInt(req.params.id, 10);
        const { reason } = req.body;
        const user = req.user;

        if (!reason || !reason.trim()) {
            return res.status(400).json({ success: false, message: 'Cancellation reason is required' });
        }

        const order = req.order;
        const CANCELLABLE_STATUSES = ['New', 'Pending', 'Quote Requested'];
        if (user.role === 'requester' && !CANCELLABLE_STATUSES.includes(order.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel an order with status "${order.status}". Only New, Pending or Quote Requested orders can be cancelled by the requester.`
            });
        }

        const previousStatus = order.status;

        // Update status to Cancelled
        await db.query(
            `UPDATE orders SET status = 'Cancelled', updated_at = NOW() WHERE id = ?`,
            [orderId]
        );

        // Write full audit trail to order_history
        await db.query(
            `INSERT INTO order_history (order_id, field_name, old_value, new_value, changed_by, changed_at)
             VALUES (?, 'status', ?, 'Cancelled', ?, NOW())`,
            [orderId, previousStatus, user.name || user.email]
        );
        await db.query(
            `INSERT INTO order_history (order_id, field_name, old_value, new_value, changed_by, changed_at)
             VALUES (?, 'cancellation_reason', NULL, ?, ?, NOW())`,
            [orderId, reason.trim(), user.name || user.email]
        );

        res.json({ success: true, message: 'Order cancelled successfully' });

        // Non-blocking email notification to admin/procurement
        const emailService = require('../utils/emailService');
        emailService.sendOrderCancelledNotification({
            orderId,
            building: order.building || '',
            itemDescription: order.item_description,
            quantity: order.quantity || 1,
            previousStatus,
            cancelledBy: user.name || user.email,
            cancelledAt: new Date(),
            reason: reason.trim(),
        }).catch(err => console.error('Cancel notification email failed:', err.message));

    } catch (e) {
        console.error('Cancel order error:', e);
        res.status(500).json({ success: false, message: 'Failed to cancel order' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ⭐ NEW: POST /api/orders/:id/cancel-by-manager
// Building manager cancels an order from their building (any non-terminal status).
// Body: { reason: string }
// MUST be before /:id GET route.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/cancel-by-manager',
    authenticateToken,
    enrichBuildingManager,
    requireOrderAccess(),
    authorizeRoles('requester', 'manager'),
    orderController.cancelOrderByManager
);

// Workflow-enforcement endpoints. They are intentionally registered before
// /:id so Express does not treat the final segment as a generic order ID.
router.post('/:orderId/confirm-delivery',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    requireOrderAccess('orderId'),
    orderController.confirmDelivery
);
router.get('/:orderId/accounting-preflight',
    authenticateToken,
    authorizeRoles('admin', 'accounting'),
    requireAccountingWorkflowOrderAccess('orderId'),
    accountingController.getOrderAccountingPreflight
);
router.post('/:orderId/accounting-handover',
    authenticateToken,
    authorizeRoles('admin', 'accounting'),
    requireAccountingWorkflowOrderAccess('orderId'),
    accountingController.createOrderAccountingHandover
);
router.post('/:orderId/submit-approval',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    requireOrderAccess('orderId'),
    orderController.submitApproval
);
router.post('/:orderId/approve',
    authenticateToken,
    authorizeRoles('admin', 'manager'),
    requireOrderAccess('orderId'),
    orderController.approveOrder
);

// ─────────────────────────────────────────────────────────────────────────────
// Parameterised routes — AFTER all static routes
// ─────────────────────────────────────────────────────────────────────────────

// Create new order
router.post('/',
    authenticateToken,
    upload.array('files', 5),
    orderController.createOrder
);

// Get all orders (filtered by role + query params)
// enrichBuildingManager: building managers (role=requester) see all orders in their building
router.get('/',
    authenticateToken,
    enrichBuildingManager,
    orderController.getOrders
);

// ⭐ Per-order: AI supplier suggestions
router.get('/:id/suggested-suppliers',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    requireOrderAccess(),
    supplierSuggestionsController.getSuggestedSuppliers
);

// ⭐ Correct description + queue Gemini enrichment
router.post('/:id/correct-description',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    requireOrderAccess(),
    descriptionCorrectionController.correctDescription
);

// Get specific order by ID
// enrichBuildingManager: building managers can open any order in their building
router.get('/:id',
    authenticateToken,
    enrichBuildingManager,
    requireOrderAccess(),
    orderController.getOrderById
);

// Update order (admin and procurement)
router.put('/:id',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    requireOrderAccess(),
    orderController.updateOrder
);

// Delete order (admin only)
router.delete('/:id',
    authenticateToken,
    authorizeRoles('admin'),
    requireOrderAccess(),
    orderController.deleteOrder
);

module.exports = router;
