// backend/controllers/rfqController.js
const db = require('../config/database');

/**
 * Get unassigned orders (no assigned_supplier, status new/pending).
 */
exports.getUnassignedOrders = async (req, res) => {
    try {
        const [orders] = await db.query(
            `SELECT o.id, o.item_description, o.part_number, o.quantity, o.priority,
                    o.requester_name, o.submission_date, o.status, o.date_needed,
                    o.building, o.category, o.notes,
                    s.name as current_supplier_name
             FROM orders o
             LEFT JOIN suppliers s ON o.supplier_id = s.id
             WHERE (o.assigned_supplier_name IS NULL OR o.assigned_supplier_name = '')
               AND o.status IN ('New', 'Pending', 'Quote Requested')
             ORDER BY FIELD(o.priority, 'Urgent', 'High', 'Normal', 'Low'), o.submission_date ASC`
        );
        res.json({ success: true, orders });
    } catch (error) {
        console.error('getUnassignedOrders error:', error);
        res.status(500).json({ success: false, message: 'Failed to get unassigned orders' });
    }
};

/**
 * Assign a supplier to an order.
 * POST /api/orders/:id/assign-supplier
 * Body: { supplier_name, supplier_id? }
 */
exports.assignSupplier = async (req, res) => {
    try {
        const orderId = parseInt(req.params.id, 10);
        const { supplier_name, supplier_id } = req.body;

        if (!supplier_name) {
            return res.status(400).json({ success: false, message: 'supplier_name is required' });
        }

        await db.query(
            'UPDATE orders SET assigned_supplier_name = ?, assigned_supplier_id = ? WHERE id = ?',
            [supplier_name, supplier_id || null, orderId]
        );

        res.json({ success: true, message: 'Supplier assigned' });
    } catch (error) {
        console.error('assignSupplier error:', error);
        res.status(500).json({ success: false, message: 'Failed to assign supplier' });
    }
};

/**
 * Get orders grouped by assigned supplier.
 */
exports.getGroupedOrders = async (req, res) => {
    try {
        const [orders] = await db.query(
            `SELECT o.id, o.item_description, o.part_number, o.quantity, o.priority,
                    o.requester_name, o.submission_date, o.status, o.date_needed,
                    o.building, o.category, o.notes,
                    o.assigned_supplier_name, o.assigned_supplier_id,
                    o.unit_price, o.total_price, o.rfq_id
             FROM orders o
             WHERE o.assigned_supplier_name IS NOT NULL AND o.assigned_supplier_name != ''
               AND (o.rfq_id IS NULL)
               AND o.status IN ('New', 'Pending', 'Quote Requested')
             ORDER BY o.assigned_supplier_name, FIELD(o.priority, 'Urgent', 'High', 'Normal', 'Low'), o.submission_date ASC`
        );

        // Group by supplier
        const groups = {};
        for (const order of orders) {
            const key = order.assigned_supplier_name;
            if (!groups[key]) {
                groups[key] = {
                    supplier_name: key,
                    supplier_id: order.assigned_supplier_id,
                    orders: [],
                    total_est_value: 0,
                    order_count: 0
                };
            }
            groups[key].orders.push(order);
            groups[key].order_count++;
            groups[key].total_est_value += parseFloat(order.total_price) || 0;
        }

        res.json({ success: true, groups: Object.values(groups) });
    } catch (error) {
        console.error('getGroupedOrders error:', error);
        res.status(500).json({ success: false, message: 'Failed to get grouped orders' });
    }
};

/**
 * Create an RFQ from an array of order IDs + supplier name.
 * POST /api/rfq/create
 * Body: { order_ids: [1,2,3], supplier_name, supplier_id?, notes?, response_due_date? }
 */
