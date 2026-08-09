'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { withTransaction } = require('../utils/withTransaction');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const email = require('../utils/emailService');
const { applyStatusChange } = require('../utils/statusChange');

class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
function sendError(res, error, fallback) {
    console.error(`[Approvals] ${fallback}:`, error);
    const isExpected = error instanceof HttpError;
    res.status(isExpected ? error.status : 500).json({ success: false, message: isExpected ? error.message : fallback });
}
function scopeForUser(user, params) {
    if (user.role === 'manager') { params.push(user.id); return ' AND a.assigned_to = ?'; }
    if (user.role === 'requester') { params.push(user.id); return ' AND a.requested_by = ?'; }
    if (user.role === 'admin' || user.role === 'procurement') return '';
    return ' AND 1 = 0';
}

router.get('/', authenticateToken, async (req, res) => {
    try {
        const { status, assigned_to, order_id, from_date, to_date } = req.query;
        const params = [];
        let query = `SELECT a.*, o.item_description, o.building, cc.code AS cost_center_code,
            s.name AS supplier_name, u_req.name AS requested_by_name, u_req.email AS requested_by_email,
            u_assigned.name AS assigned_to_name, u_approved.name AS approved_by_name,
            d.file_name AS quote_file_name, d.id AS quote_document_id
            FROM approvals a JOIN orders o ON a.order_id=o.id
            LEFT JOIN cost_centers cc ON cc.id=o.cost_center_id LEFT JOIN suppliers s ON a.supplier_id=s.id
            LEFT JOIN users u_req ON a.requested_by=u_req.id LEFT JOIN users u_assigned ON a.assigned_to=u_assigned.id
            LEFT JOIN users u_approved ON a.approved_by=u_approved.id LEFT JOIN documents d ON a.quote_document_id=d.id WHERE 1=1`;
        query += scopeForUser(req.user, params);
        if (status) { query += ' AND a.status=?'; params.push(status); }
        if (assigned_to && req.user.role === 'admin') { query += ' AND a.assigned_to=?'; params.push(assigned_to); }
        if (order_id) { query += ' AND a.order_id=?'; params.push(order_id); }
        if (from_date) { query += ' AND a.requested_at>=?'; params.push(from_date); }
        if (to_date) { query += ' AND a.requested_at<=?'; params.push(to_date); }
        query += ' ORDER BY a.requested_at DESC';
        const [approvals] = await pool.query(query, params);
        res.json({ success:true, approvals });
    } catch (error) { sendError(res, error, 'Failed to fetch approvals'); }
});

router.get('/pending-count', authenticateToken, async (req, res) => {
    try {
        if (!['manager','admin','procurement'].includes(req.user.role)) return res.json({success:true,count:0});
        const params = []; let where = "WHERE status='pending'";
        if (req.user.role === 'manager') { where += ' AND assigned_to=?'; params.push(req.user.id); }
        const [[row]] = await pool.query(`SELECT COUNT(*) AS count FROM approvals ${where}`, params);
        res.json({ success:true, count:row.count });
    } catch (error) { sendError(res, error, 'Failed to count pending approvals'); }
});

router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const params = [req.params.id];
        const scope = scopeForUser(req.user, params);
        const [approvals] = await pool.query(`SELECT a.*,o.item_description,o.part_number,o.quantity,o.building,cc.code AS cost_center_code,cc.name AS cost_center_name,
            o.notes AS order_notes,s.name AS supplier_name,s.email AS supplier_email,u_req.name AS requested_by_name,u_req.email AS requested_by_email,
            u_assigned.name AS assigned_to_name,u_approved.name AS approved_by_name,d.file_name AS quote_file_name,d.id AS quote_document_id
            FROM approvals a JOIN orders o ON a.order_id=o.id LEFT JOIN cost_centers cc ON cc.id=o.cost_center_id
            LEFT JOIN suppliers s ON a.supplier_id=s.id LEFT JOIN users u_req ON a.requested_by=u_req.id
            LEFT JOIN users u_assigned ON a.assigned_to=u_assigned.id LEFT JOIN users u_approved ON a.approved_by=u_approved.id
            LEFT JOIN documents d ON a.quote_document_id=d.id WHERE a.id=?${scope}`, params);
        if (!approvals.length) return res.status(404).json({success:false,message:'Approval not found'});
        const [history] = await pool.query(`SELECT ah.*,u.name AS performed_by_name FROM approval_history ah LEFT JOIN users u ON ah.performed_by=u.id WHERE ah.approval_id=? ORDER BY ah.performed_at DESC`, [req.params.id]);
        res.json({ success:true, approval:{...approvals[0], history} });
    } catch (error) { sendError(res, error, 'Failed to fetch approval details'); }
});

router.post('/', authenticateToken, async (req, res) => {
    const { order_id, quote_document_id, assigned_to, estimated_cost, supplier_id, priority, comments } = req.body;
    if (!Number(order_id)) return res.status(400).json({success:false,message:'Order ID is required'});
    try {
        const approvalId = await withTransaction(pool, async connection => {
            const [[order]] = await connection.query('SELECT id, requester_id FROM orders WHERE id=? FOR UPDATE', [order_id]);
            if (!order) throw new HttpError(404, 'Order not found');
            if (req.user.role === 'requester' && order.requester_id !== req.user.id) throw new HttpError(403, 'Not allowed to request approval for this order');
            if (assigned_to) {
                const [[assignee]] = await connection.query("SELECT id FROM users WHERE id=? AND active=1 AND role='manager'", [assigned_to]);
                if (!assignee) throw new HttpError(400, 'Assigned manager not found');
            }
            const [result] = await connection.query(`INSERT INTO approvals (order_id,quote_document_id,requested_by,assigned_to,estimated_cost,supplier_id,priority,comments)
                VALUES (?,?,?,?,?,?,?,?)`, [order_id, quote_document_id || null, req.user.id, assigned_to || null, estimated_cost || null, supplier_id || null, priority || 'Normal', comments || null]);
            await connection.query(`INSERT INTO approval_history (approval_id,action,performed_by,new_status,comments) VALUES (?, 'created', ?, 'pending', ?)`, [result.insertId, req.user.id, comments || null]);
            await connection.query("UPDATE orders SET approval_status='pending' WHERE id=?", [order_id]);
            return result.insertId;
        });
        if (assigned_to) notifyApprovalRequest(approvalId).catch(error => console.error('[Approvals] notification failed:', error.message));
        res.json({ success:true, message:'Approval request created', approvalId });
    } catch (error) { sendError(res, error, 'Failed to create approval request'); }
});

