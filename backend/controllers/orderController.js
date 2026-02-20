// backend/controllers/orderController.js
const db = require('../config/database');
const emailService = require('../utils/emailService');

exports.createOrder = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        const {
            building,
            itemDescription,
            quantity,
            dateNeeded,
            notes,
            requester,
            requesterEmail
        } = req.body;

        // Insert order
        const [result] = await connection.query(
            `INSERT INTO orders (
                building, item_description, quantity, date_needed, notes,
                requester_id, requester_name, requester_email
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [building, itemDescription, quantity, dateNeeded, notes,
             req.user.id, requester, requesterEmail]
        );

        const orderId = result.insertId;

        // Handle file uploads
        if (req.files && req.files.length > 0) {
            const fileInserts = req.files.map(file => [
                orderId,
                file.originalname,
                file.path,
                file.mimetype,
                file.size
            ]);

            await connection.query(
                `INSERT INTO order_files 
                (order_id, file_name, file_path, file_type, file_size) 
                VALUES ?`,
                [fileInserts]
            );
        }

        await connection.commit();

        // Send email notification to admin/procurement
        await emailService.sendNewOrderNotification({
            orderId,
            building,
            itemDescription,
            quantity,
            requester,
            dateNeeded
        });

        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            orderId
        });

    } catch (error) {
        await connection.rollback();
        console.error('Create order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order'
        });
    } finally {
        connection.release();
    }
};

exports.getOrders = async (req, res) => {
    try {
        let query = `
            SELECT o.*, 
                   GROUP_CONCAT(
                       JSON_OBJECT(
                           'id', f.id,
                           'name', f.file_name,
                           'path', f.file_path,
                           'type', f.file_type
                       )
                   ) as files
            FROM orders o
            LEFT JOIN order_files f ON o.id = f.order_id
        `;

        const params = [];

        // Filter by building for requesters
        if (req.user.role === 'requester') {
            query += ' WHERE o.building = ?';
            params.push(req.user.building);
        }

        query += ' GROUP BY o.id ORDER BY o.submission_date DESC';

        const [orders] = await db.query(query, params);

        // Parse files JSON
        orders.forEach(order => {
            if (order.files) {
                order.files = JSON.parse(`[${order.files}]`);
            } else {
                order.files = [];
            }
        });

        res.json({
            success: true,
            orders
        });

    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve orders'
        });
    }
};

exports.updateOrder = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const updates = req.body;

        // Get current order data for history
        const [currentOrder] = await connection.query(
            'SELECT * FROM orders WHERE id = ?',
            [id]
        );

        if (currentOrder.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Build update query
        const updateFields = [];
        const updateValues = [];

        Object.keys(updates).forEach(key => {
            if (['status', 'supplier', 'quote_id', 'price', 'assigned_to'].includes(key)) {
                updateFields.push(`${key} = ?`);
                updateValues.push(updates[key]);
            }
        });

        if (updateFields.length > 0) {
            updateValues.push(id);
            
            await connection.query(
                `UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?`,
                updateValues
            );

            // Log history
            for (const key of Object.keys(updates)) {
                if (currentOrder[0][key] !== updates[key]) {
                    await connection.query(
                        `INSERT INTO order_history 
                        (order_id, changed_by, field_name, old_value, new_value) 
                        VALUES (?, ?, ?, ?, ?)`,
                        [id, req.user.username, key, 
                         currentOrder[0][key], updates[key]]
                    );
                }
            }
        }

        await connection.commit();

        // Send notification email if status changed
        if (updates.status && updates.status !== currentOrder[0].status) {
            await emailService.sendStatusUpdateNotification({
                orderId: id,
                requesterEmail: currentOrder[0].requester_email,
                oldStatus: currentOrder[0].status,
                newStatus: updates.status
            });
        }

        res.json({
            success: true,
            message: 'Order updated successfully'
        });

    } catch (error) {
        await connection.rollback();
        console.error('Update order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update order'
        });
    } finally {
        connection.release();
    }
};

exports.getOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        const [orders] = await db.query(
            `SELECT o.*, 
                    GROUP_CONCAT(
                        JSON_OBJECT(
                            'id', f.id,
                            'name', f.file_name,
                            'path', f.file_path,
                            'type', f.file_type,
                            'size', f.file_size
                        )
                    ) as files
            FROM orders o
            LEFT JOIN order_files f ON o.id = f.order_id
            WHERE o.id = ?
            GROUP BY o.id`,
            [id]
        );

        if (orders.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const order = orders[0];
        if (order.files) {
            order.files = JSON.parse(`[${order.files}]`);
        } else {
            order.files = [];
        }

        res.json({
            success: true,
            order
        });

    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve order'
        });
    }
};

exports.deleteOrder = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        const { id } = req.params;

        // Check if order exists
        const [orders] = await connection.query(
            'SELECT * FROM orders WHERE id = ?',
            [id]
        );

        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Delete associated files from filesystem
        const [files] = await connection.query(
            'SELECT file_path FROM order_files WHERE order_id = ?',
            [id]
        );

        const fs = require('fs');
        files.forEach(file => {
            if (fs.existsSync(file.file_path)) {
                fs.unlinkSync(file.file_path);
            }
        });

        // Delete order (cascade will delete files and history)
        await connection.query('DELETE FROM orders WHERE id = ?', [id]);

        await connection.commit();

        res.json({
            success: true,
            message: 'Order deleted successfully'
        });

    } catch (error) {
        await connection.rollback();
        console.error('Delete order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete order'
        });
    } finally {
        connection.release();
    }
};

exports.getOrderStats = async (req, res) => {
    try {
        // Get order counts by status
        const [statusCounts] = await db.query(`
            SELECT status, COUNT(*) as count
            FROM orders
            GROUP BY status
        `);

        // Get orders by building
        const [buildingCounts] = await db.query(`
            SELECT building, COUNT(*) as count
            FROM orders
            GROUP BY building
        `);

        // Get total order value
        const [totalValue] = await db.query(`
            SELECT SUM(price) as total
            FROM orders
            WHERE status != 'Cancelled'
        `);

        // Get recent orders
        const [recentOrders] = await db.query(`
            SELECT id, building, item_description, status, submission_date
            FROM orders
            ORDER BY submission_date DESC
            LIMIT 10
        `);

        res.json({
            success: true,
            stats: {
                byStatus: statusCounts,
                byBuilding: buildingCounts,
                totalValue: totalValue[0].total || 0,
                recentOrders
            }
        });

    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve statistics'
        });
    }
};
