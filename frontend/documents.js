// frontend/documents.js
// Phase 1: Document Management System

// ===================== DOCUMENT MANAGEMENT =====================

let currentOrderDocuments = [];

async function loadOrderDocuments(orderId) {
    try {
        const res = await apiGet(`/documents/order/${orderId}`);
        if (res.success) {
            currentOrderDocuments = res.documents;
            renderDocumentsSection(orderId);
        }
    } catch (err) {
        console.error('Load documents error:', err);
    }
}

function renderDocumentsSection(orderId) {
    const documentsSection = document.getElementById('documentsSection');
    if (!documentsSection) return;

    let html = '<div class="documents-container">';
    
    // Document upload form
    html += `
        <div class="document-upload-card">
            <h4 style="margin: 0 0 0.8rem 0; font-size: 0.95rem; color: #e2e8f0;">Upload Document</h4>
            <form id="documentUploadForm" enctype="multipart/form-data">
                <div class="form-group">
                    <label>Document Type</label>
                    <select id="docType" class="form-control form-control-sm" required>
                        <option value="">Select type...</option>
                        <option value="quote_request">Quote Request</option>
                        <option value="quote_pdf">Quote PDF</option>
                        <option value="proforma_invoice">Proforma Invoice</option>
                        <option value="purchase_order">Purchase Order</option>
                        <option value="invoice">Invoice</option>
                        <option value="delivery_note">Delivery Note</option>
                        <option value="signed_delivery_note">Signed Delivery Note</option>
                        <option value="packing_list">Packing List</option>
                        <option value="customs_declaration">Customs Declaration</option>
                        <option value="intrastat_declaration">Intrastat Declaration</option>
                        <option value="other">Other</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>File (PDF, Word, Excel, Images - Max 50MB)</label>
                    <input type="file" id="docFile" class="form-control form-control-sm" 
                           accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif" required>
                    <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.3rem;">
                        Accepted: PDF, Word, Excel, JPG, PNG (max 50MB)
                    </div>
                </div>
                <div class="form-group">
                    <label>Notes (optional)</label>
                    <textarea id="docNotes" class="form-control form-control-sm" rows="2" 
                              placeholder="Additional notes about this document..."></textarea>
                </div>
                <div class="form-group" style="display: flex; align-items: center; gap: 0.5rem;">
                    <input type="checkbox" id="docRequiresAction" style="width: auto;">
                    <label for="docRequiresAction" style="margin: 0; cursor: pointer;">Requires action/follow-up</label>
                </div>
                <div class="form-group" id="actionDetailsGroup" style="display: none;">
                    <label>Action Deadline</label>
                    <input type="date" id="docActionDeadline" class="form-control form-control-sm date-picker">
                    <label style="margin-top: 0.5rem;">Action Notes</label>
                    <textarea id="docActionNotes" class="form-control form-control-sm" rows="2" 
                              placeholder="What action is required?"></textarea>
                </div>
                <button type="submit" class="btn btn-primary btn-sm" style="width: 100%;">
                    📤 Upload Document
                </button>
            </form>
        </div>
    `;

    // Document checklist
    html += `
        <div class="document-checklist">
            <h4 style="margin: 0 0 0.8rem 0; font-size: 0.95rem; color: #e2e8f0;">Document Checklist</h4>
            ${renderDocumentChecklist()}
        </div>
    `;

    // Documents list
    if (currentOrderDocuments.length > 0) {
        html += '<div class="documents-list">';
        html += '<h4 style="margin: 0 0 0.8rem 0; font-size: 0.95rem; color: #e2e8f0;">Uploaded Documents</h4>';
        
        for (const doc of currentOrderDocuments) {
            const statusBadge = getDocumentStatusBadge(doc.status);
            const requiresActionBadge = doc.requires_action ? '⚠️ <span style="color: #fbbf24;">Action Required</span>' : '';
            const isOverdue = doc.action_deadline && new Date(doc.action_deadline) < new Date();
            
            html += `
                <div class="document-item ${doc.requires_action && isOverdue ? 'document-overdue' : ''}">
                    <div class="document-header">
                        <div class="document-info">
                            <span class="document-type">${formatDocumentType(doc.document_type)}</span>
                            ${statusBadge}
                            ${requiresActionBadge}
                        </div>
                        <div class="document-actions">
                            <a href="/${doc.file_path}" target="_blank" class="btn btn-secondary btn-sm">📄 View</a>
                            <button class="btn btn-secondary btn-sm" onclick="deleteDocument(${doc.id})">🗑️</button>
                        </div>
                    </div>
                    <div class="document-details">
                        <div><strong>File:</strong> ${escapeHtml(doc.file_name)}</div>
                        <div><strong>Uploaded:</strong> ${formatDateTime(doc.uploaded_at)} by ${doc.uploaded_by_name}</div>
                        ${doc.notes ? `<div><strong>Notes:</strong> ${escapeHtml(doc.notes)}</div>` : ''}
                        ${doc.action_deadline ? `<div><strong>Action Deadline:</strong> ${formatDate(doc.action_deadline)}</div>` : ''}
                        ${doc.action_notes ? `<div><strong>Action:</strong> ${escapeHtml(doc.action_notes)}</div>` : ''}
                    </div>
                    ${doc.requires_action ? `
                        <div class="document-status-update">
                            <button class="btn btn-primary btn-sm" onclick="markDocumentProcessed(${doc.id})">✓ Mark as Processed</button>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        html += '</div>';
    } else {
        html += '<div class="text-muted" style="text-align: center; padding: 1.5rem; border: 1px dashed rgba(148,163,184,0.3); border-radius: 8px; margin-top: 1rem;">📋 No documents uploaded yet</div>';
    }

    html += '</div>';
    documentsSection.innerHTML = html;

    // Attach event listeners
    const uploadForm = document.getElementById('documentUploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', (e) => handleDocumentUpload(e, orderId));
    }

    const requiresActionCheckbox = document.getElementById('docRequiresAction');
    const actionDetailsGroup = document.getElementById('actionDetailsGroup');
    if (requiresActionCheckbox && actionDetailsGroup) {
        requiresActionCheckbox.addEventListener('change', () => {
            actionDetailsGroup.style.display = requiresActionCheckbox.checked ? 'block' : 'none';
        });
    }
}

