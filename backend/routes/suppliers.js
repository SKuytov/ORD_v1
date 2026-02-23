// backend/routes/suppliers.js
const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Get all suppliers
router.get('/',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    supplierController.getSuppliers
);

// ⭐ NEW: Get AI-powered supplier suggestions for an order
router.get('/suggestions/:orderId',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    supplierController.getSupplierSuggestions
);

// ⭐ NEW: Get brand rules configuration
router.get('/brand-rules',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    supplierController.getBrandRules
);

// Create supplier
router.post('/',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    supplierController.createSupplier
);

// Update supplier
router.put('/:id',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    supplierController.updateSupplier
);

// Delete supplier
router.delete('/:id',
    authenticateToken,
    authorizeRoles('admin'),
    supplierController.deleteSupplier
);

module.exports = router;
