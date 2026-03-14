// frontend/procurement-workspace.js
// PartPulse Orders v3.0 — Procurement Workspace
// Unified lifecycle: Quote → Supplier Response → Approval → PO → Invoice → Accounting
// Pure Vanilla JS — no frameworks

'use strict';

// ============================================================
// MODULE STATE
// ============================================================
const PW = {
    currentQuoteId: null,
    currentLifecycle: null,
    wizardState: {
        step: 1,
        selectedOrderIds: [],
        orders: [],
        selectedSupplierId: null,
        selectedSupplierName: '',
        currency: 'EUR',
        validUntil: '',
        notes: '',
        aiSuggestions: []
    },
    panelOpen: false
};

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

/**
 * showToast — displays a dismissible toast at bottom-right
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} type
 */
function showToast(message, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        info: '#06b6d4',
        warning: '#f59e0b'
    };
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.style.borderLeftColor = colors[type] || colors.success;
    toast.innerHTML = `<span class="toast-icon" style="color:${colors[type]}">${icons[type] || '✓'}</span><span class="toast-msg">${escHtml(message)}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.classList.add('toast-hiding');
        setTimeout(() => toast.remove(), 350);
    }, 3500);
}

// ============================================================
// HTML ESCAPE UTILITY
// ============================================================
function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================================
// API HELPERS
// ============================================================
function pwApiGet(path) {
    const token = localStorage.getItem('authToken') || (typeof authToken !== 'undefined' ? authToken : '');
    return fetch('/api' + path, {
        headers: { 'Authorization': 'Bearer ' + token }
    }).then(r => r.json());
}

function pwApiPost(path, body) {
    const token = localStorage.getItem('authToken') || (typeof authToken !== 'undefined' ? authToken : '');
    return fetch('/api' + path, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    }).then(r => r.json());
}

function pwApiPut(path, body) {
    const token = localStorage.getItem('authToken') || (typeof authToken !== 'undefined' ? authToken : '');
    return fetch('/api' + path, {
        method: 'PUT',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    }).then(r => r.json());
}

function pwApiDelete(path) {
    const token = localStorage.getItem('authToken') || (typeof authToken !== 'undefined' ? authToken : '');
    return fetch('/api' + path, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    }).then(r => r.json());
}

/**
 * Upload a file as a quote PDF document.
 * Uses the procurement quote PDF upload endpoint.
 * @param {File} file - the PDF file to upload
 * @param {number} quoteId - quote ID
 * @param {Array} orderIds - order IDs to link the document to
 * Returns { success, documentId }
 */
async function pwApiUploadQuotePDF(file, quoteId, orderIds) {
    const token = localStorage.getItem('authToken') || (typeof authToken !== 'undefined' ? authToken : '');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('description', 'Supplier Quote PDF — Quote #' + quoteId);
    fd.append('documentType', 'quote_pdf');
    // The documents/upload endpoint requires at least one orderId.
    // Pass the provided order IDs, or fallback to sending quoteId as placeholder
    const ids = (orderIds && orderIds.length) ? orderIds : [];
    if (ids.length > 0) {
        ids.forEach(id => fd.append('orderIds', String(id)));
    } else {
        // No order IDs available — use the procurement-specific PDF route
        try {
            const res = await fetch(`/api/procurement/quotes/${quoteId}/upload-pdf`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token },
                body: fd
            });
            if (!res.ok) { const txt = await res.text(); return { success: false, message: txt }; }
            const data = await res.json();
            return { success: data.success, documentId: data.documentId || (data.document && data.document.id), ...data };
        } catch (err) {
            return { success: false, message: err.message };
        }
    }
    try {
        const res = await fetch('/api/documents/upload', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: fd
        });
        if (!res.ok) { const txt = await res.text(); return { success: false, message: txt }; }
        const data = await res.json();
        // documents/upload returns { success, document: { id, ... } }
        return { success: data.success, documentId: data.document && data.document.id, ...data };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

// ============================================================
// FORMAT HELPERS
// ============================================================
function pwFmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function pwFmtDateTime(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function pwFmtPrice(v, currency) {
    if (v === null || v === undefined || v === '') return '—';
    const n = parseFloat(v);
    if (isNaN(n)) return '—';
    return n.toFixed(2) + ' ' + (currency || 'EUR');
}

// ============================================================
// SPINNER HELPER
// ============================================================
function pwSpinner() {
    return '<div class="loading-spinner"></div>';
}

// ============================================================
// STATUS BADGE HELPERS
// ============================================================
function pwStatusBadge(status, type) {
    const maps = {
        quote: {
            'Draft': 'badge-gray', 'Sent to Supplier': 'badge-cyan', 'Received': 'badge-blue',
            'Under Approval': 'badge-yellow', 'Approved': 'badge-green', 'Rejected': 'badge-red'
        },
        po: {
            'draft': 'badge-gray', 'sent': 'badge-cyan', 'confirmed': 'badge-blue',
            'partially_delivered': 'badge-yellow', 'delivered': 'badge-green', 'cancelled': 'badge-red'
        },
        invoice: {
            'received': 'badge-gray', 'verified': 'badge-blue', 'sent_to_accounting': 'badge-cyan',
            'booked': 'badge-yellow', 'paid': 'badge-green', 'disputed': 'badge-red'
        },
        response: {
            'pending': 'badge-gray', 'accepted': 'badge-green', 'rejected': 'badge-red',
            'negotiating': 'badge-yellow', 'countered': 'badge-orange'
        },
        availability: {
            'in_stock': 'badge-green', 'available': 'badge-blue', 'on_order': 'badge-yellow',
            'partial': 'badge-orange', 'unavailable': 'badge-red'
        }
    };
    const cls = (maps[type] && maps[type][status]) || 'badge-gray';
    return `<span class="pw-badge ${cls}">${escHtml(status || '—')}</span>`;
}

function priorityBadge(p) {
    const cls = { 'Urgent': 'badge-red', 'High': 'badge-orange', 'Normal': 'badge-blue', 'Low': 'badge-gray' };
    return `<span class="pw-badge ${cls[p] || 'badge-gray'}">${escHtml(p || 'Normal')}</span>`;
}

// ============================================================
// LIFECYCLE BADGE (compact mini-timeline for order list rows)
// ============================================================

/**
 * renderLifecycleBadge — returns compact HTML mini-timeline for an order
 * Used in renderOrderRow to show procurement stage
 * @param {Object} order
 * @returns {string} HTML
 */
function renderLifecycleBadge(order) {
    if (!order) return '';

    const stages = [
        { key: 'quote', label: 'Quote', icon: '📋' },
        { key: 'approved', label: 'Approved', icon: '✅' },
        { key: 'ordered', label: 'Ordered', icon: '📦' },
        { key: 'delivered', label: 'Delivered', icon: '🚚' }
    ];

    const statusMap = {
        'New': 0, 'Pending': 0, 'Quote Requested': 1, 'Quote Received': 1,
        'Under Approval': 1, 'Approved': 2, 'Rejected': 1,
        'Ordered': 3, 'In Transit': 3, 'Partially Delivered': 3,
        'Delivered': 4, 'Cancelled': 0
    };

    const currentStage = statusMap[order.status] || 0;

    let html = '<div class="lifecycle-badge">';
    stages.forEach((stage, i) => {
        const stageNum = i + 1;
        let cls = 'lb-step';
        if (stageNum < currentStage) cls += ' lb-done';
        else if (stageNum === currentStage) cls += ' lb-active';
        else cls += ' lb-pending';
        html += `<span class="${cls}" title="${stage.label}">${stage.icon}</span>`;
        if (i < stages.length - 1) html += '<span class="lb-connector"></span>';
    });

    if (order.quote_number) {
        html += `<span class="lb-ref">${escHtml(order.quote_number)}</span>`;
    } else if (order.po_number) {
        html += `<span class="lb-ref">${escHtml(order.po_number)}</span>`;
    }

    html += '</div>';
    return html;
}

// ============================================================
// A. ENHANCED QUOTE CREATION WIZARD
// ============================================================

function openEnhancedCreateQuoteModal(preselectedSupplierId, preselectedSupplierName) {
    const selIds = typeof selectedOrderIds !== 'undefined'
        ? Array.from(selectedOrderIds)
        : [];

    if (!selIds.length) {
        showToast('Please select at least one order', 'warning');
        return;
    }

    const suppliers = typeof suppliersState !== 'undefined' ? suppliersState : [];
    const orders = typeof ordersState !== 'undefined'
        ? ordersState.filter(o => selIds.includes(o.id))
        : selIds.map(id => ({ id, item_description: 'Order #' + id, quantity: 1, building: '—' }));

    openEnhancedQuoteModal(selIds, orders, suppliers, preselectedSupplierId, preselectedSupplierName);
}

function openEnhancedQuoteModal(selectedOrderIds, orders, suppliersState, preselectedSupplierId, preselectedSupplierName) {
    PW.wizardState = {
        step: 1,
        selectedOrderIds: selectedOrderIds,
        orders: orders,
        selectedSupplierId: preselectedSupplierId || null,
        selectedSupplierName: preselectedSupplierName || '',
        currency: 'EUR',
        validUntil: '',
        notes: '',
        aiSuggestions: []
    };

    const existing = document.getElementById('pwWizardOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pwWizardOverlay';
    overlay.className = 'pw-modal-overlay';
    overlay.innerHTML = buildWizardHTML(orders, suppliersState);
    document.body.appendChild(overlay);

    overlay.querySelector('.pw-wizard-close').addEventListener('click', closeEnhancedQuoteModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeEnhancedQuoteModal(); });

    showWizardStep(1);
    bindWizardStep1(orders);
}

function closeEnhancedQuoteModal() {
    const overlay = document.getElementById('pwWizardOverlay');
    if (overlay) {
        overlay.classList.add('pw-fade-out');
        setTimeout(() => overlay.remove(), 300);
    }
}

function buildWizardHTML(orders, suppliers) {
    return `
        <div class="pw-modal-card pw-wizard-card">
            <div class="pw-modal-header">
                <div>
                    <h3 class="pw-modal-title">📋 Create Quote</h3>
                    <div class="pw-wizard-steps">
                        <span class="pw-step-dot active" data-step="1">1</span>
                        <span class="pw-step-line"></span>
                        <span class="pw-step-dot" data-step="2">2</span>
                        <span class="pw-step-line"></span>
                        <span class="pw-step-dot" data-step="3">3</span>
                    </div>
                </div>
                <button class="pw-close-btn pw-wizard-close">✕</button>
            </div>
            <div class="pw-wizard-body">
                <div id="wizardStep1" class="wizard-step">${buildStep1HTML(orders)}</div>
                <div id="wizardStep2" class="wizard-step hidden">${buildStep2HTML(suppliers)}</div>
                <div id="wizardStep3" class="wizard-step hidden">${buildStep3HTML()}</div>
            </div>
            <div class="pw-wizard-footer">
                <button id="wizardBtnBack" class="btn btn-secondary hidden">← Back</button>
                <div style="flex:1"></div>
                <button id="wizardBtnNext" class="btn btn-primary">Review Suppliers →</button>
                <button id="wizardBtnCreate" class="btn btn-primary hidden">✓ Create Quote</button>
            </div>
        </div>
    `;
}

function buildStep1HTML(orders) {
    const totalItems = orders.length;
    const urgentCount = orders.filter(o => o.priority === 'Urgent').length;
    const soonestDate = orders.map(o => o.date_needed).filter(Boolean).sort()[0];

    let rows = '';
    for (const o of orders) {
        rows += `<tr>
            <td>#${o.id}</td>
            <td title="${escHtml(o.item_description)}">${escHtml((o.item_description || '').substring(0, 45))}${(o.item_description || '').length > 45 ? '…' : ''}</td>
            <td>${escHtml(o.building || '—')}</td>
            <td>${o.quantity || 1}</td>
            <td>${pwFmtDate(o.date_needed)}</td>
            <td>${priorityBadge(o.priority)}</td>
        </tr>`;
    }

    return `
        <div class="pw-step-header"><h4>Step 1: Review Selected Orders</h4><p class="pw-step-subtitle">Confirm the orders to include in this quote request</p></div>
        <div class="pw-summary-cards">
            <div class="pw-summary-card"><div class="pw-summary-number">${totalItems}</div><div class="pw-summary-label">Total Orders</div></div>
            ${urgentCount > 0 ? `<div class="pw-summary-card pw-summary-urgent"><div class="pw-summary-number">${urgentCount}</div><div class="pw-summary-label">Urgent</div></div>` : ''}
            ${soonestDate ? `<div class="pw-summary-card"><div class="pw-summary-number">${pwFmtDate(soonestDate)}</div><div class="pw-summary-label">Earliest Needed</div></div>` : ''}
        </div>
        <div class="pw-table-wrapper">
            <table class="pw-table">
                <thead><tr><th>ID</th><th>Description</th><th>Building</th><th>Qty</th><th>Date Needed</th><th>Priority</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function buildStep2HTML(suppliers) {
    const supplierOptions = (suppliers || []).filter(s => s.active !== 0)
        .map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
    return `
        <div class="pw-step-header"><h4>Step 2: Select Supplier</h4><p class="pw-step-subtitle">Use AI suggestions or pick manually</p></div>
        <div id="aiSuggestionsArea">
            <div class="pw-ai-loading" id="aiLoadingSpinner">${pwSpinner()}<span>Getting AI supplier suggestions…</span></div>
            <div id="aiSuggestionsCards" class="ai-supplier-cards hidden"></div>
            <div id="aiNoSuggestions" class="hidden" style="text-align:center;color:#94a3b8;padding:1rem;">No AI suggestions available for these orders.</div>
        </div>
        <div style="margin-top:1rem;"><button id="btnShowManualSupplier" class="btn btn-secondary btn-sm">🏢 Skip AI and pick manually</button></div>
        <div id="manualSupplierArea" class="hidden" style="margin-top:1rem;">
            <div class="pw-form-group">
                <label class="pw-label">Select Supplier</label>
                <select id="wizardManualSupplier" class="pw-form-control"><option value="">— Choose supplier —</option>${supplierOptions}</select>
            </div>
            <button id="btnConfirmManualSupplier" class="btn btn-primary btn-sm" style="margin-top:0.5rem;">Use This Supplier →</button>
        </div>
        <div id="selectedSupplierConfirm" class="hidden" style="margin-top:1rem;">
            <div class="pw-selected-supplier-card">
                <span class="pw-check-icon">✓</span>
                <div><strong id="selectedSupplierNameDisplay"></strong><div id="selectedSupplierContactDisplay" style="font-size:0.8rem;color:#94a3b8;margin-top:0.2rem;"></div></div>
                <button id="btnChangeSupplier" class="btn btn-secondary btn-sm" style="margin-left:auto;">Change</button>
            </div>
        </div>
    `;
}

