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
        // Call the real per-order endpoint for each order, then merge results
        const perOrderResults = await Promise.all(
            orderIds.map(id => pwApiGet(`/api/suppliers/suggestions/${id}`).catch(() => null))
        );
        // Collect all unique supplier suggestions by supplier_id
        const seen = new Set();
        const merged = [];
        for (const res of perOrderResults) {
            if (!res || !res.suggestions) continue;
            for (const s of res.suggestions) {
                const key = s.supplier_id || s.id || s.name;
                if (!seen.has(key)) {
                    seen.add(key);
                    merged.push(s);
                }
            }
        }
        return merged.slice(0, 3);
    } catch (err) { console.error('getAISuggestionsForOrders error:', err); return []; }
}

// ============================================================
// B. QUOTE LIFECYCLE PANEL
// ============================================================
async function openQuoteLifecyclePanel(quoteId) {
    if (!quoteId) return;
    const existing = document.getElementById('lifecyclePanel');
    if (existing) existing.remove();
    PW.currentQuoteId = quoteId;
    PW.panelOpen = true;
    const panel = document.createElement('div');
    panel.id = 'lifecyclePanel';
    panel.className = 'lifecycle-panel';
    panel.innerHTML = `
        <div class="lifecycle-panel-header">
            <div><h3 class="lifecycle-panel-title">🚀 Procurement Workspace</h3><div id="lcPanelSubtitle" class="lifecycle-panel-subtitle">Loading…</div></div>
            <button class="pw-close-btn" id="btnCloseLifecycle">✕</button>
        </div>
        <div class="lifecycle-panel-body" id="lifecyclePanelBody">
            <div style="padding:2rem;text-align:center;">${pwSpinner()}<p style="margin-top:1rem;color:#94a3b8;">Loading lifecycle data…</p></div>
        </div>`;
    document.body.appendChild(panel);
    document.getElementById('btnCloseLifecycle').addEventListener('click', closeLifecyclePanel);
    const backdrop = document.createElement('div');
    backdrop.id = 'lifecycleBackdrop';
    backdrop.className = 'lifecycle-backdrop';
    backdrop.addEventListener('click', closeLifecyclePanel);
    document.body.insertBefore(backdrop, panel);
    requestAnimationFrame(() => { panel.classList.add('panel-open'); backdrop.classList.add('backdrop-visible'); });
    await loadAndRenderLifecycle(quoteId);
}

function closeLifecyclePanel() {
    const panel = document.getElementById('lifecyclePanel');
    const backdrop = document.getElementById('lifecycleBackdrop');
    if (panel) { panel.classList.remove('panel-open'); panel.classList.add('panel-closing'); setTimeout(() => panel.remove(), 350); }
    if (backdrop) { backdrop.classList.remove('backdrop-visible'); setTimeout(() => backdrop.remove(), 350); }
    PW.panelOpen = false;
    PW.currentQuoteId = null;
}

async function loadAndRenderLifecycle(quoteId) {
    try {
        const res = await pwApiGet(`/procurement/lifecycle/quote/${quoteId}`);
        if (!res.success) { showLifecycleError(res.message || 'Failed to load lifecycle'); return; }
        PW.currentLifecycle = res.lifecycle;
        const { quote, items, responses, purchase_orders, invoices, sendLog } = res.lifecycle;
        const subtitle = document.getElementById('lcPanelSubtitle');
        if (subtitle) subtitle.textContent = `${quote.quote_number} • ${quote.supplier_name} • ${items.length} item(s)`;
        const body = document.getElementById('lifecyclePanelBody');
        if (body) body.innerHTML = renderLifecycleContent(quote, items, responses, purchase_orders, invoices, sendLog);
        bindLifecycleEvents(quoteId, quote, items, responses, purchase_orders, invoices);
    } catch (err) {
        console.error('loadAndRenderLifecycle error:', err);
        showLifecycleError('Network error loading lifecycle');
    }
}

function showLifecycleError(msg) {
    const body = document.getElementById('lifecyclePanelBody');
    if (body) body.innerHTML = `<div style="padding:2rem;text-align:center;color:#ef4444;">⚠ ${escHtml(msg)}</div>`;
}

function renderLifecycleContent(quote, items, responses, purchase_orders, invoices, sendLog) {
    const po = purchase_orders && purchase_orders.length ? purchase_orders[0] : null;
    return `
        ${renderStage1(quote, items)}
        ${renderStage2(quote, responses, sendLog)}
        ${renderStage3(quote, items)}
        ${renderStage4(po, quote)}
        ${renderStage5(po, invoices)}
    `;
}

