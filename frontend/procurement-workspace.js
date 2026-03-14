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
        renderLifecyclePanel(res.lifecycle);
    } catch (err) { console.error('loadAndRenderLifecycle error:', err); showLifecycleError('Network error loading lifecycle'); }
}

function showLifecycleError(msg) {
    const body = document.getElementById('lifecyclePanelBody');
    if (body) body.innerHTML = `<div style="padding:2rem;text-align:center;"><div style="font-size:3rem;">⚠️</div><p style="color:#ef4444;margin-top:1rem;">${escHtml(msg)}</p><button class="btn btn-secondary" style="margin-top:1rem;" onclick="loadAndRenderLifecycle(PW.currentQuoteId)">↺ Retry</button></div>`;
}

// ============================================================
// C. LIFECYCLE PANEL RENDERING
// ============================================================

function renderLifecyclePanel(lc) {
    const body = document.getElementById('lifecyclePanelBody');
    const subtitle = document.getElementById('lcPanelSubtitle');
    if (!body || !lc) return;

    if (subtitle) {
        subtitle.textContent = `Quote #${lc.quote?.quote_number || lc.quote?.id || '?'} · ${lc.quote?.supplier_name || ''}`.trim().replace(/·\s*$/, '');
    }

    const currentStage = determineCurrentStage(lc.quote, lc.responses, lc.purchase_orders, lc.invoices);

    body.innerHTML = `
        ${renderStageNav(currentStage)}
        <div id="lcStageContent" class="lc-stage-content">
            ${renderStageContent(currentStage, lc)}
        </div>
    `;

    bindStageNavEvents(lc);
}

function determineCurrentStage(quote, responses, pos, invoices) {
    if (invoices && invoices.length > 0) return 5;
    if (pos && pos.length > 0) return 4;
    const status = quote?.status || '';
    if (status === 'Approved' || status === 'Under Approval') return 3;
    if (responses && responses.length > 0) return 2;
    return 1;
}

function stageClass(stageNum, currentStage) {
    if (stageNum < currentStage) return 'stage-done';
    if (stageNum === currentStage) return 'stage-active';
    return 'stage-pending';
}

function stageIcon(stageNum, currentStage) {
    if (stageNum < currentStage) return '✓';
    const icons = { 1: '📋', 2: '📩', 3: '✅', 4: '📦', 5: '💰' };
    return icons[stageNum] || stageNum;
}

function renderStageNav(currentStage) {
    const stages = [
        { num: 1, label: 'Quote' },
        { num: 2, label: 'Response' },
        { num: 3, label: 'Approval' },
        { num: 4, label: 'PO' },
        { num: 5, label: 'Invoice' }
    ];
    return `
        <div class="lc-stage-nav">
            ${stages.map(s => `
                <button class="lc-stage-btn ${stageClass(s.num, currentStage)}" data-stage="${s.num}">
                    <span class="lc-stage-icon">${stageIcon(s.num, currentStage)}</span>
                    <span class="lc-stage-label">${s.label}</span>
                </button>
            `).join('<span class="lc-stage-connector"></span>')}
        </div>
    `;
}

function renderStageContent(stage, lc) {
    switch (stage) {
        case 1: return renderStage1(lc.quote, lc.items);
        case 2: return renderStage2(lc.quote, lc.responses, lc.items);
        case 3: return renderStage3(lc.quote, lc.approval);
        case 4: return renderStage4(lc.quote, lc.purchase_orders);
        case 5: return renderStage5(lc.quote, lc.purchase_orders, lc.invoices);
        default: return renderStage1(lc.quote, lc.items);
    }
}

function bindStageNavEvents(lc) {
    document.querySelectorAll('#lifecyclePanelBody .lc-stage-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const stage = parseInt(btn.dataset.stage);
            const content = document.getElementById('lcStageContent');
            if (content) content.innerHTML = renderStageContent(stage, lc);
            document.querySelectorAll('#lifecyclePanelBody .lc-stage-btn').forEach(b => b.classList.remove('stage-active-nav'));
            btn.classList.add('stage-active-nav');
            // Re-bind stage events after content change
            const eventBinders = {
                1: () => {},
                2: () => bindStage2Events(lc.quote, lc.items),
                3: () => bindStage3Events(lc.quote),
                4: () => bindStage4Events(lc.quote, lc.purchase_orders),
                5: () => bindStage5Events(lc.quote, lc.purchase_orders, lc.invoices)
            };
            if (eventBinders[stage]) eventBinders[stage]();
        });
    });
    // Bind events for initial stage
    const currentStage = determineCurrentStage(lc.quote, lc.responses, lc.purchase_orders, lc.invoices);
    const initBinders = {
        2: () => bindStage2Events(lc.quote, lc.items),
        3: () => bindStage3Events(lc.quote),
        4: () => bindStage4Events(lc.quote, lc.purchase_orders),
        5: () => bindStage5Events(lc.quote, lc.purchase_orders, lc.invoices)
    };
    if (initBinders[currentStage]) initBinders[currentStage]();
}