function buildStep3HTML() {
    const defaultValidUntil = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
    return `
        <div class="pw-step-header"><h4>Step 3: Confirm &amp; Create Quote</h4><p class="pw-step-subtitle">Review details and create the quote request</p></div>
        <div id="step3Summary" class="pw-confirm-summary"></div>
        <div class="pw-form-row" style="margin-top:1.25rem;">
            <div class="pw-form-group"><label class="pw-label">Currency</label>
                <select id="wizardCurrency" class="pw-form-control"><option value="EUR">EUR</option><option value="BGN">BGN</option><option value="USD">USD</option><option value="GBP">GBP</option></select>
            </div>
            <div class="pw-form-group"><label class="pw-label">Valid Until</label>
                <input type="date" id="wizardValidUntil" class="pw-form-control" value="${defaultValidUntil}">
            </div>
        </div>
        <div class="pw-form-group"><label class="pw-label">Internal Notes</label>
            <textarea id="wizardNotes" class="pw-form-control" rows="2" placeholder="Notes for procurement team…"></textarea>
        </div>
    `;
}

function showWizardStep(step) {
    PW.wizardState.step = step;
    document.querySelectorAll('#pwWizardOverlay .pw-step-dot').forEach(dot => {
        const s = parseInt(dot.dataset.step);
        dot.classList.remove('active', 'done');
        if (s < step) dot.classList.add('done');
        else if (s === step) dot.classList.add('active');
    });
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById('wizardStep' + i);
        if (el) el.classList.toggle('hidden', i !== step);
    }
    const btnBack = document.getElementById('wizardBtnBack');
    const btnNext = document.getElementById('wizardBtnNext');
    const btnCreate = document.getElementById('wizardBtnCreate');
    if (btnBack) btnBack.classList.toggle('hidden', step === 1);
    if (btnNext) btnNext.classList.toggle('hidden', step === 3);
    if (btnCreate) btnCreate.classList.toggle('hidden', step !== 3);
    if (step === 2) { if (btnNext) btnNext.textContent = 'Confirm Details →'; loadAISuggestionsForWizard(); }
    else if (step === 1) { if (btnNext) btnNext.textContent = 'Review Suppliers →'; }
    else if (step === 3) { populateStep3Summary(); }
}

