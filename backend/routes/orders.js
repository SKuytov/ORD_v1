// backend/routes/orders.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const supplierSuggestionsController = require('../controllers/supplierSuggestionsController');
const supplierGroupController          = require('../controllers/supplierGroupController');
const descriptionCorrectionController  = require('../controllers/descriptionCorrectionController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { enrichBuildingManager } = require('../middleware/buildingManagerMiddleware');
const upload = require('../middleware/upload');

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
    supplierSuggestionsController.logSupplierSelection
);

// ⭐ POST /api/orders/auto-suggest-suppliers — AI supplier suggestions for multiple orders at once
router.post('/auto-suggest-suppliers', authenticateToken, authorizeRoles('admin', 'procurement'), async (req, res) => {
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
router.post('/bulk-status', authenticateToken, authorizeRoles('admin', 'procurement'), async (req, res) => {
    try {
        const { order_ids, status } = req.body;
        if (!order_ids || !order_ids.length || !status) {
            return res.status(400).json({ success: false, message: 'order_ids and status required' });
        }
        const db = require('../config/database');
        const placeholders = order_ids.map(() => '?').join(',');

        // Get old statuses for history
        const [oldOrders] = await db.query(`SELECT id, status FROM orders WHERE id IN (${placeholders})`, order_ids);

        await db.query(`UPDATE orders SET status = ?, updated_at = NOW() WHERE id IN (${placeholders})`, [status, ...order_ids]);

        // Log history for each order
        for (const old of oldOrders) {
            await db.query(
                `INSERT INTO order_history (order_id, changed_by, field_name, old_value, new_value) VALUES (?, ?, 'status', ?, ?)`,
                [old.id, req.user.name || req.user.username, old.status, status]
            );
        }
        res.json({ success: true, updated: order_ids.length, message: `${order_ids.length} orders updated to ${status}` });
    } catch (err) {
        console.error('bulk-status error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

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
        // Admins/procurement see all templates; requesters see their building's templates
        let rows;
        if (role === 'admin' || role === 'procurement' || role === 'manager') {
            [rows] = await db.query(
                `SELECT id, template_name, item_description, part_number, category, quantity, priority, notes, building
                 FROM orders WHERE is_template = 1 ORDER BY id DESC LIMIT 50`
            );
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
router.delete('/templates/:id', authenticateToken, async (req, res) => {
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
router.post('/:id/cancel', authenticateToken, async (req, res) => {
    const db = require('../config/database');
    try {
        const orderId = parseInt(req.params.id, 10);
        const { reason } = req.body;
        const user = req.user;

        if (!reason || !reason.trim()) {
            return res.status(400).json({ success: false, message: 'Cancellation reason is required' });
        }

        // Fetch the order — requester isolation enforced
        const whereClause = (user.role === 'requester')
            ? 'WHERE id = ? AND building = ? AND requester_id = ?'
            : 'WHERE id = ?';
        const params = (user.role === 'requester')
            ? [orderId, user.building, user.id]
            : [orderId];

        const [orders] = await db.query(`SELECT id, status, item_description, building, quantity FROM orders ${whereClause}`, params);
        if (!orders.length) {
            return res.status(404).json({ success: false, message: 'Order not found or access denied' });
        }

        const order = orders[0];
        const CANCELLABLE_STATUSES = ['New', 'Pending', 'Quote Requested'];

        if (!CANCELLABLE_STATUSES.includes(order.status)) {
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
    orderController.cancelOrderByManager
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
    supplierSuggestionsController.getSuggestedSuppliers
);

// ⭐ Correct description + queue Gemini enrichment
router.post('/:id/correct-description',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    descriptionCorrectionController.correctDescription
);

// Get specific order by ID
// enrichBuildingManager: building managers can open any order in their building
router.get('/:id',
    authenticateToken,
    enrichBuildingManager,
    orderController.getOrderById
);

// Update order (admin and procurement)
router.put('/:id',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    orderController.updateOrder
);

// Delete order (admin only)
router.delete('/:id',
    authenticateToken,
    authorizeRoles('admin'),
    orderController.deleteOrder
);

module.exports = router;
