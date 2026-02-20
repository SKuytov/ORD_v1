// backend/routes/orders.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Get order statistics (admin and procurement) - MUST be before /:id
router.get('/stats/overview', 
    authenticateToken, 
    authorizeRoles('admin', 'procurement'), 
    orderController.getOrderStats
);

// Create new order (authenticated users)
router.post('/', 
    authenticateToken, 
    upload.array('files', 5), 
    orderController.createOrder
);

// Get all orders (filtered by role)
router.get('/', 
    authenticateToken, 
    orderController.getOrders
);

// Get specific order by ID
router.get('/:id', 
    authenticateToken, 
    orderController.getOrderById
);

// Update order (admin and procurement only)
router.put('/:id', 
    authenticateToken, 
    authorizeRoles('admin', 'procurement'), 
    orderController.updateOrder
);

// Delete order (admin only)
router.delete('/:id', 
    authenticateToken, 
    authorizeRoles('admin'), 
    orderController.deleteOrder
);

module.exports = router;
