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

function openEnhancedCreateQuoteModal() {
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

    openEnhancedQuoteModal(selIds, orders, suppliers);
}

function openEnhancedQuoteModal(selectedOrderIds, orders, suppliersState) {
    PW.wizardState = {
        step: 1,
        selectedOrderIds: selectedOrderIds,
        orders: orders,
        selectedSupplierId: null,
        selectedSupplierName: '',
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
        const batchRes = await pwApiPost('/supplier-suggestions/batch', { order_ids: orderIds }).catch(() => null);
        if (batchRes && batchRes.success && batchRes.suggestions) return batchRes.suggestions.slice(0, 3);
        const singleRes = await pwApiGet(`/supplier-suggestions/${orderIds[0]}`);
        if (singleRes && singleRes.suggestions) {
            const suggestions = singleRes.suggestions.slice(0, 3);
            if (orderIds.length > 1) suggestions.forEach(s => { if (!s.reasons) s.reasons = []; s.reasons.push(`Based on order #${orderIds[0]} (representative sample)`); });
            return suggestions;
        }
        return [];
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
    if (body) body.innerHTML = `<div class="pw-error-state"><div class="pw-error-icon">⚠</div><p>${escHtml(msg)}</p></div>`;
}

function renderLifecyclePanel(lc) {
    const { quote, items, responses, purchase_orders, invoices, sendLog } = lc;
    if (!quote) return;
    const subtitle = document.getElementById('lcPanelSubtitle');
    if (subtitle) subtitle.innerHTML = `${escHtml(quote.quote_number)} · ${escHtml(quote.supplier_name || '—')} · ${pwStatusBadge(quote.status, 'quote')}`;
    const body = document.getElementById('lifecyclePanelBody');
    if (!body) return;
    const stage = determineCurrentStage(quote, responses, purchase_orders, invoices);
    body.innerHTML = `<div class="lifecycle-timeline">${renderStage1(quote, items, sendLog, stage)}${renderStage2(quote, items, responses, stage)}${renderStage3(quote, stage)}${renderStage4(quote, purchase_orders, stage)}${renderStage5(quote, purchase_orders, invoices, stage)}</div>`;
    bindStage2Events(quote, items);
    bindStage3Events(quote);
    bindStage4Events(quote, purchase_orders);
    bindStage5Events(quote, purchase_orders, invoices);
}

function determineCurrentStage(quote, responses, pos, invoices) {
    if (invoices && invoices.length) return 5;
    if (pos && pos.length) { const po = pos[0]; if (po.status === 'delivered') return 5; return 4; }
    if (quote.status === 'Approved' || quote.status === 'Under Approval') return 3;
    if (responses && responses.length) return 2;
    if (quote.status === 'Sent to Supplier' || quote.status === 'Received') return 2;
    return 1;
}

function stageClass(stageNum, currentStage) {
    if (stageNum < currentStage) return 'stage-complete';
    if (stageNum === currentStage) return 'stage-active';
    return 'stage-pending';
}

function stageIcon(stageNum, currentStage) {
    if (stageNum < currentStage) return '<span class="stage-status-icon stage-check">✓</span>';
    if (stageNum === currentStage) return '<span class="stage-status-icon stage-pulse"></span>';
    return '<span class="stage-status-icon stage-lock">🔒</span>';
}

function renderStage1(quote, items, sendLog, currentStage) {
    const cls = stageClass(1, currentStage);
    const icon = stageIcon(1, currentStage);
    const logRows = (sendLog || []).map(l => `<tr><td>${pwFmtDateTime(l.sent_at)}</td><td>${escHtml(l.sent_by_name || '—')}</td><td>${escHtml(l.recipient_email || '—')}</td></tr>`).join('') || '<tr><td colspan="3" style="color:#64748b;text-align:center;">No send history</td></tr>';
    const itemRows = (items || []).map(item => `<tr><td>#${item.order_id}</td><td title="${escHtml(item.item_description)}">${escHtml((item.item_description || '').substring(0, 40))}${(item.item_description || '').length > 40 ? '…' : ''}</td><td>${escHtml(item.building || '—')}</td><td>${item.quantity || item.order_qty || 1}</td><td>${item.files && item.files.length ? `📎 ${item.files.length}` : '—'}</td></tr>`).join('') || '<tr><td colspan="5" style="color:#64748b;text-align:center;">No items</td></tr>';
    return `<div class="lifecycle-stage ${cls}" id="stage1">
        <div class="stage-header">${icon}<div class="stage-title-area"><div class="stage-title">📋 Quote Request Sent</div><div class="stage-meta">${escHtml(quote.quote_number)} · ${escHtml(quote.supplier_name || '—')} · Created ${pwFmtDate(quote.created_at)}</div></div>
        ${currentStage >= 1 && typeof openQuoteSendPanel === 'function' ? `<button class="btn btn-secondary btn-sm" onclick="openQuoteSendPanel(${quote.id})" style="margin-left:auto;white-space:nowrap;">📧 Resend Email</button>` : ''}</div>
        <div class="stage-body">
            <div class="pw-subsection-title">Send History</div>
            <div class="pw-table-wrapper" style="max-height:140px;"><table class="pw-table"><thead><tr><th>Sent At</th><th>By</th><th>Recipient</th></tr></thead><tbody>${logRows}</tbody></table></div>
            <div class="pw-subsection-title" style="margin-top:1rem;">Quote Items</div>
            <div class="pw-table-wrapper"><table class="pw-table"><thead><tr><th>Order</th><th>Description</th><th>Building</th><th>Qty</th><th>Files</th></tr></thead><tbody>${itemRows}</tbody></table></div>
        </div></div>`;
}

function renderStage2(quote, items, responses, currentStage) {
    const cls = stageClass(2, currentStage);
    const icon = stageIcon(2, currentStage);
    const responseSummary = (responses || []).length > 0 ? `${responses.length} response(s) recorded` : 'Awaiting supplier response';
    const existingResponses = (responses || []).map(r => `<div class="pw-response-card" style="margin-bottom:0.75rem;"><div class="pw-response-header"><span>${escHtml(r.item_description || 'All items')}</span>${pwStatusBadge(r.status, 'response')}${pwStatusBadge(r.availability, 'availability')}<span class="pw-muted">${pwFmtDateTime(r.responded_at)}</span></div><div class="pw-response-details">${r.unit_price ? `<div><span class="pw-detail-label">Unit Price:</span> <strong>${pwFmtPrice(r.unit_price, r.currency)}</strong></div>` : ''}${r.total_price ? `<div><span class="pw-detail-label">Total:</span> <strong>${pwFmtPrice(r.total_price, r.currency)}</strong></div>` : ''}${r.promised_delivery_date ? `<div><span class="pw-detail-label">Promised Delivery:</span> ${pwFmtDate(r.promised_delivery_date)}</div>` : ''}${r.lead_time_days ? `<div><span class="pw-detail-label">Lead Time:</span> ${r.lead_time_days} days</div>` : ''}${r.has_alternative ? `<div style="margin-top:0.5rem;padding:0.5rem;background:#1e293b;border-radius:0.375rem;border-left:3px solid #f59e0b;"><strong>Alternative:</strong> ${escHtml(r.alternative_description || '')} ${r.alternative_unit_price ? '— ' + pwFmtPrice(r.alternative_unit_price, r.currency) : ''}</div>` : ''}${r.supplier_notes ? `<div><span class="pw-detail-label">Supplier Notes:</span> ${escHtml(r.supplier_notes)}</div>` : ''}${r.internal_notes ? `<div><span class="pw-detail-label">Internal Notes:</span> ${escHtml(r.internal_notes)}</div>` : ''}<div style="font-size:0.75rem;color:#64748b;">Recorded by ${escHtml(r.recorded_by_name || '—')}</div></div></div>`).join('');
    const itemOptions = (items || []).map(item => `<option value="${item.order_id}">#${item.order_id} — ${escHtml((item.item_description || '').substring(0, 35))}</option>`).join('');
    return `<div class="lifecycle-stage ${cls}" id="stage2">
        <div class="stage-header">${icon}<div class="stage-title-area"><div class="stage-title">💬 Supplier Response</div><div class="stage-meta">${responseSummary}</div></div>
        ${currentStage >= 1 ? `<button class="btn btn-secondary btn-sm" id="btnMarkAllReceived" style="margin-left:auto;white-space:nowrap;">✅ Mark All Received</button>` : ''}</div>
        <div class="stage-body">
            ${existingResponses ? `<div class="pw-subsection-title">Recorded Responses</div>${existingResponses}` : ''}
            <div class="pw-subsection-title" style="margin-top:1rem;">Record New Response</div>
            <div class="response-form" id="responseFormContainer">
                <div class="pw-form-group"><label class="pw-label">For Order Item (optional)</label><select id="respOrderId" class="pw-form-control"><option value="">— All items in quote —</option>${itemOptions}</select></div>
                <div class="pw-form-row">
                    <div class="pw-form-group"><label class="pw-label">Unit Price</label><input type="number" id="respUnitPrice" class="pw-form-control" step="0.0001" placeholder="0.0000"></div>
                    <div class="pw-form-group"><label class="pw-label">Total Price</label><input type="number" id="respTotalPrice" class="pw-form-control" step="0.01" placeholder="0.00"></div>
                    <div class="pw-form-group"><label class="pw-label">Currency</label><select id="respCurrency" class="pw-form-control"><option value="EUR">EUR</option><option value="BGN">BGN</option><option value="USD">USD</option><option value="GBP">GBP</option></select></div>
                </div>
                <div class="pw-form-row">
                    <div class="pw-form-group"><label class="pw-label">Promised Delivery Date</label><input type="date" id="respDeliveryDate" class="pw-form-control"></div>
                    <div class="pw-form-group"><label class="pw-label">Lead Time (days)</label><input type="number" id="respLeadTime" class="pw-form-control" placeholder="e.g. 14"></div>
                    <div class="pw-form-group"><label class="pw-label">MOQ</label><input type="number" id="respMoq" class="pw-form-control" placeholder="Min order qty"></div>
                </div>
                <div class="pw-form-row">
                    <div class="pw-form-group"><label class="pw-label">Availability</label><select id="respAvailability" class="pw-form-control"><option value="in_stock">In Stock</option><option value="available" selected>Available</option><option value="on_order">On Order</option><option value="partial">Partial</option><option value="unavailable">Unavailable</option></select></div>
                    <div class="pw-form-group"><label class="pw-label">Response Status</label><select id="respStatus" class="pw-form-control"><option value="pending">Pending</option><option value="accepted">Accepted</option><option value="negotiating">Negotiating</option><option value="countered">Countered</option><option value="rejected">Rejected</option></select></div>
                </div>
                <div class="pw-form-group"><label class="pw-label"><input type="checkbox" id="respHasAlt"> Has Alternative Product</label></div>
                <div id="respAltFields" class="hidden">
                    <div class="pw-form-group"><label class="pw-label">Alternative Description</label><textarea id="respAltDesc" class="pw-form-control" rows="2" placeholder="Describe the alternative…"></textarea></div>
                    <div class="pw-form-group"><label class="pw-label">Alternative Unit Price</label><input type="number" id="respAltPrice" class="pw-form-control" step="0.0001" placeholder="0.0000"></div>
                </div>
                <div class="pw-form-group"><label class="pw-label">Supplier Notes</label><textarea id="respSupplierNotes" class="pw-form-control" rows="2" placeholder="Notes from the supplier…"></textarea></div>
                <div class="pw-form-group"><label class="pw-label">Internal Notes</label><textarea id="respInternalNotes" class="pw-form-control" rows="2" placeholder="Internal procurement notes…"></textarea></div>
                <div class="pw-form-actions"><button class="btn btn-primary" id="btnSaveResponse">💾 Save Response</button></div>
            </div>
        </div></div>`;
}

function renderStage3(quote, currentStage) {
    const cls = stageClass(3, currentStage);
    const icon = stageIcon(3, currentStage);
    const isApproved = quote.status === 'Approved';
    const isUnderApproval = quote.status === 'Under Approval';
    const isSubmittable = ['Draft', 'Received'].includes(quote.status);
    let approvalContent = '';
    if (isApproved) approvalContent = `<div class="pw-success-notice"><span>✓</span> Quote has been approved</div>`;
    else if (isUnderApproval) approvalContent = `<div class="pw-info-notice"><span>⏳</span> Quote is under review by manager</div>`;
    else if (isSubmittable) approvalContent = `<p class="pw-muted" style="margin-bottom:0.75rem;">Submit this quote for manager approval before creating a purchase order.</p><button class="btn btn-primary" id="btnSubmitApprovalFromLC">📋 Submit for Approval</button>`;
    else approvalContent = `<p class="pw-muted">Current status: ${escHtml(quote.status)}</p>`;
    const totalDisplay = quote.total_amount ? `<div class="pw-totals-row"><span class="pw-detail-label">Quote Total</span> <strong>${pwFmtPrice(quote.total_amount, quote.currency)}</strong></div>` : '';
    return `<div class="lifecycle-stage ${cls}" id="stage3"><div class="stage-header">${icon}<div class="stage-title-area"><div class="stage-title">✅ Approval</div><div class="stage-meta">${escHtml(quote.status)}</div></div></div><div class="stage-body">${totalDisplay}${approvalContent}</div></div>`;
}

function renderStage4(quote, pos, currentStage) {
    const cls = stageClass(4, currentStage);
    const icon = stageIcon(4, currentStage);
    const po = pos && pos.length ? pos[0] : null;
    const canCreatePO = quote.status === 'Approved';
    let poContent = '';
    if (po) {
        poContent = `<div class="po-panel"><div class="pw-confirm-grid"><div class="pw-confirm-item"><div class="pw-confirm-label">PO Number</div><div class="pw-confirm-value" style="color:#06b6d4;font-weight:600;">${escHtml(po.po_number)}</div></div><div class="pw-confirm-item"><div class="pw-confirm-label">Status</div><div class="pw-confirm-value">${pwStatusBadge(po.status, 'po')}</div></div><div class="pw-confirm-item"><div class="pw-confirm-label">Total</div><div class="pw-confirm-value">${pwFmtPrice(po.total_amount, po.currency)}</div></div><div class="pw-confirm-item"><div class="pw-confirm-label">Expected Delivery</div><div class="pw-confirm-value">${pwFmtDate(po.expected_delivery_date)}</div></div>${po.actual_delivery_date ? `<div class="pw-confirm-item"><div class="pw-confirm-label">Actual Delivery</div><div class="pw-confirm-value" style="color:#10b981;">${pwFmtDate(po.actual_delivery_date)}</div></div>` : ''}</div><div class="pw-po-status-actions">${po.status === 'draft' ? `<button class="btn btn-primary btn-sm" data-po-id="${po.id}" data-new-status="sent" id="btnMarkPOSent">📤 Mark as Sent</button>` : ''}${po.status === 'sent' ? `<button class="btn btn-secondary btn-sm" data-po-id="${po.id}" data-new-status="confirmed" id="btnMarkPOConfirmed">✓ Mark Confirmed</button>` : ''}${['sent','confirmed','partially_delivered'].includes(po.status) ? `<button class="btn btn-secondary btn-sm" data-po-id="${po.id}" id="btnMarkPartialDelivery">📦 Partial Delivery</button><button class="btn btn-primary btn-sm" data-po-id="${po.id}" id="btnMarkDelivered">🚚 Mark Delivered</button>` : ''}</div></div>`;
    } else if (canCreatePO) {
        poContent = `<div class="po-panel"><p class="pw-muted" style="margin-bottom:0.75rem;">Create a purchase order for this approved quote. Items will be auto-populated from quote responses.</p><div class="pw-form-group"><label class="pw-label">Delivery Address</label><textarea id="poDeliveryAddress" class="pw-form-control" rows="2" placeholder="Delivery address…"></textarea></div><div class="pw-form-row"><div class="pw-form-group"><label class="pw-label">Payment Terms</label><input type="text" id="poPaymentTerms" class="pw-form-control" placeholder="e.g. Net 30"></div><div class="pw-form-group"><label class="pw-label">Expected Delivery</label><input type="date" id="poExpectedDelivery" class="pw-form-control"></div></div><div class="pw-form-group"><label class="pw-label">Notes</label><textarea id="poNotes" class="pw-form-control" rows="2" placeholder="PO notes…"></textarea></div><button class="btn btn-primary" id="btnCreatePO">📦 Create Purchase Order</button></div>`;
    } else {
        poContent = `<p class="pw-muted">Quote must be approved before creating a purchase order.</p>`;
    }
    return `<div class="lifecycle-stage ${cls}" id="stage4"><div class="stage-header">${icon}<div class="stage-title-area"><div class="stage-title">📦 Purchase Order</div><div class="stage-meta">${po ? `PO: ${po.po_number} · ${po.status}` : 'Not yet created'}</div></div></div><div class="stage-body">${poContent}</div></div>`;
}

function renderStage5(quote, pos, invoices, currentStage) {
    const cls = stageClass(5, currentStage);
    const icon = stageIcon(5, currentStage);
    const po = pos && pos.length ? pos[0] : null;
    const invoiceRows = (invoices || []).map(inv => `<div class="pw-invoice-card" style="margin-bottom:0.75rem;"><div class="pw-response-header"><strong>${escHtml(inv.invoice_number || 'No invoice #')}</strong>${pwStatusBadge(inv.status, 'invoice')}<span class="pw-muted">${pwFmtDateTime(inv.received_at)}</span></div><div class="pw-response-details">${inv.invoice_date ? `<div><span class="pw-detail-label">Invoice Date:</span> ${pwFmtDate(inv.invoice_date)}</div>` : ''}${inv.due_date ? `<div><span class="pw-detail-label">Due Date:</span> ${pwFmtDate(inv.due_date)}</div>` : ''}<div><span class="pw-detail-label">Amount:</span> ${pwFmtPrice(inv.amount, inv.currency)} + VAT: ${pwFmtPrice(inv.vat_amount, inv.currency)} = <strong>${pwFmtPrice(inv.total_amount, inv.currency)}</strong></div>${inv.status !== 'sent_to_accounting' && inv.status !== 'booked' && inv.status !== 'paid' ? `<button class="btn btn-secondary btn-sm" style="margin-top:0.5rem;" data-inv-id="${inv.id}" id="btnSendToAccounting_${inv.id}">📤 Send to Accounting</button>` : ''}${inv.status === 'sent_to_accounting' || inv.status === 'booked' ? `<div class="pw-form-row" style="margin-top:0.5rem;"><div class="pw-form-group"><label class="pw-label">Booking Reference</label><input type="text" class="pw-form-control pw-booking-ref" data-inv-id="${inv.id}" value="${escHtml(inv.booking_reference || '')}" placeholder="Accounting ref…"></div><div style="align-self:flex-end;"><button class="btn btn-secondary btn-sm pw-save-booking" data-inv-id="${inv.id}">Save Ref</button></div></div>` : ''}${inv.accounting_notes ? `<div><span class="pw-detail-label">Accounting Notes:</span> ${escHtml(inv.accounting_notes)}</div>` : ''}${inv.paid_at ? `<div style="color:#10b981;"><span class="pw-detail-label">Paid:</span> ${pwFmtDateTime(inv.paid_at)}</div>` : ''}</div></div>`).join('');
    const canAddInvoice = po || quote;
    return `<div class="lifecycle-stage ${cls}" id="stage5"><div class="stage-header">${icon}<div class="stage-title-area"><div class="stage-title">🧾 Invoice &amp; Accounting</div><div class="stage-meta">${invoices && invoices.length ? `${invoices.length} invoice(s)` : 'No invoices yet'}</div></div></div><div class="stage-body invoice-panel">${invoiceRows}${canAddInvoice ? `<div class="pw-subsection-title" style="margin-top:1rem;">Record New Invoice</div><div class="pw-form-row"><div class="pw-form-group"><label class="pw-label">Supplier Invoice #</label><input type="text" id="invNumber" class="pw-form-control" placeholder="Supplier's invoice number"></div><div class="pw-form-group"><label class="pw-label">Invoice Date</label><input type="date" id="invDate" class="pw-form-control"></div><div class="pw-form-group"><label class="pw-label">Due Date</label><input type="date" id="invDueDate" class="pw-form-control"></div></div><div class="pw-form-row"><div class="pw-form-group"><label class="pw-label">Amount (excl. VAT)</label><input type="number" id="invAmount" class="pw-form-control" step="0.01" placeholder="0.00"></div><div class="pw-form-group"><label class="pw-label">VAT Amount</label><input type="number" id="invVat" class="pw-form-control" step="0.01" placeholder="0.00"></div><div class="pw-form-group"><label class="pw-label">Total</label><input type="number" id="invTotal" class="pw-form-control" step="0.01" placeholder="0.00"></div><div class="pw-form-group"><label class="pw-label">Currency</label><select id="invCurrency" class="pw-form-control"><option value="EUR">EUR</option><option value="BGN">BGN</option><option value="USD">USD</option><option value="GBP">GBP</option></select></div></div><div class="pw-form-group"><label class="pw-label">Notes</label><textarea id="invNotes" class="pw-form-control" rows="2" placeholder="Invoice notes…"></textarea></div><button class="btn btn-primary" id="btnRecordInvoice">🧾 Record Invoice</button>` : `<p class="pw-muted">No purchase order linked yet.</p>`}</div></div>`;
}

// ============================================================
// EVENT BINDERS
// ============================================================
function bindStage2Events(quote, items) {
    const hasAlt = document.getElementById('respHasAlt');
    const altFields = document.getElementById('respAltFields');
    if (hasAlt && altFields) hasAlt.addEventListener('change', () => altFields.classList.toggle('hidden', !hasAlt.checked));
    const unitPriceInput = document.getElementById('respUnitPrice');
    const totalPriceInput = document.getElementById('respTotalPrice');
    const orderSel = document.getElementById('respOrderId');
    if (unitPriceInput && totalPriceInput) {
        unitPriceInput.addEventListener('input', () => {
            const orderId = orderSel ? parseInt(orderSel.value) : null;
            const qty = orderId ? ((items.find(i => i.order_id === orderId) || {}).quantity || 1) : 1;
            const up = parseFloat(unitPriceInput.value);
            if (!isNaN(up)) totalPriceInput.value = (up * qty).toFixed(2);
        });
    }
    const btnSave = document.getElementById('btnSaveResponse');
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const orderId = document.getElementById('respOrderId')?.value;
            const body = {
                order_id: orderId ? parseInt(orderId) : null,
                unit_price: parseFloat(document.getElementById('respUnitPrice')?.value) || null,
                total_price: parseFloat(document.getElementById('respTotalPrice')?.value) || null,
                currency: document.getElementById('respCurrency')?.value || 'EUR',
                promised_delivery_date: document.getElementById('respDeliveryDate')?.value || null,
                lead_time_days: parseInt(document.getElementById('respLeadTime')?.value) || null,
                moq: parseInt(document.getElementById('respMoq')?.value) || null,
                availability: document.getElementById('respAvailability')?.value || 'available',
                status: document.getElementById('respStatus')?.value || 'pending',
                has_alternative: document.getElementById('respHasAlt')?.checked ? 1 : 0,
                alternative_description: document.getElementById('respAltDesc')?.value || null,
                alternative_unit_price: parseFloat(document.getElementById('respAltPrice')?.value) || null,
                supplier_notes: document.getElementById('respSupplierNotes')?.value || null,
                internal_notes: document.getElementById('respInternalNotes')?.value || null
            };
            btnSave.disabled = true; btnSave.innerHTML = pwSpinner() + ' Saving…';
            try {
                const res = await pwApiPost(`/procurement/quotes/${quote.id}/responses`, body);
                if (res.success) { showToast('Response recorded successfully', 'success'); await loadAndRenderLifecycle(quote.id); }
                else { showToast('Failed to save response: ' + (res.message || ''), 'error'); btnSave.disabled = false; btnSave.textContent = '💾 Save Response'; }
            } catch (err) { console.error('saveResponse error:', err); showToast('Network error saving response', 'error'); btnSave.disabled = false; btnSave.textContent = '💾 Save Response'; }
        });
    }
    const btnMarkAll = document.getElementById('btnMarkAllReceived');
    if (btnMarkAll) {
        btnMarkAll.addEventListener('click', async () => {
            if (!confirm('Mark quote as Received and update all linked orders to "Quote Received"?')) return;
            btnMarkAll.disabled = true;
            try {
                const res = await pwApiPut(`/quotes/${quote.id}`, { status: 'Received' });
                if (res.success) { showToast('Quote marked as Received', 'success'); await loadAndRenderLifecycle(quote.id); }
                else { showToast('Failed to update status', 'error'); btnMarkAll.disabled = false; }
            } catch (err) { showToast('Network error', 'error'); btnMarkAll.disabled = false; }
        });
    }
}