// ============================================================
// STAGE 1: Quote Details
// ============================================================
function renderStage1(quote, items) {
    if (!quote) return '<div class="lc-empty">No quote data</div>';
    let itemsHtml = '';
    if (items && items.length) {
        itemsHtml = `
            <div class="lc-section">
                <div class="lc-section-title">📋 Quote Items (${items.length})</div>
                <div class="pw-table-wrapper">
                    <table class="pw-table">
                        <thead><tr><th>Order #</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Availability</th></tr></thead>
                        <tbody>${items.map(item => `
                            <tr>
                                <td>#${item.order_id || '—'}</td>
                                <td title="${escHtml(item.item_description)}">${escHtml((item.item_description || '').substring(0, 40))}${(item.item_description || '').length > 40 ? '…' : ''}</td>
                                <td>${item.quantity || 1}</td>
                                <td>${pwFmtPrice(item.unit_price, quote.currency)}</td>
                                <td>${pwFmtPrice((item.unit_price || 0) * (item.quantity || 1), quote.currency)}</td>
                                <td>${pwStatusBadge(item.availability_status || 'unknown', 'availability')}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    }
    return `
        <div class="lc-stage-panel">
            <div class="lc-stage-header"><h4>📋 Quote Details</h4>${pwStatusBadge(quote.status, 'quote')}</div>
            <div class="lc-detail-grid">
                <div class="lc-detail-item"><div class="lc-detail-label">Quote Number</div><div class="lc-detail-value" style="font-weight:600;">${escHtml(quote.quote_number || '—')}</div></div>
                <div class="lc-detail-item"><div class="lc-detail-label">Supplier</div><div class="lc-detail-value">${escHtml(quote.supplier_name || '—')}</div></div>
                <div class="lc-detail-item"><div class="lc-detail-label">Created</div><div class="lc-detail-value">${pwFmtDate(quote.created_at)}</div></div>
                <div class="lc-detail-item"><div class="lc-detail-label">Valid Until</div><div class="lc-detail-value">${pwFmtDate(quote.valid_until)}</div></div>
                <div class="lc-detail-item"><div class="lc-detail-label">Currency</div><div class="lc-detail-value">${escHtml(quote.currency || 'EUR')}</div></div>
                <div class="lc-detail-item"><div class="lc-detail-label">Total Value</div><div class="lc-detail-value" style="color:#06b6d4;font-weight:600;">${pwFmtPrice(quote.total_value, quote.currency)}</div></div>
            </div>
            ${quote.notes ? `<div class="lc-section"><div class="lc-section-title">Notes</div><div class="lc-notes-box">${escHtml(quote.notes)}</div></div>` : ''}
            ${itemsHtml}
        </div>`;
}

