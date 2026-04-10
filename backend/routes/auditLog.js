// backend/routes/auditLog.js
const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLogController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Get audit log entries (admin only, paginated, filterable)
router.get('/',
    authenticateToken,
    authorizeRoles('admin'),
    auditLogController.getAuditLogs
);

// Get audit log for specific order (any authenticated role)
router.get('/order/:orderId',
    authenticateToken,
    auditLogController.getAuditLogsByOrder
);

module.exports = router;
