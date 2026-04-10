// backend/routes/claims.js
const express = require('express');
const router = express.Router();
const claimController = require('../controllers/claimController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Claim an order
router.post('/:id/claim',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    claimController.claimOrder
);

// Release a claim
router.post('/:id/release',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    claimController.releaseOrder
);

// Request help on a claimed order
router.post('/:id/request-help',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    claimController.requestHelp
);

module.exports = router;
