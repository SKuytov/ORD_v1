'use strict';

const db = require('../config/database');
const { withTransaction } = require('../utils/withTransaction');

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function quoteNumber() {
    const year = new Date().getUTCFullYear();
    const random = Math.floor(100000 + Math.random() * 900000);
    return `QT-${year}-${Date.now()}-${random}`;
}

function responseError(res, error, fallback) {
    console.error(`[Quote] ${fallback}:`, error);
    const isExpected = error instanceof HttpError;
    res.status(isExpected ? error.status : 500).json({ success: false, message: isExpected ? error.message : fallback });
}

exports.getQuotes = async (req, res) => {
    try {
        const [quotes] = await db.query(`
            SELECT q.*, s.name AS supplier_name, u.name AS created_by_name, COUNT(qi.id) AS item_count
            FROM quotes q
            LEFT JOIN suppliers s ON q.supplier_id = s.id
            LEFT JOIN users u ON q.created_by = u.id
            LEFT JOIN quote_items qi ON q.id = qi.quote_id
            GROUP BY q.id ORDER BY q.created_at DESC`);
        res.json({ success: true, quotes });
    } catch (error) { responseError(res, error, 'Failed to retrieve quotes'); }
};

exports.getQuoteById = async (req, res) => {
    try {
        const [quotes] = await db.query(`
            SELECT q.*, s.name AS supplier_name, s.email AS supplier_email,
                   s.contact_person AS supplier_contact, u.name AS created_by_name
            FROM quotes q LEFT JOIN suppliers s ON q.supplier_id=s.id
            LEFT JOIN users u ON q.created_by=u.id WHERE q.id=?`, [req.params.id]);
        if (!quotes.length) return res.status(404).json({ success: false, message: 'Quote not found' });
        const [items] = await db.query(`
            SELECT qi.*, o.building, o.item_description, o.part_number, o.quantity AS order_quantity,
                   o.date_needed, o.requester_name, o.status AS order_status
            FROM quote_items qi JOIN orders o ON qi.order_id=o.id WHERE qi.quote_id=? ORDER BY qi.id`, [req.params.id]);
        res.json({ success: true, quote: { ...quotes[0], items } });
    } catch (error) { responseError(res, error, 'Failed to retrieve quote'); }
};

exports.createQuote = async (req, res) => {
    const { supplier_id, order_ids, notes, currency, valid_until } = req.body;
    if (!supplier_id || !Array.isArray(order_ids) || !order_ids.length) {
        return res.status(400).json({ success: false, message: 'Supplier and at least one order are required' });
    }
    const orderIds = [...new Set(order_ids.map(Number).filter(Number.isInteger))];
    if (!orderIds.length) return res.status(400).json({ success: false, message: 'At least one valid order is required' });

    try {
        let created;
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                created = await withTransaction(db, async connection => {
                    const [supplier] = await connection.query('SELECT id FROM suppliers WHERE id = ?', [supplier_id]);
                    if (!supplier.length) throw new HttpError(404, 'Supplier not found');
                    const placeholders = orderIds.map(() => '?').join(',');
                    const [orders] = await connection.query(`SELECT id, quantity FROM orders WHERE id IN (${placeholders}) FOR UPDATE`, orderIds);
                    if (orders.length !== orderIds.length) throw new HttpError(404, 'One or more orders were not found');
                    const [result] = await connection.query(
                        'INSERT INTO quotes (quote_number, supplier_id, currency, valid_until, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)',
                        [quoteNumber(), supplier_id, currency || 'EUR', valid_until || null, notes || null, req.user.id]);
                    for (const order of orders) {
                        await connection.query('INSERT INTO quote_items (quote_id, order_id, quantity) VALUES (?, ?, ?)', [result.insertId, order.id, order.quantity]);
                        await connection.query('UPDATE orders SET supplier_id=?, quote_ref=? WHERE id=?', [supplier_id, result.insertId, order.id]);
                        await connection.query(`INSERT INTO order_history (order_id, changed_by, field_name, old_value, new_value)
                            VALUES (?, ?, 'quote_ref', NULL, ?)`, [order.id, req.user.name || req.user.username || 'system', String(result.insertId)]);
                    }
                    const [[quote]] = await connection.query('SELECT quote_number FROM quotes WHERE id=?', [result.insertId]);
                    return { quoteId: result.insertId, quoteNumber: quote.quote_number };
                });
                break;
            } catch (error) {
                if (error.code !== 'ER_DUP_ENTRY' || attempt === 4) throw error;
            }
        }
        res.status(201).json({ success: true, message: 'Quote created successfully', ...created });
    } catch (error) { responseError(res, error, 'Failed to create quote'); }
};