function bindWizardStep1(orders) {
    const btnNext = document.getElementById('wizardBtnNext');
    const btnBack = document.getElementById('wizardBtnBack');
    const btnCreate = document.getElementById('wizardBtnCreate');
    if (btnNext) {
        btnNext.addEventListener('click', () => {
            const step = PW.wizardState.step;
            if (step === 1) { showWizardStep(2); }
            else if (step === 2) {
                if (!PW.wizardState.selectedSupplierId) { showToast('Please select a supplier before continuing', 'warning'); return; }
                showWizardStep(3);
            }
        });
    }
    if (btnBack) btnBack.addEventListener('click', () => showWizardStep(Math.max(1, PW.wizardState.step - 1)));
    if (btnCreate) btnCreate.addEventListener('click', executeCreateQuote);
    const btnShowManual = document.getElementById('btnShowManualSupplier');
    if (btnShowManual) btnShowManual.addEventListener('click', () => { const area = document.getElementById('manualSupplierArea'); if (area) area.classList.remove('hidden'); });
    const btnConfirmManual = document.getElementById('btnConfirmManualSupplier');
    if (btnConfirmManual) {
        btnConfirmManual.addEventListener('click', () => {
            const sel = document.getElementById('wizardManualSupplier');
            if (!sel || !sel.value) { showToast('Please choose a supplier', 'warning'); return; }
            selectWizardSupplier(parseInt(sel.value), sel.options[sel.selectedIndex].text, null, null);
        });
    }
}

async function loadAISuggestionsForWizard() {
    const spinner = document.getElementById('aiLoadingSpinner');
    const cards = document.getElementById('aiSuggestionsCards');
    const noSugg = document.getElementById('aiNoSuggestions');
    if (spinner) spinner.classList.remove('hidden');
    if (cards) cards.classList.add('hidden');
    if (noSugg) noSugg.classList.add('hidden');
    try {
        const suggestions = await getAISuggestionsForOrders(PW.wizardState.selectedOrderIds);
        PW.wizardState.aiSuggestions = suggestions;
        if (spinner) spinner.classList.add('hidden');
        if (!suggestions || !suggestions.length) { if (noSugg) noSugg.classList.remove('hidden'); return; }
        if (cards) {
            cards.innerHTML = renderAISuggestionCards(suggestions);
            cards.classList.remove('hidden');
            cards.querySelectorAll('.btn-select-ai-supplier').forEach(btn => {
                btn.addEventListener('click', () => selectWizardSupplier(parseInt(btn.dataset.supplierId), btn.dataset.supplierName, btn.dataset.supplierContact || '', btn.dataset.supplierEmail || ''));
            });
        }
    } catch (err) {
        console.error('loadAISuggestionsForWizard error:', err);
        if (spinner) spinner.classList.add('hidden');
        if (noSugg) noSugg.classList.remove('hidden');
    }
}

function renderAISuggestionCards(suggestions) {
    return suggestions.map(s => `
        <div class="ai-supplier-card">
            <div class="ai-card-header"><div class="ai-supplier-name">${escHtml(s.name)}</div><div class="ai-score-label">${Math.round((s.score || 0.7) * 100)}% match</div></div>
            <div class="supplier-score-bar"><div class="supplier-score-fill" style="width:${Math.round((s.score || 0.7) * 100)}%"></div></div>
            ${s.reasons && s.reasons.length ? `<ul class="ai-reasons-list">${s.reasons.slice(0, 3).map(r => `<li>${escHtml(r)}</li>`).join('')}</ul>` : ''}
            ${s.email ? `<div class="ai-contact"><span>📧</span> ${escHtml(s.email)}</div>` : ''}
            ${s.contact_person ? `<div class="ai-contact"><span>👤</span> ${escHtml(s.contact_person)}</div>` : ''}
            <button class="btn btn-primary btn-sm btn-select-ai-supplier" style="margin-top:0.75rem;width:100%;"
                data-supplier-id="${s.id || s.supplier_id}" data-supplier-name="${escHtml(s.name)}"
                data-supplier-contact="${escHtml(s.contact_person || '')}" data-supplier-email="${escHtml(s.email || '')}">
                Select This Supplier
            </button>
        </div>
    `).join('');
}

function selectWizardSupplier(id, name, contact, email) {
    PW.wizardState.selectedSupplierId = id;
    PW.wizardState.selectedSupplierName = name;
    const confirm = document.getElementById('selectedSupplierConfirm');
    const nameDisplay = document.getElementById('selectedSupplierNameDisplay');
    const contactDisplay = document.getElementById('selectedSupplierContactDisplay');
    const manualArea = document.getElementById('manualSupplierArea');
    const aiCards = document.getElementById('aiSuggestionsCards');
    if (nameDisplay) nameDisplay.textContent = name;
    if (contactDisplay) contactDisplay.textContent = [contact, email].filter(Boolean).join(' · ');
    if (confirm) confirm.classList.remove('hidden');
    if (manualArea) manualArea.classList.add('hidden');
    if (aiCards) {
        aiCards.querySelectorAll('.ai-supplier-card').forEach(card => {
            const btn = card.querySelector('.btn-select-ai-supplier');
            if (btn && parseInt(btn.dataset.supplierId) === id) { card.classList.add('ai-card-selected'); btn.textContent = '✓ Selected'; btn.disabled = true; }
            else { card.style.opacity = '0.5'; }
        });
    }
    const btnChange = document.getElementById('btnChangeSupplier');
    if (btnChange) {
        btnChange.onclick = () => {
            PW.wizardState.selectedSupplierId = null;
            if (confirm) confirm.classList.add('hidden');
            if (aiCards) { aiCards.querySelectorAll('.ai-supplier-card').forEach(card => { card.classList.remove('ai-card-selected'); card.style.opacity = ''; const btn = card.querySelector('.btn-select-ai-supplier'); if (btn) { btn.textContent = 'Select This Supplier'; btn.disabled = false; } }); }
        };
    }
    showToast('Supplier "' + name + '" selected', 'success');
}