function bindStage3Events(quote) {
    const btnSubmit = document.getElementById('btnSubmitApprovalFromLC');
    if (btnSubmit) {
        btnSubmit.addEventListener('click', () => {
            if (typeof openSubmitForApprovalDialog === 'function') { openSubmitForApprovalDialog(quote.id); }
            else {
                if (!confirm('Submit quote for approval?')) return;
                pwApiPut(`/quotes/${quote.id}`, { status: 'Under Approval' }).then(res => {
                    if (res.success) { showToast('Submitted for approval', 'success'); loadAndRenderLifecycle(quote.id); }
                    else { showToast('Failed to submit: ' + (res.message || ''), 'error'); }
                });
            }
        });
    }
}

function bindStage4Events(quote, pos) {
    const po = pos && pos.length ? pos[0] : null;
    const btnCreatePO = document.getElementById('btnCreatePO');
    if (btnCreatePO) {
        btnCreatePO.addEventListener('click', async () => {
            if (!quote.supplier_id) { showToast('No supplier linked to this quote', 'error'); return; }
            btnCreatePO.disabled = true; btnCreatePO.innerHTML = pwSpinner() + ' Creating PO…';
            try {
                const body = { quote_id: quote.id, supplier_id: quote.supplier_id, currency: quote.currency || 'EUR', delivery_address: document.getElementById('poDeliveryAddress')?.value || null, payment_terms: document.getElementById('poPaymentTerms')?.value || null, expected_delivery_date: document.getElementById('poExpectedDelivery')?.value || null, notes: document.getElementById('poNotes')?.value || null };
                const res = await pwApiPost('/procurement/purchase-orders', body);
                if (res.success) { showToast('Purchase Order ' + res.poNumber + ' created', 'success'); if (typeof loadOrders === 'function') loadOrders(); await loadAndRenderLifecycle(quote.id); }
                else { showToast('Failed to create PO: ' + (res.message || ''), 'error'); btnCreatePO.disabled = false; btnCreatePO.textContent = '📦 Create Purchase Order'; }
            } catch (err) { console.error('createPO error:', err); showToast('Network error creating PO', 'error'); btnCreatePO.disabled = false; btnCreatePO.textContent = '📦 Create Purchase Order'; }
        });
    }
    if (po) {
        [{ id: 'btnMarkPOSent', status: 'sent', msg: 'Mark PO as Sent?' }, { id: 'btnMarkPOConfirmed', status: 'confirmed', msg: 'Mark PO as Confirmed by supplier?' }, { id: 'btnMarkPartialDelivery', status: 'partially_delivered', msg: 'Mark as Partially Delivered?' }].forEach(({ id, status, msg }) => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener('click', async () => {
                if (!confirm(msg)) return; btn.disabled = true;
                try {
                    const res = await pwApiPut(`/procurement/purchase-orders/${po.id}`, { status });
                    if (res.success) { showToast('PO status updated', 'success'); if (typeof loadOrders === 'function') loadOrders(); await loadAndRenderLifecycle(quote.id); }
                    else { showToast('Failed: ' + (res.message || ''), 'error'); btn.disabled = false; }
                } catch (err) { showToast('Network error', 'error'); btn.disabled = false; }
            });
        });
        const btnDelivered = document.getElementById('btnMarkDelivered');
        if (btnDelivered) {
            btnDelivered.addEventListener('click', async () => {
                const dateStr = prompt('Enter actual delivery date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
                if (!dateStr) return; btnDelivered.disabled = true;
                try {
                    const res = await pwApiPut(`/procurement/purchase-orders/${po.id}`, { status: 'delivered', actual_delivery_date: dateStr });
                    if (res.success) { showToast('Delivery confirmed', 'success'); if (typeof loadOrders === 'function') loadOrders(); await loadAndRenderLifecycle(quote.id); }
                    else { showToast('Failed: ' + (res.message || ''), 'error'); btnDelivered.disabled = false; }
                } catch (err) { showToast('Network error', 'error'); btnDelivered.disabled = false; }
            });
        }
    }
}

