// backend/controllers/accountingController.js
// PartPulse Orders — Accounting Portal Controller
'use strict';

const db        = require('../config/database');
const fs        = require('fs').promises;
const fsSync    = require('fs');
const path      = require('path');
const archiver  = require('archiver');
const email     = require('../utils/emailService');
const { withTransaction } = require('../utils/withTransaction');
const crypto    = require('crypto');

// ─── Helpers ──────────────────────────────────────────────────────────────────
class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function publicError(res, error, fallback) {
    const expected = error instanceof HttpError;
    res.status(expected ? error.status : 500).json({ success: false, message: expected ? error.message : fallback });
}

async function auditLog({ eventType, handoverId, documentId, invoiceMetaId, orderId, actorId, actorName, description, meta }, connection = db) {
    await connection.query(
        `INSERT INTO accounting_audit_log
         (event_type, handover_id, document_id, invoice_meta_id, order_id, actor_id, actor_name, description, meta)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [eventType, handoverId||null, documentId||null, invoiceMetaId||null, orderId||null,
         actorId||null, actorName||null, description||null, meta ? JSON.stringify(meta) : null]
    );
}

// ─── Invoice Metadata ─────────────────────────────────────────────────────────

// GET /api/accounting/invoice-meta/:documentId
exports.getInvoiceMeta = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT im.*, u.name AS paid_by_name
             FROM invoice_metadata im
             LEFT JOIN users u ON im.paid_by = u.id
             WHERE im.document_id = ?`,
            [req.params.documentId]
        );

        // Also fetch linked orders (for cost center + supplier auto-fill)
        const [linked] = await db.query(
            `SELECT o.id, cc.code AS cost_center_code, cc.name AS cost_center_name,
                    o.building, s.name AS supplier_name
             FROM order_documents_link odl
             INNER JOIN orders o ON odl.order_id = o.id
             LEFT JOIN cost_centers cc ON cc.id = o.cost_center_id
             LEFT JOIN suppliers s ON o.supplier_id = s.id
             WHERE odl.document_id = ?
             LIMIT 10`,
            [req.params.documentId]
        );

        // Build unique cost centers list from linked orders
        const costCenters = [];
        const seen = new Set();
        for (const row of linked) {
            if (row.cost_center_code && !seen.has(row.cost_center_code)) {
                seen.add(row.cost_center_code);
                costCenters.push({
                    code: row.cost_center_code,
                    name: row.cost_center_name,
                });
            }
        }

        // Derive supplier name suggestion from linked orders (first non-null)
        const supplierSuggestion = linked.find(r => r.supplier_name)?.supplier_name || null;
        const buildingSuggestion = linked[0]?.building || null;
        const linkedOrderIds     = linked.map(r => r.id);

        res.json({
            success: true,
            meta: rows[0] || null,
            linkedOrders: linkedOrderIds,
            costCenters,
            supplierSuggestion,
            buildingSuggestion,
        });
    } catch (err) {
        console.error('getInvoiceMeta error:', err);
        res.status(500).json({ success: false, message: 'Грешка при зареждане на данните' });
    }
};

