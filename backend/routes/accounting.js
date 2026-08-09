// backend/routes/accounting.js
// PartPulse Orders — Accounting Portal Routes
'use strict';

const express   = require('express');
const router    = express.Router();
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs').promises;
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const {
    requireDocumentAccess,
    requireInvoiceMetaAccess,
    requireHandoverAccess,
    requireBodyDocumentAccess,
    requireOptionalBodyDocumentAccess,
    requireOptionalAccountingRecipient
} = require('../middleware/authz');
const ctrl      = require('../controllers/accountingController');

// ── Multer config for payment slip uploads ───────────────────────────────────
const slipStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const dir = path.join(__dirname, '../uploads/payment-slips');
        await fs.mkdir(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext  = path.extname(file.originalname);
        const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        cb(null, `slip-${Date.now()}-${base}${ext}`);
    }
});
const uploadSlip = multer({
    storage: slipStorage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok = /pdf|jpg|jpeg|png/i.test(path.extname(file.originalname));
        cb(ok ? null : new Error('Само PDF, JPG, PNG'), ok);
    }
});

// All routes require authentication
router.use(authenticateToken);

// ── Dashboard (accounting users + admin/procurement) ─────────────────────────
router.get('/dashboard', authorizeRoles('admin', 'accounting', 'procurement'), ctrl.getDashboard);

// ── Invoice Metadata (procurement/admin can edit; accounting can read) ────────
router.get('/invoice-meta/:documentId',
    authorizeRoles('admin', 'accounting', 'procurement'),
    requireDocumentAccess(),
    ctrl.getInvoiceMeta
);
router.post('/invoice-meta/:documentId',
    authorizeRoles('admin', 'accounting'),
    requireDocumentAccess(),
    ctrl.upsertInvoiceMeta
);

// ── Invoice List ──────────────────────────────────────────────────────────────
router.get('/invoices', authorizeRoles('admin', 'accounting', 'procurement'), ctrl.listInvoices);

// ── Mark Invoice Paid ─────────────────────────────────────────────────────────
// Accounting can mark paid; so can admin
router.post('/invoices/:invoiceMetaId/pay',
    authorizeRoles('accounting', 'admin'),
    requireInvoiceMetaAccess(),
    uploadSlip.single('payment_slip'),
    async (req, res, next) => {
        // If a payment slip file was uploaded, store it as a document first
        if (req.file) {
            const db   = require('../config/database');
            const pool = require('../config/database');
            try {
                const [[meta]] = await pool.query(
                    'SELECT document_id FROM invoice_metadata WHERE id = ?',
                    [req.params.invoiceMetaId]
                );
                if (meta) {
                    const [[doc]] = await pool.query(
                        'SELECT id FROM order_documents_link WHERE document_id = ? LIMIT 1',
                        [meta.document_id]
                    );
                    const [ins] = await pool.query(
                        `INSERT INTO documents
                         (document_type, file_path, file_name, file_size, mime_type, uploaded_by, description)
                         VALUES ('other', ?, ?, ?, ?, ?, 'Платежно нареждане')`,
                        [req.file.path, req.file.originalname, req.file.size,
                         req.file.mimetype, req.user.id]
                    );
                    req.body.payment_slip_doc_id = ins.insertId;
                    // Link to same orders as the invoice document
                    if (doc) {
                        await pool.query(
                            `INSERT IGNORE INTO order_documents_link (order_id, document_id, linked_by)
                             SELECT order_id, ?, ? FROM order_documents_link WHERE document_id = ?`,
                            [ins.insertId, req.user.id, meta.document_id]
                        );
                    }
                }
            } catch (e) { console.error('[slip upload]', e.message); }
        }
        next();
    },
    requireOptionalBodyDocumentAccess('payment_slip_doc_id'),
    ctrl.markInvoicePaid
);

// ── Handovers ─────────────────────────────────────────────────────────────────
router.get('/handovers', authorizeRoles('admin', 'accounting', 'procurement'), ctrl.listHandovers);
router.get('/handovers/:id',
    authorizeRoles('admin', 'accounting', 'procurement'),
    requireHandoverAccess(),
    ctrl.getHandover
);
router.post('/handover',
    authorizeRoles('admin', 'accounting'),
    requireBodyDocumentAccess('documentIds'),
    requireOptionalAccountingRecipient(),
    ctrl.createHandover
);
router.post('/handovers/:id/acknowledge',
    authorizeRoles('accounting', 'admin'),
    requireHandoverAccess(),
    ctrl.acknowledgeHandover
);
router.get('/handovers/:id/download-zip',
    authorizeRoles('admin', 'accounting', 'procurement'),
    requireHandoverAccess(),
    ctrl.downloadHandoverZip
);

// ── Audit Log ─────────────────────────────────────────────────────────────────
router.get('/audit-log',
    authorizeRoles('admin', 'accounting', 'procurement'),
    ctrl.getAuditLog
);

// ── Payment Reminders (cron endpoint or manual trigger) ───────────────────────
router.post('/send-reminders',
    authorizeRoles('admin'),
    ctrl.sendPaymentReminders
);

// ── Accounting Users (for recipient picker in proforma send) ──────────────
router.get('/users',
    authorizeRoles('admin', 'procurement', 'accounting'),
    ctrl.getAccountingUsers
);

module.exports = router;