function renderDocumentChecklist() {
    const requiredDocs = [
        { type: 'quote_pdf', label: 'Quote PDF', icon: '📄' },
        { type: 'proforma_invoice', label: 'Proforma Invoice', icon: '📋' },
        { type: 'invoice', label: 'Invoice', icon: '💰' },
        { type: 'delivery_note', label: 'Delivery Note', icon: '📦' },
        { type: 'signed_delivery_note', label: 'Signed Delivery Note', icon: '✍️' }
    ];

    let html = '<div class="checklist-grid">';
    
    for (const req of requiredDocs) {
        const hasDoc = currentOrderDocuments.some(d => d.document_type === req.type);
        const icon = hasDoc ? '✅' : '☐';
        const className = hasDoc ? 'checklist-item-complete' : 'checklist-item-pending';
        
        html += `
            <div class="checklist-item ${className}">
                <span class="checklist-icon">${icon}</span>
                <span class="checklist-label">${req.icon} ${req.label}</span>
            </div>
        `;
    }
    
    html += '</div>';
    return html;
}

function formatDocumentType(type) {
    const types = {
        'quote_request': '📨 Quote Request',
        'quote_pdf': '📄 Quote PDF',
        'proforma_invoice': '📋 Proforma Invoice',
        'purchase_order': '📝 Purchase Order',
        'invoice': '💰 Invoice',
        'delivery_note': '📦 Delivery Note',
        'signed_delivery_note': '✍️ Signed Delivery Note',
        'packing_list': '📦 Packing List',
        'customs_declaration': '🛃 Customs Declaration',
        'intrastat_declaration': '🇪🇺 Intrastat Declaration',
        'other': '📎 Other'
    };
    return types[type] || type;
}

