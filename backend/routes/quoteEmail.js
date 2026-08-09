// backend/routes/quoteEmail.js
// Smart Quote Send routes
// POST /api/quotes/:id/send-log       — record that a quote email was sent
// GET  /api/quotes/:id/send-log       — get send history for a quote
// GET  /api/quotes/:id/email-data     — get all data needed to compose the email
// POST /api/quotes/:id/send-rfq-email — actually sends SMTP email to supplier

const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { requireQuoteAccess } = require('../middleware/authz');
const {
    getQuoteEmailData,
    logQuoteSend,
    getQuoteSendLog
} = require('../controllers/quoteController');
const emailService = require('../utils/emailService');
const db = require('../config/database');
const { withTransaction } = require('../utils/withTransaction');
const { applyStatusChangeToMany } = require('../utils/statusChange');

// All routes require auth
router.use(authenticateToken);
router.use(authorizeRoles('admin', 'procurement'));

// GET /api/quotes/:id/email-data — full data for email composition
router.get('/:id/email-data', requireQuoteAccess('id'), getQuoteEmailData);

// POST /api/quotes/:id/send-log — record a send action
router.post('/:id/send-log', requireQuoteAccess('id'), logQuoteSend);

// GET /api/quotes/:id/send-log — get send history
router.get('/:id/send-log', requireQuoteAccess('id'), getQuoteSendLog);

// POST /api/quotes/:id/send-rfq-email — actually sends SMTP email to supplier
router.post('/:id/send-rfq-email', requireQuoteAccess('id'), async (req, res) => {
    try {
        const { id } = req.params;
        const { notes, attachFiles, supplierEmailOverride } = req.body;

        // Get quote + supplier + items
        const [quotes] = await db.query(`
            SELECT q.*, s.name AS supplier_name, s.email AS supplier_email,
                   s.contact_person AS supplier_contact
            FROM quotes q
            LEFT JOIN suppliers s ON q.supplier_id = s.id
            WHERE q.id = ?
        `, [id]);
        if (!quotes.length) return res.status(404).json({ success: false, message: 'Quote not found' });
        const quote = quotes[0];

        // Allow the RFQ wizard to override the supplier email (e.g., if admin edits it before sending)
        const recipientEmail = supplierEmailOverride || quote.supplier_email;
        if (!recipientEmail) {
            return res.status(400).json({ success: false, message: 'Supplier has no email address configured' });
        }

        const [items] = await db.query(`
            SELECT qi.quantity, o.item_description, o.part_number, o.building, o.date_needed, o.notes AS order_notes
            FROM quote_items qi
            JOIN orders o ON qi.order_id = o.id
            WHERE qi.quote_id = ?
        `, [id]);

        const result = await emailService.sendRfqToSupplier({
            quoteId: quote.quote_number,
            supplierEmail: recipientEmail,
            supplierName: quote.supplier_name,
            contactPerson: quote.supplier_contact,
            items: items.map(it => ({
                itemDescription: it.item_description,
                partNumber: it.part_number,
                quantity: it.quantity,
                unit: 'pcs',
                notes: it.order_notes
            })),
            currency: quote.currency || 'EUR',
            validUntil: quote.valid_until,
            notes: notes || quote.notes,
            companyName: 'Septona'
        });

        // Log the send
        await db.query(
            `INSERT INTO quote_send_log (quote_id, sent_by, method, supplier_email, notes) VALUES (?, ?, 'smtp', ?, ?)`,
            [id, req.user.id, recipientEmail, notes || null]
        );

        // The quote status and the linked orders move together, so they are now
        // in one transaction. Each order is checked against the lifecycle rules
        // instead of relying on a NOT IN list in the WHERE clause, which was the
        // only guard here and did not match the rules the rest of the app uses.
        let skipped = [];
        await withTransaction(db, async connection => {
            await connection.query(`UPDATE quotes SET status = 'Sent to Supplier' WHERE id = ?`, [id]);

            const [linkedOrders] = await connection.query(
                'SELECT id FROM orders WHERE quote_ref = ?', [id]
            );
            const outcome = await applyStatusChangeToMany(
                connection, linkedOrders.map(o => o.id), 'Quote Requested', req.user
            );
            skipped = outcome.skipped;
        });

        res.json({
            success: true,
            message: skipped.length
                ? `RFQ email sent. ${skipped.length} linked order(s) kept their status.`
                : 'RFQ email sent successfully',
            messageId: result.messageId,
            ...(skipped.length ? { skipped } : {})
        });
    } catch (err) {
        console.error('send-rfq-email error:', err);
        res.status(500).json({ success: false, message: 'Failed to send email: ' + err.message });
    }
});

module.exports = router;