// ============================================================
// STAGE 2: Supplier Response
// ============================================================
function renderStage2(quote, responses, items) {
    const noResponseHtml = `
        <div class="lc-stage-panel">
            <div class="lc-stage-header"><h4>📩 Supplier Response</h4><span class="pw-badge badge-gray">Awaiting Response</span></div>
            <div class="lc-empty-state">
                <div style="font-size:3rem;">📬</div>
                <p>No supplier response yet.</p>
                <p style="color:#94a3b8;font-size:0.875rem;">Quote sent to ${escHtml(quote?.supplier_name || 'supplier')} on ${pwFmtDate(quote?.sent_at || quote?.created_at)}.</p>
            </div>
            <div class="lc-action-bar">
                <div class="pw-form-group" style="flex:1;min-width:200px;">
                    <label class="pw-label">Upload Supplier Response PDF</label>
                    <input type="file" id="responseFileInput" accept=".pdf" class="pw-form-control">
                </div>
                <div class="pw-form-group">
                    <label class="pw-label">Response Status</label>
                    <select id="responseStatusSelect" class="pw-form-control">
                        <option value="accepted">Accepted</option>
                        <option value="countered">Countered (with changes)</option>
                        <option value="rejected">Rejected</option>
                    </select>
                </div>
                <button class="btn btn-primary" id="btnUploadResponse" style="align-self:flex-end;">📤 Upload Response</button>
            </div>
        </div>`;

    if (!responses || !responses.length) return noResponseHtml;

    const resp = responses[0];
    return `
        <div class="lc-stage-panel">
            <div class="lc-stage-header"><h4>📩 Supplier Response</h4>${pwStatusBadge(resp.status, 'response')}</div>
            <div class="lc-detail-grid">
                <div class="lc-detail-item"><div class="lc-detail-label">Response Date</div><div class="lc-detail-value">${pwFmtDate(resp.response_date || resp.created_at)}</div></div>
                <div class="lc-detail-item"><div class="lc-detail-label">Status</div><div class="lc-detail-value">${pwStatusBadge(resp.status, 'response')}</div></div>
                <div class="lc-detail-item"><div class="lc-detail-label">Valid Until</div><div class="lc-detail-value">${pwFmtDate(resp.valid_until)}</div></div>
                <div class="lc-detail-item"><div class="lc-detail-label">Total Price</div><div class="lc-detail-value" style="color:#06b6d4;font-weight:600;">${pwFmtPrice(resp.total_price, quote?.currency)}</div></div>
            </div>
            ${resp.notes ? `<div class="lc-section"><div class="lc-section-title">Notes</div><div class="lc-notes-box">${escHtml(resp.notes)}</div></div>` : ''}
            ${resp.pdf_path ? `<div class="lc-section"><div class="lc-section-title">Attached PDF</div><a href="/api/procurement/response-pdf/${resp.id}" target="_blank" class="btn btn-secondary btn-sm">📄 Download Response PDF</a></div>` : ''}
            ${resp.status === 'accepted' ? `
                <div class="lc-action-bar">
                    <button class="btn btn-primary" id="btnInitiateApproval">→ Submit for Approval</button>
                </div>` : `
                <div class="lc-action-bar">
                    <div class="pw-form-group" style="flex:1;min-width:200px;">
                        <label class="pw-label">Upload New Response</label>
                        <input type="file" id="responseFileInput" accept=".pdf" class="pw-form-control">
                    </div>
                    <div class="pw-form-group">
                        <label class="pw-label">Response Status</label>
                        <select id="responseStatusSelect" class="pw-form-control">
                            <option value="accepted">Accepted</option>
                            <option value="countered">Countered (with changes)</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    </div>
                    <button class="btn btn-primary" id="btnUploadResponse" style="align-self:flex-end;">📤 Upload Response</button>
                </div>`}
        </div>`;
}

async function pwUploadResponsePdf(file, responseId, orderIds) {
    const formData = new FormData();
    formData.append('file', file);
    if (responseId) formData.append('response_id', responseId);
    if (orderIds && orderIds.length) formData.append('order_ids', JSON.stringify(orderIds));
    const token = localStorage.getItem('authToken') || (typeof authToken !== 'undefined' ? authToken : '');
    const res = await fetch('/api/procurement/upload-response-pdf', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: formData
    });
    return res.json();
}

