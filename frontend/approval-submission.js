// frontend/approval-submission.js - Submit Quotes for Manager Approval

// ===================== APPROVAL SUBMISSION SYSTEM =====================

/**
 * Opens the "Submit for Approval" dialog for a quote
 * @param {number} quoteId - The quote ID to submit for approval
 */
async function openSubmitForApprovalDialog(quoteId) {
    try {
        // Load managers list, quote data, and responses in parallel
        const [managersRes, quoteRes, responsesRes] = await Promise.all([
            apiGet('/users'),
            apiGet(`/quotes/${quoteId}`),
            apiGet(`/procurement/quotes/${quoteId}/responses`).catch(() => ({ success: false, responses: [] }))
        ]);

        if (!managersRes.success) {
            alert('Failed to load managers list');
            return;
        }

        // Filter only managers
        const managers = managersRes.users.filter(u => u.role === 'manager' && u.active);
        
        if (managers.length === 0) {
            alert('No active managers found. Please create a manager user first.');
            return;
        }

        if (!quoteRes.success) {
            alert('Failed to load quote details');
            return;
        }

        const quote = quoteRes.quote;
        // Collect PDF document IDs from responses
        const responses = (responsesRes.success ? responsesRes.responses : []) || [];
        const pdfDocIds = responses
            .filter(r => r.response_document_id)
            .map(r => ({ docId: r.response_document_id, label: r.item_description || 'All items', status: r.status }));

        // Build the approval submission form
        showApprovalSubmissionDialog(quoteId, quote, managers, pdfDocIds);
    } catch (err) {
        console.error('openSubmitForApprovalDialog error:', err);
        alert('Failed to open approval submission dialog');
    }
}

/**
 * Shows the approval submission dialog with form
 * @param {number} quoteId
 * @param {Object} quote
 * @param {Array} managers
 * @param {Array} pdfDocIds - array of { docId, label, status } for response PDFs
 */
function showApprovalSubmissionDialog(quoteId, quote, managers, pdfDocIds) {
    pdfDocIds = pdfDocIds || [];
    const overlay = document.createElement('div');
    overlay.id = 'approvalSubmissionOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);display:flex;align-items:center;justify-content:center;z-index:100;';
    
    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#020617;padding:1.5rem;border-radius:12px;border:1px solid rgba(148,163,184,0.5);min-width:480px;max-width:620px;max-height:90vh;overflow-y:auto;color:white;';

    // Build PDF section
    const pdfSection = pdfDocIds.length > 0 ? `
        <div style="background:#0f172a;padding:0.75rem;border-radius:6px;margin-bottom:1rem;border-left:3px solid #06b6d4;">
            <div style="font-size:0.8rem;color:#06b6d4;font-weight:600;margin-bottom:0.5rem;">📄 Supplier Quote PDF Attachments</div>
            <div style="font-size:0.8rem;color:#94a3b8;margin-bottom:0.5rem;">These PDFs will be visible to the manager in the approval request:</div>
            ${pdfDocIds.map(p => `
                <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.35rem;">
                    <a href="/api/documents/${p.docId}/download" target="_blank"
                        style="color:#06b6d4;font-size:0.8rem;text-decoration:none;background:rgba(6,182,212,0.1);padding:0.2rem 0.6rem;border-radius:4px;border:1px solid rgba(6,182,212,0.3);"
                        title="Open PDF">
                        📄 PDF — ${escapeHtml(p.label)}
                    </a>
                    <span style="font-size:0.75rem;color:#64748b;">(status: ${escapeHtml(p.status || '')})</span>
                </div>`).join('')}
        </div>` : '';
    
    let html = `
        <div style="margin-bottom:1rem;">
            <h3 style="margin:0 0 0.5rem 0;font-size:1.1rem;font-weight:600;">Submit Quote for Approval</h3>
            <div style="color:#94a3b8;font-size:0.85rem;">Quote ${quote.quote_number} • ${fmtPrice(quote.total_amount)} ${quote.currency}</div>
        </div>

        <div style="margin-bottom:1rem;">
            <label style="display:block;margin-bottom:0.3rem;font-size:0.85rem;font-weight:500;">Select Manager *</label>
            <select id="approvalManagerSelect" class="form-control form-control-sm" required style="width:100%;">
                <option value="">-- Select Manager --</option>
                ${managers.map(m => `<option value="${m.id}">${escapeHtml(m.name)} (${escapeHtml(m.email || m.username)})</option>`).join('')}
            </select>
        </div>

        <div style="margin-bottom:1rem;">
            <label style="display:block;margin-bottom:0.3rem;font-size:0.85rem;font-weight:500;">Priority *</label>
            <select id="approvalPrioritySelect" class="form-control form-control-sm" required style="width:100%;">
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
                <option value="Low">Low</option>
            </select>
        </div>

        <div style="margin-bottom:1rem;">
            <label style="display:block;margin-bottom:0.3rem;font-size:0.85rem;font-weight:500;">Comments (optional)</label>
            <textarea id="approvalCommentsInput" class="form-control form-control-sm" rows="3" 
                placeholder="Add any comments or notes for the manager..." 
                style="width:100%;resize:vertical;"></textarea>
        </div>

        <div style="background:#0f172a;padding:0.75rem;border-radius:6px;margin-bottom:1rem;">
            <div style="font-size:0.8rem;color:#94a3b8;margin-bottom:0.4rem;">Quote Summary:</div>
            <div style="font-size:0.85rem;">
                <div>Supplier: <strong>${escapeHtml(quote.supplier_name || 'N/A')}</strong></div>
                <div>Items: <strong>${quote.item_count || 0}</strong></div>
                <div>Total: <strong>${fmtPrice(quote.total_amount)} ${quote.currency}</strong></div>
                <div>Valid Until: <strong>${quote.valid_until ? formatDate(quote.valid_until) : 'N/A'}</strong></div>
            </div>
        </div>

        ${pdfSection}

        <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
            <button id="btnCancelApprovalSubmission" class="btn btn-secondary btn-sm">Cancel</button>
            <button id="btnConfirmApprovalSubmission" class="btn btn-primary btn-sm">Submit for Approval</button>
        </div>
    `;
    
    dialog.innerHTML = html;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Event listeners
    document.getElementById('btnCancelApprovalSubmission').addEventListener('click', () => {
        document.body.removeChild(overlay);
    });

    document.getElementById('btnConfirmApprovalSubmission').addEventListener('click', async () => {
        await handleApprovalSubmission(quoteId, overlay);
    });
}

