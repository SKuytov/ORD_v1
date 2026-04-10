// backend/routes/comments.js - Order Comments API
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// GET /api/comments/:orderId - Get comments for an order
router.get('/:orderId', async (req, res) => {
    try {
        const [comments] = await db.query(
            `SELECT * FROM order_comments
             WHERE order_id = ?
             ORDER BY created_at ASC`,
            [req.params.orderId]
        );
        res.json({ success: true, comments });
    } catch (error) {
        console.error('Get comments error:', error);
        res.status(500).json({ success: false, message: 'Failed to load comments' });
    }
});

// POST /api/comments/:orderId - Add comment to order
router.post('/:orderId', async (req, res) => {
    try {
        const { comment } = req.body;
        if (!comment || !comment.trim()) {
            return res.status(400).json({ success: false, message: 'Comment is required' });
        }

        const [result] = await db.query(
            `INSERT INTO order_comments (order_id, user_id, user_name, comment)
             VALUES (?, ?, ?, ?)`,
            [req.params.orderId, req.user.id, req.user.name, comment.trim()]
        );

        // Try to create notification for order owner
        try {
            const [[order]] = await db.query('SELECT requester_id FROM orders WHERE id = ?', [req.params.orderId]);
            if (order && order.requester_id && order.requester_id !== req.user.id) {
                const { createNotification } = require('./notifications');
                await createNotification(
                    order.requester_id,
                    'comment',
                    `New comment on Order #${req.params.orderId}`,
                    `${req.user.name}: ${comment.trim().substring(0, 100)}`,
                    parseInt(req.params.orderId)
                );
            }
        } catch (notifErr) {
            // Non-critical - don't fail the request
            console.error('Comment notification error:', notifErr);
        }

        res.status(201).json({
            success: true,
            comment: {
                id: result.insertId,
                order_id: parseInt(req.params.orderId),
                user_id: req.user.id,
                user_name: req.user.name,
                comment: comment.trim(),
                created_at: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Add comment error:', error);
        res.status(500).json({ success: false, message: 'Failed to add comment' });
    }
});

module.exports = router;
