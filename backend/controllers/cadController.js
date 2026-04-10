// backend/controllers/cadController.js
const db = require('../config/database');
const { createNotification } = require('./notificationController');

/**
 * Get CAD tasks for the current user (CAD designer).
 */
exports.getMyTasks = async (req, res) => {
    try {
        const [tasks] = await db.query(
            `SELECT o.id, o.item_description, o.part_number, o.quantity, o.priority,
                    o.requester_name, o.submission_date, o.date_needed,
                    o.building, o.category, o.requires_cad, o.cad_status,
                    o.cad_assigned_to_user_id,
                    (SELECT COUNT(*) FROM cad_log_entries cle
                     WHERE cle.order_id = o.id AND cle.entry_type = 'question' AND cle.is_answered = FALSE) as unanswered_questions
             FROM orders o
             WHERE o.requires_cad = TRUE AND o.cad_assigned_to_user_id = ?
             ORDER BY FIELD(o.cad_status, 'not_started', 'in_progress', 'review_needed', 'approved', 'delivered'),
                      FIELD(o.priority, 'Urgent', 'High', 'Normal', 'Low'),
                      o.submission_date ASC`,
            [req.user.id]
        );

        res.json({ success: true, tasks });
    } catch (error) {
        console.error('getMyTasks error:', error);
        res.status(500).json({ success: false, message: 'Failed to get CAD tasks' });
    }
};

/**
 * Get CAD task detail for a specific order.
 */
exports.getTaskDetail = async (req, res) => {
    try {
        const orderId = parseInt(req.params.orderId, 10);

        const [orders] = await db.query(
            `SELECT o.id, o.item_description, o.part_number, o.quantity, o.priority,
                    o.requester_name, o.submission_date, o.date_needed,
                    o.building, o.category, o.notes, o.requires_cad, o.cad_status,
                    o.cad_assigned_to_user_id,
                    u.name as cad_assigned_to_name
             FROM orders o
             LEFT JOIN users u ON o.cad_assigned_to_user_id = u.id
             WHERE o.id = ?`,
            [orderId]
        );

        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        res.json({ success: true, task: orders[0] });
    } catch (error) {
        console.error('getTaskDetail error:', error);
        res.status(500).json({ success: false, message: 'Failed to get task detail' });
    }
};

/**
 * Assign a CAD designer to an order.
 * POST /api/orders/:id/cad/assign
 * Body: { user_id }
 */
exports.assignCadDesigner = async (req, res) => {
    try {
        const orderId = parseInt(req.params.id, 10);
        const { user_id } = req.body;

        if (!user_id) {
            return res.status(400).json({ success: false, message: 'user_id is required' });
        }

        await db.query(
            `UPDATE orders SET requires_cad = TRUE, cad_assigned_to_user_id = ?, cad_status = 'not_started' WHERE id = ?`,
            [user_id, orderId]
        );

        // Notify the assigned CAD designer
        const [order] = await db.query('SELECT item_description FROM orders WHERE id = ?', [orderId]);
        createNotification(
            user_id,
            'cad_assigned',
            'CAD Task Assigned',
            `You have been assigned a CAD task for Order #${orderId}: ${order[0]?.item_description || ''}`,
            orderId,
            `/orders/${orderId}`
        ).catch(() => {});

        // Add log entry
        await db.query(
            `INSERT INTO cad_log_entries (order_id, user_id, entry_type, content)
             VALUES (?, ?, 'status_change', ?)`,
            [orderId, req.user.id, `CAD task assigned to designer by ${req.user.name || req.user.username}`]
        );

        res.json({ success: true, message: 'CAD designer assigned' });
    } catch (error) {
        console.error('assignCadDesigner error:', error);
        res.status(500).json({ success: false, message: 'Failed to assign CAD designer' });
    }
};

/**
 * Update CAD status.
 * POST /api/orders/:id/cad/status
 * Body: { status }
 */
exports.updateCadStatus = async (req, res) => {
    try {
        const orderId = parseInt(req.params.id, 10);
        const { status } = req.body;

        const validStatuses = ['not_started', 'in_progress', 'review_needed', 'approved', 'delivered'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid CAD status' });
        }

        const [orders] = await db.query('SELECT cad_status, cad_assigned_to_user_id, item_description FROM orders WHERE id = ?', [orderId]);
        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const oldStatus = orders[0].cad_status;

        await db.query('UPDATE orders SET cad_status = ? WHERE id = ?', [status, orderId]);

        // Add log entry
        await db.query(
            `INSERT INTO cad_log_entries (order_id, user_id, entry_type, content)
             VALUES (?, ?, 'status_change', ?)`,
            [orderId, req.user.id, `Status changed from "${oldStatus || 'none'}" to "${status}"`]
        );

        // Notify relevant users on key transitions
        if (status === 'review_needed') {
            // Notify procurement/admin
            const [procUsers] = await db.query(
                "SELECT id FROM users WHERE (role IN ('procurement','admin') OR JSON_CONTAINS(roles, '\"procurement\"')) AND active = 1"
            );
            for (const u of procUsers) {
                createNotification(
                    u.id,
                    'cad_review',
                    'CAD Review Needed',
                    `CAD work for Order #${orderId} is ready for review`,
                    orderId,
                    `/orders/${orderId}`
                ).catch(() => {});
            }
        } else if (status === 'delivered') {
            const [procUsers] = await db.query(
                "SELECT id FROM users WHERE (role IN ('procurement','admin') OR JSON_CONTAINS(roles, '\"procurement\"')) AND active = 1"
            );
            for (const u of procUsers) {
                createNotification(
                    u.id,
                    'cad_delivered',
                    'CAD Documentation Delivered',
                    `CAD documentation for Order #${orderId} has been delivered. Supplier selection can proceed.`,
                    orderId,
                    `/orders/${orderId}`
                ).catch(() => {});
            }
        }

        res.json({ success: true, message: 'CAD status updated' });
    } catch (error) {
        console.error('updateCadStatus error:', error);
        res.status(500).json({ success: false, message: 'Failed to update CAD status' });
    }
};

