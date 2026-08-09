// partpulse-features.js — PartPulse Full Feature Pack
// All new features: RFQ Wizard, Bulk Status, Today's Actions, Supplier Response,
// Order Templates, Duplicate Detection, XLSX Export, Status Timeline
'use strict';

// ============================================================
//  STANDARD CATEGORIES (used everywhere)
// ============================================================
const PP_CATEGORIES = [
    'Bearings', 'Seals & Gaskets', 'Belts & Chains', 'Pneumatics', 'Hydraulics',
    'Electrical Components', 'Motors & Drives', 'Sensors & Switches', 'Filters',
    'Lubricants & Chemicals', 'Fasteners & Hardware', 'Pipes & Fittings',
    'Safety Equipment', 'Tools', 'Spare Parts', 'Other'
];

// ============================================================
//  HELPER: wait for DOM element
// ============================================================
function ppWaitFor(id, cb, tries = 20) {
    const el = document.getElementById(id);
    if (el) { cb(el); return; }
    if (tries > 0) setTimeout(() => ppWaitFor(id, cb, tries - 1), 100);
}

// ============================================================
//  BULK STATUS UPDATE
// ============================================================
async function applyBulkStatus() {
    const sel = document.getElementById('bulkStatusSelect');
    if (!sel || !sel.value) { showToast('Select a status first', 'warning'); return; }
    if (!selectedOrderIds || !selectedOrderIds.size) { showToast('No orders selected', 'warning'); return; }

    const status = sel.value;
    const ids = [...selectedOrderIds];
    const confirmed = confirm(`Change ${ids.length} order(s) to "${status}"?`);
    if (!confirmed) return;

    try {
        const res = await apiPost('/orders/bulk-status', { order_ids: ids, status });
        if (res.success) {
            showToast(`${res.updated} orders updated to ${status}`, 'success');
            selectedOrderIds.clear();
            updateSelectionUi();
            loadOrders();
        } else {
            showToast(res.message || 'Failed to update', 'error');
        }
    } catch (e) {
        showToast('Network error', 'error');
    }
}