function populateStep3Summary() {
    const el = document.getElementById('step3Summary');
    if (!el) return;
    const ws = PW.wizardState;
    el.innerHTML = `<div class="pw-confirm-grid"><div class="pw-confirm-item"><div class="pw-confirm-label">Supplier</div><div class="pw-confirm-value" style="color:#06b6d4;font-weight:600;">${escHtml(ws.selectedSupplierName)}</div></div><div class="pw-confirm-item"><div class="pw-confirm-label">Orders</div><div class="pw-confirm-value">${ws.selectedOrderIds.length} order(s) selected</div></div></div>`;
}

async function executeCreateQuote() {
    const ws = PW.wizardState;
    if (!ws.selectedSupplierId) { showToast('No supplier selected', 'error'); return; }
    const currency = document.getElementById('wizardCurrency')?.value || 'EUR';
    const validUntil = document.getElementById('wizardValidUntil')?.value || null;
    const notes = document.getElementById('wizardNotes')?.value || null;
    const btnCreate = document.getElementById('wizardBtnCreate');
    if (btnCreate) { btnCreate.disabled = true; btnCreate.innerHTML = pwSpinner() + ' Creating…'; }
    try {
        const body = { supplier_id: ws.selectedSupplierId, order_ids: ws.selectedOrderIds, notes, currency, valid_until: validUntil };
        const res = await pwApiPost('/quotes', body);
        if (res.success) {
            closeEnhancedQuoteModal();
            if (typeof selectedOrderIds !== 'undefined') selectedOrderIds.clear();
            if (typeof updateSelectionUi === 'function') updateSelectionUi();
            if (typeof loadOrders === 'function') loadOrders();
            if (typeof loadQuotes === 'function') loadQuotes();
            showToast('Quote ' + (res.quoteNumber || '') + ' created successfully', 'success');
            if (res.quoteId) setTimeout(() => openQuoteLifecyclePanel(res.quoteId), 400);
        } else {
            showToast('Failed to create quote: ' + (res.message || 'Unknown error'), 'error');
            if (btnCreate) { btnCreate.disabled = false; btnCreate.textContent = '✓ Create Quote'; }
        }
    } catch (err) {
        console.error('executeCreateQuote error:', err);
        showToast('Network error creating quote', 'error');
        if (btnCreate) { btnCreate.disabled = false; btnCreate.textContent = '✓ Create Quote'; }
    }
}

// ============================================================
// D. AI SUPPLIER SUGGESTIONS
// ============================================================
async function getAISuggestionsForOrders(orderIds) {
    if (!orderIds || !orderIds.length) return [];
    try {
        // Fetch suggestions for each order in parallel using the real endpoint
        const results = await Promise.allSettled(
            orderIds.map(id => pwApiGet(`/suppliers/suggestions/${id}`).catch(() => null))
        );
        // Merge and deduplicate by supplier_id, summing scores
        const scoreMap = {};
        for (const r of results) {
            if (r.status !== 'fulfilled' || !r.value || !r.value.suggestions) continue;
            for (const s of r.value.suggestions) {
                const sid = s.supplier_id || s.id;
                if (!scoreMap[sid]) {
                    scoreMap[sid] = { ...s, score: s.score || 0, match_reasons: s.match_reasons || [] };
                } else {
                    scoreMap[sid].score = (scoreMap[sid].score || 0) + (s.score || 0);
                    if (s.match_reasons) scoreMap[sid].match_reasons = [...new Set([...scoreMap[sid].match_reasons, ...s.match_reasons])];
                }
            }
        }
        // Sort by score descending, return top 5
        return Object.values(scoreMap)
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, 5)
            .map(s => ({
                id: s.supplier_id || s.id,
                supplier_id: s.supplier_id || s.id,
                name: s.name || s.supplier_name,
                email: s.email,
                contact_person: s.contact_person,
                score: Math.min(s.score, 1),
                reasons: s.match_reasons || []
            }));
    } catch (err) {
        console.error('getAISuggestionsForOrders error:', err);
        return [];
    }
}

// ============================================================
// B. QUOTE LIFECYCLE PANEL
// ============================================================