exports.updateQuote = async (req, res) => {
    try {
        await withTransaction(db, async connection => {
            const { id } = req.params;
            const { status, total_amount, valid_until, notes, items } = req.body;
            const [[quote]] = await connection.query('SELECT id FROM quotes WHERE id=? FOR UPDATE', [id]);
            if (!quote) throw new HttpError(404, 'Quote not found');
            const updates = []; const values = [];
            if (status !== undefined) { updates.push('status=?'); values.push(status); }
            if (total_amount !== undefined) { updates.push('total_amount=?'); values.push(total_amount); }
            if (valid_until !== undefined) { updates.push('valid_until=?'); values.push(valid_until || null); }
            if (notes !== undefined) { updates.push('notes=?'); values.push(notes || null); }
            if (updates.length) { values.push(id); await connection.query(`UPDATE quotes SET ${updates.join(', ')} WHERE id=?`, values); }
            if (Array.isArray(items) && items.length) {
                let total = 0;
                for (const item of items) {
                    const quantity = Number(item.quantity) || 1;
                    const unitPrice = Number(item.unit_price) || 0;
                    const itemTotal = quantity * unitPrice;
                    const [updated] = await connection.query(`UPDATE quote_items SET unit_price=?, quantity=?, total_price=?, notes=?
                        WHERE id=? AND quote_id=?`, [unitPrice, quantity, itemTotal, item.notes || null, item.id, id]);
                    if (updated.affectedRows !== 1) throw new HttpError(400, 'Quote item does not belong to this quote');
                    total += itemTotal;
                    await connection.query(`UPDATE orders o JOIN quote_items qi ON qi.order_id=o.id
                        SET o.price=?, o.unit_price=?, o.total_price=?
                        WHERE qi.id=? AND qi.quote_id=?`,
                    [unitPrice, unitPrice, itemTotal, item.id, id]);
                }
                await connection.query('UPDATE quotes SET total_amount=? WHERE id=?', [total, id]);
            }
            if (status === 'Received') await connection.query("UPDATE orders SET status='Quote Received' WHERE quote_ref=? AND status='Quote Requested'", [id]);
            if (status === 'Under Approval') await connection.query("UPDATE orders SET status='Quote Under Approval' WHERE quote_ref=? AND status='Quote Received'", [id]);
        });
        res.json({ success: true, message: 'Quote updated successfully' });
    } catch (error) { responseError(res, error, 'Failed to update quote'); }
};

exports.addItemsToQuote = async (req, res) => {
    const orderIds = [...new Set((req.body.order_ids || []).map(Number).filter(Number.isInteger))];
    if (!orderIds.length) return res.status(400).json({ success: false, message: 'At least one valid order is required' });
    try {
        await withTransaction(db, async connection => {
            const { id } = req.params;
            const [[quote]] = await connection.query('SELECT supplier_id FROM quotes WHERE id=? FOR UPDATE', [id]);
            if (!quote) throw new HttpError(404, 'Quote not found');
            for (const orderId of orderIds) {
                const [[order]] = await connection.query('SELECT id, quantity FROM orders WHERE id=? FOR UPDATE', [orderId]);
                if (!order) throw new HttpError(404, 'One or more orders were not found');
                await connection.query('INSERT INTO quote_items (quote_id, order_id, quantity) VALUES (?, ?, ?)', [id, order.id, order.quantity]);
                await connection.query("UPDATE orders SET status='Quote Requested', supplier_id=?, quote_ref=? WHERE id=?", [quote.supplier_id, id, order.id]);
            }
        });
        res.json({ success: true, message: 'Items added to quote' });
    } catch (error) { responseError(res, error, 'Failed to add items'); }
};

exports.removeItemFromQuote = async (req, res) => {
    try {
        await withTransaction(db, async connection => {
            const { id, itemId } = req.params;
            const [[item]] = await connection.query('SELECT order_id FROM quote_items WHERE id=? AND quote_id=? FOR UPDATE', [itemId, id]);
            if (!item) throw new HttpError(404, 'Quote item not found');
            await connection.query('DELETE FROM quote_items WHERE id=? AND quote_id=?', [itemId, id]);
            await connection.query("UPDATE orders SET status='New', supplier_id=NULL, quote_ref=NULL WHERE id=? AND quote_ref=?", [item.order_id, id]);
            await connection.query(`UPDATE quotes SET total_amount=(SELECT COALESCE(SUM(total_price),0) FROM quote_items WHERE quote_id=?) WHERE id=?`, [id, id]);
        });
        res.json({ success: true, message: 'Item removed from quote' });
    } catch (error) { responseError(res, error, 'Failed to remove item'); }
};

