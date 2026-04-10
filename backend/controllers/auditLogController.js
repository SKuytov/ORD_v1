// backend/controllers/auditLogController.js
const db = require('../config/database');

exports.getAuditLogs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const { order_id, action, performed_by } = req.query;

        let query = `
            SELECT al.*, o.item_description as order_item_description
            FROM order_audit_log al
            LEFT JOIN orders o ON al.order_id = o.id
        `;
        const conditions = [];
        const params = [];

        if (order_id) {
            conditions.push('al.order_id = ?');
            params.push(order_id);
        }
        if (action) {
            conditions.push('al.action = ?');
            params.push(action);
        }
        if (performed_by) {
            conditions.push('al.performed_by = ?');
            params.push(performed_by);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY al.performed_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const [logs] = await db.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM order_audit_log al';
        const countParams = [];

        if (conditions.length > 0) {
            const countConditions = [];
            if (order_id) { countConditions.push('al.order_id = ?'); countParams.push(order_id); }
            if (action) { countConditions.push('al.action = ?'); countParams.push(action); }
            if (performed_by) { countConditions.push('al.performed_by = ?'); countParams.push(performed_by); }
            countQuery += ' WHERE ' + countConditions.join(' AND ');
        }

        const [countResult] = await db.query(countQuery, countParams);
        const total = countResult[0].total;

        // Parse details JSON if present
        logs.forEach(log => {
            if (log.details && typeof log.details === 'string') {
                try {
                    log.details = JSON.parse(log.details);
                } catch (e) {
                    // Keep as string if not valid JSON
                }
            }
        });

        res.json({
            success: true,
            logs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve audit logs' });
    }
};

exports.getAuditLogsByOrder = async (req, res) => {
    try {
        const { orderId } = req.params;

        const [logs] = await db.query(
            `SELECT * FROM order_audit_log
             WHERE order_id = ?
             ORDER BY performed_at DESC`,
            [orderId]
        );

        // Parse details JSON if present
        logs.forEach(log => {
            if (log.details && typeof log.details === 'string') {
                try {
                    log.details = JSON.parse(log.details);
                } catch (e) {
                    // Keep as string if not valid JSON
                }
            }
        });

        res.json({
            success: true,
            logs
        });
    } catch (error) {
        console.error('Get audit logs by order error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve audit logs for order' });
    }
};

/**
 * Helper function to log an audit entry.
 * Can be imported and used by other controllers.
 */
exports.logAudit = async (orderId, action, performedBy, performedByName, fieldName = null, oldValue = null, newValue = null, details = null, ipAddress = null) => {
    try {
        const detailsJson = details ? JSON.stringify(details) : null;

        const [result] = await db.query(
            `INSERT INTO order_audit_log (
                order_id, action, field_name, old_value, new_value,
                performed_by, performed_by_name, ip_address, details
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                orderId, action, fieldName, oldValue, newValue,
                performedBy, performedByName, ipAddress, detailsJson
            ]
        );
        return result.insertId;
    } catch (error) {
        console.error('Log audit error:', error);
        throw error;
    }
};