function bindStage2Events(quote, items) {
    const btnUpload = document.getElementById('btnUploadResponse');
    if (btnUpload) {
        btnUpload.addEventListener('click', async () => {
            const fileInput = document.getElementById('responseFileInput');
            const statusSelect = document.getElementById('responseStatusSelect');
            const file = fileInput?.files?.[0];
            if (!file) { showToast('Please select a PDF file', 'warning'); return; }
            btnUpload.disabled = true;
            btnUpload.innerHTML = pwSpinner() + ' Uploading…';
            try {
                const orderIds = items ? items.map(i => i.order_id).filter(Boolean) : [];
                const uploadResult = await pwUploadResponsePdf(file, null, orderIds);
                if (!uploadResult.success) { showToast('Upload failed: ' + (uploadResult.message || 'Unknown error'), 'error'); btnUpload.disabled = false; btnUpload.textContent = '📤 Upload Response'; return; }
                const status = statusSelect?.value || 'accepted';
                const body = {
                    quote_id: PW.currentQuoteId,
                    status,
                    pdf_path: uploadResult.path || uploadResult.filename,
                    response_date: new Date().toISOString().split('T')[0]
                };
                const res = await pwApiPost('/procurement/supplier-response', body);
                if (res.success) {
                    showToast('Supplier response saved', 'success');
                    await loadAndRenderLifecycle(PW.currentQuoteId);
                } else {
                    showToast('Failed to save response: ' + (res.message || ''), 'error');
                    btnUpload.disabled = false;
                    btnUpload.textContent = '📤 Upload Response';
                }
            } catch (err) {
                console.error('bindStage2Events upload error:', err);
                showToast('Upload error', 'error');
                btnUpload.disabled = false;
                btnUpload.textContent = '📤 Upload Response';
            }
        });
    }
    const btnInitApproval = document.getElementById('btnInitiateApproval');
    if (btnInitApproval) {
        btnInitApproval.addEventListener('click', async () => {
            btnInitApproval.disabled = true;
            btnInitApproval.innerHTML = pwSpinner() + ' Submitting…';
            try {
                const res = await pwApiPost('/procurement/initiate-approval', { quote_id: PW.currentQuoteId });
                if (res.success) {
                    showToast('Submitted for approval', 'success');
                    await loadAndRenderLifecycle(PW.currentQuoteId);
                } else {
                    showToast('Failed: ' + (res.message || ''), 'error');
                    btnInitApproval.disabled = false;
                    btnInitApproval.textContent = '→ Submit for Approval';
                }
            } catch (err) {
                console.error('btnInitiateApproval error:', err);
                showToast('Network error', 'error');
                btnInitApproval.disabled = false;
                btnInitApproval.textContent = '→ Submit for Approval';
            }
        });
    }
}

// ============================================================
// STAGE 3: Approval
// ============================================================
function renderStage3(quote, approval) {
    const status = quote?.status || '';
    if (!approval && status !== 'Under Approval' && status !== 'Approved' && status !== 'Rejected') {
        return `
            <div class="lc-stage-panel">
                <div class="lc-stage-header"><h4>✅ Approval</h4><span class="pw-badge badge-gray">Pending</span></div>
                <div class="lc-empty-state"><div style="font-size:3rem;">📋</div><p>Not yet submitted for approval.</p></div>
            </div>`;
    }
    const approvalBadge = status === 'Approved' ? '<span class="pw-badge badge-green">Approved</span>' :
        status === 'Rejected' ? '<span class="pw-badge badge-red">Rejected</span>' :
        '<span class="pw-badge badge-yellow">Under Review</span>';
    return `
        <div class="lc-stage-panel">
            <div class="lc-stage-header"><h4>✅ Approval</h4>${approvalBadge}</div>
            <div class="lc-detail-grid">
                ${approval ? `
                    <div class="lc-detail-item"><div class="lc-detail-label">Approver</div><div class="lc-detail-value">${escHtml(approval.approver_name || approval.approved_by || '—')}</div></div>
                    <div class="lc-detail-item"><div class="lc-detail-label">Decision</div><div class="lc-detail-value">${escHtml(approval.decision || status || '—')}</div></div>
                    <div class="lc-detail-item"><div class="lc-detail-label">Date</div><div class="lc-detail-value">${pwFmtDate(approval.decided_at || approval.created_at)}</div></div>
                ` : `<div class="lc-detail-item"><div class="lc-detail-label">Status</div><div class="lc-detail-value">Awaiting decision…</div></div>`}
            </div>
            ${approval?.notes ? `<div class="lc-section"><div class="lc-section-title">Approval Notes</div><div class="lc-notes-box">${escHtml(approval.notes)}</div></div>` : ''}
            ${status === 'Approved' ? `
                <div class="lc-action-bar">
                    <button class="btn btn-primary" id="btnCreatePO">📦 Create Purchase Order</button>
                </div>` : (status === 'Under Approval' ? `
                <div class="lc-action-bar">
                    <button class="btn btn-success" id="btnApproveQuote">✓ Approve</button>
                    <button class="btn btn-danger" id="btnRejectQuote">✕ Reject</button>
                </div>` : '')}
        </div>`;
}

