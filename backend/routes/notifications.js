// backend/routes/notifications.js
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticateToken } = require('../middleware/auth');

// Get notifications for current user (paginated, newest first)
router.get('/',
    authenticateToken,
    notificationController.getNotifications
);

// Get unread count for current user
router.get('/unread-count',
    authenticateToken,
    notificationController.getUnreadCount
);

// Mark all as read for current user (must be before /:id/read to avoid route conflict)
router.put('/read-all',
    authenticateToken,
    notificationController.markAllAsRead
);

// Mark single notification as read
router.put('/:id/read',
    authenticateToken,
    notificationController.markAsRead
);

module.exports = router;
