// backend/routes/supplierScorecard.js
const express = require('express');
const router = express.Router();
const supplierScorecardController = require('../controllers/supplierScorecardController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// List all suppliers with scorecard data (procurement/manager/admin only)
router.get('/',
    authenticateToken,
    authorizeRoles('procurement', 'manager', 'admin'),
    supplierScorecardController.listScorecards
);

// Get detailed scorecard for one supplier (procurement/manager/admin only)
router.get('/:id',
    authenticateToken,
    authorizeRoles('procurement', 'manager', 'admin'),
    supplierScorecardController.getScorecardById
);

module.exports = router;