function openQuoteLifecyclePanel(quoteId) {
    PW.currentQuoteId = quoteId;
    const existing = document.getElementById('pwLifecyclePanel');
    if (existing) existing.remove();
    const panel = document.createElement('div');
    panel.id = 'pwLifecyclePanel';
    panel.className = 'pw-lifecycle-panel';
    panel.innerHTML = `
        <div class="pw-panel-header">
            <h3 class="pw-panel-title">📋 Quote Lifecycle</h3>
            <button class="pw-close-btn" id="pwLifecyclePanelClose">✕</button>
        </div>
        <div class="pw-panel-body" id="pwLifecyclePanelBody">${pwSpinner()}</div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('#pwLifecyclePanelClose').addEventListener('click', closeQuoteLifecyclePanel);
    requestAnimationFrame(() => panel.classList.add('pw-panel-open'));
    loadQuoteLifecycle(quoteId);
}

function closeQuoteLifecyclePanel() {
    const panel = document.getElementById('pwLifecyclePanel');
    if (panel) { panel.classList.remove('pw-panel-open'); setTimeout(() => panel.remove(), 350); }
    PW.currentQuoteId = null;
    PW.currentLifecycle = null;
}

async function loadQuoteLifecycle(quoteId) {
    const body = document.getElementById('pwLifecyclePanelBody');
    if (!body) return;
    try {
        const data = await pwApiGet(`/procurement/lifecycle/quote/${quoteId}`);
        if (!data.success) { body.innerHTML = '<div class="pw-error">Failed to load lifecycle data</div>'; return; }
        PW.currentLifecycle = data.lifecycle;
        body.innerHTML = renderLifecyclePanel(data.lifecycle);
        bindLifecyclePanelEvents(data.lifecycle);
    } catch (err) {
        body.innerHTML = '<div class="pw-error">Error loading lifecycle: ' + escHtml(err.message) + '</div>';
    }
}

function renderLifecyclePanel(lifecycle) {
    const { quote, items, responses, purchase_orders, invoices, sendLog } = lifecycle;
    let html = '';

    // ---- Quote Header ----
    html += `
        <div class="pw-lc-section">
            <div class="pw-lc-section-header">
                <span>📋 Quote ${escHtml(quote.quote_number)}</span>
                ${pwStatusBadge(quote.status, 'quote')}
            </div>
            <div class="pw-lc-grid">
                <div><div class="pw-lc-label">Supplier</div><div class="pw-lc-value">${escHtml(quote.supplier_name || '—')}</div></div>
                <div><div class="pw-lc-label">Total</div><div class="pw-lc-value">${pwFmtPrice(quote.total_amount, quote.currency)}</div></div>
                <div><div class="pw-lc-label">Valid Until</div><div class="pw-lc-value">${pwFmtDate(quote.valid_until)}</div></div>
                <div><div class="pw-lc-label">Created</div><div class="pw-lc-value">${pwFmtDate(quote.created_at)}</div></div>
            </div>
            ${quote.notes ? `<div class="pw-lc-notes">💬 ${escHtml(quote.notes)}</div>` : ''}
        </div>`;

    // ---- Items ----
    if (items && items.length) {
        html += `<div class="pw-lc-section"><div class="pw-lc-section-header"><span>📦 Items (${items.length})</span></div>`;
        const responseMap = {};
        if (responses) for (const r of responses) { if (!responseMap[r.order_id]) responseMap[r.order_id] = r; }
        html += '<div class="pw-table-wrapper"><table class="pw-table pw-sm-table"><thead><tr><th>Order</th><th>Description</th><th>Qty</th><th>Response</th><th>Price</th><th>Delivery</th></tr></thead><tbody>';
        for (const item of items) {
            const resp = responseMap[item.order_id];
            html += `<tr>
                <td>#${item.order_id}</td>
                <td>${escHtml((item.item_description || '').substring(0, 35))}</td>
                <td>${item.quantity || item.order_qty || '—'}</td>
                <td>${resp ? pwStatusBadge(resp.status, 'response') : '<span class="pw-badge badge-gray">Pending</span>'}</td>
                <td>${resp && resp.unit_price ? pwFmtPrice(resp.unit_price, resp.currency) : '—'}</td>
                <td>${resp && resp.promised_delivery_date ? pwFmtDate(resp.promised_delivery_date) : '—'}</td>
            </tr>`;
        }
        html += '</tbody></table></div></div>';
    }

    // ---- Actions ----
    html += `<div class="pw-lc-actions">`;

    // Send to Supplier
    if (quote.status === 'Draft' || quote.status === 'Received') {
        html += `<button class="btn btn-secondary btn-sm" id="pwBtnSendSupplier">📧 Send to Supplier</button>`;
    }

    // Record Response button
    if (quote.status === 'Sent to Supplier' || quote.status === 'Received') {
        html += `<button class="btn btn-primary btn-sm" id="pwBtnRecordResponse">🗒 Record Response</button>`;
    }

    // Upload PDF
    html += `<button class="btn btn-secondary btn-sm" id="pwBtnUploadPDF">📄 Upload Quote PDF</button>`;

    // Create PO
    if ((quote.status === 'Approved' || quote.status === 'Received') && (!purchase_orders || !purchase_orders.length)) {
        html += `<button class="btn btn-primary btn-sm" id="pwBtnCreatePO">📦 Create Purchase Order</button>`;
    }

    // Record Invoice
    if (purchase_orders && purchase_orders.length > 0 && (!invoices || !invoices.length)) {
        html += `<button class="btn btn-primary btn-sm" id="pwBtnRecordInvoice">🧾 Record Invoice</button>`;
    }

    // Send to Accounting
    if (invoices && invoices.length > 0) {
        const pendingInvoices = invoices.filter(inv => inv.status === 'received' || inv.status === 'verified');
        if (pendingInvoices.length) {
            html += `<button class="btn btn-primary btn-sm" id="pwBtnSendAccounting">🏦 Send to Accounting</button>`;
        }
    }

    html += `</div>`;

    // ---- PO Section ----
    if (purchase_orders && purchase_orders.length) {
        const po = purchase_orders[0];
        html += `
            <div class="pw-lc-section">
                <div class="pw-lc-section-header"><span>📦 Purchase Order</span>${pwStatusBadge(po.status, 'po')}</div>
                <div class="pw-lc-grid">
                    <div><div class="pw-lc-label">PO Number</div><div class="pw-lc-value">${escHtml(po.po_number)}</div></div>
                    <div><div class="pw-lc-label">Total</div><div class="pw-lc-value">${pwFmtPrice(po.total_amount, po.currency)}</div></div>
                    <div><div class="pw-lc-label">Created</div><div class="pw-lc-value">${pwFmtDate(po.created_at)}</div></div>
                    ${po.expected_delivery_date ? `<div><div class="pw-lc-label">Expected Delivery</div><div class="pw-lc-value">${pwFmtDate(po.expected_delivery_date)}</div></div>` : ''}
                </div>
                <div class="pw-lc-actions" style="margin-top:0.5rem;">
                    <select id="poStatusSelect" class="pw-form-control" style="max-width:180px;">
                        ${['draft','sent','confirmed','partially_delivered','delivered','cancelled'].map(s => `<option value="${s}" ${po.status === s ? 'selected' : ''}>${s.replace(/_/g,' ')}</option>`).join('')}
                    </select>
                    <button class="btn btn-primary btn-sm" id="pwBtnUpdatePO" data-po-id="${po.id}">Update Status</button>
                </div>
            </div>`;
    }

    // ---- Invoice Section ----
    if (invoices && invoices.length) {
        const inv = invoices[0];
        html += `
            <div class="pw-lc-section">
                <div class="pw-lc-section-header"><span>🧾 Invoice</span>${pwStatusBadge(inv.status, 'invoice')}</div>
                <div class="pw-lc-grid">
                    <div><div class="pw-lc-label">Invoice #</div><div class="pw-lc-value">${escHtml(inv.invoice_number || '—')}</div></div>
                    <div><div class="pw-lc-label">Amount</div><div class="pw-lc-value">${pwFmtPrice(inv.total_amount, inv.currency)}</div></div>
                    <div><div class="pw-lc-label">Due Date</div><div class="pw-lc-value">${pwFmtDate(inv.due_date)}</div></div>
                    <div><div class="pw-lc-label">Status</div><div class="pw-lc-value">${pwStatusBadge(inv.status, 'invoice')}</div></div>
                </div>
            </div>`;
    }

    // ---- Send Log ----
    if (sendLog && sendLog.length) {
        html += `<div class="pw-lc-section"><div class="pw-lc-section-header"><span>📧 Send History</span></div>`;
        for (const entry of sendLog) {
            html += `<div class="pw-lc-log-item"><span class="pw-lc-log-date">${pwFmtDateTime(entry.sent_at)}</span> → ${escHtml(entry.sent_to_email || '—')} by ${escHtml(entry.sent_by_name || '—')}</div>`;
        }
        html += '</div>';
    }

    return html;
}

function bindLifecyclePanelEvents(lifecycle) {
    const { quote, items, purchase_orders, invoices } = lifecycle;

    const btnSendSupplier = document.getElementById('pwBtnSendSupplier');
    if (btnSendSupplier) {
        btnSendSupplier.addEventListener('click', () => openSendQuoteDialogPW(quote));
    }

    const btnRecordResponse = document.getElementById('pwBtnRecordResponse');
    if (btnRecordResponse) {
        btnRecordResponse.addEventListener('click', () => openRecordResponseDialog(quote.id, items));
    }

    const btnUploadPDF = document.getElementById('pwBtnUploadPDF');
    if (btnUploadPDF) {
        btnUploadPDF.addEventListener('click', () => openUploadPDFDialog(quote.id, items));
    }

    const btnCreatePO = document.getElementById('pwBtnCreatePO');
    if (btnCreatePO) {
        btnCreatePO.addEventListener('click', () => openCreatePODialog(quote, items));
    }

    const btnRecordInvoice = document.getElementById('pwBtnRecordInvoice');
    if (btnRecordInvoice) {
        btnRecordInvoice.addEventListener('click', () => openRecordInvoiceDialog(quote, purchase_orders));
    }

    const btnSendAccounting = document.getElementById('pwBtnSendAccounting');
    if (btnSendAccounting) {
        btnSendAccounting.addEventListener('click', () => sendToAccounting(invoices[0].id));
    }

    const btnUpdatePO = document.getElementById('pwBtnUpdatePO');
    if (btnUpdatePO) {
        btnUpdatePO.addEventListener('click', async () => {
            const poId = btnUpdatePO.dataset.poId;
            const status = document.getElementById('poStatusSelect').value;
            const actualDelivery = status === 'delivered' ? new Date().toISOString().split('T')[0] : null;
            const res = await pwApiPut(`/procurement/purchase-orders/${poId}`, { status, actual_delivery_date: actualDelivery });
            if (res.success) { showToast('PO updated', 'success'); loadQuoteLifecycle(quote.id); }
            else showToast('Failed to update PO: ' + (res.message || 'Error'), 'error');
        });
    }
}

// ============================================================
// C. SEND QUOTE TO SUPPLIER (PW version)
// ============================================================
async function openSendQuoteDialogPW(quote) {
    const overlay = document.createElement('div');
    overlay.className = 'pw-modal-overlay';
    const suppEmail = quote.supplier_email || '';
    overlay.innerHTML = `
        <div class="pw-modal-card">
            <div class="pw-modal-header"><h3 class="pw-modal-title">📧 Send Quote to Supplier</h3><button class="pw-close-btn" id="sendDialogClose">✕</button></div>
            <div style="padding:1rem;">
                <div class="pw-form-group"><label class="pw-label">Supplier Email *</label>
                    <input id="sendEmailInput" type="email" class="pw-form-control" value="${escHtml(suppEmail)}" placeholder="supplier@example.com">
                </div>
                <div class="pw-form-group"><label class="pw-label">Message (optional)</label>
                    <textarea id="sendMessageInput" class="pw-form-control" rows="3" placeholder="Additional message..."></textarea>
                </div>
            </div>
            <div class="pw-modal-footer">
                <button class="btn btn-secondary btn-sm" id="sendDialogCancel">Cancel</button>
                <button class="btn btn-primary btn-sm" id="sendDialogConfirm">📧 Send Email</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#sendDialogClose').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#sendDialogCancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#sendDialogConfirm').addEventListener('click', async () => {
        const email = document.getElementById('sendEmailInput').value.trim();
        const message = document.getElementById('sendMessageInput').value.trim();
        if (!email) { showToast('Please enter supplier email', 'warning'); return; }
        const btn = overlay.querySelector('#sendDialogConfirm');
        btn.disabled = true; btn.innerHTML = pwSpinner() + ' Sending…';
        const res = await pwApiPost(`/quotes/${quote.id}/send`, { supplier_email: email, message: message || null });
        if (res.success) { showToast('Quote sent to supplier', 'success'); overlay.remove(); loadQuoteLifecycle(quote.id); }
        else { showToast('Send failed: ' + (res.message || 'Error'), 'error'); btn.disabled = false; btn.textContent = '📧 Send Email'; }
    });
}