/**
 * Add a CAD log entry.
 * POST /api/orders/:id/cad/log
 * Body: { entry_type, content, addressed_to_user_id? }
 */
exports.addLogEntry = async (req, res) => {
    try {
        const orderId = parseInt(req.params.id, 10);
        const { entry_type, content, addressed_to_user_id } = req.body;

        const validTypes = ['progress', 'question', 'file_ref'];
        if (!validTypes.includes(entry_type)) {
            return res.status(400).json({ success: false, message: 'Invalid entry_type' });
        }
        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, message: 'content is required' });
        }

        const [result] = await db.query(
            `INSERT INTO cad_log_entries (order_id, user_id, entry_type, content, addressed_to_user_id)
             VALUES (?, ?, ?, ?, ?)`,
            [orderId, req.user.id, entry_type, content.trim(), addressed_to_user_id || null]
        );

        // Notify addressed user for questions
        if (entry_type === 'question' && addressed_to_user_id) {
            createNotification(
                addressed_to_user_id,
                'cad_question',
                'CAD Question',
                `${req.user.name || req.user.username} asked a question about Order #${orderId}: ${content.substring(0, 100)}`,
                orderId,
                `/orders/${orderId}`
            ).catch(() => {});
        }

        res.json({ success: true, entry_id: result.insertId, message: 'Log entry added' });
    } catch (error) {
        console.error('addLogEntry error:', error);
        res.status(500).json({ success: false, message: 'Failed to add log entry' });
    }
};

/**
 * Reply to a CAD log entry (question).
 * POST /api/cad/log/:entryId/reply
 * Body: { content }
 */
exports.replyToEntry = async (req, res) => {
    try {
        const entryId = parseInt(req.params.entryId, 10);
        const { content } = req.body;

        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, message: 'content is required' });
        }

        // Get the parent entry
        const [entries] = await db.query('SELECT * FROM cad_log_entries WHERE id = ?', [entryId]);
        if (entries.length === 0) {
            return res.status(404).json({ success: false, message: 'Entry not found' });
        }

        const parentEntry = entries[0];

        // Create reply entry
        const [result] = await db.query(
            `INSERT INTO cad_log_entries (order_id, user_id, entry_type, content, parent_entry_id)
             VALUES (?, ?, 'reply', ?, ?)`,
            [parentEntry.order_id, req.user.id, content.trim(), entryId]
        );

        // Mark question as answered if parent is a question
        if (parentEntry.entry_type === 'question') {
            await db.query('UPDATE cad_log_entries SET is_answered = TRUE WHERE id = ?', [entryId]);
        }

        // Notify the question asker
        if (parentEntry.user_id !== req.user.id) {
            createNotification(
                parentEntry.user_id,
                'cad_reply',
                'CAD Question Answered',
                `${req.user.name || req.user.username} replied to your question on Order #${parentEntry.order_id}`,
                parentEntry.order_id,
                `/orders/${parentEntry.order_id}`
            ).catch(() => {});
        }

        res.json({ success: true, entry_id: result.insertId, message: 'Reply added' });
    } catch (error) {
        console.error('replyToEntry error:', error);
        res.status(500).json({ success: false, message: 'Failed to reply' });
    }
};

/**
 * Get all CAD log entries for an order.
 */
exports.getLogEntries = async (req, res) => {
    try {
        const orderId = parseInt(req.params.id, 10);

        const [entries] = await db.query(
            `SELECT cle.*, u.name as user_name, u2.name as addressed_to_name
             FROM cad_log_entries cle
             LEFT JOIN users u ON cle.user_id = u.id
             LEFT JOIN users u2 ON cle.addressed_to_user_id = u2.id
             WHERE cle.order_id = ?
             ORDER BY cle.created_at DESC`,
            [orderId]
        );

        res.json({ success: true, entries });
    } catch (error) {
        console.error('getLogEntries error:', error);
        res.status(500).json({ success: false, message: 'Failed to get log entries' });
    }
};

/**
 * Get users with cad_designer role for assignment dropdown.
 */
exports.getCadDesigners = async (req, res) => {
    try {
        const [users] = await db.query(
            "SELECT id, name, username FROM users WHERE (role = 'cad_designer' OR JSON_CONTAINS(roles, '\"cad_designer\"') OR is_super_admin = TRUE) AND active = 1 ORDER BY name"
        );
        res.json({ success: true, users });
    } catch (error) {
        console.error('getCadDesigners error:', error);
        res.status(500).json({ success: false, message: 'Failed to get CAD designers' });
    }
};
