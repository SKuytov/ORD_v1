// backend/routes/procurement.js
// PartPulse Orders v3.0 - Procurement Lifecycle Routes
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/procurementController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const {
    requireOrderAccess,
    requireQuoteAccess,
    requireQuoteResponseAccess,
    requirePurchaseOrderAccess,
    requireInvoiceAccess,
    requireOptionalBodyDocumentAccess,
    requireManagerBuildingScope,
    scopeManagerToBuildings
} = require('../middleware/authz');

const procurementAuth = [authenticateToken, authorizeRoles('admin', 'procurement')];
const allAuth = [authenticateToken, authorizeRoles('admin', 'procurement', 'manager'), scopeManagerToBuildings];

// Quote responses
router.get('/quotes/:quoteId/responses', allAuth, requireQuoteAccess(), requireManagerBuildingScope, ctrl.getQuoteResponses);
router.post('/quotes/:quoteId/responses', procurementAuth, requireQuoteAccess(), requireOptionalBodyDocumentAccess('response_document_id'), ctrl.recordQuoteResponse);
router.put('/quotes/responses/:responseId', procurementAuth, requireQuoteResponseAccess(), requireOptionalBodyDocumentAccess('response_document_id'), ctrl.updateQuoteResponse);

// Purchase orders
router.get('/purchase-orders', allAuth, ctrl.getPOs);
router.post('/purchase-orders', procurementAuth, ctrl.createPO);
router.get('/purchase-orders/:id', allAuth, requirePurchaseOrderAccess(), requireManagerBuildingScope, ctrl.getPOById);
router.put('/purchase-orders/:id', procurementAuth, requirePurchaseOrderAccess(), ctrl.updatePO);

// Invoices
router.get('/invoices', allAuth, ctrl.getInvoices);
router.post('/invoices', procurementAuth, ctrl.createInvoice);
router.put('/invoices/:id', procurementAuth, requireInvoiceAccess(), ctrl.updateInvoice);

// Unified lifecycle views
router.get('/lifecycle/:orderId', allAuth, requireOrderAccess('orderId'), requireManagerBuildingScope, ctrl.getOrderLifecycle);
router.get('/lifecycle/quote/:quoteId', allAuth, requireQuoteAccess(), requireManagerBuildingScope, ctrl.getQuoteLifecycle);

module.exports = router;
