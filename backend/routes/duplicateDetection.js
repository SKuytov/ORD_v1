// backend/routes/duplicateDetection.js
const express = require('express');
const router = express.Router();
const duplicateDetectionController = require('../controllers/duplicateDetectionController');
const { authenticateToken } = require('../middleware/auth');

// Check for duplicate orders
router.post('/check',
    authenticateToken,
    duplicateDetectionController.checkDuplicates
);

module.exports = router;
