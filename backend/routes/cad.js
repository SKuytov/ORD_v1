// backend/routes/cad.js
const express = require('express');
const router = express.Router();
const cadController = require('../controllers/cadController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// CAD designer's task list
router.get('/tasks',
    authenticateToken,
    cadController.getMyTasks
);

// CAD task detail
router.get('/tasks/:orderId',
    authenticateToken,
    cadController.getTaskDetail
);

// Get CAD designers list (for assignment dropdown)
router.get('/designers',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    cadController.getCadDesigners
);

// Assign CAD designer to order
router.post('/orders/:id/assign',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    cadController.assignCadDesigner
);

// Update CAD status
router.post('/orders/:id/status',
    authenticateToken,
    cadController.updateCadStatus
);

// Add CAD log entry
router.post('/orders/:id/log',
    authenticateToken,
    cadController.addLogEntry
);

// Get CAD log entries for an order
router.get('/orders/:id/log',
    authenticateToken,
    cadController.getLogEntries
);

// Reply to a CAD log entry
router.post('/log/:entryId/reply',
    authenticateToken,
    cadController.replyToEntry
);

module.exports = router;