// POST /api/accounting/invoice-meta/:documentId
// Creates or updates invoice metadata for a document
exports.upsertInvoiceMeta = async (req, res) => {
    try {
        const { documentId } = req.params;
        const {
            invoice_number, invoice_date, due_date,
            amount_net, amount_vat, amount_total, currency,
            supplier_name, payment_terms, notes
        } = req.body;

        // Verify document exists
        const [[doc]] = await db.query('SELECT id, document_type FROM documents WHERE id = ?', [documentId]);
        if (!doc) return res.status(404).json({ success: false, message: 'Документът не е намерен' });

        await db.query(
            `INSERT INTO invoice_metadata
             (document_id, invoice_number, invoice_date, due_date,
              amount_net, amount_vat, amount_total, currency,
              supplier_name, payment_terms, notes)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
               invoice_number  = VALUES(invoice_number),
               invoice_date    = VALUES(invoice_date),
               due_date        = VALUES(due_date),
               amount_net      = VALUES(amount_net),
               amount_vat      = VALUES(amount_vat),
               amount_total    = VALUES(amount_total),
               currency        = VALUES(currency),
               supplier_name   = VALUES(supplier_name),
               payment_terms   = VALUES(payment_terms),
               notes           = VALUES(notes),
               updated_at      = NOW()`,
            [documentId, invoice_number||null, invoice_date||null, due_date||null,
             amount_net||null, amount_vat||null, amount_total||null, currency||'BGN',
             supplier_name||null, payment_terms||null, notes||null]
        );

        await auditLog({
            eventType: 'invoice_meta_saved',
            documentId: parseInt(documentId),
            actorId: req.user.id,
            actorName: req.user.name,
            description: `Запазени данни за фактура: ${invoice_number || '—'}`,
            meta: { invoice_number, due_date, amount_total, currency }
        });

        // Auto-create default reminder schedule if due_date is set
        if (due_date) {
            const [[existing]] = await db.query(
                `SELECT im.id FROM invoice_metadata im WHERE im.document_id = ?`, [documentId]
            );
            if (existing) {
                const [configs] = await db.query('SELECT days_before FROM payment_reminder_config WHERE active = 1');
                for (const c of configs) {
                    await db.query(
                        `INSERT IGNORE INTO payment_reminders (invoice_meta_id, remind_days_before)
                         VALUES (?, ?)`,
                        [existing.id, c.days_before]
                    );
                }
            }
        }

        const [[saved]] = await db.query('SELECT * FROM invoice_metadata WHERE document_id = ?', [documentId]);
        res.json({ success: true, meta: saved });
    } catch (err) {
        console.error('upsertInvoiceMeta error:', err);
        res.status(500).json({ success: false, message: 'Грешка при запис на данните' });
    }
};

// ─── Overdue / Upcoming Invoice List ─────────────────────────────────────────

