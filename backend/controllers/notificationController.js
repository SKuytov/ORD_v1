// backend/controllers/notificationController.js
const db = require('../config/database');

exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const [notifications] = await db.query(
            `SELECT * FROM notifications
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );

        const [countResult] = await db.query(
            'SELECT COUNT(*) as total FROM notifications WHERE user_id = ?',
            [userId]
        );

        const total = countResult[0].total;

        res.json({
            success: true,
            notifications,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve notifications' });
    }
};

exports.getUnreadCount = async (req, res) => {
    try {
        const userId = req.user.id;

        const [result] = await db.query(
            'SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = ? AND is_read = 0',
            [userId]
        );

        res.json({
            success: true,
            unread_count: result[0].unread_count
        });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve unread count' });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const [result] = await db.query(
            'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        res.json({
            success: true,
            message: 'Notification marked as read'
        });
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({ success: false, message: 'Failed to mark notification as read' });
    }
};

exports.markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.id;

        const [result] = await db.query(
            'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
            [userId]
        );

        res.json({
            success: true,
            message: 'All notifications marked as read',
            updated: result.affectedRows
        });
    } catch (error) {
        console.error('Mark all as read error:', error);
        res.status(500).json({ success: false, message: 'Failed to mark all notifications as read' });
    }
};

/**
 * Helper function to create a notification.
 * Can be imported and used by other controllers.
 */
exports.createNotification = async (userId, type, title, message, orderId = null, link = null) => {
    try {
        const [result] = await db.query(
            `INSERT INTO notifications (user_id, type, title, message, order_id, link)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, type, title, message, orderId, link]
        );
        return result.insertId;
    } catch (error) {
        console.error('Create notification error:', error);
        throw error;
    }
};