// ============================================================
//  EXPORT ORDERS TO CSV (works without server lib)
// ============================================================
function exportOrdersToCsv() {
    const orders = (typeof filteredOrders !== 'undefined' && filteredOrders.length)
        ? filteredOrders
        : (typeof ordersState !== 'undefined' ? ordersState : []);

    if (!orders.length) { showToast('No orders to export', 'warning'); return; }

    const headers = ['ID','Building','Cost Center','Description','Part No.','Category',
        'Qty','Priority','Status','Supplier','Unit Price','Total Price',
        'Date Needed','Expected Delivery','Requester','Created At'];

    function esc(v) {
        if (v === null || v === undefined) return '';
        const s = String(v).replace(/"/g, '""');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    }
    function fmtD(d) { if (!d) return ''; try { return new Date(d).toLocaleDateString(); } catch { return d; } }

    const rows = orders.map(o => [
        o.id, o.building, o.cost_center_code || o.costcentercode || '',
        o.item_description || o.itemdescription || '',
        o.part_number || o.partnumber || '',
        o.category || '',
        o.quantity, o.priority, o.status,
        o.supplier_name || o.suppliername || '',
        o.unit_price || '', o.total_price || '',
        fmtD(o.date_needed || o.dateneeded),
        fmtD(o.expected_delivery_date),
        o.requester_name || o.requestername || '',
        fmtD(o.created_at || o.createdat || o.submission_date)
    ].map(esc).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `partpulse-orders-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
    showToast(`Exported ${orders.length} orders`, 'success');
}

// ============================================================
//  DUPLICATE ORDER DETECTION
// ============================================================
let _pendingOrderSubmit = null;

async function checkDuplicateOrder(itemDescription, building) {
    if (!itemDescription || itemDescription.length < 5) return [];
    try {
        const words = itemDescription.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 4);
        const all = typeof ordersState !== 'undefined' ? ordersState : [];
        const recent = all.filter(o => {
            if (['Delivered', 'Cancelled'].includes(o.status)) return false;
            const desc = (o.item_description || o.itemdescription || '').toLowerCase();
            const matches = words.filter(w => desc.includes(w));
            return matches.length >= Math.min(2, words.length);
        });
        return recent;
    } catch { return []; }
}

function showDuplicateWarning(duplicates, onConfirm) {
    const modal = document.getElementById('duplicateOrderModal');
    const msg = document.getElementById('duplicateOrderMsg');
    const list = document.getElementById('duplicateOrderList');
    const btn = document.getElementById('btnSubmitAnyway');

    if (!modal) { onConfirm(); return; }

    msg.textContent = `Found ${duplicates.length} similar active order(s). Are you sure you want to submit?`;
    list.innerHTML = duplicates.slice(0, 5).map(o =>
        `<div style="padding:.5rem;background:#1e293b;border-radius:6px;margin-bottom:.4rem;font-size:.85rem;">
            <span style="color:#94a3b8;">#${o.id}</span> 
            <strong style="color:#f1f5f9;">${(o.item_description || o.itemdescription || '').substring(0, 60)}</strong>
            <span class="status-badge" style="margin-left:.5rem;font-size:.7rem;">${o.status}</span>
        </div>`
    ).join('');

    btn.onclick = () => { modal.classList.add('hidden'); onConfirm(); };
    modal.classList.remove('hidden');
}

// ============================================================
//  TODAY'S ACTIONS PANEL
// ============================================================
async function openProcTodayPanel() {
    const panel = document.getElementById('procTodayPanel');
    const backdrop = document.getElementById('procTodayBackdrop');
    const body = document.getElementById('procTodayBody');

    if (!panel) return;
    panel.classList.remove('hidden');
    if (backdrop) backdrop.classList.remove('hidden');
    body.innerHTML = '<div class="text-muted" style="padding:1rem;">Loading...</div>';

    try {
        const res = await apiGet('/orders/todays-actions');
        if (!res.success) { body.innerHTML = '<div class="text-muted">Failed to load.</div>'; return; }
        body.innerHTML = renderTodayActions(res);
    } catch (e) {
        body.innerHTML = '<div style="color:#ef4444;padding:1rem;">Network error</div>';
    }
}

function closeProcTodayPanel() {
    const panel = document.getElementById('procTodayPanel');
    const backdrop = document.getElementById('procTodayBackdrop');
    if (panel) panel.classList.add('hidden');
    if (backdrop) backdrop.classList.add('hidden');
}

function renderTodayActions(data) {
    const { overdue = [], awaitingResponse = [], newUnprocessed = [], arrivalToday = [], quotesNoPrice = [] } = data;

    function section(title, color, icon, items, renderFn) {
        if (!items.length) return '';
        return `<div class="today-section">
            <div class="today-section-title" style="--today-color:${color}">${icon} ${title} <span class="today-count">${items.length}</span></div>
            <div class="today-section-body">${items.map(renderFn).join('')}</div>
        </div>`;
    }

    function orderItem(o, extra = '') {
        return `<div class="today-item" onclick="openOrderDetail(${o.id})" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:.5rem;">
            <div style="min-width:0;flex:1;">
                <div class="today-item-id">#${o.id}</div>
                <div class="today-item-desc">${escapeHtml((o.item_description || '').substring(0, 50))}</div>
                <div class="today-item-meta">${escapeHtml(o.building || '')}${extra}</div>
            </div>
            <div style="flex-shrink:0;font-size:.75rem;color:#e8682a;font-weight:600;white-space:nowrap;">View →</div>
        </div>`;
    }

    const totalActions = overdue.length + awaitingResponse.length + newUnprocessed.length + arrivalToday.length + quotesNoPrice.length;

    if (!totalActions) {
        return `<div style="text-align:center;padding:3rem 1rem;">
            <div style="font-size:3rem;margin-bottom:1rem;">✅</div>
            <div style="color:#94a3b8;font-size:1rem;">All caught up! No actions needed today.</div>
        </div>`;
    }

    return `
        <div style="font-size:.8rem;color:#64748b;margin-bottom:.75rem;">${totalActions} total action${totalActions !== 1 ? 's' : ''} need attention</div>
        ${section('Overdue Orders', '#ef4444', '🔴', overdue, o =>
            orderItem(o, ` · Due ${new Date(o.date_needed).toLocaleDateString()}`)
        )}
        ${section('Awaiting Supplier Response', '#f59e0b', '⏳', awaitingResponse, o =>
            `<div class="today-item" onclick="openOrderDetail(${o.id})" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:.5rem;">
                <div style="min-width:0;flex:1;">
                    <div class="today-item-id">#${o.id}</div>
                    <div class="today-item-desc">${escapeHtml((o.item_description || '').substring(0, 45))}</div>
                    <div class="today-item-meta">${escapeHtml(o.supplier_name || '—')} · ${o.days_waiting}d waiting
                        <button class="btn btn-secondary btn-sm" style="margin-left:.5rem;padding:.15rem .5rem;" 
                            onclick="event.stopPropagation();openSupplierResponseModalForQuote('${o.quote_number}')">Enter Prices</button>
                    </div>
                </div>
                <div style="flex-shrink:0;font-size:.75rem;color:#e8682a;font-weight:600;white-space:nowrap;">View →</div>
            </div>`
        )}
        ${section('New Orders — Needs Processing', '#3b82f6', '🆕', newUnprocessed, o =>
            orderItem(o, ` · ${o.priority} · ${o.days_old}d old`)
        )}
        ${section('Expected Deliveries', '#10b981', '📦', arrivalToday, o =>
            orderItem(o, ` · ${escapeHtml(o.supplier_name || '')}`)
        )}
        ${section('Quotes with Missing Prices', '#a78bfa', '💰', quotesNoPrice, o =>
            `<div class="today-item" onclick="openOrderDetail(${o.id})" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:.5rem;">
                <div style="min-width:0;flex:1;">
                    <div class="today-item-id">#${o.id}</div>
                    <div class="today-item-desc">${escapeHtml((o.item_description || '').substring(0, 45))}</div>
                    <div class="today-item-meta">${escapeHtml(o.quote_number || '')} · ${escapeHtml(o.supplier_name || '')}
                        <button class="btn btn-primary btn-sm" style="margin-left:.5rem;padding:.15rem .5rem;"
                            onclick="event.stopPropagation();openSupplierResponseForOrder(${o.id})">Enter Price</button>
                    </div>
                </div>
                <div style="flex-shrink:0;font-size:.75rem;color:#e8682a;font-weight:600;white-space:nowrap;">View →</div>
            </div>`
        )}
    `;
}

// ============================================================
//  SUPPLIER RESPONSE MODAL  (enter prices after supplier emails back)
// ============================================================
async function openSupplierResponseForOrder(orderId) {
    const modal = document.getElementById('supplierResponseModal');
    const body = document.getElementById('supplierResponseBody');
    if (!modal) return;
    modal.classList.remove('hidden');
    body.innerHTML = '<div class="text-muted" style="padding:1rem;">Loading...</div>';

    try {
        const res = await apiGet(`/orders/${orderId}`);
        if (!res.success) { body.innerHTML = '<div style="color:#ef4444;">Failed to load order.</div>'; return; }
        const o = res.order;
        body.innerHTML = `
            <div style="margin-bottom:1rem;padding:.75rem;background:#1e293b;border-radius:8px;">
                <div style="font-size:.8rem;color:#94a3b8;">Order #${o.id} · ${escapeHtml(o.building || '')}</div>
                <div style="font-weight:600;color:#f1f5f9;">${escapeHtml((o.item_description || '').substring(0,80))}</div>
                <div style="font-size:.8rem;color:#94a3b8;margin-top:.25rem;">Qty: ${o.quantity} · ${escapeHtml(o.supplier_name || 'No supplier')}</div>
            </div>
            <form id="supplierRespForm">
                <div class="form-row">
                    <div class="form-group">
                        <label>Unit Price *</label>
                        <input type="number" id="srUnitPrice" class="form-control" step="0.01" min="0" placeholder="0.00" value="${o.unit_price || ''}">
                    </div>
                    <div class="form-group">
                        <label>Currency</label>
                        <select id="srCurrency" class="form-control">
                            <option value="EUR" ${!o.currency || o.currency==='EUR' ? 'selected' : ''}>EUR</option>
                            <option value="USD" ${o.currency==='USD' ? 'selected' : ''}>USD</option>
                            <option value="BGN" ${o.currency==='BGN' ? 'selected' : ''}>BGN</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Lead Time (days)</label>
                        <input type="number" id="srLeadTime" class="form-control" min="0" placeholder="e.g. 14">
                    </div>
                    <div class="form-group">
                        <label>Promised Delivery</label>
                        <input type="date" id="srDeliveryDate" class="form-control date-picker" value="${o.expected_delivery_date ? o.expected_delivery_date.substring(0,10) : ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Supplier Notes</label>
                    <textarea id="srNotes" class="form-control" rows="2" placeholder="Any notes from the supplier...">${o.supplier_notes || ''}</textarea>
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label>Availability</label>
                    <select id="srAvailability" class="form-control">
                        <option value="available">Available</option>
                        <option value="partial">Partially Available</option>
                        <option value="unavailable">Unavailable</option>
                        <option value="alternative">Alternative Available</option>
                    </select>
                </div>
                <div class="form-actions" style="margin-top:1.25rem;">
                    <button type="button" class="btn btn-secondary" onclick="closeSupplierResponseModal()">Cancel</button>
                    <button type="button" class="btn btn-primary" onclick="submitSupplierResponse(${o.id}, ${o.quote_ref || 'null'})">Save Response</button>
                </div>
            </form>`;
    } catch (e) {
        body.innerHTML = '<div style="color:#ef4444;padding:1rem;">Network error</div>';
    }
}

async function submitSupplierResponse(orderId, quoteId) {
    const unitPrice = parseFloat(document.getElementById('srUnitPrice')?.value || 0);
    const currency = document.getElementById('srCurrency')?.value || 'EUR';
    const leadTime = parseInt(document.getElementById('srLeadTime')?.value || 0) || null;
    const deliveryDate = document.getElementById('srDeliveryDate')?.value || null;
    const notes = document.getElementById('srNotes')?.value || null;
    const availability = document.getElementById('srAvailability')?.value || 'available';

    if (!unitPrice) { showToast('Please enter a unit price', 'warning'); return; }

    // Fetch order quantity for correct total — ordersState has it already loaded
    const orderObj = (typeof ordersState !== 'undefined' ? ordersState : []).find(o => o.id === orderId);
    const qty = orderObj ? (parseFloat(orderObj.quantity) || 1) : 1;
    const totalPrice = Math.round(unitPrice * qty * 100) / 100;

    try {
        // Update the order with price and delivery info
        const payload = {
            unit_price: unitPrice,
            total_price: totalPrice,
            expected_delivery_date: deliveryDate,
            supplier_notes: notes,
            status: 'Quote Received'
        };
        const res = await apiPut(`/orders/${orderId}`, payload);

        // If there's a quote, also record the quote response
        if (quoteId && res.success) {
            await apiPost(`/procurement/quotes/${quoteId}/responses`, {
                order_id: orderId,
                unit_price: unitPrice,
                currency,
                promised_delivery_date: deliveryDate,
                lead_time_days: leadTime,
                availability,
                supplier_notes: notes,
                status: 'received'
            });
        }

        if (res.success) {
            showToast('Supplier response saved', 'success');
            closeSupplierResponseModal();
            loadOrders();
        } else {
            showToast(res.message || 'Failed to save', 'error');
        }
    } catch (e) {
        showToast('Network error', 'error');
    }
}

function closeSupplierResponseModal() {
    const m = document.getElementById('supplierResponseModal');
    if (m) m.classList.add('hidden');
}

function openSupplierResponseModalForQuote(quoteNumber) {
    // Find orders in this quote from ordersState
    if (typeof ordersState === 'undefined') return;
    const orders = ordersState.filter(o => o.quote_number === quoteNumber);
    if (orders.length === 1) {
        openSupplierResponseForOrder(orders[0].id);
    } else if (orders.length > 1) {
        // Open for the first one — user can do the rest
        openSupplierResponseForOrder(orders[0].id);
    }
}

// ============================================================
//  RFQ WIZARD  — 3 steps:
//  1. Review selected orders + AI auto-assigns suppliers
//  2. Confirm/override supplier per order group
//  3. Compose notes → Send RFQ email directly
// ============================================================
let _rfqState = {
    step: 1,
    orders: [],
    // Map: supplierId → { supplier, orderIds[], aiScore }
    groups: {},
    selectedGroupSupplierId: null,
    notes: '',
    language: 'bg',
    createdQuoteIds: [] // quote IDs created in step 2
};

function openRfqWizard() {
    if (!selectedOrderIds || !selectedOrderIds.size) {
        showToast('Select one or more orders first', 'warning');
        return;
    }

    const modal = document.getElementById('rfqWizardModal');
    if (!modal) return;

    // Init state
    _rfqState = {
        step: 1,
        orders: (typeof ordersState !== 'undefined' ? ordersState : [])
            .filter(o => selectedOrderIds.has(o.id)),
        groups: {},
        notes: '',
        language: 'bg',
        createdQuoteIds: []
    };

    modal.classList.remove('hidden');
    renderRfqStep1();
}

function closeRfqWizard() {
    const modal = document.getElementById('rfqWizardModal');
    if (modal) modal.classList.add('hidden');
    _rfqState = { step: 1, orders: [], groups: {}, notes: '', language: 'bg', createdQuoteIds: [] };
}

async function renderRfqStep1() {
    _rfqState.step = 1;
    const body = document.getElementById('rfqWizardBody');
    const footer = document.getElementById('rfqWizardFooter');
    const subtitle = document.getElementById('rfqWizardSubtitle');
    if (!body) return;

    subtitle.textContent = 'Step 1 of 3 — AI is grouping orders by best supplier';

    body.innerHTML = `<div style="text-align:center;padding:2rem;">
        <div class="spinner" style="margin:0 auto 1rem;"></div>
        <div style="color:#94a3b8;">Analyzing ${_rfqState.orders.length} order(s) — finding best suppliers…</div>
    </div>`;

    footer.innerHTML = '';

    // Call auto-suggest for all selected orders
    let suggestions = {};
    try {
        const ids = _rfqState.orders.map(o => o.id);
        const res = await apiPost('/orders/auto-suggest-suppliers', { order_ids: ids });
        if (res.success) suggestions = res.suggestions || {};
    } catch (e) {
        console.warn('Auto-suggest failed, continuing without AI', e);
    }

    // Group orders by their top suggested supplier
    // Orders with no suggestion go to a "manual" group
    const groups = {}; // supplierId|'manual' → { supplier, orders[], aiConfidence }

    for (const o of _rfqState.orders) {
        const orderSuggestions = suggestions[o.id] || [];
        const topSuggestion = orderSuggestions[0];

        let key, supplier;
        if (topSuggestion && topSuggestion.suggestion_score > 0) {
            key = String(topSuggestion.id);
            supplier = topSuggestion;
        } else {
            key = 'manual';
            supplier = null;
        }

        if (!groups[key]) {
            groups[key] = {
                supplierId: topSuggestion ? topSuggestion.id : null,
                supplier: supplier,
                orders: [],
                aiConfidence: topSuggestion ? topSuggestion.suggestion_score : 0,
                aiReasons: topSuggestion ? (topSuggestion.suggestion_reasons || []) : [],
                allSuggestions: {} // orderId → suggestions[]
            };
        }
        groups[key].orders.push(o);
        groups[key].allSuggestions[o.id] = orderSuggestions;
    }

    _rfqState.groups = groups;
    subtitle.textContent = 'Step 1 of 3 — Review AI Supplier Assignment';

    // Render groups
    const suppliersHtml = Object.entries(groups).map(([key, g]) => {
        const isManual = key === 'manual';
        const confidence = g.aiConfidence;
        const confClass = confidence > 100 ? 'conf-high' : confidence > 40 ? 'conf-med' : 'conf-low';
        const confLabel = confidence > 100 ? '🟢 High confidence' : confidence > 40 ? '🟡 Medium' : '🔴 Low / Manual';

        const suppliersDropdown = `<select class="form-control form-control-sm rfq-supplier-override" 
            data-group-key="${key}" style="min-width:200px;" onchange="rfqOverrideSupplier('${key}', this.value)">
            <option value="">— Select Supplier —</option>
            ${(typeof suppliersState !== 'undefined' ? suppliersState : []).map(s =>
                `<option value="${s.id}" ${g.supplierId == s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
            ).join('')}
        </select>`;

        const ordersList = g.orders.map(o =>
            `<div class="rfq-order-row">
                <span class="rfq-order-id">#${o.id}</span>
                <span class="rfq-order-desc">${escapeHtml((o.item_description || o.itemdescription || '').substring(0, 55))}</span>
                <span class="rfq-order-qty">×${o.quantity}</span>
                <span class="rfq-order-prio rfq-prio-${(o.priority || 'normal').toLowerCase()}">${o.priority || 'Normal'}</span>
            </div>`
        ).join('');

        const reasonsHtml = g.aiReasons.length
            ? `<div class="rfq-ai-reasons">${g.aiReasons.slice(0,3).map(r => `<span class="rfq-reason-chip">${escapeHtml(r)}</span>`).join('')}</div>`
            : '';

        return `<div class="rfq-group-card" data-group-key="${key}">
            <div class="rfq-group-header">
                <div>
                    <div class="rfq-group-supplier-name">
                        ${isManual ? '⚠ No AI Match — Select Manually' : `🏢 ${escapeHtml(g.supplier?.name || '—')}`}
                    </div>
                    ${!isManual ? `<div class="rfq-ai-conf ${confClass}">${confLabel}</div>` : ''}
                    ${reasonsHtml}
                </div>
                <div class="rfq-group-override">
                    <label style="font-size:.75rem;color:#64748b;display:block;margin-bottom:.25rem;">Override supplier:</label>
                    ${suppliersDropdown}
                </div>
            </div>
            <div class="rfq-group-orders">${ordersList}</div>
            <div class="rfq-group-footer">
                <span class="rfq-order-count">${g.orders.length} order${g.orders.length !== 1 ? 's' : ''}</span>
            </div>
        </div>`;
    }).join('');

    body.innerHTML = `
        <div class="rfq-groups-container">${suppliersHtml}</div>
        <div class="rfq-step1-note" style="margin-top:1rem;padding:.75rem;background:#1e293b;border-radius:8px;font-size:.8rem;color:#94a3b8;">
            💡 AI has grouped your orders by the most likely supplier based on historical data. 
            Override any assignment using the dropdown. Each group will become one RFQ email.
        </div>`;

    footer.innerHTML = `
        <button class="btn btn-secondary" onclick="closeRfqWizard()">Cancel</button>
        <button class="btn btn-primary" onclick="rfqStep2()" id="rfqNextBtn">
            Next: Review &amp; Send →
        </button>`;
}

function rfqOverrideSupplier(groupKey, supplierId) {
    if (!_rfqState.groups[groupKey]) return;
    const supplier = (typeof suppliersState !== 'undefined' ? suppliersState : [])
        .find(s => String(s.id) === String(supplierId));
    _rfqState.groups[groupKey].supplierId = supplierId ? parseInt(supplierId) : null;
    _rfqState.groups[groupKey].supplier = supplier || null;
    _rfqState.groups[groupKey].overridden = true;
}

async function rfqStep2() {
    // Validate all groups have a supplier
    const missingSupplier = Object.entries(_rfqState.groups).filter(([k, g]) => !g.supplierId);
    if (missingSupplier.length) {
        showToast(`Please assign a supplier to all ${missingSupplier.length} group(s)`, 'warning');
        return;
    }

    _rfqState.step = 2;
    const body = document.getElementById('rfqWizardBody');
    const footer = document.getElementById('rfqWizardFooter');
    const subtitle = document.getElementById('rfqWizardSubtitle');

    subtitle.textContent = 'Step 2 of 3 — Compose & Send RFQ Emails';

    // Create quotes (RFQs) for each group
    body.innerHTML = `<div style="text-align:center;padding:2rem;">
        <div class="spinner" style="margin:0 auto 1rem;"></div>
        <div style="color:#94a3b8;">Creating RFQ requests…</div>
    </div>`;
    footer.innerHTML = '';

    const results = []; // { groupKey, supplier, quoteId, quoteNumber, success, error }

    for (const [key, g] of Object.entries(_rfqState.groups)) {
        try {
            const res = await apiPost('/quotes', {
                supplier_id: g.supplierId,
                order_ids: g.orders.map(o => o.id),
                notes: _rfqState.notes || null,
                currency: 'EUR'
            });
            if (res.success) {
                results.push({ groupKey: key, supplier: g.supplier, quoteId: res.quoteId, quoteNumber: res.quoteNumber, success: true });
                _rfqState.createdQuoteIds.push(res.quoteId);
            } else {
                results.push({ groupKey: key, supplier: g.supplier, success: false, error: res.message });
            }
        } catch (e) {
            results.push({ groupKey: key, supplier: g.supplier, success: false, error: e.message });
        }
    }

    // Render send UI for each successful group
    const sendCards = results.map(r => {
        const supplierEmail = r.supplier?.email || '';
        if (!r.success) {
            return `<div class="rfq-send-card rfq-send-error">
                <div class="rfq-send-card-header">
                    ❌ Failed: ${escapeHtml(r.supplier?.name || 'Unknown')}
                </div>
                <div style="color:#ef4444;font-size:.8rem;">${escapeHtml(r.error || 'Unknown error')}</div>
            </div>`;
        }

        const hasEmail = !!supplierEmail;
        return `<div class="rfq-send-card" id="rfqCard_${r.quoteId}">
            <div class="rfq-send-card-header">
                <div>
                    <span class="rfq-send-supplier">🏢 ${escapeHtml(r.supplier?.name || '—')}</span>
                    <span class="rfq-quote-num">${r.quoteNumber}</span>
                </div>
                <span id="rfqSentBadge_${r.quoteId}" class="rfq-unsent-badge">Not sent</span>
            </div>
            <div class="rfq-send-email-row">
                <label style="font-size:.75rem;color:#64748b;">Supplier Email:</label>
                <input type="email" id="rfqEmail_${r.quoteId}" class="form-control form-control-sm" 
                    value="${escapeHtml(supplierEmail)}" placeholder="supplier@company.com"
                    style="flex:1;margin-left:.5rem;">
            </div>
            <div class="rfq-send-notes-row">
                <label style="font-size:.75rem;color:#64748b;">Additional notes for supplier (optional):</label>
                <textarea id="rfqNotes_${r.quoteId}" class="form-control form-control-sm" rows="2" 
                    placeholder="e.g. Urgent! Please reply by Friday."></textarea>
            </div>
            <div class="rfq-send-actions">
                <button class="btn btn-primary rfq-send-btn" 
                    onclick="sendRfqEmail(${r.quoteId})" 
                    ${!hasEmail ? '' : ''}
                    id="rfqSendBtn_${r.quoteId}">
                    📧 Send RFQ Email
                </button>
                ${!hasEmail ? `<span style="color:#f59e0b;font-size:.75rem;">⚠ No email on file — add one above</span>` : ''}
            </div>
        </div>`;
    }).join('');

    body.innerHTML = `
        <div class="rfq-send-note" style="padding:.75rem;background:#1e2d1e;border:1px solid #22c55e33;border-radius:8px;margin-bottom:1rem;font-size:.8rem;color:#86efac;">
            ✅ ${results.filter(r=>r.success).length} RFQ request${results.filter(r=>r.success).length!==1?'s':''} created successfully. 
            Now send each email to the supplier directly from here.
        </div>
        <div class="rfq-send-cards">${sendCards}</div>`;

    footer.innerHTML = `
        <button class="btn btn-secondary" onclick="closeRfqWizard();loadOrders();loadQuotes();">Done</button>`;
}

async function sendRfqEmail(quoteId) {
    const btn = document.getElementById(`rfqSendBtn_${quoteId}`);
    const badge = document.getElementById(`rfqSentBadge_${quoteId}`);
    const emailInput = document.getElementById(`rfqEmail_${quoteId}`);
    const notesInput = document.getElementById(`rfqNotes_${quoteId}`);

    const email = emailInput?.value?.trim();
    if (!email) { showToast('Please enter the supplier email address', 'warning'); return; }

    // If the supplier email changed from the saved one, we may need to update supplier
    // For now just use it as the send-to

    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    try {
        const res = await apiPost(`/quotes/${quoteId}/send-rfq-email`, {
            notes: notesInput?.value?.trim() || null,
            supplierEmailOverride: email
        });

        if (res.success) {
            if (badge) {
                badge.textContent = '✓ Sent';
                badge.className = 'rfq-sent-badge';
            }
            if (btn) { btn.textContent = '✓ Email Sent'; btn.className = btn.className.replace('btn-primary','btn-secondary'); }
            showToast('RFQ email sent to supplier', 'success');
        } else {
            showToast(res.message || 'Failed to send email', 'error');
            if (btn) { btn.disabled = false; btn.textContent = '📧 Send RFQ Email'; }
        }
    } catch (e) {
        showToast('Network error sending email', 'error');
        if (btn) { btn.disabled = false; btn.textContent = '📧 Send RFQ Email'; }
    }
}

// ============================================================
//  ORDER TEMPLATES  (server-backed — no localStorage)
// ============================================================

async function openOrderTemplatesModal() {
    const modal = document.getElementById('orderTemplatesModal');
    const body = document.getElementById('orderTemplatesBody');
    if (!modal) return;

    body.innerHTML = '<div style="text-align:center;padding:2rem;color:#64748b;">Loading…</div>';
    modal.classList.remove('hidden');

    try {
        const res = await apiGet('/orders/templates');
        const templates = res.templates || [];

        if (!templates.length) {
            body.innerHTML = `<div style="text-align:center;padding:2rem;color:#64748b;">
                <div style="font-size:2rem;margin-bottom:.5rem;">📋</div>
                <div>No templates saved yet.</div>
                <div style="font-size:.8rem;margin-top:.5rem;">Fill in an order and click "💾 Save as Template".</div>
            </div>`;
        } else {
            body.innerHTML = `<div class="templates-list">
                ${templates.map(t => `
                    <div class="template-card">
                        <div class="template-card-name">${escapeHtml(t.template_name)}</div>
                        <div class="template-card-meta">${escapeHtml(t.building || '')}${t.category ? ' · ' + escapeHtml(t.category) : ''} · Qty ${t.quantity || 1}</div>
                        <div class="template-card-desc">${escapeHtml((t.item_description || '').substring(0, 70))}${(t.item_description||'').length > 70 ? '…' : ''}</div>
                        <div class="template-card-actions">
                            <button class="btn btn-primary btn-sm" onclick="useTemplate(${t.id})">Use This</button>
                            <button class="btn btn-secondary btn-sm" onclick="deleteTemplateById(${t.id})">Delete</button>
                        </div>
                    </div>`).join('')}
            </div>`;
        }
    } catch (e) {
        body.innerHTML = '<div style="color:#f87171;padding:1rem;">Failed to load templates.</div>';
    }
}

async function deleteTemplateById(id) {
    if (!confirm('Delete this template?')) return;
    try {
        await apiDelete('/orders/templates/' + id);
        showToast('Template deleted', 'success');
        openOrderTemplatesModal(); // refresh
    } catch (e) {
        showToast('Failed to delete template', 'error');
    }
}

// Helper: apiDelete (mirrors apiGet/apiPost pattern)
async function apiDelete(path) {
    const token = authToken || (typeof loadToken === 'function' ? loadToken() : null);
    const res = await fetch('/api' + path, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    });
    return res.json();
}

function useTemplate(id) {
    // Find by id in the rendered modal (we have it from the last fetch)
    // Re-fetch from API to get full data
    const token = authToken || (typeof loadToken === 'function' ? loadToken() : null);
    fetch('/api/orders/templates', { headers: { 'Authorization': 'Bearer ' + token } })
        .then(r => r.json())
        .then(res => {
            const tpl = (res.templates || []).find(t => t.id === id);
            if (!tpl) { showToast('Template not found', 'error'); return; }

            ppWaitFor('itemDescription', el => {
                el.value = tpl.item_description || '';
                el.dispatchEvent(new Event('input')); // trigger dup detection + autocomplete
            });
            ppWaitFor('partNumber', el => { el.value = tpl.part_number || ''; });
            ppWaitFor('quantity', el => { el.value = tpl.quantity || 1; });
            ppWaitFor('notes', el => { el.value = tpl.notes || ''; });
            ppWaitFor('priority', el => { el.value = tpl.priority || 'Normal'; });

            ppWaitFor('category', el => {
                el.value = tpl.category || '';
                if (!el.value && tpl.category) {
                    const opt = document.createElement('option');
                    opt.value = tpl.category; opt.textContent = tpl.category;
                    el.appendChild(opt);
                    el.value = tpl.category;
                }
            });

            document.getElementById('orderTemplatesModal')?.classList.add('hidden');

            const createSection = document.getElementById('createOrderSection');
            if (createSection) createSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

            showToast(`Template "${tpl.template_name}" loaded`, 'success');
        })
        .catch(() => showToast('Failed to load template', 'error'));
}

async function saveCurrentFormAsTemplate() {
    const itemDesc = document.getElementById('itemDescription')?.value?.trim();
    if (!itemDesc) { showToast('Fill in at least the item description first', 'warning'); return; }

    const name = prompt('Template name (e.g. "Festo O-rings CT"):');
    if (!name?.trim()) return;

    try {
        const res = await apiPost('/orders/templates', {
            template_name: name.trim(),
            item_description: itemDesc,
            part_number: document.getElementById('partNumber')?.value || '',
            category: document.getElementById('category')?.value || '',
            quantity: parseInt(document.getElementById('quantity')?.value || 1),
            priority: document.getElementById('priority')?.value || 'Normal',
            notes: document.getElementById('notes')?.value || ''
        });
        if (res.success) {
            showToast(`Template "${name.trim()}" saved`, 'success');
        } else {
            showToast(res.message || 'Failed to save template', 'error');
        }
    } catch (e) {
        showToast('Failed to save template', 'error');
    }
}

// ============================================================
//  ONE-CLICK PO GENERATION  (from order detail panel)
// ============================================================
async function generatePoFromOrder(orderId, quoteRef) {
    if (!quoteRef) { showToast('No approved quote linked to this order', 'warning'); return; }

    const confirmed = confirm('Generate Purchase Order from this approved quote?');
    if (!confirmed) return;

    try {
        // Get the quote data
        const qRes = await apiGet(`/quotes/${quoteRef}`);
        if (!qRes.success) { showToast('Failed to load quote data', 'error'); return; }
        const q = qRes.quote;

        const res = await apiPost('/procurement/purchase-orders', {
            quote_id: quoteRef,
            supplier_id: q.supplier_id,
            currency: q.currency || 'EUR',
            notes: q.notes || null,
            items: (q.items || []).map(it => ({
                quote_item_id: it.id,
                order_id: it.order_id,
                item_description: it.item_description,
                quantity: it.quantity,
                unit_price: it.unit_price || 0,
                total_price: it.total_price || 0
            }))
        });

        if (res.success) {
            showToast(`PO ${res.poNumber} created successfully!`, 'success');
            loadOrders();
        } else {
            showToast(res.message || 'Failed to create PO', 'error');
        }
    } catch (e) {
        showToast('Network error creating PO', 'error');
    }
}
window.generatePoFromOrder = generatePoFromOrder;

// ============================================================
//  PATCH: inject "Generate PO" button into order detail panel
//  Called after openOrderDetail renders the HTML
// ============================================================
const _origOpenOrderDetail = window.openOrderDetail;
if (typeof _origOpenOrderDetail === 'function') {
    window.openOrderDetail = async function(id) {
        await _origOpenOrderDetail(id);
        // Inject PO generation button for approved orders
        setTimeout(() => {
            const body = document.getElementById('orderDetailBody');
            if (!body) return;
            // Find the order in state
            const o = (typeof ordersState !== 'undefined' ? ordersState : []).find(x => x.id === id);
            if (!o) return;
            const canGenPO = (typeof currentUser !== 'undefined') &&
                (currentUser.role === 'admin' || currentUser.role === 'procurement') &&
                o.status === 'Approved' && o.quote_ref;
            if (canGenPO) {
                const existing = body.querySelector('#btnGenPo');
                if (!existing) {
                    const div = document.createElement('div');
                    div.style.cssText = 'margin-top:.75rem;padding:.75rem;background:#1e2d1e;border:1px solid #22c55e33;border-radius:8px;';
                    div.innerHTML = `<div style="font-size:.8rem;color:#86efac;margin-bottom:.5rem;">✅ Quote approved — ready to generate PO</div>
                        <button id="btnGenPo" class="btn btn-primary btn-sm" onclick="generatePoFromOrder(${o.id}, ${o.quote_ref})">
                            📦 Generate Purchase Order
                        </button>`;
                    const saveBtn = body.querySelector('.form-actions');
                    if (saveBtn) saveBtn.parentNode.insertBefore(div, saveBtn);
                    else body.appendChild(div);
                }
            }
        }, 300);
    };
}

// ============================================================
//  WIRE ALL BUTTONS ON DOM READY
// ============================================================
document.addEventListener('DOMContentLoaded', function() {

    // Bulk status apply
    const btnBulk = document.getElementById('btnBulkStatus');
    if (btnBulk) btnBulk.addEventListener('click', applyBulkStatus);

    // Export
    const btnExport = document.getElementById('btnExportOrders');
    if (btnExport) btnExport.addEventListener('click', exportOrdersToCsv);

    // Send RFQ (replaces "Create Quote from Selected")
    const btnSendRfq = document.getElementById('btnSendRfq');
    if (btnSendRfq) btnSendRfq.addEventListener('click', openRfqWizard);

    // Today's Actions button (shown only for admin/procurement after login)
    const btnToday = document.getElementById('btnTodayActions');
    if (btnToday) btnToday.addEventListener('click', openProcTodayPanel);

    // Templates buttons
    const btnUseTemplate = document.getElementById('btnUseTemplate');
    if (btnUseTemplate) btnUseTemplate.addEventListener('click', openOrderTemplatesModal);

    const btnSaveTemplate = document.getElementById('btnSaveAsTemplate');
    if (btnSaveTemplate) btnSaveTemplate.addEventListener('click', saveCurrentFormAsTemplate);

    // Show "Save as Template" button when form has content (all roles)
    const itemDescEl = document.getElementById('itemDescription');
    if (itemDescEl && btnSaveTemplate) {
        itemDescEl.addEventListener('input', () => {
            if (itemDescEl.value.trim().length > 3) {
                btnSaveTemplate.style.display = '';
            } else {
                btnSaveTemplate.style.display = 'none';
            }
        });
    }

    // Show "Today's Actions" + "Save as Template" after login (role check)
    // Hook into the auth flow — check every 2 seconds until currentUser is set
    const authPoll = setInterval(() => {
        if (typeof currentUser !== 'undefined' && currentUser) {
            clearInterval(authPoll);
            const isAdminProc = currentUser.role === 'admin' || currentUser.role === 'procurement';
            if (btnToday) btnToday.style.display = isAdminProc ? '' : 'none';
            if (btnSaveTemplate) btnSaveTemplate.style.display = 'none'; // shown only when form has content
        }
    }, 500);

    // Duplicate order detection — intercept form submission
    const createOrderForm = document.getElementById('createOrderForm');
    if (createOrderForm) {
        async function ppDupCheckHandler(e) {
            const itemDesc = document.getElementById('itemDescription')?.value?.trim() || '';
            const building = document.getElementById('building')?.value || '';

            // Check for duplicates before letting app.js handle submit
            const duplicates = await checkDuplicateOrder(itemDesc, building);
            if (duplicates.length > 0) {
                e.stopImmediatePropagation();
                e.preventDefault();
                showDuplicateWarning(duplicates, () => {
                    // Remove our capture listener, then re-fire the submit event
                    createOrderForm.removeEventListener('submit', ppDupCheckHandler, true);
                    createOrderForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    // Re-attach after a tick so future submits are still checked
                    setTimeout(() => createOrderForm.addEventListener('submit', ppDupCheckHandler, true), 100);
                });
            }
        }
        createOrderForm.addEventListener('submit', ppDupCheckHandler, true); // capture phase — runs before app.js listener
    }
});

// ============================================================
//  CSS for new features — injected at runtime
// ============================================================
(function injectFeatureCss() {
    const style = document.createElement('style');
    style.textContent = `
    /* ── RFQ Wizard ─────────────────────────────────────── */
    .rfq-wizard-card { max-width: 780px; width: 95vw; max-height: 90vh; display: flex; flex-direction: column; }
    .rfq-wizard-subtitle { font-size: .8rem; color: #94a3b8; margin-top: .2rem; }
    .rfq-wizard-body { flex: 1; overflow-y: auto; }
    .rfq-wizard-footer { display: flex; justify-content: flex-end; gap: .75rem; padding-top: .75rem; border-top: 1px solid #1e293b; }
    .rfq-groups-container { display: flex; flex-direction: column; gap: 1rem; }
    .rfq-group-card { background: #1e293b; border-radius: 10px; padding: 1rem; border: 1px solid rgba(232,104,42,0.2); }
    .rfq-group-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: .75rem; flex-wrap: wrap; }
    .rfq-group-supplier-name { font-weight: 700; color: #f1f5f9; font-size: .95rem; }
    .rfq-ai-conf { font-size: .72rem; margin-top: .2rem; }
    .conf-high { color: #4ade80; } .conf-med { color: #fbbf24; } .conf-low { color: #f87171; }
    .rfq-ai-reasons { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .4rem; }
    .rfq-reason-chip { background: #0f172a; border: 1px solid #334155; border-radius: 20px; padding: .15rem .5rem; font-size: .7rem; color: #94a3b8; }
    .rfq-order-row { display: flex; align-items: center; gap: .5rem; padding: .35rem 0; border-bottom: 1px solid #0f172a; font-size: .82rem; }
    .rfq-order-row:last-child { border-bottom: none; }
    .rfq-order-id { color: #64748b; min-width: 36px; }
    .rfq-order-desc { flex: 1; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rfq-order-qty { color: #94a3b8; min-width: 36px; text-align: right; }
    .rfq-order-prio { font-size: .7rem; padding: .1rem .35rem; border-radius: 4px; font-weight: 600; }
    .rfq-prio-urgent { background: rgba(239,68,68,0.2); color: #fca5a5; }
    .rfq-prio-high { background: rgba(249,115,22,0.2); color: #fb923c; }
    .rfq-prio-normal { background: rgba(148,163,184,0.15); color: #cbd5e1; }
    .rfq-prio-low { background: rgba(71,85,105,0.3); color: #94a3b8; }
    .rfq-group-footer { font-size: .75rem; color: #64748b; margin-top: .5rem; }
    .rfq-group-override { display: flex; flex-direction: column; }
    .rfq-order-count { font-weight: 600; }
    /* RFQ Send Step */
    .rfq-send-cards { display: flex; flex-direction: column; gap: 1rem; }
    .rfq-send-card { background: #1e293b; border-radius: 10px; padding: 1rem; border: 1px solid rgba(232,104,42,0.2); }
    .rfq-send-card.rfq-send-error { border-color: #ef4444; }
    .rfq-send-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: .75rem; }
    .rfq-send-supplier { font-weight: 700; color: #f1f5f9; }
    .rfq-quote-num { font-size: .75rem; color: #64748b; margin-left: .5rem; font-family: monospace; }
    .rfq-send-email-row, .rfq-send-notes-row { display: flex; align-items: center; gap: .5rem; margin-bottom: .5rem; flex-wrap: wrap; }
    .rfq-send-notes-row { flex-direction: column; align-items: stretch; }
    .rfq-send-actions { display: flex; align-items: center; gap: .75rem; margin-top: .75rem; }
    .rfq-send-btn { transition: transform 0.15s ease, box-shadow 0.15s ease; }
    .rfq-send-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(232,104,42,0.4); }
    .rfq-sent-badge { background: rgba(20,83,45,0.5); color: #4ade80; border: 1px solid #22c55e; border-radius: 20px; padding: .2rem .6rem; font-size: .72rem; font-weight: 600; }
    .rfq-unsent-badge { background: rgba(28,25,23,0.6); color: #78716c; border: 1px solid #44403c; border-radius: 20px; padding: .2rem .6rem; font-size: .72rem; }
    /* Today's Actions Panel */
    .today-section { margin-bottom: 1.25rem; }
    .today-section-title { font-weight: 700; font-size: .85rem; color: var(--today-color, #94a3b8); padding-bottom: .4rem; border-bottom: 1px solid #1e293b; margin-bottom: .5rem; display: flex; align-items: center; gap: .4rem; }
    .today-count { background: rgba(255,255,255,0.15); color: #fff; border-radius: 20px; padding: .1rem .45rem; font-size: .7rem; font-weight: 700; }
    .today-item { padding: .6rem .75rem; background: #1e293b; border-radius: 8px; margin-bottom: .4rem; transition: background .15s, border-color .15s; border: 1px solid transparent; }
    .today-item:hover { background: rgba(232,104,42,0.08); border-color: rgba(232,104,42,0.25); }
    .today-item-id { font-size: .72rem; color: #64748b; }
    .today-item-desc { font-size: .85rem; color: #e2e8f0; font-weight: 500; margin: .1rem 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .today-item-meta { font-size: .75rem; color: #94a3b8; display: flex; align-items: center; gap: .3rem; flex-wrap: wrap; }
    /* Supplier Response Modal */
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
    @media (max-width: 500px) { .form-row { grid-template-columns: 1fr; } }
    /* Order Templates */
    .templates-list { display: flex; flex-direction: column; gap: .6rem; max-height: 60vh; overflow-y: auto;
        scrollbar-width: thin; scrollbar-color: rgba(232,104,42,0.3) transparent; }
    .template-card { background: #1e293b; border-radius: 8px; padding: .85rem; border: 1px solid rgba(148,163,184,0.15); transition: border-color 0.15s, background 0.15s; }
    .template-card:hover { border-color: rgba(232,104,42,0.35); background: rgba(232,104,42,0.05); }
    .template-card-name { font-weight: 700; color: #f1f5f9; font-size: .9rem; }
    .template-card-meta { font-size: .72rem; color: #64748b; margin: .2rem 0; }
    .template-card-desc { font-size: .8rem; color: #94a3b8; margin-bottom: .6rem; }
    .template-card-actions { display: flex; gap: .5rem; }
    /* Bulk action bar refinement */
    .order-actions-inner { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
    /* Status timeline in requester view */
    .req-status-timeline { display: flex; flex-direction: column; gap: .4rem; margin-top: .75rem; }
    .req-timeline-item { display: flex; align-items: flex-start; gap: .6rem; font-size: .8rem; }
    .req-timeline-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: .2rem; }
    .req-timeline-dot.done { background: #22c55e; }
    .req-timeline-dot.active { background: #e8682a; box-shadow: 0 0 0 3px rgba(232,104,42,.25); }
    .req-timeline-dot.pending { background: #334155; border: 1px solid #475569; }
    .req-timeline-content { flex: 1; }
    .req-timeline-label { color: #e2e8f0; font-weight: 500; }
    .req-timeline-date { color: #64748b; font-size: .72rem; }
    /* RFQ wizard mobile */
    @media (max-width: 500px) {
        .rfq-wizard-card { max-width: 100% !important; width: 100% !important; max-height: 100vh !important; border-radius: 0 !important; }
    }
    `;
    document.head.appendChild(style);
})();

// ============================================================
//  STATUS TIMELINE FOR REQUESTERS  (shown in order detail)
// ============================================================
function buildStatusTimeline(order) {
    // Map of status → step index
    const STEP_MAP = {
        'New': 0, 'Pending': 0, 'Pending CAD': 0,
        'Quote Requested': 1, 'Quote Received': 1, 'Quote Under Approval': 1,
        'Approved': 2,
        'Ordered': 3,
        'In Transit': 4, 'Partially Delivered': 4,
        'Delivered': 5,
        'Cancelled': -1, 'On Hold': -1
    };

    const steps = [
        { label: 'Submitted', icon: '📝' },
        { label: 'Quote Requested', icon: '📧' },
        { label: 'Approved', icon: '✅' },
        { label: 'Ordered', icon: '📦' },
        { label: 'In Transit', icon: '🚚' },
        { label: 'Delivered', icon: '✓' }
    ];

    const currentStep = STEP_MAP[order.status] ?? 0;
    if (currentStep === -1) {
        return `<div style="color:#94a3b8;font-size:.8rem;">${order.status}</div>`;
    }

    return `<div class="req-status-timeline">
        ${steps.map((s, i) => {
            const state = i < currentStep ? 'done' : i === currentStep ? 'active' : 'pending';
            return `<div class="req-timeline-item">
                <div class="req-timeline-dot ${state}"></div>
                <div class="req-timeline-content">
                    <div class="req-timeline-label" style="color:${state === 'active' ? '#e8682a' : state === 'done' ? '#22c55e' : '#475569'}">${s.icon} ${s.label}</div>
                </div>
            </div>`;
        }).join('')}
    </div>`;
}
window.buildStatusTimeline = buildStatusTimeline;