// GET /api/accounting/invoices?status=unpaid|overdue|upcoming|all
exports.listInvoices = async (req, res) => {
    try {
        const { status = 'all', page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let whereClause = '';
        if (status === 'unpaid')   whereClause = `AND im.payment_status = 'unpaid' AND (im.due_date IS NULL OR im.due_date >= CURDATE())`;
        if (status === 'overdue')  whereClause = `AND im.payment_status = 'unpaid' AND im.due_date < CURDATE()`;
        if (status === 'upcoming') whereClause = `AND im.payment_status = 'unpaid' AND im.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)`;
        if (status === 'paid')     whereClause = `AND im.payment_status = 'paid'`;

        const [rows] = await db.query(
            `SELECT
                im.*,
                d.file_name, d.document_type, d.uploaded_at, d.file_path,
                u_paid.name AS paid_by_name,
                u_up.name   AS uploaded_by_name,
                DATEDIFF(im.due_date, CURDATE()) AS days_until_due,
                GROUP_CONCAT(DISTINCT odl.order_id ORDER BY odl.order_id) AS linked_order_ids
             FROM invoice_metadata im
             JOIN documents d ON im.document_id = d.id
             LEFT JOIN users u_paid ON im.paid_by = u_paid.id
             LEFT JOIN users u_up   ON d.uploaded_by = u_up.id
             LEFT JOIN order_documents_link odl ON d.id = odl.document_id
             WHERE 1=1 ${whereClause}
             GROUP BY im.id
             ORDER BY
               CASE im.payment_status WHEN 'unpaid' THEN 0 ELSE 1 END,
               im.due_date ASC,
               d.uploaded_at DESC
             LIMIT ? OFFSET ?`,
            [parseInt(limit), offset]
        );

        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) AS total
             FROM invoice_metadata im
             JOIN documents d ON im.document_id = d.id
             WHERE 1=1 ${whereClause}`
        );

        // Summary counts for dashboard badges
        const [[counts]] = await db.query(
            `SELECT
               SUM(CASE WHEN im.payment_status = 'unpaid' AND (im.due_date IS NULL OR im.due_date >= CURDATE()) THEN 1 ELSE 0 END) AS cnt_unpaid,
               SUM(CASE WHEN im.payment_status = 'unpaid' AND im.due_date < CURDATE() THEN 1 ELSE 0 END) AS cnt_overdue,
               SUM(CASE WHEN im.payment_status = 'unpaid' AND im.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS cnt_upcoming,
               SUM(CASE WHEN im.payment_status = 'paid' THEN 1 ELSE 0 END) AS cnt_paid
             FROM invoice_metadata im`
        );

        const invoices = rows.map(r => ({
            ...r,
            linked_order_ids: r.linked_order_ids ? r.linked_order_ids.split(',').map(Number) : []
        }));

        res.json({ success: true, invoices, total, counts, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        console.error('listInvoices error:', err);
        res.status(500).json({ success: false, message: 'Грешка при зареждане на фактурите' });
    }
};

// ─── Mark Invoice as Paid ─────────────────────────────────────────────────────

// POST /api/accounting/invoices/:invoiceMetaId/pay
exports.markInvoicePaid = async (req, res) => {
    try {
        const { invoiceMetaId } = req.params;
        const { payment_slip_doc_id, notes } = req.body;
        const meta = await withTransaction(db, async conn => {
            const [[row]] = await conn.query('SELECT * FROM invoice_metadata WHERE id = ? FOR UPDATE', [invoiceMetaId]);
            if (!row) {
                throw new HttpError(404, 'Invoice not found');
            }
            if (row.payment_status === 'paid') {
                throw new HttpError(409, 'Invoice is already paid');
            }
            await conn.query(`UPDATE invoice_metadata SET payment_status='paid', paid_at=NOW(), paid_by=?, payment_slip_doc_id=?,
                notes=CONCAT(IFNULL(notes,''), ?) WHERE id=?`, [req.user.id, payment_slip_doc_id || null, notes ? '\n[Payment] ' + notes : '', invoiceMetaId]);
            await conn.query("UPDATE documents SET status='processed', processed_at=NOW(), processed_by=? WHERE id=?", [req.user.id, row.document_id]);
            await auditLog({ eventType:'invoice_paid', documentId:row.document_id, invoiceMetaId:Number(invoiceMetaId), actorId:req.user.id,
                actorName:req.user.name || req.user.username, description:`Invoice ${row.invoice_number || '#' + row.document_id} marked as paid`,
                meta:{ payment_slip_doc_id, amount_total:row.amount_total, currency:row.currency } }, conn);
            return row;
        });
        const [[updated]] = await db.query(`SELECT im.*,u.name AS paid_by_name FROM invoice_metadata im LEFT JOIN users u ON im.paid_by=u.id WHERE im.id=?`, [invoiceMetaId]);
        res.json({ success:true, message:'Фактурата е маркирана като платена', meta:updated });
    } catch (err) {
        console.error('markInvoicePaid error:', err);
        publicError(res, err, 'Грешка при обработка');
    }
};

// ─── Document Handover ────────────────────────────────────────────────────────

// POST /api/accounting/handover
// Body: { documentIds: [1,2,3], notes: '...' }
exports.createHandover = async (req, res) => {
    let documentIds = Array.isArray(req.body.documentIds) ? req.body.documentIds.map(Number).filter(Boolean) : [];
    if (!documentIds.length) return res.status(400).json({ success:false, message:'Изберете поне един документ' });
    const { notes, recipientId } = req.body;
    try {
        // DB state is committed before archive I/O or SMTP so locks cannot be held by external work.
        const { handoverId, docs, accountingUsers } = await withTransaction(db, async conn => {
            const placeholders = documentIds.map(() => '?').join(',');
            const [docs] = await conn.query(`SELECT d.*,u.name AS uploaded_by_name FROM documents d LEFT JOIN users u ON d.uploaded_by=u.id
                WHERE d.id IN (${placeholders}) FOR UPDATE`, documentIds);
            if (docs.length !== documentIds.length) throw new HttpError(404, 'Документите не са намерени');
            const [result] = await conn.query('INSERT INTO accounting_handovers (sent_by,notes) VALUES (?,?)', [req.user.id,notes || null]);
            const handoverId=result.insertId;
            await conn.query('INSERT INTO accounting_handover_documents (handover_id,document_id) VALUES ?', [docs.map(d=>[handoverId,d.id])]);
            await conn.query(`UPDATE documents SET status='sent_to_accounting' WHERE id IN (${placeholders})`, documentIds);
            let [users] = await conn.query("SELECT id,email,name FROM users WHERE role='accounting' AND active=1 AND email IS NOT NULL AND email != ''");
            if (recipientId) users=users.filter(u=>u.id===Number(recipientId));
            await auditLog({eventType:'handover_created',handoverId,actorId:req.user.id,actorName:req.user.name || req.user.username,
                description:`Предаване #${handoverId} с ${docs.length} документа е създадено`,meta:{documentIds,recipientCount:users.length}}, conn);
            return {handoverId,docs,accountingUsers:users};
        });

        const uploadsDir=path.join(__dirname,'../uploads/accounting');
        await fs.mkdir(uploadsDir,{recursive:true});
        const zipName=`handover-${handoverId}-${Date.now()}.zip`;
        const zipPath=path.join(uploadsDir,zipName);
        await new Promise((resolve,reject)=>{
            const output=fsSync.createWriteStream(zipPath); const archive=archiver('zip',{zlib:{level:6}});
            output.on('close',resolve); output.on('error',reject); archive.on('error',reject); archive.pipe(output);
            for (const doc of docs) if (fsSync.existsSync(doc.file_path)) archive.file(doc.file_path,{name:`${doc.document_type}_${path.basename(doc.file_name)}`});
            archive.append([`PartPulse Orders — Счетоводно предаване #${handoverId}`,`Изпратено от: ${req.user.name || req.user.username}`,`Бележки: ${notes || '—'}`,'',...docs.map((d,i)=>`${i+1}. ${d.document_type} | ${d.file_name}`)].join('\n'),{name:'manifest.txt'});
            archive.finalize();
        });
        await db.query('UPDATE accounting_handovers SET zip_file_path=?,zip_file_name=? WHERE id=?',[zipPath,zipName,handoverId]);
        let emailSent=false;
        if (accountingUsers.length) {
            const result=await email.sendAccountingHandover({handoverId,sentBy:req.user.name || req.user.username,notes,documents:docs,recipients:accountingUsers,zipPath,zipName});
            emailSent=Boolean(result.success);
            if (emailSent) await db.query('UPDATE accounting_handovers SET email_sent=1,email_sent_at=NOW(),recipient_ids=? WHERE id=?',[JSON.stringify(accountingUsers.map(u=>u.id)),handoverId]);
        }
        await auditLog({eventType:'handover_sent',handoverId,actorId:req.user.id,actorName:req.user.name || req.user.username,
            description:`Предаване #${handoverId} обработено`,meta:{documentIds,emailSent,recipientCount:accountingUsers.length}});
        res.json({success:true,message:`Предаването е създадено успешно${emailSent ? ' и изпратено по имейл' : ' (имейлът не беше изпратен)'}`,handoverId,emailSent,documentCount:docs.length});
    } catch (err) {
        console.error('createHandover error:',err);
        publicError(res, err, 'Грешка при създаване на предаването');
    }
};