/**
 * Handles the actual approval submission
 */
async function handleApprovalSubmission(quoteId, overlay) {
    const managerId = document.getElementById('approvalManagerSelect').value;
    const priority = document.getElementById('approvalPrioritySelect').value;
    const comments = document.getElementById('approvalCommentsInput').value.trim();

    if (!managerId) { alert('Please select a manager'); return; }
    if (!priority) { alert('Please select a priority'); return; }

    const btnSubmit = document.getElementById('btnConfirmApprovalSubmission');
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Submitting...';

    try {
        // Fetch all order IDs linked to this quote
        const quoteRes = await apiGet(`/quotes/${quoteId}`);
        if (!quoteRes.success || !quoteRes.quote) throw new Error('Could not load quote details');

        const quote = quoteRes.quote;
        const items = quoteRes.items || quoteRes.quote.items || [];

        // Extract unique order IDs from quote items
        let orderIds = [];
        if (items.length > 0) {
            orderIds = [...new Set(items.map(i => i.order_id).filter(Boolean))];
        }

        // Fallback: if quote has a single order_id field
        if (!orderIds.length && quote.order_id) orderIds = [quote.order_id];

        if (!orderIds.length) {
            alert('No orders found linked to this quote. Cannot submit for approval.');
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Submit for Approval';
            return;
        }

        // Submit one approval per order
        let successCount = 0;
        const errors = [];
        for (const orderId of orderIds) {
            const payload = {
                order_id: orderId,
                assigned_to: parseInt(managerId, 10),
                supplier_id: quote.supplier_id || null,
                estimated_cost: quote.total_amount ? parseFloat(quote.total_amount) / orderIds.length : null,
                priority: priority,
                comments: comments || null
            };
            const res = await apiPost('/approvals', payload);
            if (res.success) {
                successCount++;
            } else {
                errors.push(`Order #${orderId}: ${res.message || 'failed'}`);
            }
        }

        // Update quote status to Under Approval
        await apiPut(`/quotes/${quoteId}`, { status: 'Under Approval' });

        document.body.removeChild(overlay);

        if (errors.length === 0) {
            showToast(`Approval submitted for ${successCount} order(s)`, 'success');
        } else {
            alert('Submitted ' + successCount + '/' + orderIds.length + ' approvals.\nErrors:\n' + errors.join('\n'));
        }

        await loadQuotes();
        if (typeof quoteDetailPanel !== 'undefined' && !quoteDetailPanel.classList.contains('hidden')) {
            openQuoteDetail(quoteId);
        }

    } catch (err) {
        console.error('handleApprovalSubmission error:', err);
        alert('Failed to submit approval request: ' + err.message);
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Submit for Approval';
    }
}

/**
 * Enhanced renderQuoteDetail to include "Submit for Approval" button
 * This function should be called from app.js or integrated there
 */
function addSubmitForApprovalButton(quoteDetailBody, quote) {
    // Only show submit button for admin/procurement users
    if (currentUser.role !== 'admin' && currentUser.role !== 'procurement') {
        return;
    }

    // Only show if quote is in appropriate status
    const eligibleStatuses = ['Draft', 'Received'];
    if (!eligibleStatuses.includes(quote.status)) {
        return;
    }

    // Add submit for approval button before the update section
    const submitSection = document.createElement('div');
    submitSection.style.cssText = 'margin-top:1rem;padding-top:1rem;border-top:1px solid rgba(148,163,184,0.2);';
    
    submitSection.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
            <div>
                <div class="detail-section-title" style="margin:0;">Approval Workflow</div>
                <div style="font-size:0.75rem;color:#94a3b8;margin-top:0.2rem;">Submit this quote to a manager for approval</div>
            </div>
            <button id="btnSubmitForApproval" class="btn btn-primary btn-sm" style="white-space:nowrap;">
                📋 Submit for Approval
            </button>
        </div>
    `;

    // Insert before the "Update Quote" section
    const updateSection = quoteDetailBody.querySelector('.detail-section-title');
    if (updateSection && updateSection.textContent.includes('Update Quote')) {
        updateSection.parentElement.insertBefore(submitSection, updateSection);
    } else {
        quoteDetailBody.appendChild(submitSection);
    }

    // Attach event listener
    document.getElementById('btnSubmitForApproval').addEventListener('click', () => {
        openSubmitForApprovalDialog(quote.id);
    });
}

console.log('✅ Approval submission module loaded');
