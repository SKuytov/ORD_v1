// backend/routes/procurement.js
// PartPulse Orders v3.0 - Procurement Lifecycle Routes
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const ctrl = require('../controllers/procurementController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const procurementAuth = [authenticateToken, authorizeRoles('admin', 'procurement')];
const allAuth = [authenticateToken, authorizeRoles('admin', 'procurement', 'manager')];

// Multer config for quote PDF uploads (stored in backend/uploads/documents/)
const pdfStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const fs = require('fs');
        const dir = path.join(__dirname, '../uploads/documents');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        cb(null, `${name}-${Date.now()}${ext}`);
    }
});
const pdfUpload = multer({
    storage: pdfStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
        if (/pdf/i.test(path.extname(file.originalname))) cb(null, true);
        else cb(new Error('Only PDF files are allowed for quote PDFs'));
    }
});

// Quote responses
router.get('/quotes/:quoteId/responses', allAuth, ctrl.getQuoteResponses);
router.post('/quotes/:quoteId/responses', procurementAuth, ctrl.recordQuoteResponse);
router.put('/quotes/responses/:responseId', procurementAuth, ctrl.updateQuoteResponse);

// Quote PDF upload (standalone, no order IDs required)
router.post('/quotes/:quoteId/upload-pdf', procurementAuth, pdfUpload.single('file'), ctrl.uploadQuotePDF);

// Purchase orders
router.get('/purchase-orders', allAuth, ctrl.getPOs);
router.post('/purchase-orders', procurementAuth, ctrl.createPO);
router.get('/purchase-orders/:id', allAuth, ctrl.getPOById);
router.put('/purchase-orders/:id', procurementAuth, ctrl.updatePO);

// Invoices
router.get('/invoices', allAuth, ctrl.getInvoices);
router.post('/invoices', procurementAuth, ctrl.createInvoice);
router.put('/invoices/:id', procurementAuth, ctrl.updateInvoice);

// Unified lifecycle views
router.get('/lifecycle/:orderId', allAuth, ctrl.getOrderLifecycle);
router.get('/lifecycle/quote/:quoteId', allAuth, ctrl.getQuoteLifecycle);

module.exports = router;