// GET /api/accounting/handovers
exports.listHandovers = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const [rows] = await db.query(
            `SELECT h.*,
                    u.name AS sent_by_name,
                    u2.name AS acknowledged_by_name,
                    COUNT(hd.document_id) AS document_count
             FROM accounting_handovers h
             LEFT JOIN users u  ON h.sent_by = u.id
             LEFT JOIN users u2 ON h.acknowledged_by = u2.id
             LEFT JOIN accounting_handover_documents hd ON h.id = hd.handover_id
             GROUP BY h.id
             ORDER BY h.sent_at DESC
             LIMIT ? OFFSET ?`,
            [parseInt(limit), offset]
        );

        const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM accounting_handovers');

        res.json({ success: true, handovers: rows, total, page: parseInt(page) });
    } catch (err) {
        console.error('listHandovers error:', err);
        res.status(500).json({ success: false, message: 'Грешка при зареждане' });
    }
};

// GET /api/accounting/handovers/:id
exports.getHandover = async (req, res) => {
    try {
        const [[handover]] = await db.query(
            `SELECT h.*, u.name AS sent_by_name FROM accounting_handovers h
             LEFT JOIN users u ON h.sent_by = u.id
             WHERE h.id = ?`,
            [req.params.id]
        );
        if (!handover) return res.status(404).json({ success: false, message: 'Не е намерено' });

        const [docs] = await db.query(
            `SELECT d.*, im.invoice_number, im.due_date, im.amount_total,
                    im.currency, im.payment_status, im.invoice_date,
                    im.id AS invoice_meta_id
             FROM accounting_handover_documents hd
             JOIN documents d ON hd.document_id = d.id
             LEFT JOIN invoice_metadata im ON d.id = im.document_id
             WHERE hd.handover_id = ?`,
            [req.params.id]
        );

        res.json({ success: true, handover, documents: docs });
    } catch (err) {
        console.error('getHandover error:', err);
        res.status(500).json({ success: false, message: 'Грешка при зареждане' });
    }
};

