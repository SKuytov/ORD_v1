// frontend/approvals.js - Phase 3: Approval Workflow UI

let approvalsState = [];
let currentApproval = null;
let pendingApprovalsCount = 0;

// ========================================
// INITIALIZATION
// ========================================

function initializeApprovals() {
    // Only load for managers, admin, and procurement
    if (currentUser && currentUser.role !== 'requester') {
        loadPendingApprovalsCount();
        
        // Refresh count every 60 seconds
        setInterval(loadPendingApprovalsCount, 60000);
    }
}

// ========================================
// LOAD PENDING COUNT (FOR BADGE)
// ========================================

async function loadPendingApprovalsCount() {
    try {
        const res = await apiGet('/approvals/pending-count');
        if (res.success) {
            pendingApprovalsCount = res.count || 0;
            updateApprovalsBadge();
        }
    } catch (err) {
        console.error('Error loading pending approvals count:', err);
    }
}

function updateApprovalsBadge() {
    const badge = document.getElementById('approvalsBadge');
    if (!badge) return;
    
    if (pendingApprovalsCount > 0) {
        badge.textContent = pendingApprovalsCount;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

// ========================================
// LOAD APPROVALS LIST
// ========================================

async function loadApprovals(filters = {}) {
    try {
        const res = await apiGet('/approvals', filters);
        if (res.success) {
            approvalsState = res.approvals || [];
            renderApprovalsTable();
        }
    } catch (err) {
        console.error('Error loading approvals:', err);
        const approvalsTable = document.getElementById('approvalsTable');
        if (approvalsTable) {
            approvalsTable.innerHTML = '<p class="text-danger">Failed to load approvals</p>';
        }
    }
}

function renderApprovalsTable() {
    const approvalsTable = document.getElementById('approvalsTable');
    if (!approvalsTable) return;
    
    if (!approvalsState.length) {
        approvalsTable.innerHTML = '<p class="text-muted">No approval requests found.</p>';
        return;
    }
    
    let html = '<div class="table-wrapper"><table><thead><tr>';
    html += '<th>ID</th>';
    html += '<th>Order</th>';
    html += '<th>Item</th>';
    html += '<th>Supplier</th>';
    html += '<th>Cost</th>';
    html += '<th>Priority</th>';
    html += '<th>Requested By</th>';
    html += '<th>Requested</th>';
    html += '<th>Status</th>';
    html += '<th></th>';
    html += '</tr></thead><tbody>';
    
    for (const approval of approvalsState) {
        const statusClass = 'approval-status-' + approval.status;
        const priorityClass = 'priority-' + (approval.priority || 'Normal').toLowerCase();
        const requestedDate = formatDateTime(approval.requested_at);
        
        html += `<tr data-id="${approval.id}">`;
        html += `<td>#${approval.id}</td>`;
        html += `<td><a href="#" onclick="viewOrderFromApproval(${approval.order_id}); return false;">#${approval.order_id}</a></td>`;
        html += `<td title="${escapeHtml(approval.item_description)}">${escapeHtml((approval.item_description || '').substring(0, 40))}${approval.item_description?.length > 40 ? '...' : ''}</td>`;
        html += `<td>${escapeHtml(approval.supplier_name || '-')}</td>`;
        html += `<td class="text-right">${approval.estimated_cost ? '$' + parseFloat(approval.estimated_cost).toFixed(2) : '-'}</td>`;
        html += `<td><span class="priority-pill ${priorityClass}">${approval.priority || 'Normal'}</span></td>`;
        html += `<td>${escapeHtml(approval.requested_by_name || '-')}</td>`;
        html += `<td>${requestedDate}</td>`;
        html += `<td><span class="approval-badge ${statusClass}">${approval.status.toUpperCase()}</span></td>`;
        html += `<td><button class="btn btn-secondary btn-sm" onclick="openApprovalDetail(${approval.id})">Review</button></td>`;
        html += '</tr>';
    }
    
    html += '</tbody></table></div>';
    approvalsTable.innerHTML = html;
}

// ========================================
// OPEN APPROVAL DETAIL (MANAGER VIEW)
// ========================================

async function openApprovalDetail(approvalId) {
    try {
        const res = await apiGet(`/approvals/${approvalId}`);
        if (!res.success) {
            alert('Failed to load approval details');
            return;
        }
        
        currentApproval = res.approval;
        renderApprovalDetailPanel();
        
        const panel = document.getElementById('approvalDetailPanel');
        if (panel) panel.classList.remove('hidden');
    } catch (err) {
        console.error('Error loading approval detail:', err);
        alert('Failed to load approval details');
    }
}

function renderApprovalDetailPanel() {
    const body = document.getElementById('approvalDetailBody');
    if (!body || !currentApproval) return;
    
    const a = currentApproval;
    const statusClass = 'approval-status-' + a.status;
    const priorityClass = 'priority-' + (a.priority || 'Normal').toLowerCase();
    
    let html = '';
    
    // Header info
    html += `<div class="detail-grid">`;
    html += `<div><div class="detail-label">Approval ID</div><div class="detail-value">#${a.id}</div></div>`;
    html += `<div><div class="detail-label">Order ID</div><div class="detail-value"><a href="#" onclick="viewOrderFromApproval(${a.order_id}); return false;">#${a.order_id}</a></div></div>`;
    html += `<div><div class="detail-label">Status</div><div class="detail-value"><span class="approval-badge ${statusClass}">${a.status.toUpperCase()}</span></div></div>`;
    html += `<div><div class="detail-label">Priority</div><div class="detail-value"><span class="priority-pill ${priorityClass}">${a.priority || 'Normal'}</span></div></div>`;
    html += `</div>`;
    
    // Order details
    html += `<div class="detail-section-title mt-2">Order Details</div>`;
    html += `<div class="detail-grid">`;
    html += `<div><div class="detail-label">Item</div><div class="detail-value">${escapeHtml(a.item_description || '-')}</div></div>`;
    html += `<div><div class="detail-label">Part Number</div><div class="detail-value">${escapeHtml(a.part_number || '-')}</div></div>`;
    html += `<div><div class="detail-label">Quantity</div><div class="detail-value">${a.quantity || '-'}</div></div>`;
    html += `<div><div class="detail-label">Building</div><div class="detail-value">${a.building || '-'}</div></div>`;
    html += `<div><div class="detail-label">Cost Center</div><div class="detail-value">${a.cost_center_code || '-'}</div></div>`;
    html += `<div><div class="detail-label">Supplier</div><div class="detail-value">${escapeHtml(a.supplier_name || '-')}</div></div>`;
    html += `<div><div class="detail-label">Estimated Cost</div><div class="detail-value">${a.estimated_cost ? '$' + parseFloat(a.estimated_cost).toFixed(2) : '-'}</div></div>`;
    html += `</div>`;
    
    // Request info
    html += `<div class="detail-section-title mt-2">Request Information</div>`;
    html += `<div class="detail-grid">`;
    html += `<div><div class="detail-label">Requested By</div><div class="detail-value">${escapeHtml(a.requested_by_name || '-')}</div></div>`;
    html += `<div><div class="detail-label">Requested At</div><div class="detail-value">${formatDateTime(a.requested_at)}</div></div>`;
    if (a.assigned_to_name) {
        html += `<div><div class="detail-label">Assigned To</div><div class="detail-value">${escapeHtml(a.assigned_to_name)}</div></div>`;
    }
    html += `</div>`;
    
    if (a.comments) {
        html += `<div class="detail-section-title mt-1">Comments</div>`;
        html += `<div class="text-muted mt-1">${escapeHtml(a.comments)}</div>`;
    }
    
    // Quote document preview
    if (a.quote_document_id) {
        html += `<div class="detail-section-title mt-2">Quote Document</div>`;
        html += `<div class="quote-preview-container">`;
        html += `<p class="text-muted"><strong>File:</strong> ${escapeHtml(a.quote_file_name)}</p>`;
        html += `<button class="btn btn-secondary btn-sm" onclick="downloadDocument(${a.quote_document_id}, '${escapeHtml(a.quote_file_name)}')">⬇ Download Quote</button>`;
        html += `</div>`;
    }
    
    // Approval/Rejection actions (only for pending)
    if (a.status === 'pending' && (currentUser.role === 'manager' || currentUser.role === 'admin')) {
        html += `<div class="detail-section-title mt-2">Manager Decision</div>`;
        html += `<div class="approval-actions">`;
        html += `<button class="btn btn-success" onclick="openApproveDialog()"><span style="font-size:1.2em;">✓</span> Approve</button>`;
        html += `<button class="btn btn-danger" onclick="openRejectDialog()"><span style="font-size:1.2em;">✗</span> Reject</button>`;
        html += `</div>`;
    }
    
    // Decision info (if already decided)
    if (a.status !== 'pending') {
        html += `<div class="detail-section-title mt-2">Decision</div>`;
        html += `<div class="detail-grid">`;
        html += `<div><div class="detail-label">Decided By</div><div class="detail-value">${escapeHtml(a.approved_by_name || '-')}</div></div>`;
        html += `<div><div class="detail-label">Decided At</div><div class="detail-value">${formatDateTime(a.approved_at)}</div></div>`;
        html += `</div>`;
        
        if (a.status === 'rejected' && a.rejection_reason) {
            html += `<div class="detail-section-title mt-1">Rejection Reason</div>`;
            html += `<div class="text-danger mt-1">${escapeHtml(a.rejection_reason)}</div>`;
        }
    }
    
    // History
    if (a.history && a.history.length > 0) {
        html += `<div class="detail-section-title mt-2">History</div>`;
        html += `<div class="approval-history">`;
        for (const h of a.history) {
            html += `<div class="history-item">`;
            html += `<div class="history-time">${formatDateTime(h.performed_at)}</div>`;
            html += `<div class="history-action"><strong>${h.action.toUpperCase()}</strong> by ${escapeHtml(h.performed_by_name || 'Unknown')}</div>`;
            if (h.comments) {
                html += `<div class="history-comments">${escapeHtml(h.comments)}</div>`;
            }
            html += `</div>`;
        }
        html += `</div>`;
    }
    
    body.innerHTML = html;
}

// ========================================
// APPROVE DIALOG
// ========================================

function openApproveDialog() {
    const html = `
        <div class="dialog-overlay" id="approveDialog">
            <div class="dialog-box">
                <h3>Approve Quote Request</h3>
                <p>Are you sure you want to approve this quote for Order #${currentApproval.order_id}?</p>
                <div class="form-group mt-1">
                    <label>Comments (optional)</label>
                    <textarea id="approveComments" class="form-control" rows="3" placeholder="Add any notes about this approval..."></textarea>
                </div>
                <div class="dialog-actions">
                    <button class="btn btn-secondary" onclick="closeApproveDialog()">Cancel</button>
                    <button class="btn btn-success" onclick="submitApprove()">✓ Approve</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}

function closeApproveDialog() {
    const dialog = document.getElementById('approveDialog');
    if (dialog) dialog.remove();
}

async function submitApprove() {
    const comments = document.getElementById('approveComments')?.value.trim();
    
    try {
        const res = await apiPut(`/approvals/${currentApproval.id}/approve`, { comments });
        if (res.success) {
            alert('✅ Approval granted!');
            closeApproveDialog();
            loadApprovals();
            loadPendingApprovalsCount();
            
            const panel = document.getElementById('approvalDetailPanel');
            if (panel) panel.classList.add('hidden');
        } else {
            alert('Failed to approve: ' + (res.message || 'Unknown error'));
        }
    } catch (err) {
        console.error('Error approving:', err);
        alert('Failed to approve request');
    }
}

// ========================================
// REJECT DIALOG
// ========================================

function openRejectDialog() {
    const html = `
        <div class="dialog-overlay" id="rejectDialog">
            <div class="dialog-box">
                <h3>Reject Quote Request</h3>
                <p class="text-danger">Please provide a reason for rejecting Order #${currentApproval.order_id}.</p>
                <div class="form-group mt-1">
                    <label>Rejection Reason <span class="text-danger">*</span></label>
                    <textarea id="rejectReason" class="form-control" rows="4" placeholder="Explain why this quote cannot be approved..." required></textarea>
                </div>
                <div class="dialog-actions">
                    <button class="btn btn-secondary" onclick="closeRejectDialog()">Cancel</button>
                    <button class="btn btn-danger" onclick="submitReject()">✗ Reject</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}

function closeRejectDialog() {
    const dialog = document.getElementById('rejectDialog');
    if (dialog) dialog.remove();
}

async function submitReject() {
    const rejection_reason = document.getElementById('rejectReason')?.value.trim();
    
    if (!rejection_reason) {
        alert('Please provide a rejection reason');
        return;
    }
    
    try {
        const res = await apiPut(`/approvals/${currentApproval.id}/reject`, { rejection_reason });
        if (res.success) {
            alert('❌ Approval rejected');
            closeRejectDialog();
            loadApprovals();
            loadPendingApprovalsCount();
            
            const panel = document.getElementById('approvalDetailPanel');
            if (panel) panel.classList.add('hidden');
        } else {
            alert('Failed to reject: ' + (res.message || 'Unknown error'));
        }
    } catch (err) {
        console.error('Error rejecting:', err);
        alert('Failed to reject request');
    }
}

// ========================================
// SUBMIT FOR APPROVAL (FROM ORDER DETAIL)
// ========================================

function openSubmitForApprovalDialog(orderId) {
    // Get available managers
    const managers = usersState.filter(u => u.role === 'manager' && u.active);
    const managersOptions = managers.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    
    // Get suppliers
    const suppliersOptions = suppliersState.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    
    const html = `
        <div class="dialog-overlay" id="submitApprovalDialog">
            <div class="dialog-box" style="max-width: 500px;">
                <h3>Submit for Approval</h3>
                <p>Request manager approval for Order #${orderId}</p>
                
                <div class="form-group">
                    <label>Assign to Manager</label>
                    <select id="approvalManager" class="form-control">
                        <option value="">Auto-assign</option>
                        ${managersOptions}
                    </select>
                </div>
                
                <div class="form-group">
                    <label>Supplier</label>
                    <select id="approvalSupplier" class="form-control">
                        <option value="">Select Supplier</option>
                        ${suppliersOptions}
                    </select>
                </div>
                
                <div class="form-group">
                    <label>Estimated Cost</label>
                    <input type="number" id="approvalCost" class="form-control" step="0.01" placeholder="0.00">
                </div>
                
                <div class="form-group">
                    <label>Priority</label>
                    <select id="approvalPriority" class="form-control">
                        <option value="Normal">Normal</option>
                        <option value="High">High</option>
                        <option value="Urgent">Urgent</option>
                        <option value="Low">Low</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label>Comments</label>
                    <textarea id="approvalComments" class="form-control" rows="3" placeholder="Additional notes for the manager..."></textarea>
                </div>
                
                <div class="dialog-actions">
                    <button class="btn btn-secondary" onclick="closeSubmitApprovalDialog()">Cancel</button>
                    <button class="btn btn-primary" onclick="submitApprovalRequest(${orderId})">📤 Submit</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}

function closeSubmitApprovalDialog() {
    const dialog = document.getElementById('submitApprovalDialog');
    if (dialog) dialog.remove();
}

async function submitApprovalRequest(orderId) {
    const assigned_to = document.getElementById('approvalManager')?.value || null;
    const supplier_id = document.getElementById('approvalSupplier')?.value || null;
    const estimated_cost = document.getElementById('approvalCost')?.value || null;
    const priority = document.getElementById('approvalPriority')?.value || 'Normal';
    const comments = document.getElementById('approvalComments')?.value.trim() || null;
    
    const payload = {
        order_id: orderId,
        assigned_to: assigned_to ? parseInt(assigned_to, 10) : null,
        supplier_id: supplier_id ? parseInt(supplier_id, 10) : null,
        estimated_cost: estimated_cost ? parseFloat(estimated_cost) : null,
        priority,
        comments
    };
    
    try {
        const res = await apiPost('/approvals', payload);
        if (res.success) {
            alert('✅ Approval request submitted!');
            closeSubmitApprovalDialog();
            
            // Reload order to show updated status
            if (typeof loadOrders === 'function') {
                loadOrders();
            }
        } else {
            alert('Failed to submit approval request: ' + (res.message || 'Unknown error'));
        }
    } catch (err) {
        console.error('Error submitting approval request:', err);
        alert('Failed to submit approval request');
    }
}

// ========================================
// HELPER: View order from approval
// ========================================

function viewOrderFromApproval(orderId) {
    // Switch to orders tab
    switchTab('ordersTab');
    
    // Open order detail
    if (typeof openOrderDetail === 'function') {
        openOrderDetail(orderId);
    }
    
    // Close approval panel
    const panel = document.getElementById('approvalDetailPanel');
    if (panel) panel.classList.add('hidden');
}

// ========================================
// GLOBAL EXPOSURE
// ========================================

if (typeof window !== 'undefined') {
    window.initializeApprovals = initializeApprovals;
    window.loadApprovals = loadApprovals;
    window.openApprovalDetail = openApprovalDetail;
    window.openApproveDialog = openApproveDialog;
    window.closeApproveDialog = closeApproveDialog;
    window.submitApprove = submitApprove;
    window.openRejectDialog = openRejectDialog;
    window.closeRejectDialog = closeRejectDialog;
    window.submitReject = submitReject;
    window.openSubmitForApprovalDialog = openSubmitForApprovalDialog;
    window.closeSubmitApprovalDialog = closeSubmitApprovalDialog;
    window.submitApprovalRequest = submitApprovalRequest;
    window.viewOrderFromApproval = viewOrderFromApproval;
}