// ============================================================
// STAGE 1: Quote Overview
// ============================================================
function renderStage1(quote, items) {
    const isActive = ['Draft', 'Sent to Supplier', 'Received'].includes(quote.status);
    const isDone = ['Under Approval', 'Approved', 'Rejected'].includes(quote.status) || (quote.status && !['Draft', 'Sent to Supplier', 'Received'].includes(quote.status));
    const cls = isDone ? 'stage-done' : isActive ? 'stage-active' : 'stage-pending';
    const icon = isDone ? '✅' : '📋';

    const itemRows = items.map(item => `
        <tr>
            <td>${escHtml(item.item_description)}</td>
            <td>${escHtml(item.part_number || '—')}</td>
            <td>${item.quantity || 1}</td>
            <td>${item.unit_price ? pwFmtPrice(item.unit_price, item.currency) : '<span class="pw-muted">Pending</span>'}</td>
            <td>${item.total_price ? pwFmtPrice(item.total_price, item.currency) : '<span class="pw-muted">Pending</span>'}</td>
            <td>${escHtml(item.building || '—')}</td>
            <td>${pwFmtDate(item.date_needed)}</td>
            <td>${item.files && item.files.length ? item.files.map(f => `<a href="${f.path}" target="_blank" class="pw-pdf-badge" style="display:inline-flex;align-items:center;gap:0.25rem;padding:0.15rem 0.4rem;background:#1e3a5f;border-radius:0.25rem;font-size:0.7rem;color:#60a5fa;text-decoration:none;">📄 ${escHtml(f.name)}</a>`).join(' ') : '<span class="pw-muted">—</span>'}</td>
        </tr>`).join('');

    return `<div class="lifecycle-stage ${cls}" id="stage1"><div class="stage-header">${icon}<div class="stage-title-area"><div class="stage-title">📋 Quote Overview</div><div class="stage-meta">${escHtml(quote.quote_number)} • ${pwStatusBadge(quote.status, 'quote')} • ${pwFmtDate(quote.created_at)}</div></div></div><div class="stage-body"><div class="pw-meta-grid"><div class="pw-meta-item"><span class="pw-detail-label">Supplier</span><span class="pw-detail-value">${escHtml(quote.supplier_name)}</span></div><div class="pw-meta-item"><span class="pw-detail-label">Total</span><span class="pw-detail-value" style="color:#10b981;font-weight:600;">${quote.total_amount ? pwFmtPrice(quote.total_amount, quote.currency) : 'Pending'}</span></div><div class="pw-meta-item"><span class="pw-detail-label">Valid Until</span><span class="pw-detail-value">${pwFmtDate(quote.valid_until)}</span></div><div class="pw-meta-item"><span class="pw-detail-label">Items</span><span class="pw-detail-value">${items.length}</span></div>${quote.notes ? `<div class="pw-meta-item pw-meta-full"><span class="pw-detail-label">Notes</span><span class="pw-detail-value">${escHtml(quote.notes)}</span></div>` : ''}</div><div class="pw-subsection-title" style="margin-top:1rem;">Quote Items</div><div class="pw-table-wrapper"><table class="pw-table"><thead><tr><th>Description</th><th>Part #</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Building</th><th>Date Needed</th><th>Files</th></tr></thead><tbody>${itemRows}</tbody></table></div></div></div>`;
}

