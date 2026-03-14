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
    if (contactDisplay) {
        let info = [];
        if (contact) info.push(contact);
        if (email) info.push(email);
        contactDisplay.textContent = info.join(' · ');
    }
    if (manualArea) manualArea.classList.add('hidden');
    if (aiCards) aiCards.querySelectorAll('.btn-select-ai-supplier').forEach(b => b.disabled = true);
    if (confirm) confirm.classList.remove('hidden');
    const btnChange = document.getElementById('btnChangeSupplier');
    if (btnChange) btnChange.addEventListener('click', () => {
        PW.wizardState.selectedSupplierId = null;
        PW.wizardState.selectedSupplierName = '';
        if (confirm) confirm.classList.add('hidden');
        if (manualArea) manualArea.classList.remove('hidden');
        if (aiCards) aiCards.querySelectorAll('.btn-select-ai-supplier').forEach(b => b.disabled = false);
    });
}

function populateStep3Summary() {
    const el = document.getElementById('step3Summary');
    if (!el) return;
    const ws = PW.wizardState;
    const orderCount = ws.selectedOrderIds.length;
    const supplierName = ws.selectedSupplierName || '—';
    const currencyEl = document.getElementById('wizardCurrency');
    if (currencyEl) ws.currency = currencyEl.value;
    el.innerHTML = `
        <div class="pw-confirm-row"><span class="pw-confirm-label">Supplier</span><span class="pw-confirm-value">${escHtml(supplierName)}</span></div>
        <div class="pw-confirm-row"><span class="pw-confirm-label">Orders</span><span class="pw-confirm-value">${orderCount} order${orderCount !== 1 ? 's' : ''}</span></div>
        <div class="pw-confirm-row"><span class="pw-confirm-label">Currency</span><span class="pw-confirm-value">${escHtml(ws.currency)}</span></div>
    `;
}

async function executeCreateQuote() {
    const ws = PW.wizardState;
    const validUntilEl = document.getElementById('wizardValidUntil');
    const notesEl = document.getElementById('wizardNotes');
    const currencyEl = document.getElementById('wizardCurrency');
    if (validUntilEl) ws.validUntil = validUntilEl.value;
    if (notesEl) ws.notes = notesEl.value;
    if (currencyEl) ws.currency = currencyEl.value;
    if (!ws.selectedSupplierId) { showToast('No supplier selected', 'error'); return; }
    if (!ws.selectedOrderIds || !ws.selectedOrderIds.length) { showToast('No orders selected', 'error'); return; }
    const btn = document.getElementById('wizardBtnCreate');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
    try {
        const payload = {
            supplier_id: ws.selectedSupplierId,
            order_ids: ws.selectedOrderIds,
            currency: ws.currency || 'EUR',
            valid_until: ws.validUntil || null,
            notes: ws.notes || ''
        };
        const result = await pwApiPost('/quotes', payload);
        if (result && result.id) {
            showToast(`Quote ${result.quote_number || '#' + result.id} created successfully`, 'success');
            closeEnhancedQuoteModal();
            if (typeof loadQuotes === 'function') loadQuotes();
            else if (typeof refreshData === 'function') refreshData();
        } else {
            throw new Error(result?.error || result?.message || 'Unknown error');
        }
    } catch (err) {
        showToast('Failed to create quote: ' + (err.message || err), 'error');
        if (btn) { btn.disabled = false; btn.textContent = '✓ Create Quote'; }
    }
}

async function getAISuggestionsForOrders(orderIds) {
    try {
        const result = await pwApiPost('/quotes/ai-suggest', { order_ids: orderIds });
        return Array.isArray(result) ? result : (result?.suggestions || []);
    } catch (err) {
        console.warn('AI suggestions unavailable:', err);
        return [];
    }
}

// ============================================================
// B. QUOTE LIST (Tab View)
// ============================================================

async function loadQuoteList() {
    const container = document.getElementById('quoteListContainer');
    if (!container) return;
    container.innerHTML = pwSpinner();
    try {
        const data = await pwApiGet('/quotes');
        const quotes = Array.isArray(data) ? data : (data?.quotes || []);
        if (!quotes.length) {
            container.innerHTML = '<div class="pw-empty-state">No quotes found. Select orders and create a quote request.</div>';
            return;
        }
        container.innerHTML = renderQuoteListTable(quotes);
        container.querySelectorAll('.btn-open-quote').forEach(btn => {
            btn.addEventListener('click', () => openQuoteLifecyclePanel(parseInt(btn.dataset.quoteId)));
        });
    } catch (err) {
        container.innerHTML = `<div class="pw-error-state">Error loading quotes: ${escHtml(err.message)}</div>`;
    }
}