// POST /api/accounting/handovers/:id/acknowledge
exports.acknowledgeHandover = async (req, res) => {
    try {
        await db.query(
            `UPDATE accounting_handovers SET status='acknowledged', acknowledged_by=?, acknowledged_at=NOW()
             WHERE id = ? AND acknowledged_by IS NULL`,
            [req.user.id, req.params.id]
        );
        await auditLog({
            eventType: 'handover_acknowledged',
            handoverId: parseInt(req.params.id),
            actorId: req.user.id,
            actorName: req.user.name,
            description: `Предаване #${req.params.id} потвърдено от счетоводство`,
        });
        res.json({ success: true, message: 'Предаването е потвърдено' });
    } catch (err) {
        console.error('acknowledgeHandover error:', err);
        res.status(500).json({ success: false, message: 'Грешка' });
    }
};

// GET /api/accounting/handovers/:id/download-zip
exports.downloadHandoverZip = async (req, res) => {
    try {
        const [[handover]] = await db.query(
            'SELECT zip_file_path, zip_file_name FROM accounting_handovers WHERE id = ?',
            [req.params.id]
        );
        if (!handover || !handover.zip_file_path) {
            return res.status(404).json({ success: false, message: 'Zip файлът не е наличен' });
        }
        try { await fs.access(handover.zip_file_path); } catch {
            return res.status(404).json({ success: false, message: 'Zip файлът не е намерен на сървъра' });
        }
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(handover.zip_file_name)}"`);
        fsSync.createReadStream(handover.zip_file_path).pipe(res);
    } catch (err) {
        console.error('downloadHandoverZip error:', err);
        res.status(500).json({ success: false, message: 'Грешка при изтегляне' });
    }
};

// ─── Audit Log ────────────────────────────────────────────────────────────────

// GET /api/accounting/audit-log
exports.getAuditLog = async (req, res) => {
    try {
        const { page = 1, limit = 50, event_type, from, to } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let where = 'WHERE 1=1';
        const params = [];
        if (event_type) { where += ' AND al.event_type = ?'; params.push(event_type); }
        if (from)       { where += ' AND al.created_at >= ?'; params.push(from); }
        if (to)         { where += ' AND al.created_at <= ?'; params.push(to + ' 23:59:59'); }

        const [rows] = await db.query(
            `SELECT al.*, u.name AS actor_name_resolved
             FROM accounting_audit_log al
             LEFT JOIN users u ON al.actor_id = u.id
             ${where}
             ORDER BY al.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), offset]
        );

        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) AS total FROM accounting_audit_log al ${where}`, params
        );

        res.json({ success: true, logs: rows, total, page: parseInt(page) });
    } catch (err) {
        console.error('getAuditLog error:', err);
        res.status(500).json({ success: false, message: 'Грешка при зареждане' });
    }
};