// ============================================================
// E. RECORD SUPPLIER RESPONSE DIALOG
// ============================================================
function openRecordResponseDialog(quoteId, items) {
    const overlay = document.createElement('div');
    overlay.className = 'pw-modal-overlay';
    const itemOpts = (items || []).map(i =>
        `<option value="${i.order_id}">${escHtml(i.item_description || 'Order #' + i.order_id)} (Order #${i.order_id})</option>`
    ).join('');
    overlay.innerHTML = `
        <div class="pw-modal-card">
            <div class="pw-modal-header"><h3 class="pw-modal-title">🗒 Record Supplier Response</h3><button class="pw-close-btn" id="respDialogClose">✕</button></div>
            <div style="padding:1rem;display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
                <div style="grid-column:1/-1;"><label class="pw-label">Order Item *</label>
                    <select id="respDlgOrderId" class="pw-form-control"><option value="">Select item…</option>${itemOpts}</select>
                </div>
                <div><label class="pw-label">Unit Price</label><input id="respDlgUnitPrice" type="number" class="pw-form-control" step="0.01" placeholder="0.00"></div>
                <div><label class="pw-label">Currency</label>
                    <select id="respDlgCurrency" class="pw-form-control">
                        <option value="EUR">EUR</option><option value="BGN">BGN</option><option value="USD">USD</option>
                    </select>
                </div>
                <div><label class="pw-label">Delivery Date</label><input id="respDlgDelivery" type="date" class="pw-form-control"></div>
                <div><label class="pw-label">Lead Time (days)</label><input id="respDlgLeadTime" type="number" class="pw-form-control" min="0"></div>
                <div><label class="pw-label">Availability</label>
                    <select id="respDlgAvailability" class="pw-form-control">
                        <option value="available">Available</option><option value="in_stock">In Stock</option>
                        <option value="on_order">On Order</option><option value="partial">Partial</option>
                        <option value="unavailable">Unavailable</option>
                    </select>
                </div>
                <div><label class="pw-label">Status</label>
                    <select id="respDlgStatus" class="pw-form-control">
                        <option value="pending">Pending</option><option value="accepted">Accepted</option>
                        <option value="rejected">Rejected</option><option value="negotiating">Negotiating</option>
                    </select>
                </div>
                <div style="grid-column:1/-1;"><label class="pw-label">Supplier Notes</label>
                    <textarea id="respDlgNotes" class="pw-form-control" rows="2" placeholder="Any notes from the supplier..."></textarea>
                </div>
                <div id="respPdfSection" style="grid-column:1/-1;">
                    <label class="pw-label">📄 Attach Supplier Quote PDF (optional)</label>
                    <input type="file" id="respDlgPdfFile" accept=".pdf" class="pw-form-control">
                    <div id="respPdfStatus" style="font-size:0.75rem;color:#64748b;margin-top:0.25rem;"></div>
                </div>
            </div>
            <div class="pw-modal-footer">
                <button class="btn btn-secondary btn-sm" id="respDialogCancel">Cancel</button>
                <button class="btn btn-primary btn-sm" id="respDialogSave">Save Response</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#respDialogClose').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#respDialogCancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#respDialogSave').addEventListener('click', async () => {
        const orderId = document.getElementById('respDlgOrderId').value;
        if (!orderId) { showToast('Please select an order item', 'warning'); return; }
        const btn = overlay.querySelector('#respDialogSave');
        btn.disabled = true; btn.innerHTML = pwSpinner() + ' Saving…';
        // Upload PDF first if provided
        let pdfDocId = null;
        const pdfFile = document.getElementById('respDlgPdfFile').files[0];
        if (pdfFile) {
            document.getElementById('respPdfStatus').textContent = 'Uploading PDF...';
            const uploadRes = await pwApiUploadQuotePDF(pdfFile, quoteId, [orderId]);
            if (uploadRes.success) {
                pdfDocId = uploadRes.documentId;
                document.getElementById('respPdfStatus').textContent = 'PDF uploaded successfully';
            } else {
                showToast('PDF upload failed: ' + (uploadRes.message || 'Error'), 'error');
                btn.disabled = false; btn.textContent = 'Save Response'; return;
            }
        }
        const payload = {
            order_id: parseInt(orderId, 10),
            unit_price: document.getElementById('respDlgUnitPrice').value ? parseFloat(document.getElementById('respDlgUnitPrice').value) : null,
            currency: document.getElementById('respDlgCurrency').value,
            promised_delivery_date: document.getElementById('respDlgDelivery').value || null,
            lead_time_days: document.getElementById('respDlgLeadTime').value ? parseInt(document.getElementById('respDlgLeadTime').value, 10) : null,
            availability: document.getElementById('respDlgAvailability').value,
            status: document.getElementById('respDlgStatus').value,
            supplier_notes: document.getElementById('respDlgNotes').value || null,
            response_document_id: pdfDocId || null
        };
        const res = await pwApiPost(`/procurement/quotes/${quoteId}/responses`, payload);
        if (res.success) {
            showToast('Response saved', 'success');
            overlay.remove();
            loadQuoteLifecycle(quoteId);
            if (typeof loadQuotes === 'function') loadQuotes();
        } else {
            showToast('Failed: ' + (res.message || 'Error'), 'error');
            btn.disabled = false; btn.textContent = 'Save Response';
        }
    });
}

// ============================================================
// F. UPLOAD PDF DIALOG (Standalone, no order ID required)
// ============================================================
function openUploadPDFDialog(quoteId, items) {
    const overlay = document.createElement('div');
    overlay.className = 'pw-modal-overlay';
    const orderOpts = (items || []).map(i =>
        `<option value="${i.order_id}">${escHtml(i.item_description || 'Order #' + i.order_id)}</option>`
    ).join('');
    overlay.innerHTML = `
        <div class="pw-modal-card" style="max-width:480px;">
            <div class="pw-modal-header"><h3 class="pw-modal-title">📄 Upload Supplier Quote PDF</h3><button class="pw-close-btn" id="pdfDlgClose">✕</button></div>
            <div style="padding:1rem;">
                <div class="pw-form-group">
                    <label class="pw-label">Select PDF File *</label>
                    <input type="file" id="pdfDlgFile" accept=".pdf" class="pw-form-control">
                </div>
                <div class="pw-form-group">
                    <label class="pw-label">Link to Order Item (optional)</label>
                    <select id="pdfDlgOrderId" class="pw-form-control">
                        <option value="">General quote PDF (no specific order)</option>
                        ${orderOpts}
                    </select>
                </div>
                <div id="pdfUploadStatus" style="font-size:0.8rem;color:#94a3b8;"></div>
            </div>
            <div class="pw-modal-footer">
                <button class="btn btn-secondary btn-sm" id="pdfDlgCancel">Cancel</button>
                <button class="btn btn-primary btn-sm" id="pdfDlgUpload">📄 Upload</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#pdfDlgClose').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#pdfDlgCancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#pdfDlgUpload').addEventListener('click', async () => {
        const file = document.getElementById('pdfDlgFile').files[0];
        if (!file) { showToast('Please select a PDF file', 'warning'); return; }
        const orderIdVal = document.getElementById('pdfDlgOrderId').value;
        const orderIds = orderIdVal ? [parseInt(orderIdVal, 10)] : [];
        const statusEl = document.getElementById('pdfUploadStatus');
        const btn = overlay.querySelector('#pdfDlgUpload');
        btn.disabled = true; btn.innerHTML = pwSpinner() + ' Uploading…';
        statusEl.textContent = 'Uploading...';
        const res = await pwApiUploadQuotePDF(file, quoteId, orderIds);
        if (res.success) {
            showToast('PDF uploaded successfully (Document ID: ' + res.documentId + ')', 'success');
            statusEl.textContent = '✓ Uploaded: Document ID ' + res.documentId;
            btn.textContent = 'Done';
            setTimeout(() => { overlay.remove(); loadQuoteLifecycle(quoteId); }, 1000);
        } else {
            showToast('Upload failed: ' + (res.message || 'Error'), 'error');
            statusEl.textContent = '✕ Failed: ' + (res.message || 'Error');
            btn.disabled = false; btn.textContent = '📄 Upload';
        }
    });
}

