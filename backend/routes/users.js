const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken, authorizeRoles, requireSuperAdmin } = require('../middleware/auth');

// Admin-only user management
router.get('/',
    authenticateToken,
    authorizeRoles('admin'),
    userController.listUsers
);

router.post('/',
    authenticateToken,
    authorizeRoles('admin'),
    userController.createUser
);

// Generate invite link (MUST be before /:id routes)
router.post('/invite',
    authenticateToken,
    requireSuperAdmin,
    userController.generateInvite
);

router.put('/:id',
    authenticateToken,
    authorizeRoles('admin'),
    userController.updateUser
);

router.post('/:id/reset-password',
    authenticateToken,
    authorizeRoles('admin'),
    userController.resetPassword
);

// === Super Admin only routes ===

// Update user roles (multi-role)
router.post('/:id/roles',
    authenticateToken,
    requireSuperAdmin,
    userController.updateUserRoles
);

// Deactivate user
router.post('/:id/deactivate',
    authenticateToken,
    requireSuperAdmin,
    userController.deactivateUser
);

// Activate user
router.post('/:id/activate',
    authenticateToken,
    requireSuperAdmin,
    userController.activateUser
);

module.exports = router;