// ─── Payment Reminder Cron ────────────────────────────────────────────────────

// POST /api/accounting/send-reminders (called by cron or manually)
exports.sendPaymentReminders = async (req, res) => {
    let sent = 0;
    let failed = 0;
    try {
        const [dueInvoices] = await db.query(`SELECT im.*, d.file_name, d.document_type, pr.id AS reminder_id, pr.remind_days_before
            FROM invoice_metadata im JOIN documents d ON im.document_id=d.id JOIN payment_reminders pr ON im.id=pr.invoice_meta_id
            WHERE im.payment_status='unpaid' AND im.due_date IS NOT NULL AND pr.active=1
              AND DATEDIFF(im.due_date,CURDATE())=pr.remind_days_before
              AND (pr.last_sent_at IS NULL OR DATE(pr.last_sent_at)<CURDATE())`);
        const [accountingUsers] = await db.query("SELECT email,name FROM users WHERE role='accounting' AND active=1 AND email IS NOT NULL AND email != ''");
        for (const inv of dueInvoices) {
            const claimToken=crypto.randomUUID();
            // Claim before provider call. The expiry is longer than bounded SMTP retries.
            const [claim] = await db.query(`UPDATE payment_reminders SET claim_token=?,claim_expires_at=DATE_ADD(NOW(),INTERVAL 10 MINUTE)
                WHERE id=? AND active=1 AND (last_sent_at IS NULL OR DATE(last_sent_at)<CURDATE())
                  AND (claim_expires_at IS NULL OR claim_expires_at<NOW())`,[claimToken,inv.reminder_id]);
            if (claim.affectedRows !== 1) continue;
            let delivered=false; let errorMessage=null;
            try {
                const result=accountingUsers.length ? await email.sendPaymentReminder({invoiceMeta:inv,daysUntilDue:inv.remind_days_before,recipients:accountingUsers}) : {success:false,error:'No recipients'};
                delivered=Boolean(result.success); errorMessage=result.error || null;
            } catch (error) { errorMessage='Email delivery failed'; console.error('[Reminder] provider failure:',error.message); }
            if (delivered) {
                await db.query('UPDATE payment_reminders SET last_sent_at=NOW(),claim_token=NULL,claim_expires_at=NULL WHERE id=? AND claim_token=?',[inv.reminder_id,claimToken]);
                await auditLog({eventType:'reminder_sent',invoiceMetaId:inv.id,documentId:inv.document_id,actorName:'System',description:`Напомняне за плащане изпратено — фактура ${inv.invoice_number || '#' + inv.document_id}`,meta:{daysUntilDue:inv.remind_days_before}});
                sent++;
            } else {
                await db.query('UPDATE payment_reminders SET claim_token=NULL,claim_expires_at=NULL WHERE id=? AND claim_token=?',[inv.reminder_id,claimToken]);
                await db.query(`INSERT INTO notification_log (order_id,channel,notification_type,recipient_email,subject,status,error_message,sent_at)
                    VALUES (NULL,'email','payment_reminder',NULL,?,'failed',?,NOW())`,[`Payment reminder ${inv.invoice_number || inv.id}`,errorMessage || 'Email delivery failed']);
                failed++;
            }
        }
        res.json({success:true,sent,failed,message:`Изпратени ${sent} напомняния`});
    } catch (err) {
        console.error('sendPaymentReminders error:',err);
        res.status(500).json({success:false,message:'Грешка при изпращане на напомняния'});
    }
};

// ─── Dashboard Summary ────────────────────────────────────────────────────────

