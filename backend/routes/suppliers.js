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