function getDocumentStatusBadge(status) {
    const badges = {
        'pending': '<span class="doc-status-badge doc-status-pending">Pending</span>',
        'processed': '<span class="doc-status-badge doc-status-processed">Processed</span>',
        'sent_to_accounting': '<span class="doc-status-badge doc-status-accounting">Sent to Accounting</span>',
        'archived': '<span class="doc-status-badge doc-status-archived">Archived</span>'
    };
    return badges[status] || '';
}

async function handleDocumentUpload(e, orderId) {
    e.preventDefault();

    const fileInput = document.getElementById('docFile');
    const typeInput = document.getElementById('docType');
    const notesInput = document.getElementById('docNotes');
    const requiresActionInput = document.getElementById('docRequiresAction');
    const actionDeadlineInput = document.getElementById('docActionDeadline');
    const actionNotesInput = document.getElementById('docActionNotes');

    if (!fileInput.files[0]) {
        alert('Please select a file');
        return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('document_type', typeInput.value);
    formData.append('notes', notesInput.value);
    formData.append('requires_action', requiresActionInput.checked);
    if (requiresActionInput.checked) {
        formData.append('action_deadline', actionDeadlineInput.value);
        formData.append('action_notes', actionNotesInput.value);
    }

    try {
        const response = await fetch(`${API_BASE}/documents/order/${orderId}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            alert('✅ Document uploaded successfully!');
            loadOrderDocuments(orderId);
            document.getElementById('documentUploadForm').reset();
            document.getElementById('actionDetailsGroup').style.display = 'none';
        } else {
            alert('Failed to upload document: ' + (result.message || 'Unknown error'));
        }
    } catch (err) {
        console.error('Upload error:', err);
        alert('Failed to upload document. Please try again.');
    }
}

async function deleteDocument(documentId) {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
        const res = await apiDelete(`/documents/${documentId}`);
        if (res.success) {
            alert('Document deleted');
            const orderId = currentOrderDocuments.find(d => d.id === documentId)?.order_id;
            if (orderId) loadOrderDocuments(orderId);
        } else {
            alert('Failed to delete document: ' + (res.message || 'Unknown error'));
        }
    } catch (err) {
        console.error('Delete error:', err);
        alert('Failed to delete document');
    }
}

async function markDocumentProcessed(documentId) {
    try {
        const res = await apiPut(`/documents/${documentId}`, { status: 'processed' });
        if (res.success) {
            alert('✅ Document marked as processed');
            const orderId = currentOrderDocuments.find(d => d.id === documentId)?.order_id;
            if (orderId) loadOrderDocuments(orderId);
        } else {
            alert('Failed to update document');
        }
    } catch (err) {
        console.error('Update error:', err);
        alert('Failed to update document');
    }
}

// ===================== EMAIL GENERATION =====================

async function generateQuoteRequestEmail() {
    if (!selectedOrderIds.size) {
        alert('Please select orders first');
        return;
    }

    try {
        const res = await apiPost('/documents/generate-quote-email', {
            orderIds: Array.from(selectedOrderIds)
        });

        if (res.success) {
            showEmailGenerationDialog(res.emailData);
        } else {
            alert('Failed to generate email: ' + (res.message || 'Unknown error'));
        }
    } catch (err) {
        console.error('Email generation error:', err);
        alert('Failed to generate email');
    }
}

function showEmailGenerationDialog(emailData) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.9);display:flex;align-items:center;justify-content:center;z-index:100;overflow-y:auto;padding:2rem;';
    
    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#020617;padding:1.5rem;border-radius:12px;border:1px solid rgba(148,163,184,0.5);max-width:800px;width:100%;color:white;max-height:90vh;overflow-y:auto;';
    
    dialog.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3 style="margin: 0; color: #e2e8f0;">📧 Quote Request Email</h3>
            <button id="closeEmailDialog" class="btn btn-secondary btn-sm">✕ Close</button>
        </div>

        <div style="margin-bottom: 1rem; padding: 0.8rem; background: rgba(59,130,246,0.1); border-radius: 8px; border: 1px solid rgba(59,130,246,0.3);">
            <div style="font-size: 0.85rem; color: #94a3b8;">Supplier</div>
            <div style="font-weight: 600; color: #e2e8f0;">${escapeHtml(emailData.supplierName)}</div>
            <div style="font-size: 0.85rem; color: #94a3b8; margin-top: 0.3rem;">To: ${escapeHtml(emailData.to)}</div>
        </div>

        <div style="margin-bottom: 1rem;">
            <label style="display: block; font-size: 0.85rem; color: #94a3b8; margin-bottom: 0.4rem;">Subject</label>
            <input type="text" id="emailSubject" value="${escapeHtml(emailData.subject)}" 
                   style="width: 100%; padding: 0.6rem; background: rgba(15,23,42,0.5); border: 1px solid rgba(148,163,184,0.3); border-radius: 6px; color: white; font-size: 0.9rem;" readonly>
        </div>

        <div style="margin-bottom: 1.5rem;">
            <label style="display: block; font-size: 0.85rem; color: #94a3b8; margin-bottom: 0.4rem;">Email Body</label>
            <textarea id="emailBody" rows="15" 
                      style="width: 100%; padding: 0.8rem; background: rgba(15,23,42,0.5); border: 1px solid rgba(148,163,184,0.3); border-radius: 6px; color: white; font-family: 'Courier New', monospace; font-size: 0.85rem; line-height: 1.5;" readonly>${escapeHtml(emailData.body)}</textarea>
        </div>

        <div style="display: flex; gap: 0.8rem; flex-wrap: wrap;">
            <button id="copyEmailBtn" class="btn btn-primary" style="flex: 1; min-width: 200px;">
                📋 Copy to Clipboard
            </button>
            <button id="openOutlookBtn" class="btn btn-success" style="flex: 1; min-width: 200px;">
                📧 Open in Outlook
            </button>
        </div>

        <div id="copyFeedback" style="margin-top: 1rem; padding: 0.8rem; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); border-radius: 6px; color: #4ade80; display: none;">
            ✅ Email text copied to clipboard!
        </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Close button
    document.getElementById('closeEmailDialog').onclick = () => {
        document.body.removeChild(overlay);
    };

    // Copy to clipboard
    document.getElementById('copyEmailBtn').onclick = () => {
        const subject = document.getElementById('emailSubject').value;
        const body = document.getElementById('emailBody').value;
        const fullText = `Subject: ${subject}\n\n${body}`;
        
        navigator.clipboard.writeText(fullText).then(() => {
            document.getElementById('copyFeedback').style.display = 'block';
            setTimeout(() => {
                document.getElementById('copyFeedback').style.display = 'none';
            }, 3000);
        }).catch(err => {
            console.error('Copy failed:', err);
            alert('Failed to copy to clipboard');
        });
    };

    // Open in Outlook
    document.getElementById('openOutlookBtn').onclick = () => {
        window.location.href = emailData.mailtoLink;
    };

    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
        }
    };
}

// Add button to order actions bar
function addEmailGenerationButton() {
    const actionsBar = document.getElementById('orderActionsBar');
    if (!actionsBar) return;

    const existingBtn = document.getElementById('btnGenerateEmail');
    if (existingBtn) return; // Already added

    const btn = document.createElement('button');
    btn.id = 'btnGenerateEmail';
    btn.className = 'btn btn-success btn-sm';
    btn.innerHTML = '📧 Generate Quote Email';
    btn.onclick = generateQuoteRequestEmail;

    // Insert after the Create Quote button
    const createQuoteBtn = document.getElementById('btnCreateQuote');
    if (createQuoteBtn && createQuoteBtn.parentNode) {
        createQuoteBtn.parentNode.insertBefore(btn, createQuoteBtn.nextSibling);
    } else {
        actionsBar.appendChild(btn);
    }
}

// Initialize when dashboard loads
if (typeof showDashboard !== 'undefined') {
    const originalShowDashboard = showDashboard;
    showDashboard = function() {
        originalShowDashboard();
        if (currentUser && currentUser.role !== 'requester') {
            setTimeout(addEmailGenerationButton, 100);
        }
    };
}