async function decideApproval(req, res, decision) {
    const comment = decision === 'approved' ? (req.body.comments || '') : (req.body.rejection_reason || '');
    if (decision === 'rejected' && !comment.trim()) return res.status(400).json({success:false,message:'Rejection reason is required'});
    try {
        const approval = await withTransaction(pool, async connection => {
            // Conditional update is both the authorization and the cross-worker claim.
            const assignedPredicate = req.user.role === 'admin' ? '' : ' AND assigned_to = ?';
            const params = decision === 'approved'
                ? [req.user.id, comment, req.params.id]
                : [req.user.id, comment, req.params.id];
            if (req.user.role !== 'admin') params.push(req.user.id);
            const [result] = await connection.query(`UPDATE approvals SET status='${decision}', approved_by=?, approved_at=NOW(),
                ${decision === 'approved' ? "comments=CONCAT(COALESCE(comments,''), '\n\nApproved: ', ?)" : 'rejection_reason=?'}
                WHERE id=? AND status='pending'${assignedPredicate}`, params);
            if (result.affectedRows !== 1) {
                const [[existing]] = await connection.query('SELECT status,assigned_to FROM approvals WHERE id=?', [req.params.id]);
                if (!existing) throw new HttpError(404, 'Approval not found');
                if (existing.status !== 'pending') throw new HttpError(409, 'This request has already been decided');
                throw new HttpError(403, 'This approval is assigned to another manager');
            }
            const [[approval]] = await connection.query('SELECT order_id,requested_by,estimated_cost,supplier_id FROM approvals WHERE id=?', [req.params.id]);
            await connection.query(`INSERT INTO approval_history (approval_id,action,performed_by,old_status,new_status,comments)
                VALUES (?, ?, ?, 'pending', ?, ?)`, [req.params.id, decision, req.user.id, decision, comment || null]);
            // The approval flag and the status move are separate concerns: the
            // decision is always recorded, but the status only changes if the
            // lifecycle permits it. Previously both were written blind, so
            // approving a quote could drag an already-delivered order backwards.
            if (decision === 'approved') {
                await connection.query(
                    "UPDATE orders SET approval_status='approved', approved_by=?, approved_at=NOW() WHERE id=?",
                    [req.user.id, approval.order_id]
                );
                await applyStatusChange(connection, approval.order_id, 'Approved', req.user, {
                    contextOverrides: { approvalApproved: true }
                });
            } else {
                await connection.query(
                    "UPDATE orders SET approval_status='rejected' WHERE id=?",
                    [approval.order_id]
                );
                await applyStatusChange(connection, approval.order_id, 'On Hold', req.user);
            }
            return approval;
        });
        notifyApprovalDecision(req.params.id, decision, comment).catch(error => console.error('[Approvals] decision notification failed:', error.message));
        res.json({ success:true, message: decision === 'approved' ? 'Approval granted' : 'Approval rejected' });
    } catch (error) { sendError(res, error, decision === 'approved' ? 'Failed to approve request' : 'Failed to reject request'); }
}
router.put('/:id/approve', authenticateToken, authorizeRoles('admin','manager'), (req,res) => decideApproval(req,res,'approved'));
router.put('/:id/reject', authenticateToken, authorizeRoles('admin','manager'), (req,res) => decideApproval(req,res,'rejected'));

async function notifyApprovalRequest(approvalId) {
    const [[approval]] = await pool.query(`SELECT a.id,a.order_id,a.estimated_cost,a.priority,a.comments,o.item_description,s.name AS supplier_name,u.email AS manager_email
        FROM approvals a JOIN orders o ON a.order_id=o.id LEFT JOIN suppliers s ON a.supplier_id=s.id JOIN users u ON a.assigned_to=u.id WHERE a.id=?`, [approvalId]);
    if (!approval?.manager_email) return;
    await email.sendApprovalRequest({ orderId:approval.order_id,itemDescription:approval.item_description,quoteAmount:approval.estimated_cost,
        supplierName:approval.supplier_name,notes:approval.comments,approverEmails:[approval.manager_email] });
}
async function notifyApprovalDecision(approvalId, decision, comment) {
    const [[approval]] = await pool.query(`SELECT a.order_id,a.estimated_cost,a.rejection_reason,a.comments,o.item_description,
        requester.email AS requester_email, requester.name AS requester_name, approver.name AS approver_name
        FROM approvals a JOIN orders o ON a.order_id=o.id JOIN users requester ON a.requested_by=requester.id
        LEFT JOIN users approver ON a.approved_by=approver.id WHERE a.id=?`, [approvalId]);
    if (!approval?.requester_email) return;
    await email.sendApprovalDecision({ orderId:approval.order_id,requesterEmail:approval.requester_email,requesterName:approval.requester_name,
        decision,approverName:approval.approver_name,quoteAmount:approval.estimated_cost,notes:approval.comments,rejectionReason: decision === 'rejected' ? comment : approval.rejection_reason });
}

module.exports = router;
