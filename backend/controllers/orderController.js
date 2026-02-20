// backend/controllers/orderController.js
const db = require('../config/database');
const emailService = require('../utils/emailService');

exports.createOrder = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const {
            building, itemDescription, partNumber, category,
            quantity, dateNeeded, priority, notes,
            requester, requesterEmail
        } = req.body;

        const [result] = await connection.query(
            `INSERT INTO orders (
                building, item_description, part_number, category,
                quantity, date_needed, priority, notes,
                requester_id, requester_name, requester_email, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New')`,
            [building, itemDescription, partNumber || null, category || null,
             quantity, dateNeeded, priority || 'Normal', notes,
             req.user.id, requester, requesterEmail]
        );

        const orderId = result.insertId;

        // Handle file uploads
        if (req.files && req.files.length > 0) {
            const fileInserts = req.files.map(file => [
                orderId, file.originalname, file.path, file.mimetype, file.size
            ]);

            await connection.query(
                `INSERT INTO order_files
                (order_id, file_name, file_path, file_type, file_size)
                VALUES ?`,
                [fileInserts]
            );
        }

        await connection.commit();

        // Send email notification (non-blocking)
        emailService.sendNewOrderNotification({
            orderId, building, itemDescription, quantity, requester, dateNeeded
        }).catch(err => console.error('Email notification failed:', err.message));

        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            orderId
        });
    } catch (error) {
        await connection.rollback();
        console.error('Create order error:', error);
        res.status(500).json({ success: false, message: 'Failed to create order' });
    } finally {
        connection.release();
    }
};

exports.getOrders = async (req, res) => {
    try {
        const { status, building, priority, supplier_id, search } = req.query;

        let query = `
            SELECT o.*,
                   s.name as supplier_name,
                   q.quote_number,
                   GROUP_CONCAT(
                       DISTINCT JSON_OBJECT(
                           'id', f.id,
                           'name', f.file_name,
                           'path', REPLACE(f.file_path, './', '/'),
                           'type', f.file_type,
                           'size', f.file_size
                       )
                   ) as files
            FROM orders o
            LEFT JOIN order_files f ON o.id = f.order_id
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            LEFT JOIN quotes q ON o.quote_ref = q.id
        `;

        const conditions = [];
        const params = [];

        // Role-based filtering
        if (req.user.role === 'requester') {
            conditions.push('o.building = ?');
            params.push(req.user.building);
        }

        // Filters
        if (status) { conditions.push('o.status = ?'); params.push(status); }
        if (building) { conditions.push('o.building = ?'); params.push(building); }
        if (priority) { conditions.push('o.priority = ?'); params.push(priority); }
        if (supplier_id) { conditions.push('o.supplier_id = ?'); params.push(supplier_id); }
        if (search) {
            conditions.push('(o.item_description LIKE ? OR o.part_number LIKE ? OR o.requester_name LIKE ?)');
            const s = `%${search}%`;
            params.push(s, s, s);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' GROUP BY o.id ORDER BY o.submission_date DESC';

        const [orders] = await db.query(query, params);

        // Parse files JSON
        orders.forEach(order => {
            if (order.files && order.files !== 'null') {
                try {
                    order.files = JSON.parse(`[${order.files}]`);
                    // Remove null entries
                    order.files = order.files.filter(f => f.id !== null);
                } catch { order.files = []; }
            } else {
                order.files = [];
            }
        });

        res.json({ success: true, orders });
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve orders' });
    }
};

exports.getOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        const [orders] = await db.query(`
            SELECT o.*,
                   s.name as supplier_name, s.email as supplier_email,
                   s.contact_person as supplier_contact,
                   q.quote_number, q.status as quote_status
            FROM orders o
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            LEFT JOIN quotes q ON o.quote_ref = q.id
            WHERE o.id = ?
        `, [id]);

        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const order = orders[0];

        // Get files
        const [files] = await db.query(
            'SELECT id, file_name, file_path, file_type, file_size, uploaded_at FROM order_files WHERE order_id = ?',
            [id]
        );
        order.files = files;

        // Get history
        const [history] = await db.query(
            'SELECT * FROM order_history WHERE order_id = ? ORDER BY changed_at DESC',
            [id]
        );
        order.history = history;

        res.json({ success: true, order });
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve order' });
    }
};

