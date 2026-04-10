// backend/routes/templates.js
const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// List templates (role-based visibility)
router.get('/',
    authenticateToken,
    templateController.getTemplates
);

// Get template by ID
router.get('/:id',
    authenticateToken,
    templateController.getTemplateById
);

// Create template (all authenticated roles)
router.post('/',
    authenticateToken,
    templateController.createTemplate
);

// Update template (owner or admin)
router.put('/:id',
    authenticateToken,
    templateController.updateTemplate
);

// Delete template (owner or admin)
router.delete('/:id',
    authenticateToken,
    templateController.deleteTemplate
);

// Create order from template (increments use_count)
router.post('/:id/use',
    authenticateToken,
    templateController.useTemplate
);

module.exports = router;
