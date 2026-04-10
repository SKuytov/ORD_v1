// backend/routes/rfq.js
const express = require('express');
const router = express.Router();
const rfqController = require('../controllers/rfqController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Procurement board data
router.get('/unassigned',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    rfqController.getUnassignedOrders
);

router.get('/grouped',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    rfqController.getGroupedOrders
);

router.get('/supplier-names',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    rfqController.getSupplierNames
);

// Assign supplier to order
router.post('/orders/:id/assign-supplier',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    rfqController.assignSupplier
);

// RFQ CRUD
router.post('/create',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    rfqController.createRFQ
);

router.get('/list',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    rfqController.listRFQs
);

router.get('/:id',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    rfqController.getRFQ
);

router.post('/:id/status',
    authenticateToken,
    authorizeRoles('admin', 'procurement'),
    rfqController.updateRFQStatus
);

module.exports = router;
