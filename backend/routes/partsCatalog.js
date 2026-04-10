// backend/routes/partsCatalog.js
const express = require('express');
const router = express.Router();
const partsCatalogController = require('../controllers/partsCatalogController');
const { authenticateToken } = require('../middleware/auth');

// Get catalog statistics
router.get('/stats',
    authenticateToken,
    partsCatalogController.getStats
);

// List all distinct parts ever ordered
router.get('/',
    authenticateToken,
    partsCatalogController.listParts
);

module.exports = router;
