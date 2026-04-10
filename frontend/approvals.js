// frontend/approvals.js - Manager Approval Interface
// NOTE: approvalsState, loadApprovals, renderApprovalsTable, updateApprovalBadge
// are defined in app.js. This file only provides the detail panel + approve/reject logic.

var selectedApprovalId = null;

// DOM references for approval detail (scripts load after DOM)
var approvalDetailPanel = document.getElementById('approvalDetailPanel');
var approvalDetailBody = document.getElementById('approvalDetailBody');

// Close button listener
(function() {
    var btn = document.getElementById('btnCloseApprovalDetail');
    if (btn) {
        btn.addEventListener('click', function() {
            if (approvalDetailPanel) approvalDetailPanel.classList.add('hidden');
        });
    }
})();

// Open approval detail panel
async function openApprovalDetail(approvalId) {
    try {
        const res = await apiGet(`/approvals/${approvalId}`);
        if (!res.success) {
            alert('Failed to load approval details');
            return;
        }

        selectedApprovalId = approvalId;
        renderApprovalDetail(res.approval);
        approvalDetailPanel.classList.remove('hidden');
    } catch (err) {
        console.error('Error loading approval detail:', err);
        alert('Failed to load approval details');
    }
}

// Render approval detail
function renderApprovalDetail(approval) {
    const statusClass = `approval-status-${approval.status}`;
    const priorityClass = `priority-${(approval.priority || 'Normal').toLowerCase()}`;
    const isPending = approval.status === 'pending';

    let html = '';

    // Header section
    html += `<div class="approval-detail-header">`;
    html += `<h3>Approval Request #${approval.id}</h3>`;
    html += `<span class="approval-badge ${statusClass}">${capitalizeFirst(approval.status)}</span>`;
    html += `</div>`;

    // Main details
    html += `<div class="detail-grid">`;
    html += `<div><div class="detail-label">Order ID</div><div class="detail-value">#${approval.order_id}</div></div>`;
    html += `<div><div class="detail-label">Building</div><div class="detail-value">${approval.building}</div></div>`;
    html += `<div><div class="detail-label">Cost Center</div><div class="detail-value">${approval.cost_center_code ? `${approval.cost_center_code} — ${approval.cost_center_name}` : '-'}</div></div>`;
    html += `<div><div class="detail-label">Supplier</div><div class="detail-value">${approval.supplier_name || '-'}</div></div>`;
    html += `<div><div class="detail-label">Priority</div><div class="detail-value"><span class="priority-pill ${priorityClass}">${approval.priority || 'Normal'}</span></div></div>`;
    html += `<div><div class="detail-label">Estimated Cost</div><div class="detail-value">${approval.estimated_cost ? fmtPrice(approval.estimated_cost) : '-'}</div></div>`;
    html += `<div><div class="detail-label">Requested By</div><div class="detail-value">${approval.requested_by_name}</div></div>`;
    html += `<div><div class="detail-label">Requested At</div><div class="detail-value">${formatDateTime(approval.requested_at)}</div></div>`;
    html += `</div>`;

    // Item description
    html += `<div class="detail-section-title mt-2">Item Description</div>`;
    html += `<div class="text-muted mt-1">${escapeHtml(approval.item_description)}</div>`;

    if (approval.part_number) {
        html += `<div class="detail-grid mt-1">`;
        html += `<div><div class="detail-label">Part Number</div><div class="detail-value">${escapeHtml(approval.part_number)}</div></div>`;
        html += `<div><div class="detail-label">Quantity</div><div class="detail-value">${approval.quantity}</div></div>`;
        html += `</div>`;
    }

    // Order notes
    if (approval.order_notes) {
        html += `<div class="detail-section-title mt-2">Order Notes</div>`;
        html += `<div class="text-muted mt-1">${escapeHtml(approval.order_notes)}</div>`;
    }

    // Request comments
    if (approval.comments) {
        html += `<div class="detail-section-title mt-2">Request Comments</div>`;
        html += `<div class="text-muted mt-1">${escapeHtml(approval.comments)}</div>`;
    }

    // Quote document
    if (approval.quote_document_id) {
        html += `<div class="detail-section-title mt-2">Quote Document</div>`;
        const quotePath = approval.quote_file_path.replace('./', '/');
        html += `<div class="mt-1"><a class="file-link" href="${quotePath}" target="_blank" rel="noopener">📄 ${escapeHtml(approval.quote_file_name)}</a></div>`;
    }

    // Approval decision (if decided)
    if (approval.status !== 'pending') {
        html += `<div class="detail-section-title mt-2">Decision</div>`;
        html += `<div class="detail-grid">`;
        html += `<div><div class="detail-label">Decision By</div><div class="detail-value">${approval.approved_by_name || '-'}</div></div>`;
        html += `<div><div class="detail-label">Decision At</div><div class="detail-value">${formatDateTime(approval.approved_at)}</div></div>`;
        html += `</div>`;

        if (approval.rejection_reason) {
            html += `<div class="mt-1"><strong>Rejection Reason:</strong><br><span class="text-muted">${escapeHtml(approval.rejection_reason)}</span></div>`;
        }
    }

    // History
    if (approval.history && approval.history.length > 0) {
        html += `<div class="detail-section-title mt-2">History</div>`;
        html += `<div class="text-muted" style="max-height: 120px; overflow-y: auto; font-size: 0.78rem;">`;
        for (const h of approval.history) {
            html += `<div>[${formatDateTime(h.performed_at)}] <strong>${escapeHtml(h.performed_by_name || 'System')}</strong> ${h.action} — ${escapeHtml(h.comments || '')}</div>`;
        }
        html += `</div>`;
    }

    // Action buttons (only if pending and user is manager/admin)
    if (isPending && currentUser && (currentUser.role === 'manager' || currentUser.role === 'admin')) {
        html += `<hr class="mt-2" style="border-color: rgba(31,41,55,0.9); margin-bottom: 0.6rem;">`;
        html += `<div class="detail-section-title">Your Decision</div>`;
        html += `<div class="form-group mt-1">`;
        html += `<label>Comments / Rejection Reason</label>`;
        html += `<textarea id="approvalDecisionComments" class="form-control form-control-sm" rows="3" placeholder="Add your comments or rejection reason (required for rejection)"></textarea>`;
        html += `</div>`;
        html += `<div class="form-actions" style="display: flex; gap: 0.5rem;">`;
        html += `<button id="btnApproveRequest" class="btn btn-success btn-sm">✓ Approve</button>`;
        html += `<button id="btnRejectRequest" class="btn btn-danger btn-sm">✗ Reject</button>`;
        html += `</div>`;
    }

    approvalDetailBody.innerHTML = html;

    // Attach action button listeners
    const btnApprove = document.getElementById('btnApproveRequest');
    const btnReject = document.getElementById('btnRejectRequest');

    if (btnApprove) {
        btnApprove.addEventListener('click', () => handleApprove(approval.id));
    }

    if (btnReject) {
        btnReject.addEventListener('click', () => handleReject(approval.id));
    }
}