function bindStage3Events(quote) {
    const btnCreate = document.getElementById('btnCreatePO');
    if (btnCreate) {
        btnCreate.addEventListener('click', async () => {
            btnCreate.disabled = true;
            btnCreate.innerHTML = pwSpinner() + ' Creating PO…';
            try {
                const res = await pwApiPost('/procurement/create-po', { quote_id: PW.currentQuoteId });
                if (res.success) {
                    showToast('Purchase Order ' + (res.poNumber || '') + ' created', 'success');
                    await loadAndRenderLifecycle(PW.currentQuoteId);
                } else {
                    showToast('Failed to create PO: ' + (res.message || ''), 'error');
                    btnCreate.disabled = false;
                    btnCreate.textContent = '📦 Create Purchase Order';
                }
            } catch (err) {
                console.error('btnCreatePO error:', err);
                showToast('Network error', 'error');
                btnCreate.disabled = false;
                btnCreate.textContent = '📦 Create Purchase Order';
            }
        });
    }
    const btnApprove = document.getElementById('btnApproveQuote');
    if (btnApprove) {
        btnApprove.addEventListener('click', async () => {
            btnApprove.disabled = true;
            try {
                const res = await pwApiPost('/procurement/approve-quote', { quote_id: PW.currentQuoteId, decision: 'approved' });
                if (res.success) { showToast('Quote approved', 'success'); await loadAndRenderLifecycle(PW.currentQuoteId); }
                else { showToast('Error: ' + (res.message || ''), 'error'); btnApprove.disabled = false; }
            } catch (err) { showToast('Network error', 'error'); btnApprove.disabled = false; }
        });
    }
    const btnReject = document.getElementById('btnRejectQuote');
    if (btnReject) {
        btnReject.addEventListener('click', async () => {
            btnReject.disabled = true;
            try {
                const res = await pwApiPost('/procurement/approve-quote', { quote_id: PW.currentQuoteId, decision: 'rejected' });
                if (res.success) { showToast('Quote rejected', 'info'); await loadAndRenderLifecycle(PW.currentQuoteId); }
                else { showToast('Error: ' + (res.message || ''), 'error'); btnReject.disabled = false; }
            } catch (err) { showToast('Network error', 'error'); btnReject.disabled = false; }
        });
    }
}

// ============================================================
// STAGE 4: Purchase Order
// ============================================================
function renderStage4(quote, pos) {
    if (!pos || !pos.length) {
        return `
            <div class="lc-stage-panel">
                <div class="lc-stage-header"><h4>📦 Purchase Order</h4><span class="pw-badge badge-gray">Not Created</span></div>
                <div class="lc-empty-state"><div style="font-size:3rem;">📦</div><p>No purchase order yet.</p></div>
                ${quote?.status === 'Approved' ? `<div class="lc-action-bar"><button class="btn btn-primary" id="btnCreatePO">📦 Create Purchase Order</button></div>` : ''}
            </div>`;
    }
    const po = pos[0];
    return `
        <div class="lc-stage-panel">
            <div class="lc-stage-header"><h4>📦 Purchase Order</h4>${pwStatusBadge(po.status, 'po')}</div>
            <div class="lc-detail-grid">
                <div class="lc-detail-item"><div class="lc-detail-label">PO Number</div><div class="lc-detail-value" style="font-weight:600;">${escHtml(po.po_number || '—')}</div></div>
                <div class="lc-detail-item"><div class="lc-detail-label">Status</div><div class="lc-detail-value">${pwStatusBadge(po.status, 'po')}</div></div>
                <div class="lc-detail-item"><div class="lc-detail-label">Created</div><div class="lc-detail-value">${pwFmtDate(po.created_at)}</div></div>
                <div class="lc-detail-item"><div class="lc-detail-label">Expected Delivery</div><div class="lc-detail-value">${pwFmtDate(po.expected_delivery_date)}</div></div>
                <div class="lc-detail-item"><div class="lc-detail-label">Total Amount</div><div class="lc-detail-value" style="color:#06b6d4;font-weight:600;">${pwFmtPrice(po.total_amount, quote?.currency)}</div></div>
            </div>
            ${po.notes ? `<div class="lc-section"><div class="lc-section-title">Notes</div><div class="lc-notes-box">${escHtml(po.notes)}</div></div>` : ''}
            <div class="lc-action-bar">
                ${po.status !== 'sent' && po.status !== 'confirmed' ? `<button class="btn btn-primary" id="btnSendPO">📧 Send PO to Supplier</button>` : ''}
                ${po.status === 'sent' || po.status === 'confirmed' ? `<button class="btn btn-secondary" id="btnMarkDelivered">✓ Mark as Delivered</button>` : ''}
            </div>
        </div>`;
}