exports.approveQuote = async (req, res) => {
    try {
        await withTransaction(db, async connection => {
            const { id } = req.params;
            const [quote] = await connection.query("UPDATE quotes SET status='Approved' WHERE id=? AND status <> 'Approved'", [id]);
            if (!quote.affectedRows) throw new HttpError(404, 'Quote not found');
            const [orders] = await connection.query('SELECT id, status FROM orders WHERE quote_ref=? FOR UPDATE', [id]);
            await connection.query("UPDATE orders SET status='Approved' WHERE quote_ref=?", [id]);
            for (const order of orders) await connection.query(`INSERT INTO order_history (order_id, changed_by, field_name, old_value, new_value)
                VALUES (?, ?, 'status', ?, 'Approved')`, [order.id, req.user.name || req.user.username || 'system', order.status]);
        });
        res.json({ success: true, message: 'Quote approved, all linked orders updated' });
    } catch (error) { responseError(res, error, 'Failed to approve quote'); }
};

exports.getQuoteEmailData = async (req, res) => {
    try {
        const { id } = req.params;
        const [quotes] = await db.query(`SELECT q.*,s.name AS supplier_name,s.email AS supplier_email,s.contact_person AS supplier_contact,s.phone AS supplier_phone,u.name AS created_by_name
            FROM quotes q LEFT JOIN suppliers s ON q.supplier_id=s.id LEFT JOIN users u ON q.created_by=u.id WHERE q.id=?`, [id]);
        if (!quotes.length) return res.status(404).json({ success:false, message:'Quote not found' });
        const [items] = await db.query(`SELECT qi.id AS quote_item_id,qi.quantity,o.id AS order_id,o.item_description,o.part_number,o.building,o.date_needed,o.priority,o.notes AS order_notes,cc.code AS cost_center_code,cc.name AS cost_center_name
            FROM quote_items qi JOIN orders o ON qi.order_id=o.id LEFT JOIN cost_centers cc ON o.cost_center_id=cc.id WHERE qi.quote_id=? ORDER BY qi.id`, [id]);
        const [sendLog] = await db.query(`SELECT qsl.*,u.name AS sent_by_name FROM quote_send_log qsl LEFT JOIN users u ON qsl.sent_by=u.id WHERE qsl.quote_id=? ORDER BY qsl.sent_at DESC`, [id]);
        res.json({ success:true, quote:{...quotes[0],items}, sendLog });
    } catch (error) { responseError(res, error, 'Failed to retrieve quote email data'); }
};

exports.logQuoteSend = async (req, res) => {
    const { method, supplier_email, notes } = req.body;
    if (!['outlook', 'copy', 'link'].includes(method)) return res.status(400).json({ success:false, message:'Valid method is required' });
    try {
        await withTransaction(db, async connection => {
            const { id } = req.params;
            const [[quote]] = await connection.query('SELECT id FROM quotes WHERE id=? FOR UPDATE', [id]);
            if (!quote) throw new HttpError(404, 'Quote not found');
            await connection.query('INSERT INTO quote_send_log (quote_id,sent_by,method,supplier_email,notes) VALUES (?,?,?,?,?)', [id, req.user.id, method, supplier_email || null, notes || null]);
            await connection.query("UPDATE quotes SET status='Sent to Supplier' WHERE id=?", [id]);
            await connection.query("UPDATE orders SET status='Quote Requested' WHERE quote_ref=? AND status IN ('New','Pending')", [id]);
        });
        const [updatedQuote] = await db.query(`SELECT q.*,s.name AS supplier_name,s.email AS supplier_email FROM quotes q LEFT JOIN suppliers s ON q.supplier_id=s.id WHERE q.id=?`, [req.params.id]);
        const [sendLog] = await db.query(`SELECT qsl.*,u.name AS sent_by_name FROM quote_send_log qsl LEFT JOIN users u ON qsl.sent_by=u.id WHERE qsl.quote_id=? ORDER BY qsl.sent_at DESC`, [req.params.id]);
        res.json({ success:true, message:'Quote send logged successfully', quote:updatedQuote[0], sendLog });
    } catch (error) { responseError(res, error, 'Failed to log quote send'); }
};

exports.getQuoteSendLog = async (req, res) => {
    try {
        const [sendLog] = await db.query(`SELECT qsl.*,u.name AS sent_by_name FROM quote_send_log qsl LEFT JOIN users u ON qsl.sent_by=u.id WHERE qsl.quote_id=? ORDER BY qsl.sent_at DESC`, [req.params.id]);
        res.json({ success:true, sendLog });
    } catch (error) { responseError(res, error, 'Failed to retrieve send log'); }
};

// =====================================================================
// ⭐ SMART QUOTE SEND — New exports for Phase 6
// =====================================================================