// ============================================================
// G. CREATE PURCHASE ORDER DIALOG
// ============================================================
function openCreatePODialog(quote, items) {
    const overlay = document.createElement('div');
    overlay.className = 'pw-modal-overlay';
    let itemRows = (items || []).map((item, idx) => `
        <tr>
            <td>${escHtml(item.item_description || ('Order #' + item.order_id))}</td>
            <td>${item.order_qty || item.quantity || 1}</td>
            <td><input type="number" class="pw-form-control po-unit-price" data-order-id="${item.order_id}" data-idx="${idx}" step="0.01" placeholder="0.00" value="${item.unit_price || ''}"></td>
            <td class="po-total-cell" data-idx="${idx}">—</td>
        </tr>
    `).join('');
    overlay.innerHTML = `
        <div class="pw-modal-card" style="max-width:600px;">
            <div class="pw-modal-header"><h3 class="pw-modal-title">📦 Create Purchase Order</h3><button class="pw-close-btn" id="poDlgClose">✕</button></div>
            <div style="padding:1rem;">
                <div class="pw-lc-grid" style="margin-bottom:1rem;">
                    <div><div class="pw-lc-label">Supplier</div><div class="pw-lc-value">${escHtml(quote.supplier_name || '—')}</div></div>
                    <div><div class="pw-lc-label">Currency</div>
                        <select id="poCurrency" class="pw-form-control"><option value="EUR">EUR</option><option value="BGN">BGN</option><option value="USD">USD</option></select>
                    </div>
                    <div style="grid-column:1/-1;"><label class="pw-label">Expected Delivery Date</label>
                        <input type="date" id="poExpectedDelivery" class="pw-form-control">
                    </div>
                    <div style="grid-column:1/-1;"><label class="pw-label">Delivery Address</label>
                        <input type="text" id="poDeliveryAddress" class="pw-form-control" placeholder="Optional">  
                    </div>
                    <div style="grid-column:1/-1;"><label class="pw-label">Payment Terms</label>
                        <input type="text" id="poPaymentTerms" class="pw-form-control" placeholder="e.g. Net 30">
                    </div>
                </div>
                <div class="pw-table-wrapper">
                    <table class="pw-table pw-sm-table">
                        <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
                        <tbody id="poItemsBody">${itemRows}</tbody>
                    </table>
                </div>
                <div style="margin-top:0.5rem;font-weight:600;text-align:right;">Total: <span id="poGrandTotal">—</span></div>
            </div>
            <div class="pw-modal-footer">
                <button class="btn btn-secondary btn-sm" id="poDlgCancel">Cancel</button>
                <button class="btn btn-primary btn-sm" id="poDlgCreate">📦 Create PO</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#poDlgClose').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#poDlgCancel').addEventListener('click', () => overlay.remove());
    // Live total calculation
    function recalcTotals() {
        let grand = 0;
        overlay.querySelectorAll('.po-unit-price').forEach(input => {
            const tr = input.closest('tr');
            const qty = parseFloat(tr.cells[1].textContent) || 1;
            const price = parseFloat(input.value) || 0;
            const total = qty * price;
            grand += total;
            const idx = input.dataset.idx;
            const totalCell = overlay.querySelector(`.po-total-cell[data-idx="${idx}"]`);
            if (totalCell) totalCell.textContent = total > 0 ? total.toFixed(2) : '—';
        });
        const grandEl = document.getElementById('poGrandTotal');
        if (grandEl) grandEl.textContent = grand > 0 ? grand.toFixed(2) + ' ' + (document.getElementById('poCurrency')?.value || 'EUR') : '—';
    }
    overlay.querySelectorAll('.po-unit-price').forEach(input => input.addEventListener('input', recalcTotals));
    document.getElementById('poCurrency').addEventListener('change', recalcTotals);
    recalcTotals();
    overlay.querySelector('#poDlgCreate').addEventListener('click', async () => {
        const currency = document.getElementById('poCurrency').value;
        const expectedDelivery = document.getElementById('poExpectedDelivery').value;
        const deliveryAddress = document.getElementById('poDeliveryAddress').value.trim();
        const paymentTerms = document.getElementById('poPaymentTerms').value.trim();
        const poItems = [];
        overlay.querySelectorAll('.po-unit-price').forEach(input => {
            const tr = input.closest('tr');
            const qty = parseFloat(tr.cells[1].textContent) || 1;
            const orderId = parseInt(input.dataset.orderId, 10);
            const unitPrice = parseFloat(input.value) || 0;
            const matchItem = items.find(i => i.order_id === orderId);
            poItems.push({
                order_id: orderId,
                item_description: matchItem ? (matchItem.item_description || 'Item') : 'Item',
                quantity: qty,
                unit_price: unitPrice || null,
                currency
            });
        });
        const btn = overlay.querySelector('#poDlgCreate');
        btn.disabled = true; btn.innerHTML = pwSpinner() + ' Creating…';
        const res = await pwApiPost('/procurement/purchase-orders', {
            quote_id: quote.id,
            supplier_id: quote.supplier_id,
            currency, items: poItems,
            expected_delivery_date: expectedDelivery || null,
            delivery_address: deliveryAddress || null,
            payment_terms: paymentTerms || null
        });
        if (res.success) {
            showToast('PO ' + res.poNumber + ' created', 'success');
            overlay.remove();
            loadQuoteLifecycle(quote.id);
            if (typeof loadOrders === 'function') loadOrders();
        } else {
            showToast('Failed: ' + (res.message || 'Error'), 'error');
            btn.disabled = false; btn.textContent = '📦 Create PO';
        }
    });
}

// ============================================================
// H. RECORD INVOICE DIALOG
// ============================================================
function openRecordInvoiceDialog(quote, purchaseOrders) {
    const po = purchaseOrders && purchaseOrders[0];
    const overlay = document.createElement('div');
    overlay.className = 'pw-modal-overlay';
    overlay.innerHTML = `
        <div class="pw-modal-card" style="max-width:500px;">
            <div class="pw-modal-header"><h3 class="pw-modal-title">🧾 Record Invoice</h3><button class="pw-close-btn" id="invDlgClose">✕</button></div>
            <div style="padding:1rem;display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
                <div><label class="pw-label">Invoice Number</label><input id="invNumber" type="text" class="pw-form-control" placeholder="INV-2025-001"></div>
                <div><label class="pw-label">Invoice Date</label><input id="invDate" type="date" class="pw-form-control" value="${new Date().toISOString().split('T')[0]}"></div>
                <div><label class="pw-label">Due Date</label><input id="invDueDate" type="date" class="pw-form-control"></div>
                <div><label class="pw-label">Currency</label>
                    <select id="invCurrency" class="pw-form-control"><option value="EUR">EUR</option><option value="BGN">BGN</option><option value="USD">USD</option></select>
                </div>
                <div><label class="pw-label">Amount (ex. VAT)</label><input id="invAmount" type="number" class="pw-form-control" step="0.01" placeholder="0.00"></div>
                <div><label class="pw-label">VAT Amount</label><input id="invVat" type="number" class="pw-form-control" step="0.01" placeholder="0.00" value="0"></div>
                <div><label class="pw-label">Total Amount</label><input id="invTotal" type="number" class="pw-form-control" step="0.01" placeholder="0.00"></div>
                <div style="grid-column:1/-1;"><label class="pw-label">Notes</label>
                    <textarea id="invNotes" class="pw-form-control" rows="2" placeholder="Optional notes..."></textarea>
                </div>
            </div>
            <div class="pw-modal-footer">
                <button class="btn btn-secondary btn-sm" id="invDlgCancel">Cancel</button>
                <button class="btn btn-primary btn-sm" id="invDlgSave">🧾 Record Invoice</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    // Auto-calc total
    function calcTotal() {
        const amt = parseFloat(document.getElementById('invAmount').value) || 0;
        const vat = parseFloat(document.getElementById('invVat').value) || 0;
        document.getElementById('invTotal').value = (amt + vat).toFixed(2);
    }
    document.getElementById('invAmount').addEventListener('input', calcTotal);
    document.getElementById('invVat').addEventListener('input', calcTotal);
    overlay.querySelector('#invDlgClose').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#invDlgCancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#invDlgSave').addEventListener('click', async () => {
        const btn = overlay.querySelector('#invDlgSave');
        btn.disabled = true; btn.innerHTML = pwSpinner() + ' Saving…';
        const payload = {
            quote_id: quote.id,
            po_id: po ? po.id : null,
            supplier_id: quote.supplier_id,
            invoice_number: document.getElementById('invNumber').value.trim() || null,
            invoice_date: document.getElementById('invDate').value || null,
            due_date: document.getElementById('invDueDate').value || null,
            currency: document.getElementById('invCurrency').value,
            amount: parseFloat(document.getElementById('invAmount').value) || 0,
            vat_amount: parseFloat(document.getElementById('invVat').value) || 0,
            total_amount: parseFloat(document.getElementById('invTotal').value) || 0,
            notes: document.getElementById('invNotes').value.trim() || null
        };
        const res = await pwApiPost('/procurement/invoices', payload);
        if (res.success) {
            showToast('Invoice recorded', 'success');
            overlay.remove();
            loadQuoteLifecycle(quote.id);
        } else {
            showToast('Failed: ' + (res.message || 'Error'), 'error');
            btn.disabled = false; btn.textContent = '🧾 Record Invoice';
        }
    });
}