// GET /api/accounting/dashboard
exports.getDashboard = async (req, res) => {
    try {
        const [[invoiceCounts]] = await db.query(
            `SELECT
               SUM(CASE WHEN im.payment_status = 'unpaid' AND (im.due_date IS NULL OR im.due_date >= CURDATE()) THEN 1 ELSE 0 END)  AS unpaid,
               SUM(CASE WHEN im.payment_status = 'unpaid' AND im.due_date < CURDATE()                          THEN 1 ELSE 0 END)  AS overdue,
               SUM(CASE WHEN im.payment_status = 'unpaid' AND DATEDIFF(im.due_date, CURDATE()) BETWEEN 0 AND 7 THEN 1 ELSE 0 END)  AS due_soon,
               SUM(CASE WHEN im.payment_status = 'paid'                                                        THEN 1 ELSE 0 END)  AS paid_total,
               SUM(CASE WHEN im.payment_status = 'paid'   AND MONTH(im.paid_at) = MONTH(NOW()) AND YEAR(im.paid_at) = YEAR(NOW()) THEN 1 ELSE 0 END) AS paid_this_month,
               SUM(CASE WHEN im.payment_status = 'unpaid' THEN COALESCE(im.amount_total, 0) ELSE 0 END) AS total_outstanding,
               SUM(CASE WHEN im.payment_status = 'paid' AND MONTH(im.paid_at) = MONTH(NOW()) THEN COALESCE(im.amount_total, 0) ELSE 0 END) AS total_paid_this_month
             FROM invoice_metadata im`
        );

        const [[handoverCounts]] = await db.query(
            `SELECT
               COUNT(*) AS total,
               SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
               SUM(CASE WHEN status = 'acknowledged' THEN 1 ELSE 0 END) AS acknowledged
             FROM accounting_handovers`
        );

        // Overdue invoices (max 5 for dashboard preview)
        const [overdueList] = await db.query(
            `SELECT im.id, im.invoice_number, im.due_date, im.amount_total, im.currency,
                    im.document_id, d.file_name, d.document_type,
                    DATEDIFF(CURDATE(), im.due_date) AS days_overdue
             FROM invoice_metadata im
             JOIN documents d ON im.document_id = d.id
             WHERE im.payment_status = 'unpaid' AND im.due_date < CURDATE()
             ORDER BY im.due_date ASC LIMIT 5`
        );

        // Due soon (max 5)
        const [dueSoonList] = await db.query(
            `SELECT im.id, im.invoice_number, im.due_date, im.amount_total, im.currency,
                    im.document_id, d.file_name, d.document_type,
                    DATEDIFF(im.due_date, CURDATE()) AS days_until_due
             FROM invoice_metadata im
             JOIN documents d ON im.document_id = d.id
             WHERE im.payment_status = 'unpaid'
               AND im.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
             ORDER BY im.due_date ASC LIMIT 5`
        );

        // Recent handovers (max 5)
        const [recentHandovers] = await db.query(
            `SELECT h.id, h.sent_at, h.status, h.email_sent, u.name AS sent_by_name,
                    COUNT(hd.document_id) AS document_count
             FROM accounting_handovers h
             LEFT JOIN users u ON h.sent_by = u.id
             LEFT JOIN accounting_handover_documents hd ON h.id = hd.handover_id
             GROUP BY h.id ORDER BY h.sent_at DESC LIMIT 5`
        );

        res.json({
            success: true,
            invoiceCounts,
            handoverCounts,
            overdueList,
            dueSoonList,
            recentHandovers,
        });
    } catch (err) {
        console.error('getDashboard error:', err);
        res.status(500).json({ success: false, message: 'Грешка при зареждане на таблото' });
    }
};

// ── List accounting users (for recipient picker) ──────────────────────────────
exports.getAccountingUsers = async (req, res) => {
    try {
        const [users] = await db.query(
            `SELECT id, name, username, email FROM users
             WHERE role = 'accounting' AND active = 1 AND email IS NOT NULL
             ORDER BY name`
        );
        res.json({ success: true, users });
    } catch (err) {
        console.error('getAccountingUsers error:', err);
        res.status(500).json({ success: false, message: 'Грешка при зареждане на счетоводители' });
    }
};