// GET /api/quotes/:id/email-data
// Returns all data needed to compose the quote request email
exports.getQuoteEmailData = async (req, res) => {
    try {
        const { id } = req.params;

        // Quote + supplier info
        const [quotes] = await db.query(`
            SELECT q.*,
                   s.name AS supplier_name,
                   s.email AS supplier_email,
                   s.contact_person AS supplier_contact,
                   s.phone AS supplier_phone,
                   u.name AS created_by_name
            FROM quotes q
            LEFT JOIN suppliers s ON q.supplier_id = s.id
            LEFT JOIN users u ON q.created_by = u.id
            WHERE q.id = ?
        `, [id]);

        if (quotes.length === 0) {
            return res.status(404).json({ success: false, message: 'Quote not found' });
        }

        // All items with full order details for email composition
        const [items] = await db.query(`
            SELECT
                qi.id AS quote_item_id,
                qi.quantity,
                o.id AS order_id,
                o.item_description,
                o.part_number,
                o.building,
                o.date_needed,
                o.priority,
                o.notes AS order_notes,
                cc.code AS cost_center_code,
                cc.name AS cost_center_name
            FROM quote_items qi
            JOIN orders o ON qi.order_id = o.id
            LEFT JOIN cost_centers cc ON o.cost_center_id = cc.id
            WHERE qi.quote_id = ?
            ORDER BY qi.id ASC
        `, [id]);

        // Previous send log
        const [sendLog] = await db.query(`
            SELECT qsl.*, u.name AS sent_by_name
            FROM quote_send_log qsl
            LEFT JOIN users u ON qsl.sent_by = u.id
            WHERE qsl.quote_id = ?
            ORDER BY qsl.sent_at DESC
        `, [id]);

        res.json({
            success: true,
            quote: { ...quotes[0], items },
            sendLog
        });
    } catch (error) {
        console.error('Get quote email data error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve quote email data' });
    }
};

// POST /api/quotes/:id/send-log
// Records a send action, updates quote status to "Sent to Supplier",
// updates linked orders to "Quote Requested" if not already there
exports.logQuoteSend = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { method, supplier_email, notes } = req.body;

        if (!method) {
            return res.status(400).json({ success: false, message: 'method is required (outlook|copy|link)' });
        }

        // Verify quote exists
        const [quotes] = await connection.query('SELECT id, status FROM quotes WHERE id = ?', [id]);
        if (quotes.length === 0) {
            return res.status(404).json({ success: false, message: 'Quote not found' });
        }

        // Insert send log
        await connection.query(
            `INSERT INTO quote_send_log (quote_id, sent_by, method, supplier_email, notes)
             VALUES (?, ?, ?, ?, ?)`,
            [id, req.user.id, method, supplier_email || null, notes || null]
        );

        // Update quote status to "Sent to Supplier"
        await connection.query(
            `UPDATE quotes SET status = 'Sent to Supplier' WHERE id = ?`,
            [id]
        );

        // Update linked orders to "Quote Requested" where not already in a more advanced state
        await connection.query(
            `UPDATE orders SET status = 'Quote Requested'
             WHERE quote_ref = ?
               AND status IN ('New', 'Pending')`,
            [id]
        );

        await connection.commit();

        // Return updated quote + new log
        const [updatedQuote] = await connection.query(
            `SELECT q.*, s.name AS supplier_name, s.email AS supplier_email
             FROM quotes q LEFT JOIN suppliers s ON q.supplier_id = s.id
             WHERE q.id = ?`, [id]
        );
        const [sendLog] = await connection.query(
            `SELECT qsl.*, u.name AS sent_by_name
             FROM quote_send_log qsl LEFT JOIN users u ON qsl.sent_by = u.id
             WHERE qsl.quote_id = ? ORDER BY qsl.sent_at DESC`, [id]
        );

        res.json({
            success: true,
            message: 'Quote send logged successfully',
            quote: updatedQuote[0],
            sendLog
        });
    } catch (error) {
        await connection.rollback();
        console.error('Log quote send error:', error);
        res.status(500).json({ success: false, message: 'Failed to log quote send' });
    } finally {
        connection.release();
    }
};

// GET /api/quotes/:id/send-log
// Returns all send log entries for this quote, joined with users
exports.getQuoteSendLog = async (req, res) => {
    try {
        const { id } = req.params;
        const [sendLog] = await db.query(
            `SELECT qsl.*, u.name AS sent_by_name
             FROM quote_send_log qsl
             LEFT JOIN users u ON qsl.sent_by = u.id
             WHERE qsl.quote_id = ?
             ORDER BY qsl.sent_at DESC`,
            [id]
        );
        res.json({ success: true, sendLog });
    } catch (error) {
        console.error('Get send log error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve send log' });
    }
};