// ============================================================
// STAGE 2: Supplier Interaction
// ============================================================
function renderStage2(quote, responses, sendLog) {
    const hasResponse = responses && responses.length > 0;
    const isActive = quote.status === 'Sent to Supplier' || quote.status === 'Received';
    const isDone = hasResponse || ['Under Approval', 'Approved'].includes(quote.status);
    const cls = isDone ? 'stage-done' : isActive ? 'stage-active' : 'stage-pending';
    const icon = isDone ? '✅' : '📧';
    const canAddResponse = ['Draft', 'Sent to Supplier', 'Received'].includes(quote.status);

    const sendLogHtml = sendLog && sendLog.length
        ? `<div class="pw-subsection-title" style="margin-top:1rem;">Send History</div><div style="font-size:0.8rem;">${sendLog.map(l => `<div style="display:flex;gap:0.5rem;align-items:center;padding:0.25rem 0;border-bottom:1px solid rgba(148,163,184,0.1);"><span style="color:#64748b;">${pwFmtDateTime(l.sent_at)}</span><span>${escHtml(l.recipient_email || '')}</span><span style="color:#94a3b8;">— ${escHtml(l.sent_by_name || '')}</span></div>`).join('')}</div>`
        : '';

    const existingResponses = (responses || []).map(r => `<div class="pw-response-card" style="margin-bottom:0.75rem;" data-response-id="${r.id}"><div class="pw-response-header"><span>${escHtml(r.item_description || 'All items')}</span>${pwStatusBadge(r.status, 'response')}${pwStatusBadge(r.availability, 'availability')}<span class="pw-muted">${pwFmtDateTime(r.responded_at)}</span><button class="btn btn-secondary btn-sm pw-edit-response-btn" style="margin-left:auto;padding:0.2rem 0.6rem;font-size:0.75rem;" data-response-id="${r.id}">✏️ Edit</button></div><div class="pw-response-details">${r.unit_price ? `<div><span class="pw-detail-label">Unit Price:</span> <strong>${pwFmtPrice(r.unit_price, r.currency)}</strong></div>` : ''}${r.total_price ? `<div><span class="pw-detail-label">Total:</span> <strong>${pwFmtPrice(r.total_price, r.currency)}</strong></div>` : ''}${r.promised_delivery_date ? `<div><span class="pw-detail-label">Promised Delivery:</span> ${pwFmtDate(r.promised_delivery_date)}</div>` : ''}${r.lead_time_days ? `<div><span class="pw-detail-label">Lead Time:</span> ${r.lead_time_days} days</div>` : ''}${r.has_alternative ? `<div style="margin-top:0.5rem;padding:0.5rem;background:#1e293b;border-radius:0.375rem;border-left:3px solid #f59e0b;"><strong>Alternative:</strong> ${escHtml(r.alternative_description || '')} ${r.alternative_unit_price ? '— ' + pwFmtPrice(r.alternative_unit_price, r.currency) : ''}</div>` : ''}${r.supplier_notes ? `<div><span class="pw-detail-label">Supplier Notes:</span> ${escHtml(r.supplier_notes)}</div>` : ''}${r.internal_notes ? `<div><span class="pw-detail-label">Internal Notes:</span> ${escHtml(r.internal_notes)}</div>` : ''}${r.response_document_id ? `<div style="margin-top:0.4rem;"><a class="pw-pdf-badge" href="/api/documents/${r.response_document_id}/download" target="_blank" style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.2rem 0.6rem;background:#1e3a5f;border-radius:0.375rem;font-size:0.75rem;color:#60a5fa;text-decoration:none;">📄 PDF</a></div>` : ''}<div style="font-size:0.75rem;color:#64748b;margin-top:0.3rem;">Recorded by ${escHtml(r.recorded_by_name || '—')}</div><div id="pw-edit-form-${r.id}" class="hidden" style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid rgba(148,163,184,0.2);"></div></div></div>`).join('');

    const addResponseForm = canAddResponse ? `<div class="pw-subsection-title" style="margin-top:1rem;">Record Supplier Response</div><div class="pw-form-row"><div class="pw-form-group"><label class="pw-label">Unit Price</label><input type="number" id="respUnitPrice" class="pw-form-control" step="0.01" placeholder="0.00"></div><div class="pw-form-group"><label class="pw-label">Total Price</label><input type="number" id="respTotalPrice" class="pw-form-control" step="0.01" placeholder="0.00"></div><div class="pw-form-group"><label class="pw-label">Currency</label><select id="respCurrency" class="pw-form-control"><option value="EUR">EUR</option><option value="BGN">BGN</option><option value="USD">USD</option><option value="GBP">GBP</option></select></div></div><div class="pw-form-row"><div class="pw-form-group"><label class="pw-label">Promised Delivery</label><input type="date" id="respDeliveryDate" class="pw-form-control"></div><div class="pw-form-group"><label class="pw-label">Lead Time (days)</label><input type="number" id="respLeadTime" class="pw-form-control" placeholder="e.g. 14"></div><div class="pw-form-group"><label class="pw-label">Availability</label><select id="respAvailability" class="pw-form-control"><option value="available">Available</option><option value="in_stock">In Stock</option><option value="on_order">On Order</option><option value="partial">Partial</option><option value="unavailable">Unavailable</option></select></div></div><div class="pw-form-group"><label class="pw-label">Supplier Notes</label><textarea id="respSupplierNotes" class="pw-form-control" rows="2" placeholder="Notes from supplier…"></textarea></div><div class="pw-form-group"><label class="pw-label">Internal Notes</label><textarea id="respInternalNotes" class="pw-form-control" rows="2" placeholder="Internal notes…"></textarea></div><div style="display:flex;gap:0.5rem;align-items:center;"><button class="btn btn-primary" id="btnRecordResponse">💾 Save Response</button><label style="cursor:pointer;display:flex;align-items:center;gap:0.4rem;font-size:0.85rem;"><input type="checkbox" id="respHasAlternative"> Has Alternative</label></div><div id="respAlternativeArea" class="hidden" style="margin-top:0.75rem;padding:0.75rem;background:#0f172a;border-radius:6px;border-left:3px solid #f59e0b;"><div class="pw-form-row"><div class="pw-form-group"><label class="pw-label">Alternative Description</label><input type="text" id="respAltDesc" class="pw-form-control" placeholder="Alternative product…"></div><div class="pw-form-group"><label class="pw-label">Alternative Unit Price</label><input type="number" id="respAltPrice" class="pw-form-control" step="0.01"></div></div></div>` : '';

    return `<div class="lifecycle-stage ${cls}" id="stage2"><div class="stage-header">${icon}<div class="stage-title-area"><div class="stage-title">📧 Supplier Interaction</div><div class="stage-meta">${hasResponse ? `${responses.length} response(s) recorded` : 'Awaiting supplier response'}</div></div></div><div class="stage-body">${sendLogHtml}${existingResponses ? `<div class="pw-subsection-title" style="margin-top:${sendLogHtml ? '1rem' : '0'};">Responses Received</div>${existingResponses}` : ''}${addResponseForm}</div></div>`;
}

// ============================================================
// STAGE 3: Approval
// ============================================================
function renderStage3(quote, items) {
    const isApproved = quote.status === 'Approved';
    const isUnderApproval = quote.status === 'Under Approval';
    const isRejected = quote.status === 'Rejected';
    const canSubmit = ['Draft', 'Received'].includes(quote.status);
    const isDone = isApproved;
    const cls = isDone ? 'stage-done' : isUnderApproval ? 'stage-active' : isRejected ? 'stage-error' : 'stage-pending';
    const icon = isDone ? '✅' : isRejected ? '❌' : '🔄';

    const submitButton = canSubmit ? `<button class="btn btn-primary" id="btnSubmitApproval" style="margin-top:1rem;">📋 Submit for Approval</button>` : '';
    const statusMessage = isUnderApproval
        ? `<div style="padding:0.75rem;background:#1e3a5f;border-radius:6px;border-left:3px solid #3b82f6;"><strong>🔄 Under Review</strong> — Awaiting manager approval.</div>`
        : isApproved
            ? `<div style="padding:0.75rem;background:#064e3b;border-radius:6px;border-left:3px solid #10b981;"><strong>✅ Approved</strong> — Quote has been approved.</div>`
            : isRejected
                ? `<div style="padding:0.75rem;background:#450a0a;border-radius:6px;border-left:3px solid #ef4444;"><strong>❌ Rejected</strong> — Quote was rejected.</div>`
                : `<div style="color:#94a3b8;font-size:0.9rem;">Quote must be submitted for manager approval before a PO can be created.</div>`;

    return `<div class="lifecycle-stage ${cls}" id="stage3"><div class="stage-header">${icon}<div class="stage-title-area"><div class="stage-title">✅ Approval</div><div class="stage-meta">${isApproved ? 'Approved' : isUnderApproval ? 'Under Review' : isRejected ? 'Rejected' : 'Pending'}</div></div></div><div class="stage-body">${statusMessage}${submitButton}</div></div>`;
}

// ============================================================
// STAGE 4: Purchase Order
// ============================================================
function renderStage4(po, quote) {
    const hasPO = !!po;
    const canCreatePO = quote.status === 'Approved' && !hasPO;
    const isDone = hasPO && (po.status === 'delivered' || po.status === 'confirmed');
    const cls = isDone ? 'stage-done' : hasPO ? 'stage-active' : 'stage-pending';
    const icon = isDone ? '✅' : hasPO ? '📦' : '⏳';

    let poDetails = '';
    if (hasPO) {
        poDetails = `<div class="pw-meta-grid"><div class="pw-meta-item"><span class="pw-detail-label">PO Number</span><span class="pw-detail-value" style="font-weight:600;color:#06b6d4;">${escHtml(po.po_number)}</span></div><div class="pw-meta-item"><span class="pw-detail-label">Status</span>${pwStatusBadge(po.status, 'po')}</div><div class="pw-meta-item"><span class="pw-detail-label">Total</span><span class="pw-detail-value">${pwFmtPrice(po.total_amount, po.currency)}</span></div><div class="pw-meta-item"><span class="pw-detail-label">Expected Delivery</span><span class="pw-detail-value">${pwFmtDate(po.expected_delivery_date)}</span></div>${po.actual_delivery_date ? `<div class="pw-meta-item"><span class="pw-detail-label">Actual Delivery</span><span class="pw-detail-value">${pwFmtDate(po.actual_delivery_date)}</span></div>` : ''}</div>`;
        if (!['delivered', 'cancelled'].includes(po.status)) {
            poDetails += `<div style="margin-top:1rem;"><div class="pw-subsection-title">Update PO Status</div><div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem;">${po.status === 'draft' ? `<button class="btn btn-primary btn-sm pw-po-status-btn" data-status="sent">📤 Mark as Sent</button>` : ''}${po.status === 'sent' ? `<button class="btn btn-primary btn-sm pw-po-status-btn" data-status="confirmed">✅ Confirm PO</button>` : ''}${po.status !== 'delivered' && po.status !== 'cancelled' ? `<button class="btn btn-success btn-sm pw-po-status-btn" data-status="delivered">🚚 Mark Delivered</button>` : ''}<button class="btn btn-secondary btn-sm pw-po-status-btn" data-status="cancelled">❌ Cancel PO</button></div>${(po.status === 'confirmed' || po.status === 'sent') ? `<div style="margin-top:0.5rem;"><label class="pw-label">Actual Delivery Date</label><input type="date" id="poActualDelivery" class="pw-form-control" style="max-width:200px;margin-top:0.25rem;"></div>` : ''}</div>`;
        }
    }

    const createPOForm = canCreatePO ? `<div class="pw-subsection-title" style="margin-top:${hasPO ? '1rem' : '0'};">Create Purchase Order</div><div class="pw-form-row"><div class="pw-form-group"><label class="pw-label">Currency</label><select id="poCurrency" class="pw-form-control"><option value="EUR">EUR</option><option value="BGN">BGN</option><option value="USD">USD</option><option value="GBP">GBP</option></select></div><div class="pw-form-group"><label class="pw-label">Expected Delivery</label><input type="date" id="poExpectedDelivery" class="pw-form-control"></div></div><div class="pw-form-group"><label class="pw-label">Delivery Address</label><input type="text" id="poDeliveryAddress" class="pw-form-control" placeholder="Delivery address…"></div><div class="pw-form-group"><label class="pw-label">Payment Terms</label><input type="text" id="poPaymentTerms" class="pw-form-control" placeholder="e.g. Net 30"></div><div class="pw-form-group"><label class="pw-label">Notes</label><textarea id="poNotes" class="pw-form-control" rows="2" placeholder="PO notes…"></textarea></div><button class="btn btn-primary" id="btnCreatePO">📦 Create Purchase Order</button>` : '';

    return `<div class="lifecycle-stage ${cls}" id="stage4"><div class="stage-header">${icon}<div class="stage-title-area"><div class="stage-title">📦 Purchase Order</div><div class="stage-meta">${hasPO ? `PO ${po.po_number}` : 'No PO yet'}</div></div></div><div class="stage-body po-panel">${poDetails}${createPOForm}${!hasPO && !canCreatePO ? `<p class="pw-muted">Quote must be approved before creating a PO.</p>` : ''}</div></div>`;
}

// ============================================================
// STAGE 5: Invoice & Accounting
// ============================================================
function renderStage5(po, invoices) {
    const hasInvoices = invoices && invoices.length > 0;
    const canAddInvoice = po && po.status !== 'cancelled';
    const isDone = hasInvoices && invoices.some(i => i.status === 'paid' || i.status === 'booked');
    const cls = isDone ? 'stage-done' : hasInvoices ? 'stage-active' : 'stage-pending';
    const icon = isDone ? '✅' : '🧾';

    const invoiceRows = hasInvoices ? invoices.map(inv => `<div class="pw-invoice-card" data-invoice-id="${inv.id}"><div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;"><span style="font-weight:600;">${escHtml(inv.invoice_number || 'N/A')}</span>${pwStatusBadge(inv.status, 'invoice')}<span class="pw-muted">${pwFmtDateTime(inv.received_at)}</span><button class="btn btn-secondary btn-sm pw-invoice-status-btn" style="margin-left:auto;padding:0.15rem 0.5rem;font-size:0.75rem;" data-invoice-id="${inv.id}">📤 Update Status</button></div><div class="pw-meta-grid" style="margin-top:0.5rem;"><div class="pw-meta-item"><span class="pw-detail-label">Amount</span><span>${pwFmtPrice(inv.amount, inv.currency)}</span></div><div class="pw-meta-item"><span class="pw-detail-label">VAT</span><span>${pwFmtPrice(inv.vat_amount, inv.currency)}</span></div><div class="pw-meta-item"><span class="pw-detail-label">Total</span><span style="font-weight:600;color:#10b981;">${pwFmtPrice(inv.total_amount, inv.currency)}</span></div><div class="pw-meta-item"><span class="pw-detail-label">Due</span><span>${pwFmtDate(inv.due_date)}</span></div></div>${inv.accounting_notes ? `<div style="font-size:0.8rem;color:#94a3b8;margin-top:0.3rem;">Accounting: ${escHtml(inv.accounting_notes)}</div>` : ''}${inv.booking_reference ? `<div style="font-size:0.8rem;color:#94a3b8;">Booking ref: ${escHtml(inv.booking_reference)}</div>` : ''}<div id="inv-status-form-${inv.id}" class="hidden" style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid rgba(148,163,184,0.2);"></div></div>`).join('') : '';

    return `<div class="lifecycle-stage ${cls}" id="stage5"><div class="stage-header">${icon}<div class="stage-title-area"><div class="stage-title">🧾 Invoice &amp; Accounting</div><div class="stage-meta">${invoices && invoices.length ? `${invoices.length} invoice(s)` : 'No invoices yet'}</div></div></div><div class="stage-body invoice-panel">${invoiceRows}${canAddInvoice ? `<div class="pw-subsection-title" style="margin-top:1rem;">Record New Invoice</div><div class="pw-form-row"><div class="pw-form-group"><label class="pw-label">Supplier Invoice #</label><input type="text" id="invNumber" class="pw-form-control" placeholder="Supplier's invoice number"></div><div class="pw-form-group"><label class="pw-label">Invoice Date</label><input type="date" id="invDate" class="pw-form-control"></div><div class="pw-form-group"><label class="pw-label">Due Date</label><input type="date" id="invDueDate" class="pw-form-control"></div></div><div class="pw-form-row"><div class="pw-form-group"><label class="pw-label">Amount (excl. VAT)</label><input type="number" id="invAmount" class="pw-form-control" step="0.01" placeholder="0.00"></div><div class="pw-form-group"><label class="pw-label">VAT Amount</label><input type="number" id="invVat" class="pw-form-control" step="0.01" placeholder="0.00"></div><div class="pw-form-group"><label class="pw-label">Total</label><input type="number" id="invTotal" class="pw-form-control" step="0.01" placeholder="0.00"></div><div class="pw-form-group"><label class="pw-label">Currency</label><select id="invCurrency" class="pw-form-control"><option value="EUR">EUR</option><option value="BGN">BGN</option><option value="USD">USD</option><option value="GBP">GBP</option></select></div></div><div class="pw-form-group"><label class="pw-label">Notes</label><textarea id="invNotes" class="pw-form-control" rows="2" placeholder="Invoice notes…"></textarea></div><button class="btn btn-primary" id="btnRecordInvoice">🧾 Record Invoice</button>` : `<p class="pw-muted">No purchase order linked yet.</p>`}</div></div>`;
}

// ============================================================
// C. LIFECYCLE PANEL EVENT BINDINGS
// ============================================================
function bindLifecycleEvents(quoteId, quote, items, responses, purchase_orders, invoices) {
    const po = purchase_orders && purchase_orders.length ? purchase_orders[0] : null;

    // --- Stage 2: Record Response ---
    const btnRecordResp = document.getElementById('btnRecordResponse');
    if (btnRecordResp) {
        btnRecordResp.addEventListener('click', async () => {
            const unitPrice = parseFloat(document.getElementById('respUnitPrice')?.value) || null;
            const totalPrice = parseFloat(document.getElementById('respTotalPrice')?.value) || null;
            const currency = document.getElementById('respCurrency')?.value || 'EUR';
            const deliveryDate = document.getElementById('respDeliveryDate')?.value || null;
            const leadTime = parseInt(document.getElementById('respLeadTime')?.value) || null;
            const availability = document.getElementById('respAvailability')?.value || 'available';
            const supplierNotes = document.getElementById('respSupplierNotes')?.value || null;
            const internalNotes = document.getElementById('respInternalNotes')?.value || null;
            const hasAlt = document.getElementById('respHasAlternative')?.checked || false;
            const altDesc = document.getElementById('respAltDesc')?.value || null;
            const altPrice = parseFloat(document.getElementById('respAltPrice')?.value) || null;

            const payload = {
                unit_price: unitPrice, total_price: totalPrice, currency,
                promised_delivery_date: deliveryDate, lead_time_days: leadTime,
                availability, supplier_notes: supplierNotes, internal_notes: internalNotes,
                has_alternative: hasAlt, alternative_description: altDesc, alternative_unit_price: altPrice,
                status: 'pending'
            };

            try {
                btnRecordResp.disabled = true; btnRecordResp.textContent = 'Saving…';
                const res = await pwApiPost(`/procurement/quotes/${quoteId}/responses`, payload);
                if (res.success) {
                    showToast('Response recorded', 'success');
                    await loadAndRenderLifecycle(quoteId);
                } else {
                    showToast(res.message || 'Failed to save response', 'error');
                    btnRecordResp.disabled = false; btnRecordResp.textContent = '💾 Save Response';
                }
            } catch (err) {
                console.error('btnRecordResponse error:', err);
                showToast('Network error', 'error');
                btnRecordResp.disabled = false; btnRecordResp.textContent = '💾 Save Response';
            }
        });
    }

    // Alternative toggle
    const altCheck = document.getElementById('respHasAlternative');
    if (altCheck) {
        altCheck.addEventListener('change', () => {
            const area = document.getElementById('respAlternativeArea');
            if (area) area.classList.toggle('hidden', !altCheck.checked);
        });
    }

    // Edit response buttons
    document.querySelectorAll('#lifecyclePanelBody .pw-edit-response-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const rid = btn.dataset.responseId;
            const formDiv = document.getElementById(`pw-edit-form-${rid}`);
            if (!formDiv) return;
            if (!formDiv.classList.contains('hidden')) { formDiv.classList.add('hidden'); return; }
            const resp = responses.find(r => String(r.id) === String(rid));
            if (!resp) return;
            formDiv.classList.remove('hidden');
            formDiv.innerHTML = `<div class="pw-form-row"><div class="pw-form-group"><label class="pw-label">Unit Price</label><input type="number" id="editRespUP_${rid}" class="pw-form-control" step="0.01" value="${resp.unit_price || ''}"></div><div class="pw-form-group"><label class="pw-label">Total Price</label><input type="number" id="editRespTP_${rid}" class="pw-form-control" step="0.01" value="${resp.total_price || ''}"></div><div class="pw-form-group"><label class="pw-label">Status</label><select id="editRespStatus_${rid}" class="pw-form-control"><option value="pending" ${resp.status === 'pending' ? 'selected' : ''}>Pending</option><option value="accepted" ${resp.status === 'accepted' ? 'selected' : ''}>Accepted</option><option value="rejected" ${resp.status === 'rejected' ? 'selected' : ''}>Rejected</option><option value="negotiating" ${resp.status === 'negotiating' ? 'selected' : ''}>Negotiating</option></select></div></div><div class="pw-form-group"><label class="pw-label">Internal Notes</label><textarea id="editRespNotes_${rid}" class="pw-form-control" rows="2">${escHtml(resp.internal_notes || '')}</textarea></div><button class="btn btn-primary btn-sm" id="btnSaveEditResp_${rid}">💾 Update</button>`;
            document.getElementById(`btnSaveEditResp_${rid}`).addEventListener('click', async () => {
                const payload = {
                    unit_price: parseFloat(document.getElementById(`editRespUP_${rid}`)?.value) || null,
                    total_price: parseFloat(document.getElementById(`editRespTP_${rid}`)?.value) || null,
                    status: document.getElementById(`editRespStatus_${rid}`)?.value,
                    internal_notes: document.getElementById(`editRespNotes_${rid}`)?.value || null
                };
                try {
                    const res = await pwApiPut(`/procurement/quotes/responses/${rid}`, payload);
                    if (res.success) { showToast('Response updated', 'success'); await loadAndRenderLifecycle(quoteId); }
                    else showToast(res.message || 'Update failed', 'error');
                } catch (err) { showToast('Network error', 'error'); }
            });
        });
    });

    // --- Stage 3: Submit for Approval ---
    const btnSubmitApproval = document.getElementById('btnSubmitApproval');
    if (btnSubmitApproval) {
        btnSubmitApproval.addEventListener('click', () => {
            if (typeof openSubmitForApprovalDialog === 'function') {
                openSubmitForApprovalDialog(quoteId);
            } else {
                alert('Approval submission module not loaded.');
            }
        });
    }

    // --- Stage 4: Create PO ---
    const btnCreatePO = document.getElementById('btnCreatePO');
    if (btnCreatePO) {
        btnCreatePO.addEventListener('click', async () => {
            const currency = document.getElementById('poCurrency')?.value || 'EUR';
            const expectedDelivery = document.getElementById('poExpectedDelivery')?.value || null;
            const deliveryAddress = document.getElementById('poDeliveryAddress')?.value || null;
            const paymentTerms = document.getElementById('poPaymentTerms')?.value || null;
            const notes = document.getElementById('poNotes')?.value || null;
            const payload = {
                quote_id: quoteId,
                supplier_id: PW.currentLifecycle?.quote?.supplier_id,
                currency, expected_delivery_date: expectedDelivery,
                delivery_address: deliveryAddress, payment_terms: paymentTerms, notes
            };
            try {
                btnCreatePO.disabled = true; btnCreatePO.textContent = 'Creating…';
                const res = await pwApiPost('/procurement/purchase-orders', payload);
                if (res.success) {
                    showToast(`PO ${res.poNumber} created`, 'success');
                    await loadAndRenderLifecycle(quoteId);
                } else {
                    showToast(res.message || 'Failed to create PO', 'error');
                    btnCreatePO.disabled = false; btnCreatePO.textContent = '📦 Create Purchase Order';
                }
            } catch (err) {
                console.error('btnCreatePO error:', err);
                showToast('Network error', 'error');
                btnCreatePO.disabled = false; btnCreatePO.textContent = '📦 Create Purchase Order';
            }
        });
    }

    // PO Status Update buttons
    document.querySelectorAll('#lifecyclePanelBody .pw-po-status-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!po) return;
            const newStatus = btn.dataset.status;
            const actualDelivery = newStatus === 'delivered' ? document.getElementById('poActualDelivery')?.value || null : null;
            try {
                const res = await pwApiPut(`/procurement/purchase-orders/${po.id}`, { status: newStatus, actual_delivery_date: actualDelivery });
                if (res.success) {
                    showToast(`PO status updated to ${newStatus}`, 'success');
                    await loadAndRenderLifecycle(quoteId);
                } else showToast(res.message || 'Update failed', 'error');
            } catch (err) { showToast('Network error', 'error'); }
        });
    });

    // --- Stage 5: Invoice ---
    const btnRecordInvoice = document.getElementById('btnRecordInvoice');
    if (btnRecordInvoice) {
        btnRecordInvoice.addEventListener('click', async () => {
            const payload = {
                po_id: po ? po.id : null,
                quote_id: quoteId,
                supplier_id: PW.currentLifecycle?.quote?.supplier_id,
                invoice_number: document.getElementById('invNumber')?.value || null,
                invoice_date: document.getElementById('invDate')?.value || null,
                due_date: document.getElementById('invDueDate')?.value || null,
                amount: parseFloat(document.getElementById('invAmount')?.value) || 0,
                vat_amount: parseFloat(document.getElementById('invVat')?.value) || 0,
                total_amount: parseFloat(document.getElementById('invTotal')?.value) || 0,
                currency: document.getElementById('invCurrency')?.value || 'EUR',
                notes: document.getElementById('invNotes')?.value || null
            };
            try {
                btnRecordInvoice.disabled = true; btnRecordInvoice.textContent = 'Recording…';
                const res = await pwApiPost('/procurement/invoices', payload);
                if (res.success) {
                    showToast('Invoice recorded', 'success');
                    await loadAndRenderLifecycle(quoteId);
                } else {
                    showToast(res.message || 'Failed to record invoice', 'error');
                    btnRecordInvoice.disabled = false; btnRecordInvoice.textContent = '🧾 Record Invoice';
                }
            } catch (err) {
                console.error('btnRecordInvoice error:', err);
                showToast('Network error', 'error');
                btnRecordInvoice.disabled = false; btnRecordInvoice.textContent = '🧾 Record Invoice';
            }
        });
    }

    // Invoice status update buttons
    document.querySelectorAll('#lifecyclePanelBody .pw-invoice-status-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const invId = btn.dataset.invoiceId;
            const formDiv = document.getElementById(`inv-status-form-${invId}`);
            if (!formDiv) return;
            if (!formDiv.classList.contains('hidden')) { formDiv.classList.add('hidden'); return; }
            formDiv.classList.remove('hidden');
            formDiv.innerHTML = `<div class="pw-form-row"><div class="pw-form-group"><label class="pw-label">New Status</label><select id="invStatusSel_${invId}" class="pw-form-control"><option value="received">Received</option><option value="verified">Verified</option><option value="sent_to_accounting">Sent to Accounting</option><option value="booked">Booked</option><option value="paid">Paid</option><option value="disputed">Disputed</option></select></div></div><div class="pw-form-group"><label class="pw-label">Accounting Notes</label><textarea id="invAccNotes_${invId}" class="pw-form-control" rows="2" placeholder="Notes for accounting…"></textarea></div><div class="pw-form-group"><label class="pw-label">Booking Reference</label><input type="text" id="invBookRef_${invId}" class="pw-form-control" placeholder="e.g. ACC-2024-001"></div><button class="btn btn-primary btn-sm" id="btnSaveInvStatus_${invId}">💾 Save</button>`;
            document.getElementById(`btnSaveInvStatus_${invId}`).addEventListener('click', async () => {
                const payload = {
                    status: document.getElementById(`invStatusSel_${invId}`)?.value,
                    accounting_notes: document.getElementById(`invAccNotes_${invId}`)?.value || null,
                    booking_reference: document.getElementById(`invBookRef_${invId}`)?.value || null
                };
                try {
                    const res = await pwApiPut(`/procurement/invoices/${invId}`, payload);
                    if (res.success) { showToast('Invoice updated', 'success'); await loadAndRenderLifecycle(quoteId); }
                    else showToast(res.message || 'Update failed', 'error');
                } catch (err) { showToast('Network error', 'error'); }
            });
        });
    });
}

// ============================================================
// EXPORTS (attach to window for global access)
// ============================================================
window.openEnhancedCreateQuoteModal = openEnhancedCreateQuoteModal;
window.openEnhancedQuoteModal = openEnhancedQuoteModal;
window.closeEnhancedQuoteModal = closeEnhancedQuoteModal;
window.openQuoteLifecyclePanel = openQuoteLifecyclePanel;
window.closeLifecyclePanel = closeLifecyclePanel;
window.renderLifecycleBadge = renderLifecycleBadge;
window.getAISuggestionsForOrders = getAISuggestionsForOrders;
window.showToast = showToast;

// ============================================================
// INIT
// ============================================================
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (PW.panelOpen) closeLifecyclePanel();
        const wizard = document.getElementById('pwWizardOverlay');
        if (wizard) closeEnhancedQuoteModal();
    }
});