function bindStage4Events(quote, pos) {
    const btnSend = document.getElementById('btnSendPO');
    if (btnSend && pos && pos.length) {
        btnSend.addEventListener('click', async () => {
            btnSend.disabled = true;
            btnSend.innerHTML = pwSpinner() + ' Sending…';
            try {
                const res = await pwApiPost(`/procurement/send-po/${pos[0].id}`, {});
                if (res.success) {
                    showToast('PO sent to supplier', 'success');
                    await loadAndRenderLifecycle(PW.currentQuoteId);
                } else {
                    showToast('Failed to send PO: ' + (res.message || ''), 'error');
                    btnSend.disabled = false;
                    btnSend.textContent = '📧 Send PO to Supplier';
                }
            } catch (err) {
                console.error('btnSendPO error:', err);
                showToast('Network error', 'error');
                btnSend.disabled = false;
                btnSend.textContent = '📧 Send PO to Supplier';
            }
        });
    }
    const btnDelivered = document.getElementById('btnMarkDelivered');
    if (btnDelivered && pos && pos.length) {
        btnDelivered.addEventListener('click', async () => {
            btnDelivered.disabled = true;
            try {
                const res = await pwApiPut(`/procurement/po/${pos[0].id}/status`, { status: 'delivered' });
                if (res.success) {
                    showToast('PO marked as delivered', 'success');
                    await loadAndRenderLifecycle(PW.currentQuoteId);
                } else {
                    showToast('Failed: ' + (res.message || ''), 'error');
                    btnDelivered.disabled = false;
                }
            } catch (err) {
                console.error('btnMarkDelivered error:', err);
                showToast('Network error', 'error');
                btnDelivered.disabled = false;
            }
        });
    }
    // Also bind btnCreatePO if it exists in stage 4
    const btnCreate = document.getElementById('btnCreatePO');
    if (btnCreate) {
        btnCreate.addEventListener('click', async () => {
            btnCreate.disabled = true;
            btnCreate.innerHTML = pwSpinner() + ' Creating PO…';
            try {
                const res = await pwApiPost('/procurement/create-po', { quote_id: PW.currentQuoteId });
                if (res.success) {
                    showToast('Purchase Order ' + (res.poNumber || '') + ' created', 'success');
                    await loadAndRenderLifecycle(PW.currentQuoteId);
                } else {
                    showToast('Failed: ' + (res.message || ''), 'error');
                    btnCreate.disabled = false;
                    btnCreate.textContent = '📦 Create Purchase Order';
                }
            } catch (err) {
                console.error('btnCreatePO error:', err);
                showToast('Network error', 'error');
                btnCreate.disabled = false;
                btnCreate.textContent = '📦 Create Purchase Order';
            }
        });
    }
}