exports.createRFQ = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { order_ids, supplier_name, supplier_id, notes, response_due_date } = req.body;

        if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
            return res.status(400).json({ success: false, message: 'order_ids array is required' });
        }
        if (!supplier_name) {
            return res.status(400).json({ success: false, message: 'supplier_name is required' });
        }

        // Generate RFQ number: RFQ-YYYY-NNN
        const year = new Date().getFullYear();
        const [countResult] = await connection.query(
            "SELECT COUNT(*) as cnt FROM rfqs WHERE rfq_number LIKE ?",
            [`RFQ-${year}-%`]
        );
        const nextNum = (countResult[0].cnt || 0) + 1;
        const rfqNumber = `RFQ-${year}-${String(nextNum).padStart(3, '0')}`;

        const [rfqResult] = await connection.query(
            `INSERT INTO rfqs (rfq_number, supplier_id, supplier_name, created_by_user_id, status, notes, response_due_date)
             VALUES (?, ?, ?, ?, 'draft', ?, ?)`,
            [rfqNumber, supplier_id || null, supplier_name, req.user.id, notes || null, response_due_date || null]
        );

        const rfqId = rfqResult.insertId;

        // Insert order items
        for (const oid of order_ids) {
            await connection.query(
                'INSERT INTO rfq_order_items (rfq_id, order_id) VALUES (?, ?)',
                [rfqId, oid]
            );
            // Update order with rfq_id
            await connection.query(
                'UPDATE orders SET rfq_id = ? WHERE id = ?',
                [rfqId, oid]
            );
        }

        await connection.commit();

        res.json({
            success: true,
            rfq_id: rfqId,
            rfq_number: rfqNumber,
            message: 'RFQ created successfully'
        });
    } catch (error) {
        await connection.rollback();
        console.error('createRFQ error:', error);
        res.status(500).json({ success: false, message: 'Failed to create RFQ' });
    } finally {
        connection.release();
    }
};

/**
 * Get a single RFQ with all order items.
 */
exports.getRFQ = async (req, res) => {
    try {
        const rfqId = parseInt(req.params.id, 10);

        const [rfqs] = await db.query(
            `SELECT r.*, u.name as created_by_name
             FROM rfqs r
             LEFT JOIN users u ON r.created_by_user_id = u.id
             WHERE r.id = ?`,
            [rfqId]
        );

        if (rfqs.length === 0) {
            return res.status(404).json({ success: false, message: 'RFQ not found' });
        }

        const rfq = rfqs[0];

        // Get order items
        const [items] = await db.query(
            `SELECT o.id, o.item_description, o.part_number, o.quantity, o.priority,
                    o.date_needed, o.category, o.notes, o.building,
                    o.unit_price, o.total_price
             FROM rfq_order_items roi
             JOIN orders o ON roi.order_id = o.id
             WHERE roi.rfq_id = ?
             ORDER BY o.id`,
            [rfqId]
        );

        rfq.items = items;

        res.json({ success: true, rfq });
    } catch (error) {
        console.error('getRFQ error:', error);
        res.status(500).json({ success: false, message: 'Failed to get RFQ' });
    }
};

/**
 * Update RFQ status.
 * POST /api/rfq/:id/status
 * Body: { status, response_notes?, sent_at? }
 */
exports.updateRFQStatus = async (req, res) => {
    try {
        const rfqId = parseInt(req.params.id, 10);
        const { status, response_notes, sent_at } = req.body;

        const validStatuses = ['draft', 'sent', 'response_received', 'accepted', 'rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const updates = ['status = ?'];
        const params = [status];

        if (status === 'sent' && !sent_at) {
            updates.push('sent_at = NOW()');
        } else if (sent_at) {
            updates.push('sent_at = ?');
            params.push(sent_at);
        }

        if (response_notes !== undefined) {
            updates.push('response_notes = ?');
            params.push(response_notes);
        }

        params.push(rfqId);

        await db.query(`UPDATE rfqs SET ${updates.join(', ')} WHERE id = ?`, params);

        res.json({ success: true, message: 'RFQ status updated' });
    } catch (error) {
        console.error('updateRFQStatus error:', error);
        res.status(500).json({ success: false, message: 'Failed to update RFQ status' });
    }
};

/**
 * List all RFQs with order count.
 */
exports.listRFQs = async (req, res) => {
    try {
        const [rfqs] = await db.query(
            `SELECT r.*, u.name as created_by_name,
                    (SELECT COUNT(*) FROM rfq_order_items WHERE rfq_id = r.id) as item_count
             FROM rfqs r
             LEFT JOIN users u ON r.created_by_user_id = u.id
             ORDER BY r.created_at DESC`
        );

        res.json({ success: true, rfqs });
    } catch (error) {
        console.error('listRFQs error:', error);
        res.status(500).json({ success: false, message: 'Failed to list RFQs' });
    }
};

/**
 * Get supplier names for autocomplete.
 */
exports.getSupplierNames = async (req, res) => {
    try {
        const [suppliers] = await db.query(
            'SELECT id, name FROM suppliers WHERE active = 1 ORDER BY name'
        );
        res.json({ success: true, suppliers });
    } catch (error) {
        console.error('getSupplierNames error:', error);
        res.status(500).json({ success: false, message: 'Failed to get supplier names' });
    }
};