exports.updateOrder = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const updates = req.body;

        const [currentOrder] = await connection.query(
            'SELECT * FROM orders WHERE id = ?', [id]
        );

        if (currentOrder.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Allowed updatable fields
        const allowedFields = [
            'status', 'supplier', 'supplier_id', 'quote_id', 'price',
            'unit_price', 'total_price', 'assigned_to', 'priority',
            'expected_delivery_date', 'notes', 'part_number', 'category'
        ];

        const updateFields = [];
        const updateValues = [];

        for (const key of Object.keys(updates)) {
            if (allowedFields.includes(key)) {
                updateFields.push(`${key} = ?`);
                updateValues.push(updates[key]);
            }
        }

        if (updateFields.length > 0) {
            updateValues.push(id);

            await connection.query(
                `UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?`,
                updateValues
            );

            // Log history for each changed field
            for (const key of Object.keys(updates)) {
                if (allowedFields.includes(key) && String(currentOrder[0][key]) !== String(updates[key])) {
                    await connection.query(
                        `INSERT INTO order_history
                        (order_id, changed_by, field_name, old_value, new_value)
                        VALUES (?, ?, ?, ?, ?)`,
                        [id, req.user.username, key,
                         String(currentOrder[0][key] || ''), String(updates[key] || '')]
                    );
                }
            }
        }

        await connection.commit();

        // Send email if status changed
        if (updates.status && updates.status !== currentOrder[0].status) {
            emailService.sendStatusUpdateNotification({
                orderId: id,
                requesterEmail: currentOrder[0].requester_email,
                oldStatus: currentOrder[0].status,
                newStatus: updates.status
            }).catch(err => console.error('Status email failed:', err.message));
        }

        res.json({ success: true, message: 'Order updated successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Update order error:', error);
        res.status(500).json({ success: false, message: 'Failed to update order' });
    } finally {
        connection.release();
    }
};

exports.deleteOrder = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { id } = req.params;

        const [orders] = await connection.query(
            'SELECT * FROM orders WHERE id = ?', [id]
        );

        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Delete files from filesystem
        const [files] = await connection.query(
            'SELECT file_path FROM order_files WHERE order_id = ?', [id]
        );

        const fs = require('fs');
        files.forEach(file => {
            if (fs.existsSync(file.file_path)) {
                fs.unlinkSync(file.file_path);
            }
        });

        await connection.query('DELETE FROM orders WHERE id = ?', [id]);
        await connection.commit();

        res.json({ success: true, message: 'Order deleted successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Delete order error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete order' });
    } finally {
        connection.release();
    }
};

exports.getOrderStats = async (req, res) => {
    try {
        const [statusCounts] = await db.query(
            'SELECT status, COUNT(*) as count FROM orders GROUP BY status'
        );

        const [buildingCounts] = await db.query(
            'SELECT building, COUNT(*) as count FROM orders GROUP BY building'
        );

        const [totalValue] = await db.query(
            `SELECT SUM(total_price) as total FROM orders WHERE status NOT IN ('Cancelled')`
        );

        const [priorityCounts] = await db.query(
            'SELECT priority, COUNT(*) as count FROM orders GROUP BY priority'
        );

        const [recentOrders] = await db.query(`
            SELECT id, building, item_description, status, priority, submission_date
            FROM orders ORDER BY submission_date DESC LIMIT 10
        `);

        res.json({
            success: true,
            stats: {
                byStatus: statusCounts,
                byBuilding: buildingCounts,
                byPriority: priorityCounts,
                totalValue: totalValue[0].total || 0,
                recentOrders
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve statistics' });
    }
};