// ============================================================
// I. SEND TO ACCOUNTING
// ============================================================
async function sendToAccounting(invoiceId) {
    if (!confirm('Send this invoice to accounting?')) return;
    const res = await pwApiPut(`/procurement/invoices/${invoiceId}`, { status: 'sent_to_accounting' });
    if (res.success) {
        showToast('Invoice sent to accounting', 'success');
        if (PW.currentQuoteId) loadQuoteLifecycle(PW.currentQuoteId);
    } else {
        showToast('Failed: ' + (res.message || 'Error'), 'error');
    }
}

// ============================================================
// J. INTEGRATION: Wire PW into app.js button
// ============================================================

/**
 * Call this from app.js instead of openCreateQuoteDialog()
 * to use the enhanced quote creation wizard.
 */
function pwOpenCreateQuoteModal() {
    openEnhancedCreateQuoteModal();
}

/**
 * Wire up a "View Lifecycle" button in the quote table row.
 * Call from renderQuotesTable() in app.js
 */
function pwAddLifecycleButton(rowEl, quoteId) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary btn-sm';
    btn.textContent = '📋 Lifecycle';
    btn.style.marginLeft = '0.3rem';
    btn.addEventListener('click', e => { e.stopPropagation(); openQuoteLifecyclePanel(quoteId); });
    rowEl.appendChild(btn);
}

console.log('✅ procurement-workspace.js loaded');