// ============================================================
// STAGE 5: Invoice
// ============================================================
function renderStage5(quote, pos, invoices) {
    const po = pos && pos.length ? pos[0] : null;
    if (!invoices || !invoices.length) {
        return `
            <div class="lc-stage-panel">
                <div class="lc-stage-header"><h4>💰 Invoice</h4><span class="pw-badge badge-gray">No Invoice</span></div>
                <div class="lc-empty-state"><div style="font-size:3rem;">🧾</div><p>No invoice received yet.</p></div>
                <div class="lc-action-bar">
                    <div class="pw-form-group" style="flex:1;min-width:200px;">
                        <label class="pw-label">Upload Invoice PDF</label>
                        <input type="file" id="invoiceFileInput" accept=".pdf" class="pw-form-control">
                    </div>
                    <div class="pw-form-group">
                        <label class="pw-label">Invoice Number</label>
                        <input type="text" id="invoiceNumberInput" class="pw-form-control" placeholder="INV-2024-001">
                    </div>
                    <div class="pw-form-group">
                        <label class="pw-label">Invoice Amount</label>
                        <input type="number" id="invoiceAmountInput" class="pw-form-control" placeholder="0.00" step="0.01">
                    </div>
                    <button class="btn btn-primary" id="btnUploadInvoice" style="align-self:flex-end;">📤 Upload Invoice</button>
                </div>
            </div>`;
    }
    const inv = invoices[0];
    return `
        <div class="lc-stage-panel">
            <div class="lc-stage-header"><h4>💰 Invoice</h4>${pwStatusBadge(inv.status, 'invoice')}</div>
            <div class="lc-detail-grid">
                <div class="lc-detail-item"><div class="lc-detail-label">Invoice Number</div><div class="lc-detail-value" style="font-weight:600;">${escHtml(inv.invoice_number || '—')}</div></div>
                <div class="lc-detail-item"><div class="lc-detail-label">Status</div><div class="lc-detail-value">${pwStatusBadge(inv.status, 'invoice')}</div></div>
                <div class="lc-detail-item"><div class="lc-detail-label">Invoice Date</div><div class="lc-detail-value">${pwFmtDate(inv.invoice_date || inv.created_at)}</div></div>
                <div class="lc-detail-item"><div class="lc-detail-label">Due Date</div><div class="lc-detail-value">${pwFmtDate(inv.due_date)}</div></div>
                <div class="lc-detail-item"><div class="lc-detail-label">Amount</div><div class="lc-detail-value" style="color:#06b6d4;font-weight:600;">${pwFmtPrice(inv.amount || inv.total_amount, quote?.currency)}</div></div>
            </div>
            ${inv.notes ? `<div class="lc-section"><div class="lc-section-title">Notes</div><div class="lc-notes-box">${escHtml(inv.notes)}</div></div>` : ''}
            ${inv.pdf_path ? `<div class="lc-section"><a href="/api/procurement/invoice-pdf/${inv.id}" target="_blank" class="btn btn-secondary btn-sm">📄 Download Invoice PDF</a></div>` : ''}
            <div class="lc-action-bar">
                ${inv.status === 'received' ? `<button class="btn btn-primary" id="btnVerifyInvoice">✓ Verify Invoice</button>` : ''}
                ${inv.status === 'verified' ? `<button class="btn btn-primary" id="btnSendToAccounting">→ Send to Accounting</button>` : ''}
                ${inv.status === 'sent_to_accounting' ? `<button class="btn btn-primary" id="btnMarkPaid">✓ Mark as Paid</button>` : ''}
            </div>
        </div>`;
}