function renderQuoteListTable(quotes) {
    const rows = quotes.map(q => `
        <tr>
            <td><strong>${escHtml(q.quote_number || '#' + q.id)}</strong></td>
            <td>${escHtml(q.supplier_name || '—')}</td>
            <td>${pwStatusBadge(q.status, 'quote')}</td>
            <td>${q.order_count || 0} orders</td>
            <td>${pwFmtDate(q.created_at)}</td>
            <td>${pwFmtDate(q.valid_until)}</td>
            <td><button class="btn btn-secondary btn-sm btn-open-quote" data-quote-id="${q.id}">View →</button></td>
        </tr>
    `).join('');
    return `
        <table class="pw-table">
            <thead><tr><th>Quote #</th><th>Supplier</th><th>Status</th><th>Orders</th><th>Created</th><th>Valid Until</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

// ============================================================
// C. QUOTE LIFECYCLE PANEL (Slide-in)
// ============================================================

async function openQuoteLifecyclePanel(quoteId) {
    PW.currentQuoteId = quoteId;
    PW.panelOpen = true;

    let panel = document.getElementById('quoteLifecyclePanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'quoteLifecyclePanel';
        panel.className = 'pw-lifecycle-panel';
        document.body.appendChild(panel);
    }
    panel.innerHTML = `<div class="pw-panel-header"><h3>Quote Details</h3><button class="pw-close-btn" onclick="closeLifecyclePanel()">✕</button></div><div class="pw-panel-body">${pwSpinner()}</div>`;
    panel.classList.add('pw-panel-open');

    try {
        const data = await pwApiGet('/quotes/' + quoteId);
        PW.currentLifecycle = data;
        panel.querySelector('.pw-panel-body').innerHTML = renderLifecyclePanelContent(data);
        bindLifecyclePanelEvents(data);
    } catch (err) {
        panel.querySelector('.pw-panel-body').innerHTML = `<div class="pw-error-state">Error: ${escHtml(err.message)}</div>`;
    }
}

function closeLifecyclePanel() {
    const panel = document.getElementById('quoteLifecyclePanel');
    if (panel) panel.classList.remove('pw-panel-open');
    PW.panelOpen = false;
    PW.currentQuoteId = null;
}

function renderLifecyclePanelContent(data) {
    const q = data.quote || data;
    const orders = data.orders || [];
    const responses = data.responses || [];
    const po = data.po || null;
    const invoices = data.invoices || [];

    return `
        <div class="pw-lifecycle-timeline">
            ${renderTimelineStep('quote', 'Quote Request', q.status, true)}
            ${renderTimelineStep('response', 'Supplier Response', responses.length ? responses[0].status : null, responses.length > 0)}
            ${renderTimelineStep('approval', 'Approval', q.status === 'Approved' ? 'Approved' : (q.status === 'Under Approval' ? 'Under Approval' : null), q.status === 'Approved' || q.status === 'Under Approval')}
            ${renderTimelineStep('po', 'Purchase Order', po ? po.status : null, !!po)}
            ${renderTimelineStep('invoice', 'Invoice', invoices.length ? invoices[0].status : null, invoices.length > 0)}
        </div>
        <div class="pw-panel-section">
            <div class="pw-section-header"><h4>Quote Details</h4>${renderQuoteActions(q)}</div>
            ${renderQuoteInfo(q)}
        </div>
        ${orders.length ? `
        <div class="pw-panel-section">
            <h4>Ordered Items (${orders.length})</h4>
            ${renderOrderItemsTable(orders)}
        </div>` : ''}
        ${responses.length ? `
        <div class="pw-panel-section">
            <h4>Supplier Responses</h4>
            ${renderResponsesSection(responses)}
        </div>` : renderNoResponseSection(q)}
        ${po ? `
        <div class="pw-panel-section">
            <div class="pw-section-header"><h4>Purchase Order</h4>${renderPOActions(po)}</div>
            ${renderPOInfo(po)}
        </div>` : ''}
        ${invoices.length ? `
        <div class="pw-panel-section">
            <h4>Invoices</h4>
            ${invoices.map(inv => renderInvoiceCard(inv)).join('')}
        </div>` : ''}
    `;
}

function renderTimelineStep(key, label, status, active) {
    const cls = active ? (status === 'Approved' || status === 'accepted' || status === 'paid' || status === 'delivered' ? 'tl-done' : 'tl-active') : 'tl-pending';
    return `<div class="pw-tl-step ${cls}"><div class="pw-tl-dot"></div><div class="pw-tl-label">${escHtml(label)}</div>${status ? `<div class="pw-tl-status">${escHtml(status)}</div>` : ''}</div>`;
}

function renderQuoteInfo(q) {
    return `
        <div class="pw-info-grid">
            <div class="pw-info-row"><span class="pw-info-label">Quote #</span><span class="pw-info-value">${escHtml(q.quote_number || '#' + q.id)}</span></div>
            <div class="pw-info-row"><span class="pw-info-label">Supplier</span><span class="pw-info-value">${escHtml(q.supplier_name || '—')}</span></div>
            <div class="pw-info-row"><span class="pw-info-label">Status</span><span class="pw-info-value">${pwStatusBadge(q.status, 'quote')}</span></div>
            <div class="pw-info-row"><span class="pw-info-label">Currency</span><span class="pw-info-value">${escHtml(q.currency || 'EUR')}</span></div>
            <div class="pw-info-row"><span class="pw-info-label">Created</span><span class="pw-info-value">${pwFmtDateTime(q.created_at)}</span></div>
            <div class="pw-info-row"><span class="pw-info-label">Valid Until</span><span class="pw-info-value">${pwFmtDate(q.valid_until)}</span></div>
            ${q.notes ? `<div class="pw-info-row pw-info-full"><span class="pw-info-label">Notes</span><span class="pw-info-value">${escHtml(q.notes)}</span></div>` : ''}
        </div>
    `;
}

function renderQuoteActions(q) {
    const actions = [];
    if (q.status === 'Draft') {
        actions.push(`<button class="btn btn-primary btn-sm" onclick="sendQuoteToSupplier(${q.id})">📤 Send to Supplier</button>`);
    }
    if (q.status === 'Received') {
        actions.push(`<button class="btn btn-primary btn-sm" onclick="submitForApproval(${q.id})">📋 Submit for Approval</button>`);
    }
    if (q.status === 'Under Approval') {
        actions.push(`<button class="btn btn-success btn-sm" onclick="approveQuote(${q.id})">✅ Approve</button>`);
        actions.push(`<button class="btn btn-danger btn-sm" onclick="rejectQuote(${q.id})">❌ Reject</button>`);
    }
    if (q.status === 'Approved') {
        actions.push(`<button class="btn btn-primary btn-sm" onclick="createPOFromQuote(${q.id})">📦 Create PO</button>`);
    }
    return actions.length ? `<div class="pw-action-group">${actions.join('')}</div>` : '';
}

function renderOrderItemsTable(orders) {
    const rows = orders.map(o => `
        <tr>
            <td>#${o.id}</td>
            <td title="${escHtml(o.item_description)}">${escHtml((o.item_description || '').substring(0, 40))}${(o.item_description || '').length > 40 ? '…' : ''}</td>
            <td>${escHtml(o.building || '—')}</td>
            <td>${o.quantity || 1}</td>
            <td>${pwFmtDate(o.date_needed)}</td>
            <td>${priorityBadge(o.priority)}</td>
        </tr>
    `).join('');
    return `
        <table class="pw-table pw-table-compact">
            <thead><tr><th>ID</th><th>Description</th><th>Building</th><th>Qty</th><th>Needed By</th><th>Priority</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function renderResponsesSection(responses) {
    return responses.map(r => `
        <div class="pw-response-card">
            <div class="pw-response-header">
                <span class="pw-response-supplier">${escHtml(r.supplier_name || '—')}</span>
                ${pwStatusBadge(r.status, 'response')}
                <span class="pw-response-date">${pwFmtDateTime(r.responded_at || r.created_at)}</span>
            </div>
            ${r.unit_price !== null && r.unit_price !== undefined ? `
            <div class="pw-response-pricing">
                <span class="pw-price-label">Unit Price:</span>
                <span class="pw-price-value">${pwFmtPrice(r.unit_price, r.currency)}</span>
                ${r.total_price !== null && r.total_price !== undefined ? `<span class="pw-price-label" style="margin-left:1rem;">Total:</span><span class="pw-price-value">${pwFmtPrice(r.total_price, r.currency)}</span>` : ''}
            </div>` : ''}
            ${r.availability ? `<div class="pw-response-avail">${pwStatusBadge(r.availability, 'availability')} ${r.lead_time_days ? `<span class="pw-lead-time">${r.lead_time_days} days lead time</span>` : ''}</div>` : ''}
            ${r.notes ? `<div class="pw-response-notes">${escHtml(r.notes)}</div>` : ''}
            ${renderResponseActions(r)}
        </div>
    `).join('');
}

function renderNoResponseSection(q) {
    if (q.status !== 'Sent to Supplier' && q.status !== 'Draft') return '';
    return `
        <div class="pw-panel-section">
            <h4>Supplier Response</h4>
            <div class="pw-empty-state">Awaiting supplier response…</div>
            <button class="btn btn-secondary btn-sm" style="margin-top:0.75rem;" onclick="openRecordResponseModal(${q.id})">+ Record Response Manually</button>
        </div>
    `;
}

function renderResponseActions(r) {
    const actions = [];
    if (r.status === 'pending' || r.status === 'countered') {
        actions.push(`<button class="btn btn-success btn-sm" onclick="acceptResponse(${r.id})">Accept</button>`);
        actions.push(`<button class="btn btn-danger btn-sm" onclick="rejectResponse(${r.id})">Reject</button>`);
    }
    return actions.length ? `<div class="pw-action-group" style="margin-top:0.5rem;">${actions.join('')}</div>` : '';
}

function renderPOInfo(po) {
    return `
        <div class="pw-info-grid">
            <div class="pw-info-row"><span class="pw-info-label">PO #</span><span class="pw-info-value">${escHtml(po.po_number || '#' + po.id)}</span></div>
            <div class="pw-info-row"><span class="pw-info-label">Status</span><span class="pw-info-value">${pwStatusBadge(po.status, 'po')}</span></div>
            <div class="pw-info-row"><span class="pw-info-label">Total</span><span class="pw-info-value">${pwFmtPrice(po.total_amount, po.currency)}</span></div>
            <div class="pw-info-row"><span class="pw-info-label">Delivery</span><span class="pw-info-value">${pwFmtDate(po.expected_delivery)}</span></div>
        </div>
    `;
}

function renderPOActions(po) {
    const actions = [];
    if (po.status === 'draft') {
        actions.push(`<button class="btn btn-primary btn-sm" onclick="sendPO(${po.id})">📤 Send PO</button>`);
    }
    if (po.status === 'sent' || po.status === 'confirmed') {
        actions.push(`<button class="btn btn-secondary btn-sm" onclick="markDelivered(${po.id})">📦 Mark Delivered</button>`);
    }
    if (po.status === 'delivered' || po.status === 'confirmed') {
        actions.push(`<button class="btn btn-secondary btn-sm" onclick="openAddInvoiceModal(${po.id})">🧾 Add Invoice</button>`);
    }
    return actions.length ? `<div class="pw-action-group">${actions.join('')}</div>` : '';
}

function renderInvoiceCard(inv) {
    return `
        <div class="pw-invoice-card">
            <div class="pw-invoice-header">
                <span class="pw-invoice-num">${escHtml(inv.invoice_number || '#' + inv.id)}</span>
                ${pwStatusBadge(inv.status, 'invoice')}
                <span class="pw-invoice-amount">${pwFmtPrice(inv.amount, inv.currency)}</span>
            </div>
            <div class="pw-invoice-meta">
                <span>Received: ${pwFmtDate(inv.received_date)}</span>
                ${inv.due_date ? `<span>Due: ${pwFmtDate(inv.due_date)}</span>` : ''}
            </div>
            ${renderInvoiceActions(inv)}
        </div>
    `;
}

function renderInvoiceActions(inv) {
    const actions = [];
    if (inv.status === 'received') {
        actions.push(`<button class="btn btn-secondary btn-sm" onclick="verifyInvoice(${inv.id})">✓ Verify</button>`);
    }
    if (inv.status === 'verified') {
        actions.push(`<button class="btn btn-primary btn-sm" onclick="sendInvoiceToAccounting(${inv.id})">📊 Send to Accounting</button>`);
    }
    return actions.length ? `<div class="pw-action-group" style="margin-top:0.5rem;">${actions.join('')}</div>` : '';
}

function bindLifecyclePanelEvents(data) {
    // Events are bound via onclick attributes in rendered HTML
    // Additional dynamic bindings can be added here
}

// ============================================================
// D. QUOTE ACTION HANDLERS
// ============================================================

async function sendQuoteToSupplier(quoteId) {
    try {
        const result = await pwApiPost('/quotes/' + quoteId + '/send', {});
        if (result.success || result.id || result.status) {
            showToast('Quote sent to supplier', 'success');
            openQuoteLifecyclePanel(quoteId);
        } else throw new Error(result?.error || 'Send failed');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function submitForApproval(quoteId) {
    try {
        const result = await pwApiPost('/quotes/' + quoteId + '/submit-approval', {});
        if (result.success || result.status) {
            showToast('Quote submitted for approval', 'success');
            openQuoteLifecyclePanel(quoteId);
        } else throw new Error(result?.error || 'Submit failed');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function approveQuote(quoteId) {
    try {
        const result = await pwApiPost('/quotes/' + quoteId + '/approve', {});
        if (result.success || result.status) {
            showToast('Quote approved', 'success');
            openQuoteLifecyclePanel(quoteId);
            if (typeof loadQuotes === 'function') loadQuotes();
        } else throw new Error(result?.error || 'Approve failed');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function rejectQuote(quoteId) {
    const reason = prompt('Rejection reason (optional):') || '';
    try {
        const result = await pwApiPost('/quotes/' + quoteId + '/reject', { reason });
        if (result.success || result.status) {
            showToast('Quote rejected', 'info');
            openQuoteLifecyclePanel(quoteId);
            if (typeof loadQuotes === 'function') loadQuotes();
        } else throw new Error(result?.error || 'Reject failed');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function createPOFromQuote(quoteId) {
    try {
        const result = await pwApiPost('/quotes/' + quoteId + '/create-po', {});
        if (result.id || result.success) {
            showToast('Purchase Order created', 'success');
            openQuoteLifecyclePanel(quoteId);
        } else throw new Error(result?.error || 'PO creation failed');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function acceptResponse(responseId) {
    try {
        const result = await pwApiPut('/quote-responses/' + responseId, { status: 'accepted' });
        if (result.id || result.success) {
            showToast('Response accepted', 'success');
            if (PW.currentQuoteId) openQuoteLifecyclePanel(PW.currentQuoteId);
        } else throw new Error(result?.error || 'Accept failed');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function rejectResponse(responseId) {
    try {
        const result = await pwApiPut('/quote-responses/' + responseId, { status: 'rejected' });
        if (result.id || result.success) {
            showToast('Response rejected', 'info');
            if (PW.currentQuoteId) openQuoteLifecyclePanel(PW.currentQuoteId);
        } else throw new Error(result?.error || 'Reject failed');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function sendPO(poId) {
    try {
        const result = await pwApiPost('/purchase-orders/' + poId + '/send', {});
        if (result.success || result.status) {
            showToast('PO sent to supplier', 'success');
            if (PW.currentQuoteId) openQuoteLifecyclePanel(PW.currentQuoteId);
        } else throw new Error(result?.error || 'Send PO failed');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function markDelivered(poId) {
    try {
        const result = await pwApiPost('/purchase-orders/' + poId + '/deliver', {});
        if (result.success || result.status) {
            showToast('PO marked as delivered', 'success');
            if (PW.currentQuoteId) openQuoteLifecyclePanel(PW.currentQuoteId);
        } else throw new Error(result?.error || 'Mark delivered failed');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function verifyInvoice(invoiceId) {
    try {
        const result = await pwApiPut('/invoices/' + invoiceId, { status: 'verified' });
        if (result.id || result.success) {
            showToast('Invoice verified', 'success');
            if (PW.currentQuoteId) openQuoteLifecyclePanel(PW.currentQuoteId);
        } else throw new Error(result?.error || 'Verify failed');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function sendInvoiceToAccounting(invoiceId) {
    try {
        const result = await pwApiPost('/invoices/' + invoiceId + '/send-accounting', {});
        if (result.success || result.status) {
            showToast('Invoice sent to accounting', 'success');
            if (PW.currentQuoteId) openQuoteLifecyclePanel(PW.currentQuoteId);
        } else throw new Error(result?.error || 'Send to accounting failed');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

// ============================================================
// E. RECORD RESPONSE MODAL
// ============================================================

function openRecordResponseModal(quoteId) {
    const existing = document.getElementById('recordResponseOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'recordResponseOverlay';
    overlay.className = 'pw-modal-overlay';
    overlay.innerHTML = buildRecordResponseHTML(quoteId);
    document.body.appendChild(overlay);

    overlay.querySelector('.pw-close-response').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#btnSubmitResponse').addEventListener('click', () => submitRecordedResponse(quoteId));
}

function buildRecordResponseHTML(quoteId) {
    return `
        <div class="pw-modal-card">
            <div class="pw-modal-header">
                <h3 class="pw-modal-title">📝 Record Supplier Response</h3>
                <button class="pw-close-btn pw-close-response">✕</button>
            </div>
            <div class="pw-modal-body">
                <div class="pw-form-row">
                    <div class="pw-form-group">
                        <label class="pw-label">Unit Price</label>
                        <input type="number" id="responseUnitPrice" class="pw-form-control" placeholder="0.00" step="0.01" min="0">
                    </div>
                    <div class="pw-form-group">
                        <label class="pw-label">Currency</label>
                        <select id="responseCurrency" class="pw-form-control">
                            <option value="EUR">EUR</option>
                            <option value="BGN">BGN</option>
                            <option value="USD">USD</option>
                            <option value="GBP">GBP</option>
                        </select>
                    </div>
                </div>
                <div class="pw-form-row">
                    <div class="pw-form-group">
                        <label class="pw-label">Availability</label>
                        <select id="responseAvailability" class="pw-form-control">
                            <option value="in_stock">In Stock</option>
                            <option value="available">Available</option>
                            <option value="on_order">On Order</option>
                            <option value="partial">Partial</option>
                            <option value="unavailable">Unavailable</option>
                        </select>
                    </div>
                    <div class="pw-form-group">
                        <label class="pw-label">Lead Time (days)</label>
                        <input type="number" id="responseLeadTime" class="pw-form-control" placeholder="0" min="0">
                    </div>
                </div>
                <div class="pw-form-group">
                    <label class="pw-label">Response Status</label>
                    <select id="responseStatus" class="pw-form-control">
                        <option value="pending">Pending</option>
                        <option value="accepted">Accepted</option>
                        <option value="countered">Countered</option>
                        <option value="rejected">Rejected</option>
                    </select>
                </div>
                <div class="pw-form-group">
                    <label class="pw-label">Notes</label>
                    <textarea id="responseNotes" class="pw-form-control" rows="3" placeholder="Supplier notes, terms, conditions…"></textarea>
                </div>
            </div>
            <div class="pw-modal-footer">
                <button class="btn btn-secondary pw-close-response">Cancel</button>
                <button id="btnSubmitResponse" class="btn btn-primary">Save Response</button>
            </div>
        </div>
    `;
}

async function submitRecordedResponse(quoteId) {
    const unitPrice = parseFloat(document.getElementById('responseUnitPrice')?.value) || null;
    const currency = document.getElementById('responseCurrency')?.value || 'EUR';
    const availability = document.getElementById('responseAvailability')?.value || 'available';
    const leadTime = parseInt(document.getElementById('responseLeadTime')?.value) || null;
    const status = document.getElementById('responseStatus')?.value || 'pending';
    const notes = document.getElementById('responseNotes')?.value || '';

    const btn = document.getElementById('btnSubmitResponse');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
        const result = await pwApiPost('/quotes/' + quoteId + '/responses', {
            unit_price: unitPrice,
            currency,
            availability,
            lead_time_days: leadTime,
            status,
            notes
        });
        if (result.id || result.success) {
            showToast('Response recorded', 'success');
            document.getElementById('recordResponseOverlay')?.remove();
            openQuoteLifecyclePanel(quoteId);
        } else throw new Error(result?.error || 'Save failed');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Save Response'; }
    }
}

// ============================================================
// F. ADD INVOICE MODAL
// ============================================================

function openAddInvoiceModal(poId) {
    const existing = document.getElementById('addInvoiceOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'addInvoiceOverlay';
    overlay.className = 'pw-modal-overlay';
    overlay.innerHTML = buildAddInvoiceHTML(poId);
    document.body.appendChild(overlay);

    overlay.querySelector('.pw-close-invoice').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#btnSubmitInvoice').addEventListener('click', () => submitInvoice(poId));
}

function buildAddInvoiceHTML(poId) {
    const today = new Date().toISOString().split('T')[0];
    return `
        <div class="pw-modal-card">
            <div class="pw-modal-header">
                <h3 class="pw-modal-title">🧾 Add Invoice</h3>
                <button class="pw-close-btn pw-close-invoice">✕</button>
            </div>
            <div class="pw-modal-body">
                <div class="pw-form-row">
                    <div class="pw-form-group">
                        <label class="pw-label">Invoice Number <span class="pw-required">*</span></label>
                        <input type="text" id="invoiceNumber" class="pw-form-control" placeholder="INV-2024-001">
                    </div>
                    <div class="pw-form-group">
                        <label class="pw-label">Amount <span class="pw-required">*</span></label>
                        <input type="number" id="invoiceAmount" class="pw-form-control" placeholder="0.00" step="0.01" min="0">
                    </div>
                </div>
                <div class="pw-form-row">
                    <div class="pw-form-group">
                        <label class="pw-label">Currency</label>
                        <select id="invoiceCurrency" class="pw-form-control">
                            <option value="EUR">EUR</option>
                            <option value="BGN">BGN</option>
                            <option value="USD">USD</option>
                            <option value="GBP">GBP</option>
                        </select>
                    </div>
                    <div class="pw-form-group">
                        <label class="pw-label">Received Date</label>
                        <input type="date" id="invoiceReceivedDate" class="pw-form-control" value="${today}">
                    </div>
                </div>
                <div class="pw-form-row">
                    <div class="pw-form-group">
                        <label class="pw-label">Due Date</label>
                        <input type="date" id="invoiceDueDate" class="pw-form-control">
                    </div>
                    <div class="pw-form-group">
                        <label class="pw-label">VAT Amount</label>
                        <input type="number" id="invoiceVat" class="pw-form-control" placeholder="0.00" step="0.01" min="0">
                    </div>
                </div>
                <div class="pw-form-group">
                    <label class="pw-label">Notes</label>
                    <textarea id="invoiceNotes" class="pw-form-control" rows="2" placeholder="Invoice notes…"></textarea>
                </div>
            </div>
            <div class="pw-modal-footer">
                <button class="btn btn-secondary pw-close-invoice">Cancel</button>
                <button id="btnSubmitInvoice" class="btn btn-primary">Add Invoice</button>
            </div>
        </div>
    `;
}

async function submitInvoice(poId) {
    const invoiceNumber = document.getElementById('invoiceNumber')?.value?.trim();
    const amount = parseFloat(document.getElementById('invoiceAmount')?.value);
    const currency = document.getElementById('invoiceCurrency')?.value || 'EUR';
    const receivedDate = document.getElementById('invoiceReceivedDate')?.value;
    const dueDate = document.getElementById('invoiceDueDate')?.value;
    const vat = parseFloat(document.getElementById('invoiceVat')?.value) || null;
    const notes = document.getElementById('invoiceNotes')?.value || '';

    if (!invoiceNumber) { showToast('Invoice number is required', 'warning'); return; }
    if (!amount || isNaN(amount) || amount <= 0) { showToast('Valid amount is required', 'warning'); return; }

    const btn = document.getElementById('btnSubmitInvoice');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
        const result = await pwApiPost('/purchase-orders/' + poId + '/invoices', {
            invoice_number: invoiceNumber,
            amount,
            currency,
            received_date: receivedDate || null,
            due_date: dueDate || null,
            vat_amount: vat,
            notes
        });
        if (result.id || result.success) {
            showToast('Invoice added successfully', 'success');
            document.getElementById('addInvoiceOverlay')?.remove();
            if (PW.currentQuoteId) openQuoteLifecyclePanel(PW.currentQuoteId);
        } else throw new Error(result?.error || 'Save failed');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Add Invoice'; }
    }
}

// ============================================================
// G. SUPPLIER RESPONSE TABLE (for Quote Detail Page)
// ============================================================

async function loadSupplierResponseTable(quoteId) {
    const container = document.getElementById('supplierResponseTable');
    if (!container) return;
    container.innerHTML = pwSpinner();
    try {
        const data = await pwApiGet('/quotes/' + quoteId + '/responses');
        const responses = Array.isArray(data) ? data : (data?.responses || []);
        if (!responses.length) {
            container.innerHTML = '<div class="pw-empty-state">No supplier responses yet.</div>';
            return;
        }
        container.innerHTML = renderResponseTable(responses);
    } catch (err) {
        container.innerHTML = `<div class="pw-error-state">Error: ${escHtml(err.message)}</div>`;
    }
}

function renderResponseTable(responses) {
    const rows = responses.map(r => `
        <tr>
            <td>${escHtml(r.supplier_name || '—')}</td>
            <td>${pwStatusBadge(r.status, 'response')}</td>
            <td>${pwFmtPrice(r.unit_price, r.currency)}</td>
            <td>${pwFmtPrice(r.total_price, r.currency)}</td>
            <td>${pwStatusBadge(r.availability, 'availability')}</td>
            <td>${r.lead_time_days ? r.lead_time_days + ' days' : '—'}</td>
            <td>${pwFmtDateTime(r.responded_at || r.created_at)}</td>
            <td>
                ${r.status === 'pending' ? `<button class="btn btn-success btn-sm" onclick="acceptResponse(${r.id})">Accept</button> <button class="btn btn-danger btn-sm" onclick="rejectResponse(${r.id})">Reject</button>` : ''}
            </td>
        </tr>
    `).join('');
    return `
        <table class="pw-table">
            <thead><tr><th>Supplier</th><th>Status</th><th>Unit Price</th><th>Total</th><th>Availability</th><th>Lead Time</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

// ============================================================
// H. PO LIST VIEW
// ============================================================

async function loadPOList() {
    const container = document.getElementById('poListContainer');
    if (!container) return;
    container.innerHTML = pwSpinner();
    try {
        const data = await pwApiGet('/purchase-orders');
        const pos = Array.isArray(data) ? data : (data?.purchase_orders || []);
        if (!pos.length) {
            container.innerHTML = '<div class="pw-empty-state">No purchase orders found.</div>';
            return;
        }
        container.innerHTML = renderPOTable(pos);
        container.querySelectorAll('.btn-open-po').forEach(btn => {
            btn.addEventListener('click', () => openPODetailPanel(parseInt(btn.dataset.poId)));
        });
    } catch (err) {
        container.innerHTML = `<div class="pw-error-state">Error: ${escHtml(err.message)}</div>`;
    }
}

function renderPOTable(pos) {
    const rows = pos.map(po => `
        <tr>
            <td><strong>${escHtml(po.po_number || '#' + po.id)}</strong></td>
            <td>${escHtml(po.supplier_name || '—')}</td>
            <td>${pwStatusBadge(po.status, 'po')}</td>
            <td>${pwFmtPrice(po.total_amount, po.currency)}</td>
            <td>${pwFmtDate(po.created_at)}</td>
            <td>${pwFmtDate(po.expected_delivery)}</td>
            <td><button class="btn btn-secondary btn-sm btn-open-po" data-po-id="${po.id}">View →</button></td>
        </tr>
    `).join('');
    return `
        <table class="pw-table">
            <thead><tr><th>PO #</th><th>Supplier</th><th>Status</th><th>Total</th><th>Created</th><th>Expected Delivery</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

async function openPODetailPanel(poId) {
    let panel = document.getElementById('quoteLifecyclePanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'quoteLifecyclePanel';
        panel.className = 'pw-lifecycle-panel';
        document.body.appendChild(panel);
    }
    panel.innerHTML = `<div class="pw-panel-header"><h3>PO Details</h3><button class="pw-close-btn" onclick="closeLifecyclePanel()">✕</button></div><div class="pw-panel-body">${pwSpinner()}</div>`;
    panel.classList.add('pw-panel-open');
    PW.panelOpen = true;

    try {
        const po = await pwApiGet('/purchase-orders/' + poId);
        panel.querySelector('.pw-panel-body').innerHTML = `
            <div class="pw-panel-section">
                <div class="pw-section-header"><h4>Purchase Order</h4>${renderPOActions(po)}</div>
                ${renderPOInfo(po)}
            </div>
            ${po.invoices && po.invoices.length ? `
            <div class="pw-panel-section">
                <h4>Invoices</h4>
                ${po.invoices.map(inv => renderInvoiceCard(inv)).join('')}
            </div>` : `
            <div class="pw-panel-section">
                <div class="pw-empty-state">No invoices yet.</div>
                <button class="btn btn-secondary btn-sm" style="margin-top:0.75rem;" onclick="openAddInvoiceModal(${poId})">+ Add Invoice</button>
            </div>`}
        `;
    } catch (err) {
        panel.querySelector('.pw-panel-body').innerHTML = `<div class="pw-error-state">Error: ${escHtml(err.message)}</div>`;
    }
}

// ============================================================
// I. INVOICE LIST VIEW
// ============================================================

async function loadInvoiceList() {
    const container = document.getElementById('invoiceListContainer');
    if (!container) return;
    container.innerHTML = pwSpinner();
    try {
        const data = await pwApiGet('/invoices');
        const invoices = Array.isArray(data) ? data : (data?.invoices || []);
        if (!invoices.length) {
            container.innerHTML = '<div class="pw-empty-state">No invoices found.</div>';
            return;
        }
        container.innerHTML = renderInvoiceTable(invoices);
    } catch (err) {
        container.innerHTML = `<div class="pw-error-state">Error: ${escHtml(err.message)}</div>`;
    }
}

function renderInvoiceTable(invoices) {
    const rows = invoices.map(inv => `
        <tr>
            <td><strong>${escHtml(inv.invoice_number || '#' + inv.id)}</strong></td>
            <td>${escHtml(inv.supplier_name || '—')}</td>
            <td>${escHtml(inv.po_number || '—')}</td>
            <td>${pwStatusBadge(inv.status, 'invoice')}</td>
            <td>${pwFmtPrice(inv.amount, inv.currency)}</td>
            <td>${pwFmtDate(inv.received_date)}</td>
            <td>${pwFmtDate(inv.due_date)}</td>
            <td>
                ${inv.status === 'received' ? `<button class="btn btn-secondary btn-sm" onclick="verifyInvoice(${inv.id})">Verify</button>` : ''}
                ${inv.status === 'verified' ? `<button class="btn btn-primary btn-sm" onclick="sendInvoiceToAccounting(${inv.id})">→ Accounting</button>` : ''}
            </td>
        </tr>
    `).join('');
    return `
        <table class="pw-table">
            <thead><tr><th>Invoice #</th><th>Supplier</th><th>PO #</th><th>Status</th><th>Amount</th><th>Received</th><th>Due</th><th>Actions</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

// ============================================================
// J. TAB NAVIGATION
// ============================================================

function initProcurementTabs() {
    const tabs = document.querySelectorAll('.pw-tab');
    const panels = document.querySelectorAll('.pw-tab-panel');
    if (!tabs.length) return;

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = document.getElementById('tab-' + target);
            if (panel) panel.classList.add('active');
            // Lazy-load tab content
            if (target === 'quotes') loadQuoteList();
            else if (target === 'pos') loadPOList();
            else if (target === 'invoices') loadInvoiceList();
        });
    });
}

// ============================================================
// K. FEATURE 5 — SUPPLIER PORTAL PANEL
// ============================================================

/**
 * openSupplierPortalPanel — opens a full slide-in panel for a supplier
 * showing their quote history, performance, and contact details
 * @param {number} supplierId
 * @param {string} supplierName
 */
async function openSupplierPortalPanel(supplierId, supplierName) {
    let panel = document.getElementById('supplierPortalPanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'supplierPortalPanel';
        panel.className = 'pw-lifecycle-panel';
        document.body.appendChild(panel);
    }
    panel.innerHTML = `
        <div class="pw-panel-header">
            <h3>🏢 ${escHtml(supplierName || 'Supplier')} Portal</h3>
            <button class="pw-close-btn" onclick="document.getElementById('supplierPortalPanel').classList.remove('pw-panel-open')">✕</button>
        </div>
        <div class="pw-panel-body" id="supplierPortalBody">${pwSpinner()}</div>
    `;
    panel.classList.add('pw-panel-open');

    try {
        const [supplierData, quoteHistory] = await Promise.all([
            pwApiGet('/suppliers/' + supplierId),
            pwApiGet('/suppliers/' + supplierId + '/quotes')
        ]);

        const quotes = Array.isArray(quoteHistory) ? quoteHistory : (quoteHistory?.quotes || []);
        const s = supplierData.supplier || supplierData;

        document.getElementById('supplierPortalBody').innerHTML = `
            <div class="pw-panel-section">
                <h4>Contact Details</h4>
                <div class="pw-info-grid">
                    <div class="pw-info-row"><span class="pw-info-label">Name</span><span class="pw-info-value">${escHtml(s.name)}</span></div>
                    ${s.contact_person ? `<div class="pw-info-row"><span class="pw-info-label">Contact</span><span class="pw-info-value">${escHtml(s.contact_person)}</span></div>` : ''}
                    ${s.email ? `<div class="pw-info-row"><span class="pw-info-label">Email</span><span class="pw-info-value"><a href="mailto:${escHtml(s.email)}">${escHtml(s.email)}</a></span></div>` : ''}
                    ${s.phone ? `<div class="pw-info-row"><span class="pw-info-label">Phone</span><span class="pw-info-value">${escHtml(s.phone)}</span></div>` : ''}
                    ${s.address ? `<div class="pw-info-row"><span class="pw-info-label">Address</span><span class="pw-info-value">${escHtml(s.address)}</span></div>` : ''}
                    ${s.payment_terms ? `<div class="pw-info-row"><span class="pw-info-label">Payment Terms</span><span class="pw-info-value">${escHtml(s.payment_terms)}</span></div>` : ''}
                    ${s.tax_id ? `<div class="pw-info-row"><span class="pw-info-label">Tax ID</span><span class="pw-info-value">${escHtml(s.tax_id)}</span></div>` : ''}
                </div>
            </div>
            <div class="pw-panel-section">
                <h4>Performance</h4>
                <div class="pw-info-grid">
                    ${s.avg_response_days !== null && s.avg_response_days !== undefined ? `<div class="pw-info-row"><span class="pw-info-label">Avg Response</span><span class="pw-info-value">${s.avg_response_days} days</span></div>` : ''}
                    ${s.total_orders !== null && s.total_orders !== undefined ? `<div class="pw-info-row"><span class="pw-info-label">Total Orders</span><span class="pw-info-value">${s.total_orders}</span></div>` : ''}
                    ${s.acceptance_rate !== null && s.acceptance_rate !== undefined ? `<div class="pw-info-row"><span class="pw-info-label">Acceptance Rate</span><span class="pw-info-value">${s.acceptance_rate}%</span></div>` : ''}
                </div>
            </div>
            ${quotes.length ? `
            <div class="pw-panel-section">
                <h4>Quote History (${quotes.length})</h4>
                <table class="pw-table pw-table-compact">
                    <thead><tr><th>Quote #</th><th>Status</th><th>Orders</th><th>Created</th></tr></thead>
                    <tbody>${quotes.slice(0, 10).map(q => `
                        <tr>
                            <td><button class="btn-link" onclick="openQuoteLifecyclePanel(${q.id})">${escHtml(q.quote_number || '#' + q.id)}</button></td>
                            <td>${pwStatusBadge(q.status, 'quote')}</td>
                            <td>${q.order_count || 0}</td>
                            <td>${pwFmtDate(q.created_at)}</td>
                        </tr>
                    `).join('')}</tbody>
                </table>
            </div>` : '<div class="pw-panel-section"><div class="pw-empty-state">No quote history with this supplier.</div></div>'}
            <div class="pw-panel-section">
                <button class="btn btn-primary btn-sm" onclick="openEnhancedCreateQuoteModal(${supplierId}, '${escHtml(supplierName || '')}')">
                    📋 New Quote Request
                </button>
            </div>
        `;
    } catch (err) {
        document.getElementById('supplierPortalBody').innerHTML = `<div class="pw-error-state">Error: ${escHtml(err.message)}</div>`;
    }
}

// ============================================================
// L. FEATURE 6 — PROCUREMENT DASHBOARD METRICS
// ============================================================

/**
 * loadProcurementDashboard — fetches and renders KPI cards + charts
 * Targets container with id="procurementDashboard"
 */
async function loadProcurementDashboard() {
    const container = document.getElementById('procurementDashboard');
    if (!container) return;
    container.innerHTML = pwSpinner();

    try {
        const metrics = await pwApiGet('/procurement/metrics');
        container.innerHTML = renderDashboardMetrics(metrics);
        if (metrics.monthly_spend) renderSpendChart(metrics.monthly_spend);
        if (metrics.top_suppliers) renderTopSuppliersChart(metrics.top_suppliers);
    } catch (err) {
        container.innerHTML = `<div class="pw-error-state">Dashboard unavailable: ${escHtml(err.message)}</div>`;
    }
}

function renderDashboardMetrics(metrics) {
    const kpis = [
        { label: 'Total Spend (YTD)', value: pwFmtPrice(metrics.total_spend_ytd, metrics.currency || 'EUR'), icon: '💶' },
        { label: 'Open Quotes', value: metrics.open_quotes ?? '—', icon: '📋' },
        { label: 'Pending POs', value: metrics.pending_pos ?? '—', icon: '📦' },
        { label: 'Unpaid Invoices', value: metrics.unpaid_invoices ?? '—', icon: '🧾' },
        { label: 'Avg Lead Time', value: metrics.avg_lead_time_days ? metrics.avg_lead_time_days + ' days' : '—', icon: '⏱️' },
        { label: 'On-Time Delivery', value: metrics.on_time_delivery_rate ? metrics.on_time_delivery_rate + '%' : '—', icon: '✅' }
    ];

    return `
        <div class="pw-dashboard-kpis">
            ${kpis.map(k => `
                <div class="pw-kpi-card">
                    <div class="pw-kpi-icon">${k.icon}</div>
                    <div class="pw-kpi-value">${k.value}</div>
                    <div class="pw-kpi-label">${escHtml(k.label)}</div>
                </div>
            `).join('')}
        </div>
        ${metrics.monthly_spend ? `<div class="pw-chart-container"><canvas id="spendChart"></canvas></div>` : ''}
        ${metrics.top_suppliers ? `<div class="pw-chart-container"><canvas id="suppliersChart"></canvas></div>` : ''}
    `;
}

function renderSpendChart(monthlySpend) {
    const canvas = document.getElementById('spendChart');
    if (!canvas || typeof Chart === 'undefined') return;
    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: monthlySpend.map(m => m.month),
            datasets: [{
                label: 'Monthly Spend',
                data: monthlySpend.map(m => m.amount),
                backgroundColor: 'rgba(99, 102, 241, 0.7)',
                borderColor: 'rgba(99, 102, 241, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false }, title: { display: true, text: 'Monthly Procurement Spend' } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function renderTopSuppliersChart(topSuppliers) {
    const canvas = document.getElementById('suppliersChart');
    if (!canvas || typeof Chart === 'undefined') return;
    new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: topSuppliers.map(s => s.name),
            datasets: [{
                data: topSuppliers.map(s => s.total_spend),
                backgroundColor: ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444']
            }]
        },
        options: {
            responsive: true,
            plugins: { title: { display: true, text: 'Spend by Supplier' } }
        }
    });
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    initProcurementTabs();

    // Auto-load dashboard if present
    if (document.getElementById('procurementDashboard')) {
        loadProcurementDashboard();
    }

    // Keyboard close
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (PW.panelOpen) closeLifecyclePanel();
            const wizard = document.getElementById('pwWizardOverlay');
            if (wizard) closeEnhancedQuoteModal();
        }
    });
});