// Handle approve action
async function handleApprove(approvalId) {
    const comments = document.getElementById('approvalDecisionComments').value.trim();

    if (!confirm('Are you sure you want to APPROVE this request?')) {
        return;
    }

    try {
        const res = await apiPut(`/approvals/${approvalId}/approve`, { comments });

        if (res.success) {
            alert('✓ Approval granted successfully!');
            approvalDetailPanel.classList.add('hidden');
            loadApprovals(); // Reload list
            if (typeof loadOrders === 'function') {
                loadOrders(); // Refresh orders if on that tab
            }
        } else {
            alert('Failed to approve: ' + (res.message || 'Unknown error'));
        }
    } catch (err) {
        console.error('Error approving:', err);
        alert('Failed to approve request');
    }
}

// Handle reject action
async function handleReject(approvalId) {
    const rejectionReason = document.getElementById('approvalDecisionComments').value.trim();

    if (!rejectionReason) {
        alert('Please provide a rejection reason');
        return;
    }

    if (!confirm('Are you sure you want to REJECT this request?\n\nThis will put the order on hold.')) {
        return;
    }

    try {
        const res = await apiPut(`/approvals/${approvalId}/reject`, { rejection_reason: rejectionReason });

        if (res.success) {
            alert('✗ Request rejected');
            approvalDetailPanel.classList.add('hidden');
            loadApprovals(); // Reload list
            if (typeof loadOrders === 'function') {
                loadOrders(); // Refresh orders if on that tab
            }
        } else {
            alert('Failed to reject: ' + (res.message || 'Unknown error'));
        }
    } catch (err) {
        console.error('Error rejecting:', err);
        alert('Failed to reject request');
    }
}

// Helper: Capitalize first letter
function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// No separate init needed - event listeners for approval filters
// are already set up in app.js setupApprovalFilters IIFE