function bindStage5Events(quote, pos, invoices) {
    const inv = invoices && invoices.length ? invoices[0] : null;
    const btnUploadInv = document.getElementById('btnUploadInvoice');
    if (btnUploadInv) {
        btnUploadInv.addEventListener('click', async () => {
            const fileInput = document.getElementById('invoiceFileInput');
            const invNum = document.getElementById('invoiceNumberInput')?.value?.trim();
            const invAmt = document.getElementById('invoiceAmountInput')?.value;
            const file = fileInput?.files?.[0];
            if (!file) { showToast('Please select an invoice PDF', 'warning'); return; }
            btnUploadInv.disabled = true;
            btnUploadInv.innerHTML = pwSpinner() + ' Uploading…';
            try {
                const formData = new FormData();
                formData.append('file', file);
                const token = localStorage.getItem('authToken') || (typeof authToken !== 'undefined' ? authToken : '');
                const uploadRes = await fetch('/api/procurement/upload-invoice-pdf', {
                    method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: formData
                }).then(r => r.json());
                if (!uploadRes.success) { showToast('Upload failed: ' + (uploadRes.message || ''), 'error'); btnUploadInv.disabled = false; btnUploadInv.textContent = '📤 Upload Invoice'; return; }
                const po = pos && pos.length ? pos[0] : null;
                const body = {
                    po_id: po?.id,
                    quote_id: PW.currentQuoteId,
                    invoice_number: invNum,
                    amount: invAmt ? parseFloat(invAmt) : null,
                    pdf_path: uploadRes.path || uploadRes.filename,
                    invoice_date: new Date().toISOString().split('T')[0]
                };
                const res = await pwApiPost('/procurement/invoice', body);
                if (res.success) {
                    showToast('Invoice uploaded successfully', 'success');
                    await loadAndRenderLifecycle(PW.currentQuoteId);
                } else {
                    showToast('Failed: ' + (res.message || ''), 'error');
                    btnUploadInv.disabled = false;
                    btnUploadInv.textContent = '📤 Upload Invoice';
                }
            } catch (err) {
                console.error('btnUploadInvoice error:', err);
                showToast('Upload error', 'error');
                btnUploadInv.disabled = false;
                btnUploadInv.textContent = '📤 Upload Invoice';
            }
        });
    }
    const btnVerify = document.getElementById('btnVerifyInvoice');
    if (btnVerify && inv) {
        btnVerify.addEventListener('click', async () => {
            btnVerify.disabled = true;
            try {
                const res = await pwApiPut(`/procurement/invoice/${inv.id}/status`, { status: 'verified' });
                if (res.success) { showToast('Invoice verified', 'success'); await loadAndRenderLifecycle(PW.currentQuoteId); }
                else { showToast('Error: ' + (res.message || ''), 'error'); btnVerify.disabled = false; }
            } catch (err) { showToast('Network error', 'error'); btnVerify.disabled = false; }
        });
    }
    const btnAccounting = document.getElementById('btnSendToAccounting');
    if (btnAccounting && inv) {
        btnAccounting.addEventListener('click', async () => {
            btnAccounting.disabled = true;
            btnAccounting.innerHTML = pwSpinner() + ' Sending…';
            try {
                const res = await pwApiPost(`/procurement/invoice/${inv.id}/send-to-accounting`, {});
                if (res.success) { showToast('Sent to accounting', 'success'); await loadAndRenderLifecycle(PW.currentQuoteId); }
                else { showToast('Error: ' + (res.message || ''), 'error'); btnAccounting.disabled = false; btnAccounting.textContent = '→ Send to Accounting'; }
            } catch (err) { showToast('Network error', 'error'); btnAccounting.disabled = false; btnAccounting.textContent = '→ Send to Accounting'; }
        });
    }
    const btnPaid = document.getElementById('btnMarkPaid');
    if (btnPaid && inv) {
        btnPaid.addEventListener('click', async () => {
            btnPaid.disabled = true;
            try {
                const res = await pwApiPut(`/procurement/invoice/${inv.id}/status`, { status: 'paid' });
                if (res.success) { showToast('Invoice marked as paid', 'success'); await loadAndRenderLifecycle(PW.currentQuoteId); }
                else { showToast('Error: ' + (res.message || ''), 'error'); btnPaid.disabled = false; }
            } catch (err) { showToast('Network error', 'error'); btnPaid.disabled = false; }
        });
    }
}

// ============================================================
// QUOTE LIST RENDERING (used by main app.js)
// ============================================================
function renderQuoteRow(q) {
    return `
        <tr class="quote-row" data-id="${q.id}">
            <td style="font-weight:600;color:#06b6d4;">${escHtml(q.quote_number || '—')}</td>
            <td>${escHtml(q.supplier_name || '—')}</td>
            <td>${pwFmtDate(q.created_at)}</td>
            <td>${pwFmtDate(q.valid_until)}</td>
            <td>${pwStatusBadge(q.status, 'quote')}</td>
            <td>${pwFmtPrice(q.total_value, q.currency)}</td>
            <td>
                <button class="btn btn-secondary btn-sm btn-open-lifecycle" data-id="${q.id}">🚀 Open</button>
            </td>
        </tr>`;
}

async function loadQuotes() {
    const tbody = document.getElementById('quotesTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;">${pwSpinner()}</td></tr>`;
    try {
        const res = await pwApiGet('/quotes');
        if (!res.success || !res.quotes || !res.quotes.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:2rem;">No quotes found.</td></tr>';
            return;
        }
        tbody.innerHTML = res.quotes.map(renderQuoteRow).join('');
        tbody.querySelectorAll('.btn-open-lifecycle').forEach(btn => {
            btn.addEventListener('click', () => openQuoteLifecyclePanel(parseInt(btn.dataset.id)));
        });
    } catch (err) {
        console.error('loadQuotes error:', err);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#ef4444;padding:2rem;">Error loading quotes.</td></tr>';
    }
}

// ============================================================
// GLOBAL KEYBOARD / CLICK HANDLERS
// ============================================================
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (PW.panelOpen) closeLifecyclePanel();
        const wizard = document.getElementById('pwWizardOverlay');
        if (wizard) closeEnhancedQuoteModal();
    }
});