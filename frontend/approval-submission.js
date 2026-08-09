// frontend/approval-submission.js - Submit Quotes for Manager Approval

// ===================== APPROVAL SUBMISSION SYSTEM =====================

/**
 * Opens the "Submit for Approval" dialog for a quote
 * @param {number} quoteId - The quote ID to submit for approval
 */
async function openSubmitForApprovalDialog(quoteId) {
    try {
        // Load managers list
        const managersRes = await apiGet('/users');
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

        // Get the current quote data
        const quoteRes = await apiGet(`/quotes/${quoteId}`);
        if (!quoteRes.success) {
            alert('Failed to load quote details');
            return;
        }

        const quote = quoteRes.quote;

        // Build the approval submission form
        showApprovalSubmissionDialog(quoteId, quote, managers);
    } catch (err) {
        console.error('openSubmitForApprovalDialog error:', err);
        alert('Failed to open approval submission dialog');
    }
}

/**
 * Shows the approval submission dialog with form
 */
function showApprovalSubmissionDialog(quoteId, quote, managers) {
    const overlay = document.createElement('div');
    overlay.id = 'approvalSubmissionOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);display:flex;align-items:center;justify-content:center;z-index:100;';
    
    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#020617;padding:1.5rem;border-radius:12px;border:1px solid rgba(148,163,184,0.5);min-width:480px;max-width:600px;color:white;';
    
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

    // Validation
    if (!managerId) {
        alert('Please select a manager');
        return;
    }

    if (!priority) {
        alert('Please select a priority');
        return;
    }

    // Disable button to prevent double submission
    const btnSubmit = document.getElementById('btnConfirmApprovalSubmission');
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Submitting...';

    try {
        // Fetch quote items to get the order_ids (backend requires order_id, not quote_id)
        const quoteRes = await apiGet(`/quotes/${quoteId}`);
        const quoteItems = (quoteRes.success && quoteRes.quote && quoteRes.quote.items)
            ? quoteRes.quote.items
            : [];

        // Collect unique order IDs from quote items
        let orderIds = [...new Set(quoteItems.map(i => i.order_id).filter(Boolean))];

        // Fallback: if no items, try fetching quote items separately
        if (!orderIds.length) {
            try {
                const itemsRes = await apiGet(`/quotes/${quoteId}/items`);
                if (itemsRes.success && itemsRes.items) {
                    orderIds = [...new Set(itemsRes.items.map(i => i.order_id).filter(Boolean))];
                }
            } catch (_) { /* ignore */ }
        }

        // If still no order IDs, submit a single approval with quote_id as fallback
        // (ensures backward compatibility if quote has no items yet)
        const payloads = orderIds.length
            ? orderIds.map(order_id => ({
                order_id,
                quote_id: quoteId,
                manager_id: parseInt(managerId, 10),
                priority,
                comments: comments || null
            }))
            : [{
                order_id: null,
                quote_id: quoteId,
                manager_id: parseInt(managerId, 10),
                priority,
                comments: comments || null
            }];

        // Submit one approval per order_id
        const results = await Promise.all(payloads.map(p => apiPost('/approvals', p).catch(e => ({ success: false, message: e.message }))));
        const failed = results.filter(r => !r.success);
        const succeeded = results.filter(r => r.success);

        if (succeeded.length > 0) {
            // Close dialog
            document.body.removeChild(overlay);

            const approvalInfo = succeeded[0].approval
                ? `\n\nApproval ID: ${succeeded[0].approval.id}\nManager: ${succeeded[0].approval.manager_name}`
                : '';
            alert(`Approval request submitted successfully! (${succeeded.length} order(s) submitted)${approvalInfo}${failed.length ? `\n\nWarning: ${failed.length} failed.` : ''}`);

            // Reload quotes to update status
            await loadQuotes();

            // Update the quote status to "Under Approval"
            await apiPut(`/quotes/${quoteId}`, { status: 'Under Approval' });
            await loadQuotes();

            // If quote detail panel is open, refresh it
            if (typeof quoteDetailPanel !== 'undefined' && !quoteDetailPanel.classList.contains('hidden')) {
                openQuoteDetail(quoteId);
            }
        } else {
            const errMsg = failed.map(r => r.message || 'Unknown error').join('; ');
            alert('Failed to submit approval request: ' + errMsg);
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Submit for Approval';
        }
    } catch (err) {
        console.error('handleApprovalSubmission error:', err);
        alert('Failed to submit approval request. Please try again.');
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