function bindStage5Events(quote, pos, invoices) {
    const po = pos && pos.length ? pos[0] : null;
    const btnRecord = document.getElementById('btnRecordInvoice');
    if (btnRecord) {
        btnRecord.addEventListener('click', async () => {
            const body = { po_id: po ? po.id : null, quote_id: quote.id, supplier_id: quote.supplier_id, invoice_number: document.getElementById('invNumber')?.value || null, invoice_date: document.getElementById('invDate')?.value || null, due_date: document.getElementById('invDueDate')?.value || null, currency: document.getElementById('invCurrency')?.value || 'EUR', amount: parseFloat(document.getElementById('invAmount')?.value) || 0, vat_amount: parseFloat(document.getElementById('invVat')?.value) || 0, total_amount: parseFloat(document.getElementById('invTotal')?.value) || 0, notes: document.getElementById('invNotes')?.value || null };
            if (!body.supplier_id) { showToast('No supplier linked to this quote', 'error'); return; }
            btnRecord.disabled = true; btnRecord.innerHTML = pwSpinner() + ' Recording…';
            try {
                const res = await pwApiPost('/procurement/invoices', body);
                if (res.success) { showToast('Invoice recorded successfully', 'success'); await loadAndRenderLifecycle(quote.id); }
                else { showToast('Failed to record invoice: ' + (res.message || ''), 'error'); btnRecord.disabled = false; btnRecord.textContent = '🧾 Record Invoice'; }
            } catch (err) { console.error('recordInvoice error:', err); showToast('Network error recording invoice', 'error'); btnRecord.disabled = false; btnRecord.textContent = '🧾 Record Invoice'; }
        });
    }
    const invAmount = document.getElementById('invAmount');
    const invVat = document.getElementById('invVat');
    const invTotal = document.getElementById('invTotal');
    if (invAmount && invVat && invTotal) { const calc = () => { const a = parseFloat(invAmount.value) || 0; const v = parseFloat(invVat.value) || 0; invTotal.value = (a + v).toFixed(2); }; invAmount.addEventListener('input', calc); invVat.addEventListener('input', calc); }
    if (invoices) {
        invoices.forEach(inv => {
            const btnSendAcc = document.getElementById(`btnSendToAccounting_${inv.id}`);
            if (btnSendAcc) btnSendAcc.addEventListener('click', async () => {
                if (!confirm('Send invoice to accounting?')) return; btnSendAcc.disabled = true;
                try {
                    const res = await pwApiPut(`/procurement/invoices/${inv.id}`, { status: 'sent_to_accounting' });
                    if (res.success) { showToast('Invoice sent to accounting', 'success'); await loadAndRenderLifecycle(quote.id); }
                    else { showToast('Failed: ' + (res.message || ''), 'error'); btnSendAcc.disabled = false; }
                } catch (err) { showToast('Network error', 'error'); btnSendAcc.disabled = false; }
            });
            const btnSaveRef = document.querySelector(`.pw-save-booking[data-inv-id="${inv.id}"]`);
            if (btnSaveRef) btnSaveRef.addEventListener('click', async () => {
                const refInput = document.querySelector(`.pw-booking-ref[data-inv-id="${inv.id}"]`);
                const ref = refInput ? refInput.value : ''; btnSaveRef.disabled = true;
                try {
                    const res = await pwApiPut(`/procurement/invoices/${inv.id}`, { booking_reference: ref });
                    if (res.success) showToast('Booking reference saved', 'success');
                    else showToast('Failed to save: ' + (res.message || ''), 'error');
                    btnSaveRef.disabled = false;
                } catch (err) { showToast('Network error', 'error'); btnSaveRef.disabled = false; }
            });
        });
    }
}

// ============================================================
// EXPOSE GLOBALS
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
