// frontend/app.js - PartPulse Orders v2.8.0 - Full Restore + Patches

const API_BASE = '/api';
let currentUser = null;
let authToken = null;

let ordersState = [];
let filteredOrders = [];
let suppliersState = [];
let quotesState = [];
let usersState = [];
let buildingsState = [];
let costCentersState = [];
let selectedOrderIds = new Set();
let currentTab = 'ordersTab';
let viewMode = 'flat'; // 'flat' or 'grouped'

// ⭐ NEW: Pagination state
let currentPage = 1;
const ORDERS_PER_PAGE = 20;

// Filter state
let filterState = {
    search: '',
    status: '',
    building: '',
    priority: '',
    supplier: '',
    delivery: '',
    quickFilter: '',
    ordered: '',   // ⭐ FIX: was missing from initial declaration causing race condition
    dateFrom: '',
    dateTo: '',
    was: '',
    byUser: ''
};

// ⭐ POWER SEARCH: Saved searches (session memory — no localStorage)
let savedSearches = [];
let powerSearchWasIds = null; // null = not active, [] = active but no matches, [1,2,3] = matching IDs
let _wasDebounceTimer = null; // debounce timer for was:/by: backend fetch
let _loadOrdersSeq = 0;       // sequence counter to ignore stale responses

// DOM
const loginScreen = document.getElementById('loginScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const userName = document.getElementById('userName');
const userRoleBadge = document.getElementById('userRole');
const createOrderSection = document.getElementById('createOrderSection');
const requesterBuildingBadge = document.getElementById('requesterBuildingBadge');
const createOrderForm = document.getElementById('createOrderForm');
const buildingSelect = document.getElementById('building');
const costCenterRadios = document.getElementById('costCenterRadios');
const ordersTable = document.getElementById('ordersTable');
const navTabs = document.getElementById('navTabs');
const filterStatus = document.getElementById('filterStatus');
const filterBuilding = document.getElementById('filterBuilding');
const filterPriority = document.getElementById('filterPriority');
const filterSupplier = document.getElementById('filterSupplier');
const filterSearch = document.getElementById('filterSearch');
const filterDelivery = document.getElementById('filterDelivery');
const btnClearFilters = document.getElementById('btnClearFilters');
const btnViewFlat = document.getElementById('btnViewFlat');
const btnViewGrouped = document.getElementById('btnViewGrouped');
// Lazy getters — orderDetailPanel is at bottom of HTML (global, outside tabs)
const _getOrderDetailPanel = () => document.getElementById('orderDetailPanel');
const _getOrderDetailBody  = () => document.getElementById('orderDetailBody');
const _getBtnCloseDetail   = () => document.getElementById('btnCloseDetail');
// Keep named aliases for backwards compat — resolved at call time
let orderDetailPanel = { classList: { remove: (c) => { const el = _getOrderDetailPanel(); if(el) el.classList.remove(c); }, add: (c) => { const el = _getOrderDetailPanel(); if(el) el.classList.add(c); }, contains: (c) => { const el = _getOrderDetailPanel(); return el ? el.classList.contains(c) : false; } } };
let orderDetailBody  = null; // resolved lazily in renderOrderDetail
let btnCloseDetail   = null; // resolved lazily in setupEventListeners
const selectedCount = document.getElementById('selectedCount');
const orderActionsBar = document.getElementById('orderActionsBar');
const btnCreateQuote = document.getElementById('btnCreateQuote');

const quotesTable = document.getElementById('quotesTab') ? document.getElementById('quotesTable') : null;
const quoteDetailPanel = document.getElementById('quoteDetailPanel');
const quoteDetailBody = document.getElementById('quoteDetailBody');
const btnCloseQuoteDetail = document.getElementById('btnCloseQuoteDetail');
const btnRefreshQuotes = document.getElementById('btnRefreshQuotes');

const approvalsTabButton = document.getElementById('approvalsTabButton');

const suppliersTable = document.getElementById('suppliersTable');
const supplierFormCard = document.getElementById('supplierFormCard');
const supplierFormTitle = document.getElementById('supplierFormTitle');
const supplierForm = document.getElementById('supplierForm');
const btnNewSupplier = document.getElementById('btnNewSupplier');
const btnCancelSupplier = document.getElementById('btnCancelSupplier');

const supplierIdInput = document.getElementById('supplierId');
const supplierNameInput = document.getElementById('supplierName');
const supplierContactInput = document.getElementById('supplierContact');
const supplierEmailInput = document.getElementById('supplierEmail');
const supplierPhoneInput = document.getElementById('supplierPhone');
const supplierWebsiteInput = document.getElementById('supplierWebsite');
const supplierAddressInput = document.getElementById('supplierAddress');
const supplierNotesInput = document.getElementById('supplierNotes');
const supplierActiveInput = document.getElementById('supplierActive');

const buildingsTabButton = document.getElementById('buildingsTabButton');
const buildingsTable = document.getElementById('buildingsTable');
const buildingFormCard = document.getElementById('buildingFormCard');
const buildingFormTitle = document.getElementById('buildingFormTitle');
const buildingForm = document.getElementById('buildingForm');
const btnNewBuilding = document.getElementById('btnNewBuilding');
const btnCancelBuilding = document.getElementById('btnCancelBuilding');

const buildingIdInput = document.getElementById('buildingId');
const buildingCodeInput = document.getElementById('buildingCode');
const buildingNameInput = document.getElementById('buildingName');
const buildingDescriptionInput = document.getElementById('buildingDescription');
const buildingActiveSelect = document.getElementById('buildingActive');

const costCentersTabButton = document.getElementById('costCentersTabButton');
const costCentersTable = document.getElementById('costCentersTable');
const costCenterFormCard = document.getElementById('costCenterFormCard');
const costCenterFormTitle = document.getElementById('costCenterFormTitle');
const costCenterForm = document.getElementById('costCenterForm');
const btnNewCostCenter = document.getElementById('btnNewCostCenter');
const btnCancelCostCenter = document.getElementById('btnCancelCostCenter');
const btnDeleteCostCenter = document.getElementById('btnDeleteCostCenter');
const ccFilterBuilding = document.getElementById('ccFilterBuilding');

const costCenterIdInput = document.getElementById('costCenterId');
const ccBuildingSelect = document.getElementById('ccBuilding');
const ccCodeInput = document.getElementById('ccCode');
const ccNameInput = document.getElementById('ccName');
const ccDescriptionInput = document.getElementById('ccDescription');
const ccActiveSelect = document.getElementById('ccActive');

const usersTabButton = document.getElementById('usersTabButton');
const usersTable = document.getElementById('usersTable');
const userFormCard = document.getElementById('userFormCard');
const userFormTitle = document.getElementById('userFormTitle');
const userForm = document.getElementById('userForm');
const btnNewUser = document.getElementById('btnNewUser');
const btnCancelUser = document.getElementById('btnCancelUser');

const userIdInput = document.getElementById('userId');
const userUsernameInput = document.getElementById('userUsername');
const userNameInput = document.getElementById('userNameInput');
const userEmailInput = document.getElementById('userEmail');
const userRoleSelect = document.getElementById('userRoleSelect');
const userBuildingSelect = document.getElementById('userBuilding');
const userActiveSelect = document.getElementById('userActive');
const userPasswordInput = document.getElementById('userPassword');
const userPasswordGroup = document.getElementById('userPasswordGroup');

const ORDER_STATUSES = [
    'New', 'Pending', 'Pending CAD', 'Quote Requested', 'Quote Received',
    'Quote Under Approval', 'Approved', 'Ordered',
    'In Transit', 'Partially Delivered', 'Delivered',
    'Cancelled', 'On Hold'
];

// ⭐ NEW: Priority order for sorting (Urgent first!)
const PRIORITY_ORDER = { 'Urgent': 1, 'High': 2, 'Normal': 3, 'Low': 4 };

function fmtPrice(val) {
    // ⭐ FIX: only return '-' for null/undefined/NaN/empty — NOT for zero (0.00 is a valid price)
    if (val === null || val === undefined || val === '' || val === false) return '-';
    const n = parseFloat(val);
    if (isNaN(n)) return '-';
    return n.toFixed(2);
}

// Init
window.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupDatePickers();
    checkAuth();
});

// =====================================================================
// SMART DUPLICATE DETECTION ENGINE
// Uses three signals:
//   1. Levenshtein edit distance (normalized) — catches typos / abbreviations
//   2. Jaccard token overlap — catches reordered words and partial matches
//   3. Part number exact / prefix match — hard-coded bonus
// Final score = weighted combination, range 0–1.
// =====================================================================

const _DUP_ACTIVE_STATUSES = ['New', 'Quote Requested', 'Ordered', 'In Transit', 'Partially Delivered', 'On Hold'];
const _DUP_DELIVERED_STATUSES = ['Delivered'];
const _DUP_WARN_THRESHOLD  = 0.52;  // ≥52% → show warning
const _DUP_HIGH_THRESHOLD  = 0.78;  // ≥78% → strong "likely duplicate" language

function _dupNormalize(str) {
    return (str || '')
        .toLowerCase()
        .replace(/[-_.,()/\\]/g, ' ')   // split on punctuation used in part numbers
        .replace(/\s+/g, ' ')
        .trim();
}

function _dupTokens(str) {
    // Return unique meaningful tokens (skip single-char tokens and pure numbers < 3 digits)
    return [...new Set(
        _dupNormalize(str)
            .split(' ')
            .filter(t => t.length >= 2)
    )];
}

function _dupLevenshtein(a, b) {
    // Returns normalized distance: 0 = identical, 1 = completely different
    if (!a && !b) return 0;
    if (!a || !b) return 1;
    const la = a.length, lb = b.length;
    if (la === 0) return 1; if (lb === 0) return 1;
    // Cap at 120 chars each to keep it O(n²) fast
    const sa = a.substring(0, 120), sb = b.substring(0, 120);
    const dp = Array.from({ length: sb.length + 1 }, (_, i) => i);
    for (let i = 1; i <= sa.length; i++) {
        let prev = i;
        for (let j = 1; j <= sb.length; j++) {
            const val = sa[i - 1] === sb[j - 1] ? dp[j - 1] : 1 + Math.min(dp[j - 1], dp[j], prev - 1);
            dp[j - 1] = prev;
            prev = val;
        }
        dp[sb.length] = prev;
    }
    return dp[sb.length] / Math.max(sa.length, sb.length);
}

function _dupJaccard(tokensA, tokensB) {
    if (!tokensA.length || !tokensB.length) return 0;
    const setA = new Set(tokensA), setB = new Set(tokensB);
    let inter = 0;
    setA.forEach(t => { if (setB.has(t)) inter++; });
    return inter / (setA.size + setB.size - inter);
}

function _dupTokenContainment(tokensA, tokensB) {
    // What fraction of the SMALLER set's tokens appear in the larger set?
    // Useful when one description is a subset of the other.
    if (!tokensA.length || !tokensB.length) return 0;
    const smaller = tokensA.length <= tokensB.length ? tokensA : tokensB;
    const larger  = new Set(tokensA.length > tokensB.length ? tokensA : tokensB);
    const hits = smaller.filter(t => larger.has(t)).length;
    return hits / smaller.length;
}

function _dupScore(descA, partA, descB, partB) {
    const na = _dupNormalize(descA), nb = _dupNormalize(descB);
    const ta = _dupTokens(descA), tb = _dupTokens(descB);

    // 1. Levenshtein on full normalized description (0→similar, 1→different)
    const lev = 1 - _dupLevenshtein(na.substring(0, 100), nb.substring(0, 100));

    // 2. Jaccard token overlap
    const jac = _dupJaccard(ta, tb);

    // 3. Containment (one is subset of the other)
    const cont = _dupTokenContainment(ta, tb);

    // Weighted combination: Jaccard+containment weighted more than raw edit distance
    let score = lev * 0.30 + jac * 0.40 + cont * 0.30;

    // Part number bonus: if both have a part number and it overlaps
    const pa = _dupNormalize(partA), pb = _dupNormalize(partB);
    if (pa && pb) {
        if (pa === pb) {
            score = Math.max(score, 0.92);  // same PN = almost certainly a dup
        } else if (pa.startsWith(pb) || pb.startsWith(pa)) {
            score = Math.max(score, 0.80);  // prefix match — likely same family
        } else {
            // Partial token overlap on part numbers
            const ptA = _dupTokens(partA), ptB = _dupTokens(partB);
            const pnSim = _dupJaccard(ptA, ptB);
            if (pnSim >= 0.5) score = Math.max(score, 0.65 * pnSim + 0.35 * score);
        }
    }

    return Math.min(score, 1);
}

function _dupCheckOrders(desc, partNum) {
    if (!desc || desc.trim().length < 3) return { active: [], delivered: [] };
    if (!ordersState || !ordersState.length) return { active: [], delivered: [] };

    const results = [];
    for (const o of ordersState) {
        const score = _dupScore(desc, partNum || '', o.item_description || '', o.part_number || '');
        if (score >= _DUP_WARN_THRESHOLD) {
            results.push({ order: o, score });
        }
    }

    // Sort by score desc
    results.sort((a, b) => b.score - a.score);

    const active    = results.filter(r => _DUP_ACTIVE_STATUSES.includes(r.order.status));
    const delivered = results.filter(r => _DUP_DELIVERED_STATUSES.includes(r.order.status));
    return { active, delivered };
}

let _dupDebounceTimer = null;

function _dupRender(desc, partNum) {
    const panel = document.getElementById('dupWarningPanel');
    if (!panel) return;

    const { active, delivered } = _dupCheckOrders(desc, partNum);

    if (!active.length && !delivered.length) {
        panel.style.display = 'none';
        panel.innerHTML = '';
        return;
    }

    let html = '';

    // ── ACTIVE duplicates (amber — blocking-style warning) ──
    if (active.length) {
        const isStrong = active[0].score >= _DUP_HIGH_THRESHOLD;
        html += `<div class="dup-warn-block dup-warn-active">
            <div class="dup-warn-header">
                <span class="dup-warn-icon">${isStrong ? '🚨' : '⚠️'}</span>
                <div>
                    <div class="dup-warn-title">${isStrong ? 'Likely duplicate order!' : 'Possible duplicate order'}</div>
                    <div class="dup-warn-sub">You may already have an active order for this item. Review before submitting.</div>
                </div>
            </div>
            <div class="dup-warn-list">`;
        for (const { order: o, score } of active.slice(0, 4)) {
            const pct = Math.round(score * 100);
            const sc = o.status.toLowerCase().replace(/ /g, '-');
            const age = Math.floor((Date.now() - new Date(o.submission_date || o.created_at || 0)) / 86400000);
            const ageLabel = age === 0 ? 'today' : age === 1 ? '1 day ago' : age + ' days ago';
            html += `<div class="dup-warn-row" onclick="openOrderDetail(${o.id})">
                <div class="dup-warn-row-left">
                    <span class="dup-warn-orderid">#${o.id}</span>
                    <span class="status-badge status-${sc}" style="font-size:0.68rem;">${o.status}</span>
                    <span class="dup-warn-match">${pct}% match</span>
                </div>
                <div class="dup-warn-row-desc">${escapeHtml((o.item_description || '').substring(0, 60))}${(o.item_description||'').length > 60 ? '…' : ''}</div>
                <div class="dup-warn-row-meta">${escapeHtml(o.building || '')} · ${ageLabel}${o.part_number ? ' · PN: ' + escapeHtml(o.part_number) : ''}</div>
            </div>`;
        }
        html += `</div></div>`;
    }

    // ── DELIVERED matches (blue — informational) ──
    if (delivered.length) {
        html += `<div class="dup-warn-block dup-warn-delivered">
            <div class="dup-warn-header">
                <span class="dup-warn-icon">📦</span>
                <div>
                    <div class="dup-warn-title">Previously ordered</div>
                    <div class="dup-warn-sub">Similar items were delivered before — click to review.</div>
                </div>
            </div>
            <div class="dup-warn-list">`;
        for (const { order: o, score } of delivered.slice(0, 3)) {
            const pct = Math.round(score * 100);
            // Use updated_at for delivered orders — it reflects when status last changed (= delivery date)
            const deliveryTs = o.updated_at || o.submission_date || o.created_at || 0;
            const age = Math.floor((Date.now() - new Date(deliveryTs)) / 86400000);
            const ageLabel = age === 0 ? 'today' : age === 1 ? '1 day ago' : age < 30 ? age + ' days ago' : Math.floor(age / 30) + ' months ago';
            html += `<div class="dup-warn-row dup-warn-row-delivered" onclick="openOrderDetail(${o.id})">
                <div class="dup-warn-row-left">
                    <span class="dup-warn-orderid">#${o.id}</span>
                    <span class="dup-warn-match">${pct}% match</span>
                </div>
                <div class="dup-warn-row-desc">${escapeHtml((o.item_description || '').substring(0, 60))}${(o.item_description||'').length > 60 ? '…' : ''}</div>
                <div class="dup-warn-row-meta">Delivered ${ageLabel}${o.part_number ? ' · PN: ' + escapeHtml(o.part_number) : ''} · Qty: ${o.quantity || '?'}</div>
            </div>`;
        }
        html += `</div></div>`;
    }

    panel.innerHTML = html;
    panel.style.display = '';
    // Autocomplete sits above the dup panel (z-index 9000 > dup panel)
    // — no need to force-close it; user selects a suggestion first, then sees the dup warning
}

function _dupSetupListeners() {
    const descEl = document.getElementById('itemDescription');
    const pnEl   = document.getElementById('partNumber');
    if (!descEl) return;

    const trigger = () => {
        clearTimeout(_dupDebounceTimer);
        _dupDebounceTimer = setTimeout(() => {
            const desc = descEl.value.trim();
            const pn   = pnEl ? pnEl.value.trim() : '';
            _dupRender(desc, pn);
        }, 600);  // 600ms debounce
    };

    descEl.addEventListener('input', trigger);
    if (pnEl) pnEl.addEventListener('input', trigger);

    // Also clear when the form resets
    const form = document.getElementById('createOrderForm');
    if (form) form.addEventListener('reset', () => {
        clearTimeout(_dupDebounceTimer);
        const panel = document.getElementById('dupWarningPanel');
        if (panel) { panel.style.display = 'none'; panel.innerHTML = ''; }
    });
}

function setupDatePickers() {
    document.addEventListener('click', (e) => {
        const dateInput = e.target.closest('input[type="date"].date-picker');
        if (dateInput && typeof dateInput.showPicker === 'function') {
            try { dateInput.showPicker(); } catch (_) {}
        }
    });
}

function setupEventListeners() {
    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    createOrderForm.addEventListener('submit', handleCreateOrder);

    buildingSelect.addEventListener('change', () => {
        renderCostCenterRadios(buildingSelect.value);
    });

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Real-time filtering
    if (filterSearch) filterSearch.addEventListener('input', () => { filterState.search = filterSearch.value.trim(); currentPage = 1; applyFilters(); });
    if (filterStatus) filterStatus.addEventListener('change', () => { filterState.status = filterStatus.value; currentPage = 1; applyFilters(); });
    if (filterBuilding) filterBuilding.addEventListener('change', () => { filterState.building = filterBuilding.value; currentPage = 1; applyFilters(); });
    if (filterPriority) filterPriority.addEventListener('change', () => { filterState.priority = filterPriority.value; currentPage = 1; applyFilters(); });
    if (filterSupplier) filterSupplier.addEventListener('change', () => { filterState.supplier = filterSupplier.value; currentPage = 1; applyFilters(); });
    if (filterDelivery) filterDelivery.addEventListener('change', () => { filterState.delivery = filterDelivery.value; currentPage = 1; applyFilters(); });

    if (btnClearFilters) btnClearFilters.addEventListener('click', clearFilters);
    const _filterOrdered = document.getElementById('filterOrdered');
    if (_filterOrdered) _filterOrdered.addEventListener('change', () => { filterState.ordered = _filterOrdered.value; currentPage = 1; applyFilters(); });
    // ⭐ POWER SEARCH: Date range listeners
    const _fd1 = document.getElementById('filterDateFrom');
    const _fd2 = document.getElementById('filterDateTo');
    if (_fd1) _fd1.addEventListener('change', () => { filterState.dateFrom = _fd1.value; currentPage = 1; loadOrders(); });
    if (_fd2) _fd2.addEventListener('change', () => { filterState.dateTo = _fd2.value; currentPage = 1; loadOrders(); });
    // ⭐ POWER SEARCH: Save search button
    const _btnSaveSearch = document.getElementById('btnSaveSearch');
    if (_btnSaveSearch) _btnSaveSearch.addEventListener('click', saveCurrentSearch);
    // ⭐ POWER SEARCH: Search hint tooltip toggle
    const _hintToggle = document.getElementById('searchHintToggle');
    const _hintTooltip = document.getElementById('searchHintTooltip');
    if (_hintToggle && _hintTooltip) {
        _hintToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const visible = _hintTooltip.style.display !== 'none';
            _hintTooltip.style.display = visible ? 'none' : 'block';
        });
        _hintToggle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _hintToggle.click(); }
        });
        document.addEventListener('click', () => { if (_hintTooltip) _hintTooltip.style.display = 'none'; });
    }
    const _btnViewCards = document.getElementById('btnViewCards');
    if (_btnViewCards) _btnViewCards.addEventListener('click', () => setViewMode('cards'));

    // Quick filter chips
    document.querySelectorAll('.quick-filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const filter = chip.dataset.filter;
            if (filterState.quickFilter === filter) {
                filterState.quickFilter = '';
                chip.classList.remove('active');
            } else {
                document.querySelectorAll('.quick-filter-chip').forEach(c => c.classList.remove('active'));
                filterState.quickFilter = filter;
                chip.classList.add('active');
            }
            currentPage = 1;
            applyFilters();
        });
    });

    // View mode toggle
    if (btnViewFlat) btnViewFlat.addEventListener('click', () => setViewMode('flat'));
    if (btnViewGrouped) btnViewGrouped.addEventListener('click', () => setViewMode('grouped'));

    const _btnClose = _getBtnCloseDetail();
    if (_btnClose) _btnClose.addEventListener('click', () => {
        orderDetailPanel.classList.add('hidden');
        document.getElementById('orderDetailBackdrop')?.classList.add('hidden');
    });
    if (btnCloseQuoteDetail) btnCloseQuoteDetail.addEventListener('click', () => { quoteDetailPanel.classList.add('hidden'); });

    if (btnCreateQuote) btnCreateQuote.addEventListener('click', openCreateQuoteDialog);
    if (btnRefreshQuotes) btnRefreshQuotes.addEventListener('click', loadQuotes);

    const btnNewQuoteFromQuotesTab = document.getElementById('btnNewQuoteFromQuotesTab');
    if (btnNewQuoteFromQuotesTab) {
        btnNewQuoteFromQuotesTab.addEventListener('click', () => {
            switchTab('ordersTab');
            alert('Select orders and click "Create Quote from Selected"');
        });
    }

    if (btnNewSupplier) btnNewSupplier.addEventListener('click', () => openSupplierForm());
    if (btnCancelSupplier) btnCancelSupplier.addEventListener('click', () => { supplierFormCard.hidden = true; });
    if (supplierForm) supplierForm.addEventListener('submit', handleSaveSupplier);

    if (btnNewBuilding) btnNewBuilding.addEventListener('click', () => openBuildingForm());
    if (btnCancelBuilding) btnCancelBuilding.addEventListener('click', () => { buildingFormCard.hidden = true; });
    if (buildingForm) buildingForm.addEventListener('submit', handleSaveBuilding);

    if (btnNewCostCenter) btnNewCostCenter.addEventListener('click', () => openCostCenterForm());
    if (btnCancelCostCenter) btnCancelCostCenter.addEventListener('click', () => { costCenterFormCard.hidden = true; });
    if (btnDeleteCostCenter) btnDeleteCostCenter.addEventListener('click', handleDeleteCostCenter);
    if (costCenterForm) costCenterForm.addEventListener('submit', handleSaveCostCenter);
    if (ccFilterBuilding) ccFilterBuilding.addEventListener('change', () => renderCostCentersTable());

    if (btnNewUser) btnNewUser.addEventListener('click', () => openUserForm());
    if (btnCancelUser) btnCancelUser.addEventListener('click', () => { userFormCard.hidden = true; });
    if (userForm) userForm.addEventListener('submit', handleSaveUser);

    // ⭐ NEW: Procurement/Admin/Manager Create Order button
    const btnProcurementCreateOrder = document.getElementById('btnProcurementCreateOrder');
    if (btnProcurementCreateOrder) {
        btnProcurementCreateOrder.addEventListener('click', openProcCreateOrderModal);
    }

    // ⭐ Smart duplicate detection listeners
    _dupSetupListeners();
}

function setViewMode(mode) {
    viewMode = mode;
    const _bvc = document.getElementById('btnViewCards');
    if (mode === 'flat') {
        btnViewFlat.classList.add('active'); btnViewGrouped.classList.remove('active');
        if (_bvc) _bvc.classList.remove('active');
    } else if (mode === 'cards') {
        btnViewFlat.classList.remove('active'); btnViewGrouped.classList.remove('active');
        if (_bvc) _bvc.classList.add('active');
    } else {
        btnViewFlat.classList.remove('active'); btnViewGrouped.classList.add('active');
        if (_bvc) _bvc.classList.remove('active');
    }
    currentPage = 1;
    renderOrdersTable();
}

function clearFilters() {
    // Track whether backend params were active before clearing
    const needsReload = !!(filterState.dateFrom || filterState.dateTo || filterState.was || filterState.byUser);

    filterState = { search: '', status: '', building: '', priority: '', supplier: '', delivery: '', quickFilter: '', ordered: '', dateFrom: '', dateTo: '', was: '', byUser: '' };
    powerSearchWasIds = null;
    if (_wasDebounceTimer) { clearTimeout(_wasDebounceTimer); _wasDebounceTimer = null; }

    if (filterSearch) filterSearch.value = '';
    if (filterStatus) filterStatus.value = '';
    if (filterBuilding) filterBuilding.value = '';
    if (filterPriority) filterPriority.value = '';
    if (filterSupplier) filterSupplier.value = '';
    if (filterDelivery) filterDelivery.value = '';
    const _fo = document.getElementById('filterOrdered'); if (_fo) _fo.value = '';
    const _fd1 = document.getElementById('filterDateFrom'); if (_fd1) _fd1.value = '';
    const _fd2 = document.getElementById('filterDateTo'); if (_fd2) _fd2.value = '';
    document.querySelectorAll('.quick-filter-chip').forEach(c => c.classList.remove('active'));
    currentPage = 1;

    // If backend-filtered params were active, re-fetch to restore full order list
    if (needsReload) {
        loadOrders();
    } else {
        applyFilters();
    }
}

function resetFiltersOnLogout() {
    // Reset filter state
    filterState = { search: '', status: '', building: '', priority: '', supplier: '', delivery: '', quickFilter: '', ordered: '', dateFrom: '', dateTo: '', was: '', byUser: '' };
    powerSearchWasIds = null;
    savedSearches = [];
    if (_wasDebounceTimer) { clearTimeout(_wasDebounceTimer); _wasDebounceTimer = null; }
    _loadOrdersSeq++; // invalidate any in-flight requests
    
    // Reset filter UI elements
    if (filterSearch) filterSearch.value = '';
    if (filterStatus) filterStatus.value = '';
    if (filterBuilding) filterBuilding.value = '';
    if (filterPriority) filterPriority.value = '';
    if (filterSupplier) filterSupplier.value = '';
    if (filterDelivery) filterDelivery.value = '';
    const _fd1 = document.getElementById('filterDateFrom'); if (_fd1) _fd1.value = '';
    const _fd2 = document.getElementById('filterDateTo'); if (_fd2) _fd2.value = '';
    
    // Clear quick filter chips
    document.querySelectorAll('.quick-filter-chip').forEach(c => c.classList.remove('active'));
    
    // Reset view mode
    viewMode = 'flat';
    if (btnViewFlat) btnViewFlat.classList.add('active');
    if (btnViewGrouped) btnViewGrouped.classList.remove('active');
    
    // Reset pagination
    currentPage = 1;
    renderSavedSearches();
}

// ===================== POWER SEARCH: SAVED SEARCHES =====================

function saveCurrentSearch() {
    const label = filterState.search.trim();
    if (!label) { showToast('Type a search query first', 'warning', 2500); return; }
    if (savedSearches.some(s => s.query === label)) { showToast('Already saved', 'info', 2000); return; }
    if (savedSearches.length >= 8) savedSearches.shift(); // keep max 8
    savedSearches.push({ query: label, dateFrom: filterState.dateFrom, dateTo: filterState.dateTo });
    renderSavedSearches();
    showToast('Search saved', 'success', 2000);
}

function applySavedSearch(s) {
    filterState.search = s.query;
    filterState.dateFrom = s.dateFrom || '';
    filterState.dateTo   = s.dateTo   || '';
    // Reset was/byUser so applyFilters detects them freshly from the query tokens
    filterState.was    = '';
    filterState.byUser = '';
    powerSearchWasIds  = null;
    if (filterSearch) filterSearch.value = s.query;
    const _fd1 = document.getElementById('filterDateFrom'); if (_fd1) _fd1.value = filterState.dateFrom;
    const _fd2 = document.getElementById('filterDateTo');   if (_fd2) _fd2.value = filterState.dateTo;
    currentPage = 1;
    // Use applyFilters so was:/by: prefix detection triggers a backend reload if needed,
    // and dateFrom/dateTo triggers loadOrders as well
    if (filterState.dateFrom || filterState.dateTo) {
        loadOrders(); // date params must hit backend
    } else {
        applyFilters(); // will trigger loadOrders internally if was:/by: detected
    }
}

function deleteSavedSearch(idx) {
    savedSearches.splice(idx, 1);
    renderSavedSearches();
}

function renderSavedSearches() {
    const container = document.getElementById('savedSearchesList');
    if (!container) return;
    if (savedSearches.length === 0) {
        container.innerHTML = '<span style="color:#64748b;font-size:0.78rem;">No saved searches yet</span>';
        return;
    }
    container.innerHTML = savedSearches.map((s, i) => `
        <span class="saved-search-chip" title="${escHtml(s.query)}">
            <span class="saved-search-label" onclick="applySavedSearch(savedSearches[${i}])">🔖 ${escHtml(s.query)}</span>
            <button class="saved-search-del" onclick="deleteSavedSearch(${i})" title="Remove">×</button>
        </span>
    `).join('');
}

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===================== DELIVERY TIMELINE LOGIC =====================

// ⭐ FIX: Delivered orders should never show "Late"
function getDeliveryStatus(order) {
    // If already delivered, no status needed
    if (order.status === 'Delivered') return 'delivered';
    
    if (!order.expected_delivery_date) return 'none';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expected = new Date(order.expected_delivery_date);
    expected.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((expected - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'late';
    if (diffDays <= 7) return 'due7';
    if (diffDays <= 14) return 'due14';
    return 'ontrack';
}

function getDeliveryBadgeHtml(status) {
    const badges = {
        'delivered': '<span class="delivery-badge delivery-ontrack">✓ Delivered</span>',
        'late': '<span class="delivery-badge delivery-late">⚠ Late</span>',
        'due7': '<span class="delivery-badge delivery-due7">🕒 Due 7d</span>',
        'due14': '<span class="delivery-badge delivery-due14">📅 Due 14d</span>',
        'ontrack': '<span class="delivery-badge delivery-ontrack">✓ On Track</span>',
        'none': '-'
    };
    return badges[status] || '-';
}

// ⭐ NEW: Get delivered date from history
function getDeliveredDate(order) {
    if (order.status !== 'Delivered') return null;
    
    // Try to find the delivered date from history (admin/proc have full history)
    if (order.history && order.history.length) {
        const deliveredHistory = order.history
            .filter(h => h.field_name === 'status' && h.new_value === 'Delivered')
            .sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));
        
        if (deliveredHistory.length > 0) {
            return deliveredHistory[0].changed_at;
        }
    }
    
    // Fallback for requesters (no history): use updated_at which reflects when status last changed
    if (order.updated_at) return order.updated_at;
    
    return null;
}

// ⭐ NEW: Check if order is old delivered (delivered >7 days ago)
function isOldDelivered(order) {
    if (order.status !== 'Delivered') return false;
    
    const deliveredDate = getDeliveredDate(order);
    if (deliveredDate) {
        const delivered = new Date(deliveredDate);
        const today = new Date();
        const daysSince = Math.floor((today - delivered) / (1000 * 60 * 60 * 24));
        return daysSince > 7;
    }
    
    // Fallback: If no history, check created_at (conservative)
    if (order.created_at) {
        const createdDate = new Date(order.created_at);
        const today = new Date();
        const daysSince = Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
        return daysSince > 14; // More conservative for created_at
    }
    
    return false;
}

// ===================== FILTERING =====================

// ⭐ POWER SEARCH: Parse a search query string into structured tokens
function parsePowerSearch(raw) {
    const tokens = [];
    // Split on whitespace, preserving quoted strings
    const parts = raw.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    for (const part of parts) {
        const val = part.replace(/^"|"$/g, '').trim();
        if (!val) continue;
        const idVal = val.startsWith('#') ? val.slice(1) : null;
        const atVal = val.startsWith('@') ? val.slice(1).toLowerCase() : null;
        const pnVal = /^pn:/i.test(val) ? val.slice(3).toLowerCase() : null;
        const wasVal = /^was:/i.test(val) ? val.slice(4).trim() : null;
        const byVal = /^by:/i.test(val) ? val.slice(3).toLowerCase().trim() : null;

        if (idVal !== null && idVal.length > 0) {
            tokens.push({ type: 'id', value: idVal });
        } else if (atVal !== null && atVal.length > 0) {
            tokens.push({ type: 'requester', value: atVal });
        } else if (pnVal !== null && pnVal.length > 0) {
            tokens.push({ type: 'partnum', value: pnVal });
        } else if (wasVal !== null && wasVal.length > 0) {
            tokens.push({ type: 'was', value: wasVal });
        } else if (byVal !== null && byVal.length > 0) {
            tokens.push({ type: 'by', value: byVal });
        } else if (idVal === null && atVal === null && pnVal === null && wasVal === null && byVal === null) {
            // Plain text term
            tokens.push({ type: 'text', value: val.toLowerCase() });
        }
        // else: prefix with no value — silently ignore (e.g. bare "#", "@", "pn:" with nothing after)
    }
    return tokens;
}

function matchesOrderToken(order, token, searchBlob) {
    switch (token.type) {
        case 'id':
            // Exact ID match OR prefix match (e.g. #4 matches #4, #40, #41...)
            return String(order.id || '') === token.value ||
                   String(order.id || '').startsWith(token.value);
        case 'requester':
            return (order.requester_name || '').toLowerCase().includes(token.value);
        case 'partnum':
            return (order.part_number || '').toLowerCase().includes(token.value);
        case 'was':
        case 'by':
            // These are resolved server-side; if powerSearchWasIds is active, handled there
            return true;
        case 'text':
        default:
            return searchBlob.includes(token.value);
    }
}

function applyFilters() {
    // Parse power search tokens once
    const tokens = filterState.search ? parsePowerSearch(filterState.search) : [];

    // Extract was:/by: prefix values to potentially trigger server-side lookup
    const wasToken = tokens.find(t => t.type === 'was');
    const byToken = tokens.find(t => t.type === 'by');
    const newWas = wasToken ? wasToken.value : '';
    const newBy = byToken ? byToken.value : '';

    // If was:/by: changed, handle backend fetch vs. client-side re-filter
    if (newWas !== filterState.was || newBy !== filterState.byUser) {
        filterState.was = newWas;
        filterState.byUser = newBy;
        if (_wasDebounceTimer) clearTimeout(_wasDebounceTimer);
        powerSearchWasIds = null; // always reset when prefix changes

        if (newWas || newBy) {
            // Debounce 400ms: wait for user to finish typing before hitting backend
            _wasDebounceTimer = setTimeout(() => {
                _wasDebounceTimer = null;
                loadOrders();
            }, 400);
            return; // show nothing until backend responds
        }
        // was/by both cleared: reload to restore full unfiltered list from server
        loadOrders();
        return;
    }

    const textTokens = tokens.filter(t => t.type !== 'was' && t.type !== 'by');

    filteredOrders = ordersState.filter(order => {
        // ⭐ was:/by: server-side ID filter
        // Only apply if was/by is still active (guards against stale powerSearchWasIds)
        if (powerSearchWasIds !== null && (filterState.was || filterState.byUser)) {
            if (!powerSearchWasIds.includes(order.id)) return false;
        }

        // ⭐ Full-text search — multi-term AND logic
        if (textTokens.length > 0) {
            // Build file names string from files array (classic attachments)
            const fileNames = (order.files || []).map(f => f.name || f.file_name || '').join(' ');
            // Build document names + descriptions string from documents array (linked docs)
            const documentNames = (order.documents || []).map(d => d.name || d.file_name || '').join(' ');
            const documentDescriptions = (order.documents || []).map(d => d.description || '').join(' ');

            const searchBlob = [
                String(order.id || ''),
                order.item_description || '',
                order.part_number || '',
                order.category || '',
                order.notes || '',
                order.requester_name || '',
                order.cost_center_code || '',
                order.cost_center_name || '',
                order.supplier_name || '',
                order.supplier_notes || '',
                order.alternative_product_name || '',
                order.alternative_product_description || '',
                order.building || '',
                order.status || '',
                order.quote_number || '',
                fileNames,
                documentNames,
                documentDescriptions
            ].join(' ').toLowerCase();

            // ALL tokens must match (AND logic)
            for (const token of textTokens) {
                if (!matchesOrderToken(order, token, searchBlob)) return false;
            }
        }

        // Date range filter (submission_date)
        if (filterState.dateFrom) {
            const orderDate = order.submission_date ? order.submission_date.slice(0, 10) : '';
            if (!orderDate || orderDate < filterState.dateFrom) return false;
        }
        if (filterState.dateTo) {
            const orderDate = order.submission_date ? order.submission_date.slice(0, 10) : '';
            if (!orderDate || orderDate > filterState.dateTo) return false;
        }

        // Status filter
        if (filterState.status && order.status !== filterState.status) return false;

        // Building filter
        if (filterState.building && order.building !== filterState.building) return false;

        // Priority filter
        if (filterState.priority && order.priority !== filterState.priority) return false;

        // Supplier filter
        if (filterState.supplier && order.supplier_id !== parseInt(filterState.supplier, 10)) return false;

        // Delivery timeline filter
        if (filterState.delivery) {
            const deliveryStatus = getDeliveryStatus(order);
            if (filterState.delivery !== deliveryStatus) return false;
        }

        // Quick filters
        if (filterState.quickFilter) {
            const qf = filterState.quickFilter;
            if (qf === 'late') {
                // For requesters: use priority-age logic (aligns with KPI overdue card)
                // For admin/procurement: use expected_delivery_date if set, else priority-age
                if (['Delivered', 'Cancelled'].includes(order.status)) return false;
                const ageDays = Math.floor((Date.now() - new Date(order.submission_date || order.created_at || 0)) / 86400000);
                const hasPriorityOverdue = (order.priority === 'Urgent' && ageDays >= 5) || (order.priority === 'High' && ageDays >= 10);
                const hasExpectedLate = order.expected_delivery_date && new Date(order.expected_delivery_date) < new Date();
                if (!hasPriorityOverdue && !hasExpectedLate) return false;
            } else if (qf === 'due7' || qf === 'due14') {
                // due7/due14 only meaningful with expected_delivery_date (procurement sets this)
                const deliveryStatus = getDeliveryStatus(order);
                if (deliveryStatus !== qf) return false;
            } else if (qf === 'new' && order.status !== 'New') return false;
            else if (qf === 'ordered' && !['Ordered', 'Quote Requested', 'Quote Received', 'Approved'].includes(order.status)) return false;
            else if (qf === 'transit' && !['In Transit', 'Partially Delivered'].includes(order.status)) return false;
        }

        return true;
    });

    // Sort: active orders first (by priority), then Delivered/Cancelled at bottom (by id desc)
    const TERMINAL_STATUSES = ['Delivered', 'Cancelled'];
    filteredOrders.sort((a, b) => {
        const aTerminal = TERMINAL_STATUSES.includes(a.status);
        const bTerminal = TERMINAL_STATUSES.includes(b.status);

        // Push terminal statuses to bottom
        if (aTerminal !== bTerminal) return aTerminal ? 1 : -1;

        // Within active orders: sort by priority
        if (!aTerminal) {
            const priorityA = PRIORITY_ORDER[a.priority] || PRIORITY_ORDER['Normal'];
            const priorityB = PRIORITY_ORDER[b.priority] || PRIORITY_ORDER['Normal'];
            if (priorityA !== priorityB) return priorityA - priorityB;
        }

        // Secondary sort by ID (newer first within same group)
        return b.id - a.id;
    });

    renderOrdersTable();
    if (currentUser && currentUser.role === 'requester') renderRequesterDashboard(ordersState);
}

// ===================== AUTH =====================

// Token storage helpers — use cookie as primary (works through Cloudflare/Edge tracking prevention)
// localStorage/sessionStorage as fallback
function saveToken(token) {
    authToken = token;
    try { localStorage.setItem('authToken', token); } catch {}
    try { sessionStorage.setItem('authToken', token); } catch {}
    // Cookie: SameSite=Strict, no expiry = session cookie
    document.cookie = 'pp_token=' + encodeURIComponent(token) + '; path=/; SameSite=Strict';
}

function loadToken() {
    // Try cookie first (always works in Edge even with tracking prevention)
    const cookieMatch = document.cookie.match(/(?:^|;\s*)pp_token=([^;]*)/);
    if (cookieMatch) return decodeURIComponent(cookieMatch[1]);
    // Fallback to sessionStorage, then localStorage
    try { const t = sessionStorage.getItem('authToken'); if (t) return t; } catch {}
    try { const t = localStorage.getItem('authToken'); if (t) return t; } catch {}
    return null;
}

function clearToken() {
    authToken = null;
    try { localStorage.removeItem('authToken'); } catch {}
    try { sessionStorage.removeItem('authToken'); } catch {}
    document.cookie = 'pp_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

async function checkAuth() {
    const token = loadToken();
    if (!token) { showLogin(); return; }
    authToken = token;
    try {
        const res = await apiGet('/auth/verify');
        if (res.success) { currentUser = res.user; showDashboard(); }
        else { showLogin(); }
    } catch { showLogin(); }
}

async function handleLogin(e) {
    e.preventDefault();
    loginError.classList.add('hidden');
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!data.success) {
            loginError.textContent = data.message || 'Login failed';
            loginError.classList.remove('hidden');
            return;
        }
        currentUser = data.user;
        saveToken(data.token);
        // ⭐ BM: Check if this user is a building manager (enriches currentUser before showDashboard)
        try {
            const bmRes = await fetch(`${API_BASE}/orders/building-manager-status`, {
                headers: { 'Authorization': `Bearer ${data.token}` }
            });
            if (bmRes.ok) {
                const bmData = await bmRes.json();
                if (bmData.success && bmData.isBuildingManager) {
                    currentUser.isBuildingManager = true;
                    currentUser.managedBuilding     = bmData.buildingCode;
                    currentUser.managedBuildingName = bmData.buildingName;
                } else {
                    currentUser.isBuildingManager = false;
                    currentUser.managedBuilding   = null;
                }
            }
        } catch (_bmErr) {
            currentUser.isBuildingManager = false;
            currentUser.managedBuilding   = null;
        }
        showDashboard();
    } catch (err) {
        loginError.textContent = 'Login failed. Please try again.';
        loginError.classList.remove('hidden');
    }
}

function handleLogout() {
    clearToken();
    currentUser = null;
    
    // Reset all filters and UI state
    resetFiltersOnLogout();
    
    showLogin();
}

function showLogin() {
    loginScreen.classList.remove('hidden');
    dashboardScreen.classList.add('hidden');
    loginForm.reset();
}

function showDashboard() {
    loginScreen.classList.add('hidden');
    dashboardScreen.classList.remove('hidden');
    userName.textContent = currentUser.name;
    
    // ⭐ FIX: Proper role badge display including manager
    if (currentUser.role === 'admin') {
        userRoleBadge.textContent = 'Admin';
    } else if (currentUser.role === 'procurement') {
        userRoleBadge.textContent = 'Procurement';
    } else if (currentUser.role === 'manager') {
        userRoleBadge.textContent = 'Manager';
    } else {
        userRoleBadge.textContent = `Requester · ${currentUser.building || ''}`;
    }

    // Hide admin-only tabs by default
    if (usersTabButton) usersTabButton.hidden = true;
    if (buildingsTabButton) buildingsTabButton.hidden = true;
    if (costCentersTabButton) costCentersTabButton.hidden = true;
    if (approvalsTabButton) approvalsTabButton.hidden = true;

    if (currentUser.role === 'requester') {
        // REQUESTER: Show order creation form, hide navigation tabs
        createOrderSection.classList.remove('hidden');
        requesterBuildingBadge.textContent = `Building ${currentUser.building}`;
        navTabs.classList.add('hidden');
        const _rd = document.getElementById('requesterDashboard'); if (_rd) _rd.style.display = '';
        
        // For requesters: show the container (so view-mode-toggle is visible)
        // but keep orderActionsBar (bulk actions/RFQ/export) hidden
        const orderActionsContainer = document.getElementById('orderActionsContainer');
        if (orderActionsContainer) {
            orderActionsContainer.style.display = 'flex';
        }
        
        // Hide the quote creation bar
        if (orderActionsBar) {
            orderActionsBar.style.display = 'none';
        }

        // ⭐ BM: Hide ENTIRE mobile bottom nav for regular requesters.
        // Building managers have role='requester' but keep the nav visible.
        if (!currentUser.isBuildingManager) {
            const mobileNav = document.getElementById('mobileBottomNav');
            if (mobileNav) mobileNav.style.display = 'none';
        } else {
            // Building manager: update their role badge to reflect their role
            if (userRoleBadge) {
                userRoleBadge.textContent = `Мениджър · ${currentUser.managedBuilding || currentUser.building}`;
            }
        }
    } else if (currentUser.role === 'manager') {
        // ⭐ MANAGER: Show navigation with approvals tab, read-only orders view
        createOrderSection.classList.add('hidden');
        navTabs.classList.remove('hidden');
        populateStatusFilter();
        
        // Show approvals tab for managers
        if (approvalsTabButton) approvalsTabButton.hidden = false;
        
        // Show order actions container (view toggle)
        const orderActionsContainer = document.getElementById('orderActionsContainer');
        if (orderActionsContainer) {
            orderActionsContainer.style.display = 'flex';
        }
        
        // Hide quote creation for managers
        if (orderActionsBar) {
            orderActionsBar.style.display = 'none';
        }

        // ⭐ NEW: Show Create Order button for managers
        const btnProcCreateMgr = document.getElementById('btnProcurementCreateOrder');
        if (btnProcCreateMgr) btnProcCreateMgr.classList.remove('hidden');
        
        // Initialize approvals if function exists
        if (typeof loadApprovals === 'function') {
            loadApprovals();
        }
    } else {
        // ADMIN / PROCUREMENT: Full access
        createOrderSection.classList.add('hidden');
        navTabs.classList.remove('hidden');
        populateStatusFilter();
        
        // Show order actions container for admin/procurement
        const orderActionsContainer = document.getElementById('orderActionsContainer');
        if (orderActionsContainer) {
            orderActionsContainer.style.display = 'flex';
        }

        if (currentUser.role === 'admin') {
            if (usersTabButton) usersTabButton.hidden = false;
            if (buildingsTabButton) buildingsTabButton.hidden = false;
            if (costCentersTabButton) costCentersTabButton.hidden = false;
        }

        // ⭐ NEW: Show Create Order button for admin/procurement
        const btnProcCreate = document.getElementById('btnProcurementCreateOrder');
        if (btnProcCreate) btnProcCreate.classList.remove('hidden');

        // Show analytics tab for admin and procurement (desktop + mobile)
        const analyticsTabButton = document.getElementById('analyticsTabButton');
        if (analyticsTabButton) analyticsTabButton.hidden = false;
        const mobAnalyticsBtn = document.getElementById('mobAnalyticsBtn');
        if (mobAnalyticsBtn) mobAnalyticsBtn.hidden = false;

        // ⭐ NEW: Show "По доставчик" tab for admin and procurement
        const supplierGroupTabButton = document.getElementById('supplierGroupTabButton');
        if (supplierGroupTabButton) supplierGroupTabButton.hidden = false;
    }

    // Show orders tab by default
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    const ordersTabEl = document.getElementById('ordersTab');
    if (ordersTabEl) ordersTabEl.classList.remove('hidden');
    currentTab = 'ordersTab';

    loadBuildings();
    loadCostCenters();
    // ⭐ FIX: Only load suppliers for admin and procurement roles
    if (currentUser.role === 'admin' || currentUser.role === 'procurement') {
        loadSuppliers().then(() => { populateSupplierFilter(); });
    }
    loadOrders();
    if (currentUser.role !== 'requester') { loadQuotes(); }
    if (currentUser.role === 'admin') { loadUsers(); }
}

// API helpers
async function apiGet(path, params = {}) {
    const url = new URL(`${API_BASE}${path}`, window.location.origin);
    Object.entries(params).forEach(([k, v]) => {
        if (v !== '' && v !== undefined && v !== null) url.searchParams.set(k, v);
    });
    const res = await fetch(url.toString(), { headers: { 'Authorization': `Bearer ${authToken}` } });
    // ⭐ FIX: non-JSON responses (e.g. 502/504 HTML error pages) caused silent crashes
    const ct = res.headers.get('Content-Type') || '';
    if (!ct.includes('application/json')) {
        throw new Error(`API ${path} returned non-JSON response (HTTP ${res.status})`);
    }
    return res.json();
}

async function apiPut(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return res.json();
}

async function apiPost(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return res.json();
}

async function apiDelete(path) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    return res.json();
}

// ===================== COST CENTERS =====================

async function loadCostCenters() {
    try {
        const res = await apiGet('/cost-centers');
        if (res.success) {
            costCentersState = res.costCenters;
            if (currentUser && currentUser.role === 'requester') {
                renderCostCenterRadios(currentUser.building);
            }
            if (currentUser && currentUser.role === 'admin') {
                renderCostCentersTable();
                populateCCBuildingSelects();
            }
        }
    } catch (err) { console.error('loadCostCenters error:', err); }
}

function renderCostCenterRadios(buildingCode) {
    if (!costCenterRadios) return;

    if (!buildingCode) {
        costCenterRadios.innerHTML = '<span class="text-muted">Select a building first</span>';
        return;
    }

    const filtered = costCentersState.filter(cc => cc.building_code === buildingCode && cc.active);

    if (!filtered.length) {
        costCenterRadios.innerHTML = '<span class="text-muted">No cost centers defined for this building</span>';
        return;
    }

    costCenterRadios.innerHTML = filtered.map(cc =>
        `<label class="radio-label">
            <input type="radio" name="costCenter" value="${cc.id}" required>
            <span class="radio-text"><strong>${escapeHtml(cc.code)}</strong> — ${escapeHtml(cc.name)}</span>
        </label>`
    ).join('');
}

function populateCCBuildingSelects() {
    if (ccBuildingSelect) {
        ccBuildingSelect.innerHTML = '<option value="">Select Building</option>' +
            buildingsState.filter(b => b.active).map(b => `<option value="${b.code}">${escapeHtml(b.code)} - ${escapeHtml(b.name)}</option>`).join('');
    }
    if (ccFilterBuilding) {
        ccFilterBuilding.innerHTML = '<option value="">All Buildings</option>' +
            buildingsState.filter(b => b.active).map(b => `<option value="${b.code}">${escapeHtml(b.code)} - ${escapeHtml(b.name)}</option>`).join('');
    }
}

function renderCostCentersTable() {
    if (!costCentersTable) return;

    const filterVal = ccFilterBuilding ? ccFilterBuilding.value : '';
    const filtered = filterVal ? costCentersState.filter(cc => cc.building_code === filterVal) : costCentersState;

    if (!filtered.length) {
        costCentersTable.innerHTML = '<p class="text-muted">No cost centers found.</p>';
        return;
    }

    let html = '<div class="table-wrapper"><table><thead><tr>';
    html += '<th>Building</th><th>Code</th><th>Name</th><th>Active</th><th></th>';
    html += '</tr></thead><tbody>';

    for (const cc of filtered) {
        html += `<tr data-id="${cc.id}">
            <td>${escapeHtml(cc.building_code)}</td>
            <td>${escapeHtml(cc.code)}</td>
            <td>${escapeHtml(cc.name)}</td>
            <td>${cc.active ? 'Yes' : 'No'}</td>
            <td><button class="btn btn-secondary btn-sm btn-edit-cc" data-id="${cc.id}">Edit</button></td>
        </tr>`;
    }

    html += '</tbody></table></div>';
    costCentersTable.innerHTML = html;

    document.querySelectorAll('.btn-edit-cc').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.id, 10);
            const cc = costCentersState.find(x => x.id === id);
            if (cc) openCostCenterForm(cc);
        });
    });
}

function openCostCenterForm(cc) {
    if (!costCenterFormCard) return;

    if (cc) {
        costCenterFormTitle.textContent = 'Edit Cost Center';
        costCenterIdInput.value = cc.id;
        ccBuildingSelect.value = cc.building_code || '';
        ccCodeInput.value = cc.code || '';
        ccNameInput.value = cc.name || '';
        ccDescriptionInput.value = cc.description || '';
        ccActiveSelect.value = cc.active ? '1' : '0';
        if (btnDeleteCostCenter) btnDeleteCostCenter.hidden = false;
    } else {
        costCenterFormTitle.textContent = 'Create Cost Center';
        costCenterForm.reset();
        costCenterIdInput.value = '';
        ccActiveSelect.value = '1';
        if (btnDeleteCostCenter) btnDeleteCostCenter.hidden = true;
    }
    costCenterFormCard.hidden = false;
}

async function handleSaveCostCenter(e) {
    e.preventDefault();

    const payload = {
        building_code: ccBuildingSelect.value,
        code: ccCodeInput.value.trim(),
        name: ccNameInput.value.trim(),
        description: ccDescriptionInput.value.trim(),
        active: ccActiveSelect.value === '1'
    };

    if (!payload.building_code || !payload.code || !payload.name) {
        alert('Building, code, and name are required');
        return;
    }

    const id = costCenterIdInput.value;
    let res;
    if (id) {
        res = await apiPut(`/cost-centers/${id}`, payload);
    } else {
        res = await apiPost('/cost-centers', payload);
    }

    if (res.success) {
        alert('Cost center saved');
        costCenterFormCard.hidden = true;
        loadCostCenters();
    } else {
        alert('Failed to save cost center: ' + (res.message || 'Unknown error'));
    }
}

async function handleDeleteCostCenter() {
    const id = costCenterIdInput.value;
    if (!id) return;

    if (!confirm('Are you sure you want to delete this cost center?')) return;

    const res = await apiDelete(`/cost-centers/${id}`);
    if (res.success) {
        alert('Cost center deleted');
        costCenterFormCard.hidden = true;
        loadCostCenters();
    } else {
        alert('Failed to delete: ' + (res.message || 'Unknown error'));
    }
}

// ===================== ORDERS =====================

async function handleCreateOrder(e) {
    e.preventDefault();

    const selectedCC = document.querySelector('input[name="costCenter"]:checked');
    if (!selectedCC) {
        alert('Please select a Cost Center');
        return;
    }

    const formData = new FormData();
    formData.append('building', buildingSelect.value);
    formData.append('costCenterId', selectedCC.value);
    formData.append('itemDescription', document.getElementById('itemDescription').value.trim());
    formData.append('partNumber', document.getElementById('partNumber').value.trim());
    formData.append('category', document.getElementById('category').value.trim());
    formData.append('quantity', document.getElementById('quantity').value);
    formData.append('priority', document.getElementById('priority').value);
    formData.append('notes', document.getElementById('notes').value.trim());
    formData.append('requester', currentUser.name);
    formData.append('requesterEmail', currentUser.email);

    const files = document.getElementById('attachments').files;
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }

    // Show progress overlay
    if (window.UploadProgress) {
        window.UploadProgress.show();
    }

    // Use XMLHttpRequest for upload progress tracking
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && window.UploadProgress) {
                const percentComplete = (e.loaded / e.total) * 100;
                window.UploadProgress.update(percentComplete);
            }
        });

        // Handle completion
        xhr.addEventListener('load', () => {
            if (window.UploadProgress) {
                window.UploadProgress.hide();
            }

            try {
                const data = JSON.parse(xhr.responseText);
                if (!data.success) {
                    alert('Failed to create order: ' + (data.message || 'Unknown error'));
                    reject(new Error(data.message));
                    return;
                }
                alert('Order created successfully!');
                createOrderForm.reset();
                // Clear duplicate warning panel
                const _dpanel = document.getElementById('dupWarningPanel');
                if (_dpanel) { _dpanel.style.display = 'none'; _dpanel.innerHTML = ''; }
                if (currentUser.role === 'requester') {
                    buildingSelect.value = currentUser.building;
                    renderCostCenterRadios(currentUser.building);
                }
                loadOrders();
                resolve(data);
            } catch (err) {
                alert('Failed to process server response.');
                reject(err);
            }
        });

        // Handle errors
        xhr.addEventListener('error', () => {
            if (window.UploadProgress) {
                window.UploadProgress.hide();
            }
            alert('Failed to create order. Network error.');
            reject(new Error('Network error'));
        });

        xhr.addEventListener('abort', () => {
            if (window.UploadProgress) {
                window.UploadProgress.hide();
            }
            alert('Upload cancelled.');
            reject(new Error('Upload cancelled'));
        });

        // Open connection and send
        xhr.open('POST', `${API_BASE}/orders`);
        xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
        xhr.send(formData);
    });
}


async function loadOrders() {
    const seq = ++_loadOrdersSeq; // increment sequence; stale responses will be ignored
    try {
        // Build query params for power search backend features
        const params = new URLSearchParams();
        if (filterState.dateFrom) params.set('date_from', filterState.dateFrom);
        if (filterState.dateTo)   params.set('date_to',   filterState.dateTo);
        if (filterState.was)      params.set('was',        filterState.was);
        if (filterState.byUser)   params.set('by',         filterState.byUser);

        const qs = params.toString();
        const res = await apiGet('/orders' + (qs ? '?' + qs : ''));

        // Discard if a newer request has already been fired
        if (seq !== _loadOrdersSeq) return;

        if (res.success) {
            ordersState = res.orders;
            filteredOrders = ordersState;
            selectedOrderIds.clear();
            updateSelectionUi();

            // ⭐ Mark which orders match was:/by: (backend already filtered; all returned IDs qualify)
            powerSearchWasIds = (filterState.was || filterState.byUser)
                ? ordersState.map(o => o.id)
                : null;

            currentPage = 1; // Reset to page 1
            applyFilters();
        }
    } catch (err) {
        if (seq !== _loadOrdersSeq) return; // ignore error from stale request
        console.error('loadOrders error:', err);
        ordersTable.innerHTML = '<p>Failed to load orders.</p>';
    }
}

// ⭐ NEW: Render pagination controls
function renderPaginationControls(totalOrders, containerId = 'ordersTable') {
    const totalPages = Math.ceil(totalOrders / ORDERS_PER_PAGE);
    
    if (totalPages <= 1) return ''; // No pagination needed
    
    let html = '<div class="pagination-controls">';
    html += `<div class="pagination-info">Page ${currentPage} of ${totalPages} (${totalOrders} orders)</div>`;
    html += '<div class="pagination-buttons">';
    
    // First & Previous
    html += `<button class="btn-pagination" data-page="1" ${currentPage === 1 ? 'disabled' : ''}>⏮ First</button>`;
    html += `<button class="btn-pagination" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>◀ Previous</button>`;
    
    // Page numbers (show current, ±2 pages)
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    if (startPage > 1) {
        html += '<span class="pagination-ellipsis">...</span>';
    }
    
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="btn-pagination ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    
    if (endPage < totalPages) {
        html += '<span class="pagination-ellipsis">...</span>';
    }
    
    // Next & Last
    html += `<button class="btn-pagination" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Next ▶</button>`;
    html += `<button class="btn-pagination" data-page="${totalPages}" ${currentPage === totalPages ? 'disabled' : ''}>Last ⏭</button>`;
    
    html += '</div></div>';
    
    return html;
}

// ⭐ NEW: Attach pagination event listeners
function attachPaginationListeners() {
    document.querySelectorAll('.btn-pagination').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page, 10);
            if (!isNaN(page) && page > 0) {
                currentPage = page;
                renderOrdersTable();
                // Scroll to top of orders table
                ordersTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

function renderOrdersTable() {
    // ⭐ NEW: Separate delivered orders >7 days old
    const activeOrders = filteredOrders.filter(o => !isOldDelivered(o));
    const oldDelivered = filteredOrders.filter(o => isOldDelivered(o));
    
    if (!activeOrders.length && !oldDelivered.length) {
        ordersTable.innerHTML = '';
        const emptyEl = document.getElementById('ordersEmptyState');
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
    }
    // Hide empty state if orders exist
    const emptyEl2 = document.getElementById('ordersEmptyState');
    if (emptyEl2) emptyEl2.classList.add('hidden');

    if (viewMode === 'grouped') {
        renderGroupedOrders(activeOrders, oldDelivered);
    } else if (viewMode === 'cards') {
        renderCardOrders(activeOrders, oldDelivered);
    } else {
        renderFlatOrders(activeOrders, oldDelivered);
    }
}

function renderFlatOrders(activeOrders, oldDelivered) {
    const isAdminView = currentUser.role !== 'requester';
    const canSelectOrders = currentUser.role === 'admin' || currentUser.role === 'procurement';
    
    let html = '';
    
    // ⭐ ACTIVE ORDERS (with pagination)
    if (activeOrders.length > 0) {
        const startIdx = (currentPage - 1) * ORDERS_PER_PAGE;
        const endIdx = startIdx + ORDERS_PER_PAGE;
        const paginatedOrders = activeOrders.slice(startIdx, endIdx);
        
        html += '<div class="table-wrapper"><table><thead><tr>';
        if (canSelectOrders) html += '<th class="sticky"><input type="checkbox" id="selectAllOrders"></th>';
        
        html += '<th>ID</th>';
        html += '<th></th>'; // View button column
        html += '<th>Item</th>';
        html += '<th>Cost Center</th>';
        html += '<th>Qty</th>';
        html += '<th>Status</th>';
        html += '<th>Priority</th>';
        html += '<th>Files</th>';
        
        if (isAdminView) {
            html += '<th>Requester</th>';
            html += '<th>Delivery</th>';
            html += '<th>Exp. Delivery</th>';
            html += '<th>Supplier</th>';
            html += '<th>Building</th>';
            html += '<th>Unit</th>';
            html += '<th>Total</th>';
        } else {
            html += '<th>Delivery</th>';
        }
        
        html += '</tr></thead><tbody>';

        for (const order of paginatedOrders) {
            html += renderOrderRow(order, canSelectOrders, isAdminView);
        }
        
        html += '</tbody></table></div>';
        
        // Pagination controls
        html += renderPaginationControls(activeOrders.length);
    }
    
    // ⭐ OLD DELIVERED SECTION (collapsed, not paginated)
    if (oldDelivered.length > 0) {
        html += '<div class="old-delivered-section" style="margin-top: 1.5rem;">';
        html += `<div class="old-delivered-header" onclick="this.parentElement.classList.toggle('expanded')">`;
        html += `<span class="old-delivered-title">📦 Delivered Orders (>7 days ago)</span>`;
        html += `<span class="old-delivered-count">${oldDelivered.length} orders</span>`;
        html += `<span class="old-delivered-chevron">▼</span>`;
        html += '</div>';
        html += '<div class="old-delivered-body">';
        
        html += '<div class="table-wrapper"><table><thead><tr>';
        if (canSelectOrders) html += '<th class="sticky"><input type="checkbox" id="selectAllOldOrders"></th>';
        
        html += '<th>ID</th>';
        html += '<th></th>';
        html += '<th>Item</th>';
        html += '<th>Cost Center</th>';
        html += '<th>Qty</th>';
        html += '<th>Status</th>';
        html += '<th>Priority</th>';
        html += '<th>Files</th>';
        
        if (isAdminView) {
            html += '<th>Requester</th>';
            html += '<th>Delivered</th>'; // ⭐ NEW: Delivered date column
            html += '<th>Supplier</th>';
            html += '<th>Building</th>';
            html += '<th>Unit</th>';
            html += '<th>Total</th>';
        } else {
            html += '<th>Delivered</th>'; // ⭐ NEW: Delivered date column
        }
        
        html += '</tr></thead><tbody>';

        for (const order of oldDelivered) {
            html += renderOrderRow(order, canSelectOrders, isAdminView);
        }
        
        html += '</tbody></table></div>';
        html += '</div></div>';
    }

    ordersTable.innerHTML = html;
    attachOrderEventListeners(canSelectOrders);
    attachPaginationListeners();
}

function renderGroupedOrders(activeOrders, oldDelivered) {
    const isAdminView = currentUser.role !== 'requester';
    const canSelectOrders = currentUser.role === 'admin' || currentUser.role === 'procurement';
    const grouped = {};

    // Group active orders by status
    for (const order of activeOrders) {
        if (!grouped[order.status]) grouped[order.status] = [];
        grouped[order.status].push(order);
    }

    let html = '';

    // Render active orders grouped by status
    for (const status of ORDER_STATUSES) {
        if (!grouped[status] || grouped[status].length === 0) continue;

        const statusClass = 'status-' + status.toLowerCase().replace(/ /g, '-');
        html += `<div class="status-group">
            <div class="status-group-header" data-status="${status}">
                <div class="status-group-title">
                    <span class="status-badge ${statusClass}">${status}</span>
                    <span class="status-group-count">${grouped[status].length}</span>
                </div>
                <span class="status-group-chevron">▼</span>
            </div>
            <div class="status-group-body" data-status="${status}">`;

        html += '<div class="table-wrapper"><table><thead><tr>';
        if (canSelectOrders) html += '<th class="sticky"><input type="checkbox" class="select-all-group" data-status="${status}"></th>';
        
        html += '<th>ID</th>';
        html += '<th></th>';
        html += '<th>Item</th>';
        html += '<th>Cost Center</th>';
        html += '<th>Qty</th>';
        html += '<th>Priority</th>';
        html += '<th>Files</th>';
        
        if (isAdminView) {
            html += '<th>Requester</th>';
            html += '<th>Delivery</th>';
            html += '<th>Exp. Delivery</th>';
            html += '<th>Supplier</th>';
            html += '<th>Building</th>';
            html += '<th>Unit</th>';
            html += '<th>Total</th>';
        } else {
            html += '<th>Delivery</th>';
        }
        
        html += '</tr></thead><tbody>';

        for (const order of grouped[status]) {
            html += renderOrderRow(order, canSelectOrders, isAdminView);
        }

        html += '</tbody></table></div></div></div>';
    }
    
    // ⭐ OLD DELIVERED SECTION (same as flat view)
    if (oldDelivered.length > 0) {
        html += '<div class="old-delivered-section" style="margin-top: 1.5rem;">';
        html += `<div class="old-delivered-header" onclick="this.parentElement.classList.toggle('expanded')">`;
        html += `<span class="old-delivered-title">📦 Delivered Orders (>7 days ago)</span>`;
        html += `<span class="old-delivered-count">${oldDelivered.length} orders</span>`;
        html += `<span class="old-delivered-chevron">▼</span>`;
        html += '</div>';
        html += '<div class="old-delivered-body">';
        
        html += '<div class="table-wrapper"><table><thead><tr>';
        if (canSelectOrders) html += '<th class="sticky"><input type="checkbox" id="selectAllOldOrders"></th>';
        
        html += '<th>ID</th>';
        html += '<th></th>';
        html += '<th>Item</th>';
        html += '<th>Cost Center</th>';
        html += '<th>Qty</th>';
        html += '<th>Status</th>';
        html += '<th>Priority</th>';
        html += '<th>Files</th>';
        
        if (isAdminView) {
            html += '<th>Requester</th>';
            html += '<th>Delivered</th>'; // ⭐ NEW: Delivered date column
            html += '<th>Supplier</th>';
            html += '<th>Building</th>';
            html += '<th>Unit</th>';
            html += '<th>Total</th>';
        } else {
            html += '<th>Delivered</th>'; // ⭐ NEW: Delivered date column
        }
        
        html += '</tr></thead><tbody>';

        for (const order of oldDelivered) {
            html += renderOrderRow(order, canSelectOrders, isAdminView);
        }
        
        html += '</tbody></table></div>';
        html += '</div></div>';
    }

    ordersTable.innerHTML = html;

    // Attach collapse/expand handlers
    document.querySelectorAll('.status-group-header').forEach(header => {
        header.addEventListener('click', () => {
            const status = header.dataset.status;
            const body = document.querySelector(`.status-group-body[data-status="${status}"]`);
            if (body) {
                body.classList.toggle('collapsed');
                header.classList.toggle('collapsed');
            }
        });
    });

    attachOrderEventListeners(canSelectOrders);
}

// ⭐ NEW: Shared order row rendering function
function renderOrderRow(order, canSelectOrders, isAdminView) {
    const statusClass = 'status-' + order.status.toLowerCase().replace(/ /g, '-');
    const priorityClass = 'priority-' + (order.priority || 'Normal').toLowerCase();
    const hasFiles = order.files && order.files.length > 0;
    const deliveryStatus = getDeliveryStatus(order);
    const deliveredDate = getDeliveredDate(order);

    let html = '<tr data-id="' + order.id + '">';
    
    if (canSelectOrders) {
        html += `<td class="sticky"><input type="checkbox" class="row-select" data-id="${order.id}"></td>`;
    }
    
    html += `<td>#${order.id}</td>`;
    html += `<td><button class="btn btn-secondary btn-sm btn-view-order" data-id="${order.id}">View</button></td>`;
    html += `<td title="${escapeHtml(order.item_description)}">${escapeHtml(order.item_description.substring(0, 40))}${order.item_description.length > 40 ? '…' : ''}</td>`;
    html += `<td>${order.cost_center_code || '-'}</td>`;
    html += `<td>${order.quantity}</td>`;
    
    // Show status badge only if not in a group (flat view or old delivered)
    if (isOldDelivered(order) || viewMode === 'flat') {
        html += `<td><span class="status-badge ${statusClass}">${order.status}</span></td>`;
    }
    
    html += `<td><span class="priority-pill ${priorityClass}">${order.priority || 'Normal'}</span></td>`;
    html += `<td>${hasFiles ? '📎 ' + order.files.length : '-'}</td>`;

    if (isAdminView) {
        html += `<td>${order.requester_name}</td>`;
        
        // ⭐ FIX: For old delivered, show delivered date instead of delivery status
        if (isOldDelivered(order)) {
            html += `<td>${deliveredDate ? formatDate(deliveredDate) : '<span class="status-badge status-delivered">Delivered</span>'}</td>`;
        } else {
            html += `<td>${getDeliveryBadgeHtml(deliveryStatus)}</td>`;
        }
        
        // For active orders, show expected delivery date; for old delivered, skip it
        if (!isOldDelivered(order)) {
            html += `<td>${order.expected_delivery_date ? formatDate(order.expected_delivery_date) : '-'}</td>`;
        }
        
        html += `<td>${order.supplier_name || '-'}</td>`;
        html += `<td>${order.building}</td>`;
        html += `<td class="text-right">${fmtPrice(order.unit_price)}</td>`;
        html += `<td class="text-right">${fmtPrice(order.total_price)}</td>`;
    } else {
        // ⭐ FIX: For requesters, show delivered date for old delivered
        if (isOldDelivered(order)) {
            html += `<td>${deliveredDate ? formatDate(deliveredDate) : '<span class="status-badge status-delivered">Delivered</span>'}</td>`;
        } else {
            html += `<td>${getDeliveryBadgeHtml(deliveryStatus)}</td>`;
        }
    }

    html += '</tr>';
    return html;
}

function attachOrderEventListeners(canSelectOrders) {
    if (canSelectOrders) {
        const selectAll = document.getElementById('selectAllOrders');
        if (selectAll) {
            selectAll.addEventListener('change', e => {
                const checked = e.target.checked;
                selectedOrderIds.clear();
                if (checked) { filteredOrders.forEach(o => selectedOrderIds.add(o.id)); }
                document.querySelectorAll('.row-select').forEach(cb => {
                    cb.checked = checked;
                    const tr = cb.closest('tr');
                    if (tr) checked ? tr.classList.add('row-selected') : tr.classList.remove('row-selected');
                });
                updateSelectionUi();
            });
        }

        document.querySelectorAll('.row-select').forEach(cb => {
            cb.addEventListener('change', e => {
                const id = parseInt(e.target.dataset.id, 10);
                if (e.target.checked) {
                    selectedOrderIds.add(id);
                    e.target.closest('tr')?.classList.add('row-selected');
                } else {
                    selectedOrderIds.delete(id);
                    e.target.closest('tr')?.classList.remove('row-selected');
                }
                updateSelectionUi();
            });
        });
    }

    document.querySelectorAll('.btn-view-order').forEach(btn => {
        btn.addEventListener('click', () => openOrderDetail(parseInt(btn.dataset.id, 10)));
    });
}

function updateSelectionUi() {
    const count = selectedOrderIds.size;
    if (count > 0) { orderActionsBar.hidden = false; selectedCount.textContent = `${count} selected`; }
    else { orderActionsBar.hidden = true; }
}

async function openOrderDetail(orderId) {
    try {
        // Close Today's Actions panel if open — order detail must render on top
        const todayPanel = document.getElementById('procTodayPanel');
        const todayBackdrop = document.getElementById('procTodayBackdrop');
        if (todayPanel && !todayPanel.classList.contains('hidden')) {
            todayPanel.classList.add('hidden');
            if (todayBackdrop) todayBackdrop.classList.add('hidden');
        }

        const res = await apiGet(`/orders/${orderId}`);
        if (!res.success) return;
        renderOrderDetail(res.order);
        orderDetailPanel.classList.remove('hidden');
        document.getElementById('orderDetailBackdrop')?.classList.remove('hidden');
        
        // ⭐ LOAD DOCUMENTS FOR THIS ORDER (Phase 2 Integration)
        if (typeof loadOrderDocuments === 'function') {
            loadOrderDocuments(orderId);
        }
    } catch(err) { 
        console.error('[openOrderDetail] Error:', err);
        alert('Failed to load order details: ' + (err && err.message ? err.message : String(err))); 
    }
}
// Expose on window so partpulse-features.js can monkey-patch it
window.openOrderDetail = openOrderDetail;

function renderOrderDetail(o) {
    const statusClass = 'status-' + o.status.toLowerCase().replace(/ /g, '-');
    const priorityClass = 'priority-' + (o.priority || 'Normal').toLowerCase();
    const deliveryStatus = getDeliveryStatus(o);
    const deliveredDate = getDeliveredDate(o);
    
    // ⭐ SECURITY: Check if current user can see sensitive data
    const canSeeSensitiveData = currentUser.role !== 'requester';

    let html = '';

    // ⭐ Cancellation banner — shown prominently for ALL roles when order is Cancelled
    if (o.status === 'Cancelled') {
        const cancelledAt = o.cancelled_at ? formatDateTime(o.cancelled_at) : null;
        const cancelledBy = o.cancelled_by || 'Unknown';
        const reason = o.cancellation_reason || '—';
        html += `<div style="background:#fef2f2;border:2px solid #dc2626;border-radius:10px;padding:1rem 1.25rem;margin-bottom:1rem;">
            <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;">
                <span style="font-size:1.2rem;">❌</span>
                <span style="font-weight:800;font-size:1rem;color:#dc2626;">Order Cancelled</span>
            </div>
            <div style="font-size:.82rem;color:#7f1d1d;line-height:1.6;">
                <div><strong>Cancelled by:</strong> ${escapeHtml(cancelledBy)}</div>
                ${cancelledAt ? `<div><strong>Date/Time:</strong> ${cancelledAt}</div>` : ''}
                <div style="margin-top:.4rem;padding:.5rem .75rem;background:#fee2e2;border-radius:6px;border-left:3px solid #dc2626;">
                    <strong>Reason:</strong> ${escapeHtml(reason)}
                </div>
            </div>
        </div>`;
    }

    html += `<div class="detail-grid">
        <div><div class="detail-label">Order ID</div><div class="detail-value">#${o.id}</div></div>
        <div><div class="detail-label">Submitted</div><div class="detail-value">${o.submission_date ? formatDate(o.submission_date) : '-'}</div></div>
        <div><div class="detail-label">Last Updated</div><div class="detail-value">${o.updated_at ? formatDateTime(o.updated_at) : '-'}</div></div>
        <div><div class="detail-label">Building</div><div class="detail-value">${o.building}</div></div>
        <div><div class="detail-label">Cost Center</div><div class="detail-value">${o.cost_center_code ? `${o.cost_center_code} — ${o.cost_center_name}` : '-'}</div></div>
        <div><div class="detail-label">Status</div><div class="detail-value"><span class="status-badge ${statusClass}">${o.status}</span></div></div>
        <div><div class="detail-label">Quantity</div><div class="detail-value">${o.quantity || '-'}</div></div>
        <div><div class="detail-label">Priority</div><div class="detail-value"><span class="priority-pill ${priorityClass}">${o.priority || 'Normal'}</span></div></div>
        ${canSeeSensitiveData && o.date_needed ? `<div><div class="detail-label">Date Needed</div><div class="detail-value">${formatDate(o.date_needed)}</div></div>` : ''}
        <div><div class="detail-label">Expected Delivery</div><div class="detail-value">${o.expected_delivery_date ? formatDate(o.expected_delivery_date) : '-'}</div></div>`;
    
    // ⭐ NEW: Show delivered date if available
    if (deliveredDate) {
        html += `<div><div class="detail-label">Delivered Date</div><div class="detail-value">${formatDate(deliveredDate)}</div></div>`;
    } else {
        html += `<div><div class="detail-label">Delivery Status</div><div class="detail-value">${getDeliveryBadgeHtml(deliveryStatus)}</div></div>`;
    }
    
    html += `<div><div class="detail-label">Requester</div><div class="detail-value">${o.requester_name}</div></div>`;
    
    // ⭐ HIDE SUPPLIER AND PRICES FROM REQUESTERS
    if (canSeeSensitiveData) {
        html += `
        <div><div class="detail-label">Supplier</div><div class="detail-value">${o.supplier_name || '-'}</div></div>
        <div><div class="detail-label">Unit Price</div><div class="detail-value">${fmtPrice(o.unit_price)}</div></div>
        <div><div class="detail-label">Total Price</div><div class="detail-value">${fmtPrice(o.total_price)}</div></div>`;
    }
    
    html += `</div>`;

    // ⭐ Item Description with inline edit for admin/procurement
    const _editBtn = canSeeSensitiveData
        ? '<button onclick="openDescriptionEditor(' + o.id + ')"' +
          ' style="background:none;border:1px solid #2a4a7a;color:#8bb4d8;border-radius:6px;padding:2px 10px;font-size:0.72rem;cursor:pointer;"' +
          ' title="Коригирай описание">✎ Коригирай</button>'
        : '';
    html += '<div class="detail-section-title" style="display:flex;align-items:center;justify-content:space-between;">'
        + '<span>Item Description</span>' + _editBtn + '</div>'
        + '<div id="desc-view-' + o.id + '" class="text-muted mt-1">' + escapeHtml(o.item_description) + '</div>'
        + '<div id="desc-editor-' + o.id + '" style="display:none;margin-top:8px;">'
        + '<textarea id="desc-text-' + o.id + '" rows="3"'
        + ' style="width:100%;background:#0f1923;color:#e2e8f0;border:1px solid #2a4a7a;border-radius:6px;padding:8px;font-size:0.85rem;resize:vertical;">'
        + escapeHtml(o.item_description) + '</textarea>'
        + '<div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">'
        + '<button onclick="saveDescriptionCorrection(' + o.id + ')"'
        + ' style="background:#e8682a;color:#fff;border:none;padding:0.3rem 1rem;border-radius:6px;font-size:0.82rem;cursor:pointer;">✓ Запази</button>'
        + '<button onclick="cancelDescriptionEdit(' + o.id + ')"'
        + ' style="background:#1e2d3d;color:#8bb4d8;border:1px solid #2a4a7a;padding:0.3rem 1rem;border-radius:6px;font-size:0.82rem;cursor:pointer;">✕ Откажи</button>'
        + '<span id="desc-status-' + o.id + '" style="font-size:0.75rem;color:#7a9bbf;align-self:center;"></span>'
        + '</div>'
        + '<div style="font-size:0.72rem;color:#4a7a9b;margin-top:4px;">🧠 AI ще генерира псевдоними на фон. Името се запазва в речника за бъдещи AI предложения.</div>'
        + '</div>';

    if (o.part_number || o.category) {
        html += '<div class="detail-grid mt-1">';
        if (o.part_number) html += `<div><div class="detail-label">Part Number</div><div class="detail-value">${escapeHtml(o.part_number)}</div></div>`;
        if (o.category) html += `<div><div class="detail-label">Category</div><div class="detail-value">${escapeHtml(o.category)}</div></div>`;
        html += '</div>';
    }

    if (o.notes) {
        html += `<div class="detail-section-title mt-1">Notes</div><div class="text-muted mt-1">${escapeHtml(o.notes)}</div>`;
    }

    // ⭐ NEW: Supplier Notes & Alternative Product (read-only display for admin/procurement)
    if (canSeeSensitiveData) {
        if (o.supplier_notes) {
            html += '<div class="detail-section-title mt-1">Supplier Notes</div><div class="text-muted mt-1">' + escapeHtml(o.supplier_notes) + '</div>';
        }
        if (o.alternative_product_name || o.alternative_product_description) {
            html += '<div class="detail-section-title mt-1">Alternative Product</div>';
            if (o.alternative_product_name) {
                html += '<div class="text-muted mt-1"><strong>Name:</strong> ' + escapeHtml(o.alternative_product_name) + '</div>';
            }
            if (o.alternative_product_description) {
                html += '<div class="text-muted mt-1"><strong>Description:</strong> ' + escapeHtml(o.alternative_product_description) + '</div>';
            }
        }
    }

    // ⭐ KEEP ATTACHMENTS VISIBLE TO REQUESTERS (these are files they uploaded!)
    html += '<div class="detail-section-title mt-2">Attachments</div>';
    if (o.files && o.files.length) {
        html += '<ul class="file-list">';
        for (const f of o.files) {
            const url = f.file_path.replace('./', '/');
            html += `<li><a class="file-link" href="${url}" target="_blank" rel="noopener">${escapeHtml(f.file_name)}</a><span class="text-muted">${formatFileSize(f.file_size)}</span></li>`;
        }
        html += '</ul>';
    } else {
        html += '<div class="text-muted mt-1">No attachments.</div>';
    }

    if (currentUser.role !== 'requester' && currentUser.role !== 'manager' && o.history && o.history.length) {
        html += '<div class="detail-section-title mt-2">History</div>';
        html += '<div class="text-muted" style="max-height: 120px; overflow-y: auto; font-size: 0.78rem;">';
        for (const h of o.history) {
            html += `<div>[${formatDateTime(h.changed_at)}] <strong>${escapeHtml(h.changed_by)}</strong> changed <strong>${escapeHtml(h.field_name)}</strong> from "${escapeHtml(h.old_value || '')}" to "${escapeHtml(h.new_value || '')}"</div>`;
        }
        html += '</div>';
    }

    // ⭐ NEW: Phase 1 - Smart Supplier Suggestions (BEFORE Update Order section)
    if (currentUser.role === 'admin' || currentUser.role === 'procurement') {
        html += '<hr class="mt-2" style="border-color: rgba(31,41,55,0.9); margin-bottom: 0.6rem;">';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">';
        html += '<div>';
        html += '<div class="detail-section-title" style="margin:0;">💡 Suggested Suppliers</div>';
        html += '<div style="font-size:0.75rem;color:#94a3b8;margin-top:0.2rem;">AI-powered recommendations based on item description and history</div>';
        html += '</div>';
        
        // Option to open full supplier selector
        if (typeof openSupplierSelector === 'function') {
            html += '<button class="btn btn-secondary btn-sm" onclick="openSupplierSelector(' + o.id + ', ' + (o.supplier_id || 'null') + ')" style="white-space:nowrap;">🏢 Browse All</button>';
        }
        
        html += '</div>';
        
        // ⭐ FIX: Container is now OUTSIDE the flex wrapper, on its own line
        html += '<div id="supplierSuggestionsContainer"></div>';
    }

    // ═══ DELIVERY PROOF TAB (all roles can see, admin/proc can upload) ═══
    const isDelivered = ['Delivered', 'Partially Delivered'].includes(o.status);
    const canUploadProof = currentUser.role === 'admin' || currentUser.role === 'procurement';

    html += '<hr class="mt-2" style="border-color: rgba(31,41,55,0.9); margin-bottom: 0.6rem;">';
    html += '<div class="detail-section-title" style="display:flex;align-items:center;justify-content:space-between;">';
    html += '<span>📷 Delivery Proof</span>';
    if (canUploadProof) {
        html += '<button class="btn btn-secondary btn-sm" id="btnUploadProofTrigger">⬆ Upload Photo / File</button>';
    }
    html += '</div>';

    // Hidden upload form (admin/proc only)
    if (canUploadProof) {
        html += `<div id="proofUploadForm" style="display:none;margin-top:0.75rem;padding:1rem;background:#1e293b;border-radius:8px;border:1px solid #334155;">
            <div class="form-group">
                <label style="font-size:0.8rem;">Select photo(s) or document(s)</label>
                <input type="file" id="proofFileInput" multiple accept="image/*,application/pdf,.doc,.docx"
                       style="display:block;width:100%;margin-top:0.4rem;font-size:0.85rem;color:#94a3b8;">
            </div>
            <div class="form-group">
                <label style="font-size:0.8rem;">Note (optional)</label>
                <input type="text" id="proofNoteInput" class="form-control form-control-sm" placeholder="e.g. Partial delivery, 3 of 5 items received">
            </div>
            <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                <button class="btn btn-primary btn-sm" id="btnSubmitProof">Upload</button>
                <button class="btn btn-secondary btn-sm" id="btnCancelProof">Cancel</button>
            </div>
            <div id="proofUploadStatus" style="margin-top:0.5rem;font-size:0.8rem;"></div>
        </div>`;
    }

    // Gallery container (populated async)
    html += '<div id="od-proof" style="margin-top:0.75rem;"><div class="text-muted" style="font-size:0.85rem;">Loading delivery proof files…</div></div>';

    // ═══ ALL DOCUMENTS SECTION (admin/proc/cad only) ═══
    if (currentUser.role !== 'requester') {
        html += '<hr class="mt-2" style="border-color: rgba(31,41,55,0.9); margin-bottom: 0.6rem;">';
        html += '<div class="detail-section-title">📄 All Order Documents</div>';
        html += '<div id="od-docs" style="margin-top:0.5rem;"><div class="text-muted" style="font-size:0.85rem;">Loading documents…</div></div>';
    }

    // Only admin/procurement can edit orders
    if (currentUser.role === 'admin' || currentUser.role === 'procurement') {
        html += '<hr class="mt-2" style="border-color: rgba(31,41,55,0.9); margin-bottom: 0.6rem;">';
        html += '<div class="detail-section-title">Update Order</div>';
        html += `<div class="form-group mt-1"><label>Status</label><select id="detailStatus" class="form-control form-control-sm">${ORDER_STATUSES.map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>`;
        
        // ⭐ REPLACE SUPPLIER DROPDOWN WITH BUTTON
        html += `<div class="form-group">
            <label>Supplier</label>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <input type="text" id="detailSupplierDisplay" class="form-control form-control-sm" value="${o.supplier_name || 'No supplier selected'}" readonly style="flex: 1; background: #0f172a; cursor: pointer;" />
                <button id="btnSelectSupplier" class="btn btn-primary btn-sm" style="white-space: nowrap;">🏢 Select</button>
            </div>
        </div>`;
        
        html += `<div class="detail-grid"><div><div class="form-group"><label>Expected Delivery</label><input type="date" id="detailExpected" class="form-control form-control-sm date-picker" value="${o.expected_delivery_date ? o.expected_delivery_date.substring(0,10) : ''}"></div></div><div><div class="form-group"><label>Unit Price</label><input type="number" step="0.01" id="detailUnitPrice" class="form-control form-control-sm" value="${parseFloat(o.unit_price) || ''}"></div></div></div>`;
        html += `<div class="form-group"><label>Total Price</label><input type="number" step="0.01" id="detailTotalPrice" class="form-control form-control-sm" value="${parseFloat(o.total_price) || ''}"></div>`;
        html += `<div class="form-group"><label>Supplier Notes</label><textarea id="detailSupplierNotes" class="form-control form-control-sm" rows="2" placeholder="Internal notes about the supplier for this order">${o.supplier_notes || ''}</textarea></div>`;
        html += `<div class="form-group"><label>Alternative Product Name</label><input type="text" id="detailAltProductName" class="form-control form-control-sm" placeholder="Alternative product name" value="${escapeHtml(o.alternative_product_name || '')}"></div>`;
        html += `<div class="form-group"><label>Alternative Product Description</label><textarea id="detailAltProductDesc" class="form-control form-control-sm" rows="2" placeholder="Description of the alternative product">${o.alternative_product_description || ''}</textarea></div>`;
        html += `<div class="form-actions"><button id="btnSaveOrder" class="btn btn-primary btn-sm">Save</button></div>`;
    }

    // ⭐ Requester Cancel Order button — allowed on New, Pending, Quote Requested
    const REQUESTER_CANCELLABLE = ['New', 'Pending', 'Quote Requested'];
    // Building managers can cancel any non-terminal status
    const BM_CANCELLABLE = ['New', 'Pending', 'Quote Requested', 'Quote Received', 'Approved', 'Ordered'];

    const isThisUserBM = currentUser.isBuildingManager && currentUser.managedBuilding;
    const isOrderInMyBuilding = isThisUserBM && (o.building === currentUser.managedBuilding);

    if (currentUser.role === 'requester' && !isOrderInMyBuilding && REQUESTER_CANCELLABLE.includes(o.status)) {
        // Regular requester cancel (own orders only, limited statuses)
        html += '<hr class="mt-2" style="border-color: rgba(31,41,55,0.9); margin-bottom: 0.6rem;">';
        html += '<div class="detail-section-title" style="color:#f87171;">Отказ на заявка</div>';
        html += '<div class="text-muted mt-1" style="font-size:0.82rem;">Можете да откажете заявката, докато не е обработена. Действието е необратимо и ще бъде записано.</div>';
        html += '<div class="form-group mt-1"><label style="font-size:0.8rem;">Причина за отказ <span style="color:#f87171;">*</span></label>';
        html += '<textarea id="cancelReasonInput" class="form-control form-control-sm" rows="2" placeholder="напр. Вече не е нужно, намерена алтернатива..." style="margin-top:0.3rem;"></textarea></div>';
        html += '<div class="form-actions"><button id="btnCancelOrder" class="btn btn-sm" style="background:#dc2626;color:#fff;border:none;padding:0.4rem 1rem;">Откажи заявката</button></div>';
    }

    // ⭐ Building Manager cancel section — for orders in their building, any non-terminal status
    if (isOrderInMyBuilding && BM_CANCELLABLE.includes(o.status)) {
        html += '<hr class="mt-2" style="border-color: rgba(31,41,55,0.9); margin-bottom: 0.6rem;">';
        html += '<div class="detail-section-title" style="color:#f87171;">Отказ на заявка (Мениджър)</div>';
        html += `<div class="text-muted mt-1" style="font-size:0.82rem;">Като мениджър на сграда <strong>${currentUser.managedBuilding}</strong> можете да откажете тази заявка. Действието е необратимо и ще бъде записано.</div>`;
        html += '<div class="form-group mt-1"><label style="font-size:0.8rem;">Причина за отказ <span style="color:#f87171;">*</span></label>';
        html += '<textarea id="bmCancelReasonInput" class="form-control form-control-sm" rows="2" placeholder="напр. Дублираща заявка, грешен артикул, поръчката е спряна..." style="margin-top:0.3rem;"></textarea></div>';
        html += '<div class="form-actions"><button id="btnBmCancelOrder" class="btn btn-sm" style="background:#dc2626;color:#fff;border:none;padding:0.4rem 1rem;">Откажи заявката</button></div>';
    }

    const _odb = orderDetailBody || document.getElementById('orderDetailBody');
    if (!_odb) { console.error('[renderOrderDetail] orderDetailBody element not found in DOM'); return; }
    _odb.innerHTML = html;

    // ⭐ NEW: Load supplier suggestions (Phase 1)
    if ((currentUser.role === 'admin' || currentUser.role === 'procurement') && 
        typeof loadSupplierSuggestions === 'function') {
        loadSupplierSuggestions(o.id, o.supplier_id);
    }

    // ═══ Load delivery proof gallery async ═══
    loadDeliveryProof(o.id);

    // ═══ Load all documents async (non-requester only) ═══
    if (currentUser.role !== 'requester') {
        loadOrderDocuments(o.id);
    }

    // ═══ Wire proof upload toggle ═══
    const btnUploadTrigger = document.getElementById('btnUploadProofTrigger');
    const proofForm = document.getElementById('proofUploadForm');
    if (btnUploadTrigger && proofForm) {
        btnUploadTrigger.addEventListener('click', () => {
            proofForm.style.display = proofForm.style.display === 'none' ? 'block' : 'none';
        });
    }
    const btnCancelProof = document.getElementById('btnCancelProof');
    if (btnCancelProof && proofForm) {
        btnCancelProof.addEventListener('click', () => { proofForm.style.display = 'none'; });
    }
    const btnSubmitProof = document.getElementById('btnSubmitProof');
    if (btnSubmitProof) {
        btnSubmitProof.addEventListener('click', () => uploadDeliveryProof(o.id));
    }

    // ⭐ ATTACH SUPPLIER SELECTOR BUTTON
    const btnSelectSupplier = document.getElementById('btnSelectSupplier');
    if (btnSelectSupplier && typeof openSupplierSelector === 'function') {
        btnSelectSupplier.addEventListener('click', () => {
            openSupplierSelector(o.id, o.supplier_id);
        });
    }

    const btnSave = document.getElementById('btnSaveOrder');
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const payload = {
                status: document.getElementById('detailStatus').value,
                supplier_id: o.supplier_id || null, // Keep current supplier_id (updated by modal)
                expected_delivery_date: document.getElementById('detailExpected').value || null,
                unit_price: parseFloat(document.getElementById('detailUnitPrice').value || 0) || null,
                total_price: parseFloat(document.getElementById('detailTotalPrice').value || 0) || null,
                supplier_notes: document.getElementById('detailSupplierNotes') ? document.getElementById('detailSupplierNotes').value || null : null,
                alternative_product_name: document.getElementById('detailAltProductName') ? document.getElementById('detailAltProductName').value || null : null,
                alternative_product_description: document.getElementById('detailAltProductDesc') ? document.getElementById('detailAltProductDesc').value || null : null
            };
            const res = await apiPut(`/orders/${o.id}`, payload);
            if (res.success) { alert('Order updated'); currentPage = 1; loadOrders(); openOrderDetail(o.id); } // ⭐ FIX: reset pagination after update
            else { alert('Failed to update order: ' + (res.message || 'Unknown error')); }
        });
    }

    // ⭐ Wire requester Cancel Order button
    const btnCancelOrder = document.getElementById('btnCancelOrder');
    if (btnCancelOrder) {
        btnCancelOrder.addEventListener('click', async () => {
            const reason = (document.getElementById('cancelReasonInput')?.value || '').trim();
            if (!reason) {
                alert('Моля, въведете причина за отказ.');
                return;
            }
            if (!confirm(`Откажи заявка #${o.id}? Действието е необратимо.`)) return;
            btnCancelOrder.disabled = true;
            btnCancelOrder.textContent = 'Отказване…';
            const res = await apiPost(`/orders/${o.id}/cancel`, { reason });
            if (res.success) {
                alert('Заявката беше отказана успешно.');
                // Close panel and refresh
                orderDetailPanel.classList.add('hidden');
                document.getElementById('orderDetailBackdrop')?.classList.add('hidden');
                loadOrders();
            } else {
                alert('Грешка при отказ: ' + (res.message || 'Unknown error'));
                btnCancelOrder.disabled = false;
                btnCancelOrder.textContent = 'Откажи заявката';
            }
        });
    }

    // ⭐ Wire building manager Cancel Order button
    const btnBmCancelOrder = document.getElementById('btnBmCancelOrder');
    if (btnBmCancelOrder) {
        btnBmCancelOrder.addEventListener('click', async () => {
            const reason = (document.getElementById('bmCancelReasonInput')?.value || '').trim();
            if (!reason) {
                alert('Моля, въведете причина за отказ.');
                return;
            }
            if (!confirm(`Откажи заявка #${o.id} като мениджър на сграда? Действието е необратимо.`)) return;
            btnBmCancelOrder.disabled = true;
            btnBmCancelOrder.textContent = 'Отказване…';
            const res = await apiPost(`/orders/${o.id}/cancel-by-manager`, { reason });
            if (res.success) {
                alert('Заявката беше отказана успешно.');
                orderDetailPanel.classList.add('hidden');
                document.getElementById('orderDetailBackdrop')?.classList.add('hidden');
                loadOrders();
            } else {
                alert('Грешка при отказ: ' + (res.message || 'Unknown error'));
                btnBmCancelOrder.disabled = false;
                btnBmCancelOrder.textContent = 'Откажи заявката';
            }
        });
    }
}

// ===================== QUOTES =====================

async function loadQuotes() {
    try {
        const res = await apiGet('/quotes');
        if (res.success) { quotesState = res.quotes; renderQuotesTable(); }
    } catch { if (quotesTable) quotesTable.innerHTML = '<p>Failed to load quotes.</p>'; }
}

function renderQuotesTable() {
    if (!quotesTable) return;
    if (!quotesState.length) { quotesTable.innerHTML = '<p class="text-muted">No quotes yet.</p>'; return; }
    let html = '<div class="table-wrapper"><table><thead><tr><th>Quote #</th><th>Supplier</th><th>Status</th><th>Items</th><th>Total</th><th>Valid Until</th><th>Created</th><th></th></tr></thead><tbody>';
    for (const q of quotesState) {
        const isSent = q.status === 'Sent to Supplier';
        const sentBadge = isSent
            ? '<span class="quote-sent-badge sent">✓ Sent</span>'
            : '<span class="quote-sent-badge not-sent">● Pending</span>';
        html += `<tr data-id="${q.id}">
            <td>${q.quote_number}</td>
            <td>${q.supplier_name || '-'}</td>
            <td>${q.status}</td>
            <td>${q.item_count || 0}</td>
            <td class="text-right">${fmtPrice(q.total_amount)}</td>
            <td>${q.valid_until ? formatDate(q.valid_until) : '-'}</td>
            <td>${formatDateTime(q.created_at)}</td>
            <td style="display:flex;gap:0.4rem;align-items:center;">
                ${sentBadge}
                <button class="btn btn-secondary btn-sm btn-view-quote" data-id="${q.id}">View</button>
                <button class="btn btn-primary btn-sm btn-send-quote" data-id="${q.id}" title="Compose &amp; Send">📧</button>
            </td>
        </tr>`;
    }
    html += '</tbody></table></div>';
    quotesTable.innerHTML = html;
    document.querySelectorAll('.btn-view-quote').forEach(btn => {
        btn.addEventListener('click', () => openQuoteDetail(parseInt(btn.dataset.id, 10)));
    });
    // ⭐ Send email button
    document.querySelectorAll('.btn-send-quote').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof openQuoteSendPanel === 'function') {
                openQuoteSendPanel(parseInt(btn.dataset.id, 10));
            }
        });
    });
}

async function openQuoteDetail(id) {
    try {
        const res = await apiGet(`/quotes/${id}`);
        if (!res.success) return;
        renderQuoteDetail(res.quote);
        quoteDetailPanel.classList.remove('hidden');
    } catch { alert('Failed to load quote details'); }
}

function renderQuoteDetail(q) {
    let html = `<div class="detail-grid"><div><div class="detail-label">Quote #</div><div class="detail-value">${q.quote_number}</div></div><div><div class="detail-label">Status</div><div class="detail-value">${q.status}</div></div><div><div class="detail-label">Supplier</div><div class="detail-value">${q.supplier_name || '-'}</div></div><div><div class="detail-label">Valid Until</div><div class="detail-value">${q.valid_until ? formatDate(q.valid_until) : '-'}</div></div><div><div class="detail-label">Total Amount</div><div class="detail-value">${fmtPrice(q.total_amount)}</div></div><div><div class="detail-label">Currency</div><div class="detail-value">${q.currency}</div></div></div>`;
    if (q.notes) html += `<div class="detail-section-title mt-1">Notes</div><div class="text-muted mt-1">${escapeHtml(q.notes)}</div>`;
    if (q.items && q.items.length) {
        html += '<div class="detail-section-title mt-2">Items</div><div class="table-wrapper"><table><thead><tr><th>Order</th><th>Building</th><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>';
        for (const it of q.items) html += `<tr><td>#${it.order_id}</td><td>${it.building}</td><td>${escapeHtml(it.item_description.substring(0,40))}${it.item_description.length>40?'…':''}</td><td>${it.quantity}</td><td class="text-right">${fmtPrice(it.unit_price)}</td><td class="text-right">${fmtPrice(it.total_price)}</td></tr>`;
        html += '</tbody></table></div>';
    }
    
    // ⭐ ADD SUBMIT FOR APPROVAL BUTTON (for admin/procurement only)
    if ((currentUser.role === 'admin' || currentUser.role === 'procurement') && 
        (q.status === 'Draft' || q.status === 'Received')) {
        html += `
            <hr class="mt-2" style="border-color: rgba(31,41,55,0.9); margin-bottom: 0.6rem;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
                <div>
                    <div class="detail-section-title" style="margin:0;">Approval Workflow</div>
                    <div style="font-size:0.75rem;color:#94a3b8;margin-top:0.2rem;">Submit this quote to a manager for approval</div>
                </div>
                <button id="btnSubmitForApproval" class="btn btn-primary btn-sm" style="white-space:nowrap;" data-quote-id="${q.id}">
                    📋 Submit for Approval
                </button>
            </div>
        `;
    }
    
    // ⭐ Smart Send Button (admin/procurement only)
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'procurement')) {
        html += `
            <div style="margin: 0.75rem 0;">
                <button id="btnOpenSendPanel" class="btn btn-primary btn-sm" style="width:100%;"
                    data-quote-id="${q.id}">
                    📧 Compose &amp; Send Email
                </button>
            </div>
        `;
    }

    html += '<div class="detail-section-title mt-2">Update Quote</div>';
    html += `<div class="form-group mt-1"><label>Status</label><select id="quoteStatus" class="form-control form-control-sm">${['Draft','Sent to Supplier','Received','Under Approval','Approved','Rejected'].map(s => `<option value="${s}" ${s===q.status?'selected':''}>${s}</option>`).join('')}</select></div>`;
    html += `<div class="form-group mt-1"><label>Notes</label><textarea id="quoteNotes" class="form-control form-control-sm" rows="2">${q.notes || ''}</textarea></div>`;
    html += '<div class="form-actions"><button id="btnSaveQuote" class="btn btn-primary btn-sm">Save</button></div>';
    quoteDetailBody.innerHTML = html;

    // ⭐ Attach Smart Send Panel button
    const btnOpenSend = document.getElementById('btnOpenSendPanel');
    if (btnOpenSend && typeof openQuoteSendPanel === 'function') {
        btnOpenSend.addEventListener('click', () => {
            openQuoteSendPanel(parseInt(btnOpenSend.dataset.quoteId, 10));
        });
    }
    
    // Attach submit for approval button handler
    const btnSubmitApproval = document.getElementById('btnSubmitForApproval');
    if (btnSubmitApproval && typeof openSubmitForApprovalDialog === 'function') {
        btnSubmitApproval.addEventListener('click', () => {
            const quoteId = parseInt(btnSubmitApproval.dataset.quoteId, 10);
            openSubmitForApprovalDialog(quoteId);
        });
    }
    
    document.getElementById('btnSaveQuote').addEventListener('click', async () => {
        const payload = { status: document.getElementById('quoteStatus').value, notes: document.getElementById('quoteNotes').value };
        const res = await apiPut(`/quotes/${q.id}`, payload);
        if (res.success) { alert('Quote updated'); loadQuotes(); } else { alert('Failed to update quote'); }
    });
}

function openCreateQuoteDialog() {
    if (!selectedOrderIds.size) {
        switchTab('ordersTab');
        alert('Select one or more orders first, then click "Create Quote from Selected"');
        return;
    }

    // Populate the createQuoteModal fields
    const modal = document.getElementById('createQuoteModal');
    if (!modal) return;

    // Fill supplier dropdown
    const supplierSel = document.getElementById('cqSupplier');
    if (supplierSel) {
        supplierSel.innerHTML = '<option value="">Select supplier</option>' +
            suppliersState.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    }

    // Show selected order count
    const orderCountEl = document.getElementById('cqOrderCount');
    if (orderCountEl) orderCountEl.textContent = selectedOrderIds.size;

    // Reset other fields
    const notesEl = document.getElementById('cqNotes');
    if (notesEl) notesEl.value = '';
    const currencyEl = document.getElementById('cqCurrency');
    if (currencyEl) currencyEl.value = 'EUR';
    const validEl = document.getElementById('cqValidUntil');
    if (validEl) validEl.value = '';

    // Show modal
    modal.classList.remove('hidden');
}

function closeCreateQuoteModal() {
    const modal = document.getElementById('createQuoteModal');
    if (modal) modal.classList.add('hidden');
}

async function handleCreateQuote(e) {
    e.preventDefault();
    const orders = ordersState.filter(o => selectedOrderIds.has(o.id));
    const supplierId = document.getElementById('cqSupplier')?.value;
    if (!supplierId) { alert('Please select a supplier'); return; }

    const body = {
        supplier_id: parseInt(supplierId, 10),
        order_ids: orders.map(o => o.id),
        notes: document.getElementById('cqNotes')?.value || null,
        currency: document.getElementById('cqCurrency')?.value || 'EUR',
        valid_until: document.getElementById('cqValidUntil')?.value || null
    };

    const res = await apiPost('/quotes', body);
    if (res.success) {
        closeCreateQuoteModal();
        selectedOrderIds.clear();
        updateSelectionUi();
        loadOrders();
        loadQuotes();
        // ⭐ Open Smart Send Panel immediately
        if (typeof openQuoteSendPanel === 'function') {
            openQuoteSendPanel(res.quoteId);
        } else {
            alert('Quote ' + res.quoteNumber + ' created');
        }
    } else {
        alert('Failed to create quote: ' + (res.message || 'Unknown error'));
    }
}

// ===================== BUILDINGS =====================

async function loadBuildings() {
    try {
        const res = await apiGet('/buildings');
        if (res.success) {
            buildingsState = res.buildings;
            window._cachedBuildings = res.buildings; // ⭐ cache for supplier group filter
            populateBuildingSelects();
            if (currentUser && currentUser.role === 'admin') { renderBuildingsTable(); }
        }
    } catch (err) {
        console.error('loadBuildings error:', err);
        if (buildingsTable) buildingsTable.innerHTML = '<p>Failed to load buildings.</p>';
    }
}

function populateBuildingSelects() {
    if (buildingSelect) {
        buildingSelect.innerHTML = '<option value="">Select Building</option>' +
            buildingsState.filter(b => b.active).map(b => `<option value="${b.code}">${escapeHtml(b.code)} - ${escapeHtml(b.name)}</option>`).join('');
        if (currentUser && currentUser.role === 'requester') {
            buildingSelect.value = currentUser.building;
            buildingSelect.disabled = true;
        }
    }
    if (userBuildingSelect) {
        userBuildingSelect.innerHTML = '<option value="">None</option>' +
            buildingsState.filter(b => b.active).map(b => `<option value="${b.code}">${escapeHtml(b.code)} - ${escapeHtml(b.name)}</option>`).join('');
    }
    if (filterBuilding) {
        const currentVal = filterBuilding.value;
        filterBuilding.innerHTML = '<option value="">Building: All</option>' +
            buildingsState.filter(b => b.active).map(b => `<option value="${b.code}">${escapeHtml(b.code)} - ${escapeHtml(b.name)}</option>`).join('');
        if (currentVal) filterBuilding.value = currentVal;
    }
}


// ── Requester Dashboard Functions ─────────────────────────────────────────────

function getDeliveryCountdown(order) {
    // Status-based message takes priority over date countdown
    if (order.status === 'Delivered') return '<span class="req-countdown cnt-delivered">&#10003; Delivered</span>';
    if (order.status === 'Cancelled') return '<span class="req-countdown cnt-none">Cancelled</span>';
    if (order.status === 'On Hold') return '<span class="req-countdown cnt-none">On Hold</span>';
    if (order.status === 'In Transit') return '<span class="req-countdown cnt-transit">&#128666; In Transit</span>';
    if (order.status === 'Partially Delivered') return '<span class="req-countdown cnt-transit">&#128230; Partial</span>';
    // Priority-based urgency label (replaces date countdown since date_needed removed)
    const pri = order.priority || 'Normal';
    if (pri === 'Urgent') return '<span class="req-countdown cnt-late">&#9888; Urgent</span>';
    if (pri === 'High') return '<span class="req-countdown cnt-due7">High Priority</span>';
    if (pri === 'Normal') return '<span class="req-countdown cnt-ok">Normal</span>';
    return '<span class="req-countdown cnt-none">' + pri + '</span>';
}

function getStepperHtml(status) {
    const _ss = {'New':1,'Pending':1,'Pending CAD':1,'Quote Requested':2,'Quote Received':2,'Quote Under Approval':2,'Approved':3,'Ordered':4,'In Transit':5,'Partially Delivered':5,'Delivered':6,'Cancelled':0,'On Hold':0};
    const _sl = ['','New','Quote','Appr.','Ordered','Transit','Done'];
    const _sc = _ss[status] || 0;
    if (_sc === 0) return '<span style="font-size:.72rem;color:#94a3b8">' + escapeHtml(status) + '</span>';
    let _sh = '<div class="req-stepper">';
    for (let _si = 1; _si <= 6; _si++) {
        if (_si > 1) _sh += '<div class="req-step-line' + (_si <= _sc ? ' done' : '') + '"></div>';
        const _scls = _si < _sc ? 'done' : _si === _sc ? 'active' : '';
        _sh += '<div class="req-step ' + _scls + '" title="' + _sl[_si] + '">' + (_si < _sc ? '&#10003;' : _si) + '</div>';
    }
    return _sh + '</div>';
}

function renderCardOrders(activeOrders, oldDelivered) {
    if (!activeOrders.length && !oldDelivered.length) {
        ordersTable.innerHTML = '<div style="text-align:center;padding:3rem 1rem;"><div style="font-size:3rem;margin-bottom:1rem;">&#128230;</div><div style="color:#94a3b8;font-size:1rem;">No orders yet. Create your first order above.</div></div>';
        return;
    }
    const _ca = [...activeOrders, ...oldDelivered];
    let _ch = '<div class="req-cards-grid">';
    for (const _co of _ca) {
        // Use correct snake_case field names from API
        const itemDesc = _co.item_description || _co.itemdescription || '—';
        const submittedDate = _co.submission_date || _co.createdat;
        const costCenter = _co.cost_center_name || _co.costcentercode || _co.costcentername || '';
        const priority = _co.priority || 'Normal';
        const status = _co.status || 'New';

        // Card border accent by status
        const _cbc = status === 'Delivered' ? 'card-delivered'
            : status === 'Cancelled' ? 'card-cancelled'
            : status === 'On Hold' ? 'card-onhold'
            : priority === 'Urgent' ? 'card-late'
            : priority === 'High' ? 'card-due7'
            : 'card-ontrack';

        // Priority pill colors
        const _cpc = {Urgent:'background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3)',High:'background:rgba(249,115,22,.15);color:#fb923c;border:1px solid rgba(249,115,22,.3)',Normal:'background:rgba(59,130,246,.12);color:#60a5fa;border:1px solid rgba(59,130,246,.25)',Low:'background:rgba(100,116,139,.12);color:#94a3b8;border:1px solid rgba(100,116,139,.2)'};
        const _cps = _cpc[priority] || _cpc.Normal;
        const _cti = itemDesc.length > 60 ? itemDesc.substring(0,60)+'...' : itemDesc;
        const _cod = submittedDate ? new Date(submittedDate).toLocaleDateString('bg-BG') : '—';
        const hasFiles = (_co.files && _co.files.length) ? _co.files.length : 0;

        _ch += '<div class="req-order-card ' + _cbc + '" onclick="openOrderDetail(' + _co.id + ')" style="cursor:pointer;">';

        // Header row: ID + priority pill
        _ch += '<div class="req-card-header">';
        _ch += '<span class="req-card-id">#' + _co.id + (costCenter ? ' &middot; ' + escapeHtml(costCenter) : '') + '</span>';
        _ch += '<span class="req-card-priority" style="' + _cps + ';font-size:.68rem;padding:.15rem .5rem;border-radius:20px;font-weight:700;">' + escapeHtml(priority) + '</span>';
        _ch += '</div>';

        // Item description
        _ch += '<div class="req-card-title">' + escapeHtml(_cti) + '</div>';

        // Meta: qty + submitted
        _ch += '<div class="req-card-meta">Qty: <strong>' + (_co.quantity||1) + '</strong> &nbsp;&middot;&nbsp; ' + _cod + '</div>';

        // Status stepper
        _ch += getStepperHtml(status);

        // Cancellation reason snippet (only for cancelled orders)
        if (status === 'Cancelled' && _co.cancellation_reason) {
            const reasonSnippet = _co.cancellation_reason.length > 80
                ? _co.cancellation_reason.substring(0, 80) + '…'
                : _co.cancellation_reason;
            _ch += `<div style="margin-top:.5rem;padding:.4rem .6rem;background:rgba(220,38,38,.08);border-left:3px solid #dc2626;border-radius:0 4px 4px 0;font-size:.72rem;color:#f87171;">
                <strong>Reason:</strong> ${escapeHtml(reasonSnippet)}
            </div>`;
        }

        // Footer: status badge + reorder button
        _ch += '<div style="margin-top:.6rem;display:flex;justify-content:space-between;align-items:center;gap:.5rem;">';
        _ch += getDeliveryCountdown(_co);
        _ch += '<div style="display:flex;align-items:center;gap:.4rem;">';
        if (hasFiles) _ch += '<span style="font-size:.72rem;color:#64748b;">&#128206;' + hasFiles + '</span>';
        // Quick reorder button — hidden for cancelled orders
        if (status !== 'Cancelled') {
            _ch += '<button class="req-reorder-btn" onclick="event.stopPropagation();quickReorder(' + _co.id + ')" title="Reorder this item">&#x21BA; Reorder</button>';
        }
        _ch += '</div></div>';

        _ch += '</div>'; // end card
    }
    _ch += '</div>';
    ordersTable.innerHTML = _ch;
}

// Quick-reorder: pre-fill create order form with data from an existing order
window.quickReorder = function(orderId) {
    const o = ordersState.find(x => x.id === orderId);
    if (!o) return;

    // Switch to requester view and scroll to create form
    const createSection = document.getElementById('createOrderSection') || document.getElementById('createOrderCard');
    if (createSection) {
        createSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Pre-fill fields
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
    setVal('itemDescription', o.item_description || '');
    setVal('partNumber', o.part_number || '');
    setVal('category', o.category || '');
    setVal('quantity', o.quantity || 1);
    setVal('priority', o.priority || 'Normal');
    setVal('notes', o.notes || '');

    // Pre-select cost center radio if building matches
    if (o.cost_center_id) {
        // Ensure the correct building is selected first
        if (buildingSelect && o.building) {
            buildingSelect.value = o.building;
            renderCostCenterRadios(o.building);
            // Small delay to let radios render, then select
            setTimeout(() => {
                const radio = document.querySelector('input[name="costCenter"][value="' + o.cost_center_id + '"]');
                if (radio) radio.checked = true;
            }, 80);
        }
    }

    // Toast-style notification
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);background:#1e3a5f;color:#f1f5f9;padding:0.6rem 1.25rem;border-radius:8px;font-size:0.85rem;font-weight:600;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,.4);border:1px solid #2d3e6b;';
    toast.textContent = 'Form pre-filled from order #' + orderId + ' — adjust and submit';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);

    // Re-run duplicate detection immediately after pre-fill
    setTimeout(() => {
        const descEl = document.getElementById('itemDescription');
        const pnEl   = document.getElementById('partNumber');
        if (descEl) _dupRender(descEl.value.trim(), pnEl ? pnEl.value.trim() : '');
    }, 120);
};

function renderRequesterDashboard(orders) {
    const _rc = document.getElementById('requesterDashboard');
    if (!_rc) return;
    const _rt = new Date(); _rt.setHours(0,0,0,0);
    // Active = not Delivered/Cancelled
    const _ra = orders.filter(o => o.status !== 'Delivered' && o.status !== 'Cancelled').length;
    // In Transit (includes Partially Delivered)
    const _rtr = orders.filter(o => o.status === 'In Transit' || o.status === 'Partially Delivered').length;
    // Late = no date_needed dependency; use priority-based logic (Urgent orders older than 5 days, High older than 10 days still not delivered)
    const _rl = orders.filter(o => {
        if (['Delivered','Cancelled'].includes(o.status)) return false;
        const ageDays = Math.floor((Date.now() - new Date(o.submission_date || o.created_at || 0)) / 86400000);
        if (o.priority === 'Urgent' && ageDays >= 5) return true;
        if (o.priority === 'High' && ageDays >= 10) return true;
        return false;
    });
    // Delivered this month — count by submission_date (order creation month)
    const _rdm = orders.filter(o => {
        if (o.status !== 'Delivered') return false;
        const _d = new Date(o.submission_date || o.created_at || 0);
        return _d.getMonth() === _rt.getMonth() && _d.getFullYear() === _rt.getFullYear();
    }).length;
    // Pending Approval = New orders waiting for procurement to act
    const _rpa = orders.filter(o => o.status === 'New').length;

    _rc.innerHTML =
        '<div class="req-kpi-strip">' +
        '<div class="req-kpi-card" onclick="window._kpiFilter(this.dataset.kpi)" data-kpi="active" id="kpiActive"><div class="req-kpi-icon">&#128230;</div><div class="req-kpi-count">' + _ra + '</div><div class="req-kpi-label">Active</div></div>' +
        '<div class="req-kpi-card kpi-transit" onclick="window._kpiFilter(this.dataset.kpi)" data-kpi="transit" id="kpiTransit"><div class="req-kpi-icon">&#128666;</div><div class="req-kpi-count">' + _rtr + '</div><div class="req-kpi-label">In Transit</div></div>' +
        '<div class="req-kpi-card kpi-late" onclick="window._kpiFilter(this.dataset.kpi)" data-kpi="late" id="kpiLate"><div class="req-kpi-icon">&#9888;</div><div class="req-kpi-count">' + _rl.length + '</div><div class="req-kpi-label">Overdue</div></div>' +
        '<div class="req-kpi-card kpi-delivered" onclick="window._kpiFilter(this.dataset.kpi)" data-kpi="delivered" id="kpiDelivered"><div class="req-kpi-icon">&#10003;</div><div class="req-kpi-count">' + _rdm + '</div><div class="req-kpi-label">Delivered (month)</div></div>' +
        '<div class="req-kpi-card kpi-pending" onclick="window._kpiFilter(this.dataset.kpi)" data-kpi="pending" id="kpiPending"><div class="req-kpi-icon">&#9203;</div><div class="req-kpi-count">' + _rpa + '</div><div class="req-kpi-label">Pending Approval</div></div>' +
        '</div>';

    const _rb = document.getElementById('requesterAttentionBanner');
    if (_rb) {
        // Stale New orders (>3 days) + overdue urgent/high
        const _rst = orders.filter(o => {
            if (o.status !== 'New' || !o.submission_date) return false;
            return Math.floor((Date.now() - new Date(o.submission_date)) / 86400000) >= 3;
        }).slice(0,3);
        const _rall = [..._rl.slice(0,5), ..._rst.filter(o => !_rl.find(x => x.id === o.id))];
        if (_rall.length) {
            _rb.style.display = '';
            _rb.innerHTML = '<div class="att-icon">&#9888;</div><div class="att-body"><div class="att-title">Needs Attention (' + _rall.length + ' orders)</div>' +
                _rall.map(o => '<span class="req-attention-item" onclick="openOrderDetail(' + o.id + ')">#' + o.id + ' ' + escapeHtml((o.item_description||'').substring(0,20)) + '...</span>').join('') +
                '</div>';
        } else { _rb.style.display = 'none'; }
    }
}

// _kpiFilter defined below with KPI drill-down panel support;

function renderBuildingsTable() {
    if (!buildingsTable) return;
    if (!buildingsState.length) { buildingsTable.innerHTML = '<p class="text-muted">No buildings yet.</p>'; return; }
    let html = '<div class="table-wrapper"><table><thead><tr><th>Code</th><th>Name</th><th>Active</th><th></th><th></th></tr></thead><tbody>';
    for (const b of buildingsState) {
        html += `<tr data-id="${b.id}"><td>${escapeHtml(b.code)}</td><td>${escapeHtml(b.name)}</td><td>${b.active ? 'Yes' : 'No'}</td><td><button class="btn btn-secondary btn-sm btn-edit-building" data-id="${b.id}">Edit</button></td><td><button class="btn btn-primary btn-sm btn-manage-managers" data-id="${b.id}" data-name="${escapeHtml(b.name)}">&#128101; Managers</button></td></tr>`;
    }
    html += '</tbody></table></div>';
    buildingsTable.innerHTML = html;
    document.querySelectorAll('.btn-edit-building').forEach(btn => {
        btn.addEventListener('click', () => { const b = buildingsState.find(x => x.id === parseInt(btn.dataset.id, 10)); if (b) openBuildingForm(b); });
    });
    document.querySelectorAll('.btn-manage-managers').forEach(btn => {
        btn.addEventListener('click', () => openBmPanel(parseInt(btn.dataset.id, 10), btn.dataset.name));
    });
}

// Building Managers panel
let _bmBuildingId = null;
let _bmAllUsers = [];

async function openBmPanel(buildingId, buildingName) {
    _bmBuildingId = buildingId;
    document.getElementById('bmBuildingLabel').textContent = buildingName;
    if (!_bmAllUsers.length) {
        const d = await apiGet('/users');
        _bmAllUsers = (d.users || []).filter(u => u.active);
    }
    await refreshBmList();
    document.getElementById('buildingManagersOverlay').style.display = '';
    document.getElementById('bmBackdrop').style.display = '';
}

async function refreshBmList() {
    const d = await apiGet('/buildings/' + _bmBuildingId + '/managers');
    const current = d.managers || [];
    const currentIds = new Set(current.map(m => m.id));
    document.getElementById('bmCurrentList').innerHTML = current.length
        ? current.map(m => '<div style="display:flex;justify-content:space-between;align-items:center;padding:.4rem 0;border-bottom:1px solid var(--border)"><span><strong>' + escapeHtml(m.name) + '</strong> <small style="color:var(--text-muted)">' + escapeHtml(m.email) + '</small></span><button class="btn btn-danger btn-sm" onclick="removeBmManager(' + m.id + ')">Remove</button></div>').join('')
        : '<p style="color:var(--text-muted);margin:0">No managers assigned yet.</p>';
    const sel = document.getElementById('bmUserSelect');
    sel.innerHTML = '<option value="">— select user —</option>' +
        _bmAllUsers.filter(u => !currentIds.has(u.id))
            .map(u => '<option value="' + u.id + '">' + escapeHtml(u.name) + ' (' + u.role + ')</option>').join('');
}

window.removeBmManager = async function(userId) {
    await apiDelete('/buildings/' + _bmBuildingId + '/managers/' + userId);
    await refreshBmList();
};

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('btnAddBmManager').addEventListener('click', async function() {
        const userId = document.getElementById('bmUserSelect').value;
        if (!userId) return;
        await apiPost('/buildings/' + _bmBuildingId + '/managers', { userId: parseInt(userId, 10) });
        await refreshBmList();
    });
    document.getElementById('btnCloseBmPanel').addEventListener('click', function() {
        document.getElementById('buildingManagersOverlay').style.display = 'none';
        document.getElementById('bmBackdrop').style.display = 'none';
    });
    document.getElementById('bmBackdrop').addEventListener('click', function() {
        document.getElementById('buildingManagersOverlay').style.display = 'none';
        document.getElementById('bmBackdrop').style.display = 'none';
    });
});

function openBuildingForm(building) {
    if (!buildingFormCard) return;
    if (building) {
        buildingFormTitle.textContent = 'Edit Building';
        buildingIdInput.value = building.id; buildingCodeInput.value = building.code || ''; buildingNameInput.value = building.name || ''; buildingDescriptionInput.value = building.description || ''; buildingActiveSelect.value = building.active ? '1' : '0';
    } else {
        buildingFormTitle.textContent = 'Create Building'; buildingForm.reset(); buildingIdInput.value = ''; buildingActiveSelect.value = '1';
    }
    buildingFormCard.hidden = false;
}

async function handleSaveBuilding(e) {
    e.preventDefault();
    const payload = { code: buildingCodeInput.value.trim(), name: buildingNameInput.value.trim(), description: buildingDescriptionInput.value.trim(), active: buildingActiveSelect.value === '1' };
    if (!payload.code || !payload.name) { alert('Code and name are required'); return; }
    const id = buildingIdInput.value;
    const res = id ? await apiPut(`/buildings/${id}`, payload) : await apiPost('/buildings', payload);
    if (res.success) { alert('Building saved'); buildingFormCard.hidden = true; loadBuildings(); loadCostCenters(); } else { alert('Failed to save building: ' + (res.message || 'Unknown error')); }
}

// ===================== USERS =====================

async function loadUsers() {
    try {
        const res = await apiGet('/users');
        if (res.success) { usersState = res.users; renderUsersTable(); }
    } catch (err) { console.error('loadUsers error:', err); usersTable.innerHTML = '<p>Failed to load users.</p>'; }
}

function renderUsersTable() {
    if (!usersState.length) { usersTable.innerHTML = '<p class="text-muted">No users yet.</p>'; return; }
    let html = '<div class="table-wrapper"><table><thead><tr><th>Username</th><th>Name</th><th>Email</th><th>Role</th><th>Building</th><th>Active</th><th></th></tr></thead><tbody>';
    for (const u of usersState) {
        html += `<tr data-id="${u.id}"><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.name || '')}</td><td>${escapeHtml(u.email || '')}</td><td>${u.role}</td><td>${u.building || ''}</td><td>${u.active ? 'Yes' : 'No'}</td><td><button class="btn btn-secondary btn-sm btn-edit-user" data-id="${u.id}">Edit</button> <button class="btn btn-secondary btn-sm btn-reset-pass" data-id="${u.id}">Reset Password</button></td></tr>`;
    }
    html += '</tbody></table></div>';
    usersTable.innerHTML = html;
    document.querySelectorAll('.btn-edit-user').forEach(btn => { btn.addEventListener('click', () => { const u = usersState.find(x => x.id === parseInt(btn.dataset.id, 10)); if (u) openUserForm(u); }); });
    document.querySelectorAll('.btn-reset-pass').forEach(btn => { btn.addEventListener('click', () => resetUserPassword(parseInt(btn.dataset.id, 10))); });
}

function openUserForm(user) {
    if (user) {
        userFormTitle.textContent = 'Edit User'; userIdInput.value = user.id; userUsernameInput.value = user.username || ''; userNameInput.value = user.name || ''; userEmailInput.value = user.email || ''; userRoleSelect.value = user.role || 'requester'; userBuildingSelect.value = user.building || ''; userActiveSelect.value = user.active ? '1' : '0'; userPasswordInput.value = ''; userPasswordGroup.style.display = 'none';
    } else {
        userFormTitle.textContent = 'Create User'; userForm.reset(); userIdInput.value = ''; userActiveSelect.value = '1'; userPasswordGroup.style.display = '';
    }
    userFormCard.hidden = false;
}

async function handleSaveUser(e) {
    e.preventDefault();
    const payload = { username: userUsernameInput.value.trim(), name: userNameInput.value.trim(), email: userEmailInput.value.trim(), role: userRoleSelect.value, building: userBuildingSelect.value || null, active: userActiveSelect.value === '1', password: userPasswordGroup.style.display !== 'none' ? userPasswordInput.value.trim() : undefined };
    if (!payload.username || !payload.name || !payload.email || !payload.role) { alert('Username, name, email and role are required'); return; }
    const id = userIdInput.value;
    let res;
    if (id) { delete payload.password; res = await apiPut(`/users/${id}`, payload); }
    else { res = await apiPost('/users', payload); }
    if (res.success) { if (!id && res.password) { alert(`User created. Initial password: ${res.password}`); } else { alert('User saved'); } userFormCard.hidden = true; loadUsers(); }
    else { alert('Failed to save user: ' + (res.message || 'Unknown error')); }
}

async function resetUserPassword(id) {
    const pwd = prompt('Enter new password (min 6 characters):');
    if (!pwd || pwd.trim().length < 6) { alert('Password too short. Nothing changed.'); return; }
    const confirmPwd = prompt('Confirm new password:');
    if (confirmPwd !== pwd) { alert('Passwords do not match. Nothing changed.'); return; }
    try {
        const res = await apiPost(`/users/${id}/reset-password`, { password: pwd });
        if (res.success) { alert('Password reset successfully.'); } else { alert('Password reset failed: ' + (res.message || 'Unknown error')); }
    } catch { alert('Password reset failed'); }
}

// ===================== SUPPLIERS =====================

async function loadSuppliers() {
    try {
        const res = await apiGet('/suppliers');
        if (res.success) { suppliersState = res.suppliers; renderSuppliersTable(); }
    } catch { suppliersTable.innerHTML = '<p>Failed to load suppliers.</p>'; }
}

function renderSuppliersTable() {
    if (!suppliersState.length) { suppliersTable.innerHTML = '<p class="text-muted">No suppliers yet.</p>'; return; }
    let html = '<div class="table-wrapper"><table><thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th>Active</th><th></th></tr></thead><tbody>';
    for (const s of suppliersState) {
        html += `<tr data-id="${s.id}"><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.contact_person || '')}</td><td>${escapeHtml(s.email || '')}</td><td>${escapeHtml(s.phone || '')}</td><td>${s.active ? 'Yes' : 'No'}</td><td><button class="btn btn-secondary btn-sm btn-edit-supplier" data-id="${s.id}">Edit</button></td></tr>`;
    }
    html += '</tbody></table></div>';
    suppliersTable.innerHTML = html;
    document.querySelectorAll('.btn-edit-supplier').forEach(btn => { btn.addEventListener('click', () => { const s = suppliersState.find(x => x.id === parseInt(btn.dataset.id, 10)); if (s) openSupplierForm(s); }); });
}

function openSupplierForm(supplier) {
    if (supplier) {
        supplierFormTitle.textContent = 'Edit Supplier'; supplierIdInput.value = supplier.id; supplierNameInput.value = supplier.name || ''; supplierContactInput.value = supplier.contact_person || ''; supplierEmailInput.value = supplier.email || ''; supplierPhoneInput.value = supplier.phone || ''; supplierWebsiteInput.value = supplier.website || ''; supplierAddressInput.value = supplier.address || ''; supplierNotesInput.value = supplier.notes || ''; supplierActiveInput.value = supplier.active ? '1' : '0';
    } else {
        supplierFormTitle.textContent = 'Create Supplier'; supplierForm.reset(); supplierIdInput.value = ''; supplierActiveInput.value = '1';
    }
    supplierFormCard.hidden = false;
}

async function handleSaveSupplier(e) {
    e.preventDefault();
    const payload = { name: supplierNameInput.value.trim(), contact_person: supplierContactInput.value.trim(), email: supplierEmailInput.value.trim(), phone: supplierPhoneInput.value.trim(), website: supplierWebsiteInput.value.trim(), address: supplierAddressInput.value.trim(), notes: supplierNotesInput.value.trim(), active: parseInt(supplierActiveInput.value, 10) };
    if (!payload.name) { alert('Name is required'); return; }
    const id = supplierIdInput.value;
    const res = id ? await apiPut(`/suppliers/${id}`, payload) : await apiPost('/suppliers', payload);
    if (res.success) { alert('Supplier saved'); supplierFormCard.hidden = true; loadSuppliers(); populateSupplierFilter(); } else { alert('Failed to save supplier'); }
}

function populateStatusFilter() {
    filterStatus.innerHTML = '<option value="">Status: All</option>' + ORDER_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('');
}
function populateSupplierFilter() {
    filterSupplier.innerHTML = '<option value="">Supplier: All</option>' + suppliersState.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
}

function switchTab(tabId) {
    if (currentTab === tabId) return;

    // ⭐ SECURITY: Block requesters from analytics tab (frontend guard)
    if (tabId === 'analyticsTab' && currentUser && currentUser.role === 'requester') {
        console.warn('Access denied: requester role cannot access analytics');
        return;
    }

    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
    currentTab = tabId;

    // Initialize analytics when tab is switched
    if (tabId === 'analyticsTab' && window.AnalyticsModule) {
        window.AnalyticsModule.init();
    }

    // ⭐ NEW: Show brand training UI for admins in Suppliers tab
    if (tabId === 'suppliersTab' && currentUser && currentUser.role === 'admin') {
        const brandTrainingCard = document.getElementById('brandTrainingCard');
        if (brandTrainingCard) {
            brandTrainingCard.hidden = false;
            // Load brand training UI if function exists
            if (typeof loadBrandTrainingUI === 'function') {
                loadBrandTrainingUI();
            }
        }
    }

    // ⭐ NEW: Load supplier group view when tab is activated
    if (tabId === 'supplierGroupTab') {
        loadSupplierGroupView();
    }
}

function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] || c)); }
function formatDate(dateStr) { if (!dateStr) return '-'; const d = new Date(dateStr); if (isNaN(d)) return dateStr; return d.toLocaleDateString(); }
function formatDateTime(dateStr) { if (!dateStr) return '-'; const d = new Date(dateStr); if (isNaN(d)) return dateStr; return d.toLocaleString(); }
function formatFileSize(bytes) { if (!bytes) return ''; const kb = bytes / 1024; if (kb < 1024) return kb.toFixed(1) + ' KB'; return (kb / 1024).toFixed(1) + ' MB'; }

// ===================== PROCUREMENT CREATE ORDER MODAL =====================

function openProcCreateOrderModal() {
    const modal = document.getElementById('procCreateOrderModal');
    if (!modal) return;

    const bldgSel = document.getElementById('procBuilding');
    if (bldgSel) {
        bldgSel.innerHTML = '<option value="">Select Building</option>' +
            buildingsState.filter(b => b.active).map(b =>
                `<option value="${b.code}">${escapeHtml(b.code)} - ${escapeHtml(b.name)}</option>`
            ).join('');
    }

    const ccContainer = document.getElementById('procCostCenterRadios');
    if (ccContainer) ccContainer.innerHTML = '<span class="text-muted">Select a building first</span>';

    const form = document.getElementById('procCreateOrderForm');
    if (form) form.reset();

    if (bldgSel) {
        bldgSel.onchange = () => renderProcCostCenterRadios(bldgSel.value);
    }

    // Initialize autocomplete for proc modal if available
    if (typeof initProcModalAutocomplete === 'function') {
        initProcModalAutocomplete();
    }

    modal.classList.remove('hidden');
}

function closeProcCreateOrderModal() {
    const modal = document.getElementById('procCreateOrderModal');
    if (modal) modal.classList.add('hidden');
}

function renderProcCostCenterRadios(buildingCode) {
    const container = document.getElementById('procCostCenterRadios');
    if (!container) return;

    if (!buildingCode) {
        container.innerHTML = '<span class="text-muted">Select a building first</span>';
        return;
    }

    const filtered = costCentersState.filter(cc => cc.building_code === buildingCode && cc.active);
    if (!filtered.length) {
        container.innerHTML = '<span class="text-muted">No cost centers for this building</span>';
        return;
    }

    container.innerHTML = filtered.map(cc =>
        `<label class="radio-label">
            <input type="radio" name="procCostCenter" value="${cc.id}" required>
            <span class="radio-text"><strong>${escapeHtml(cc.code)}</strong> — ${escapeHtml(cc.name)}</span>
        </label>`
    ).join('');
}

async function handleProcCreateOrder(e) {
    e.preventDefault();

    const building = document.getElementById('procBuilding')?.value;
    if (!building) { alert('Please select a building'); return; }

    const selectedCC = document.querySelector('input[name="procCostCenter"]:checked');
    if (!selectedCC) { alert('Please select a cost center'); return; }

    const itemDescription = document.getElementById('procItemDescription')?.value.trim() || '';
    const dateNeeded = document.getElementById('procDateNeeded')?.value || '';

    if (!itemDescription) { alert('Item description is required'); return; }
    if (!dateNeeded) { alert('Date needed is required'); return; }

    const formData = new FormData();
    formData.append('building', building);
    formData.append('costCenterId', selectedCC.value);
    formData.append('itemDescription', itemDescription);
    formData.append('partNumber', document.getElementById('procPartNumber')?.value.trim() || '');
    formData.append('category', document.getElementById('procCategory')?.value.trim() || '');
    formData.append('quantity', document.getElementById('procQuantity')?.value || '1');
    formData.append('dateNeeded', dateNeeded);
    formData.append('priority', document.getElementById('procPriority')?.value || 'Normal');
    formData.append('notes', document.getElementById('procNotes')?.value.trim() || '');
    formData.append('requester', currentUser.name);
    formData.append('requesterEmail', currentUser.email);

    // Attach files from procAttachments input if present
    const procFiles = document.getElementById('procAttachments');
    if (procFiles && procFiles.files) {
        for (let i = 0; i < procFiles.files.length; i++) {
            formData.append('files', procFiles.files[i]);
        }
    }

    // Show progress overlay
    if (window.UploadProgress) {
        window.UploadProgress.show();
    }

    // Use XMLHttpRequest for upload progress tracking
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener('progress', (evt) => {
            if (evt.lengthComputable && window.UploadProgress) {
                const percentComplete = (evt.loaded / evt.total) * 100;
                window.UploadProgress.update(percentComplete);
            }
        });

        // Handle completion
        xhr.addEventListener('load', () => {
            if (window.UploadProgress) {
                window.UploadProgress.hide();
            }

            try {
                const data = JSON.parse(xhr.responseText);
                if (!data.success) {
                    alert('Failed to create order: ' + (data.message || 'Unknown error'));
                    reject(new Error(data.message));
                    return;
                }
                alert('Order created successfully!');
                closeProcCreateOrderModal();
                loadOrders();
                resolve(data);
            } catch (err) {
                alert('Failed to process server response.');
                reject(err);
            }
        });

        // Handle errors
        xhr.addEventListener('error', () => {
            if (window.UploadProgress) {
                window.UploadProgress.hide();
            }
            alert('Failed to create order. Network error.');
            reject(new Error('Network error'));
        });

        xhr.addEventListener('abort', () => {
            if (window.UploadProgress) {
                window.UploadProgress.hide();
            }
            alert('Upload cancelled.');
            reject(new Error('Upload cancelled'));
        });

        // Open connection and send
        xhr.open('POST', `${API_BASE}/orders`);
        xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
        xhr.send(formData);
    });
}

// ⭐ Attach form handlers on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    const procForm = document.getElementById('procCreateOrderForm');
    if (procForm) {
        procForm.addEventListener('submit', handleProcCreateOrder);
    }

    const cqForm = document.getElementById('createQuoteForm');
    if (cqForm) {
        cqForm.addEventListener('submit', handleCreateQuote);
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// DELIVERY PROOF GALLERY — progressive thumbnails + lightbox
// Drop-in replacement for the loadDeliveryProof / loadAuthThumbnails /
// openDocumentAuthenticated / fetchDocAsDataUrl block in app.js
// ═══════════════════════════════════════════════════════════════════════════════

// ── Helpers ───────────────────────────────────────────────────────────────────

function _isImageDoc(d) {
    return /\.(jpe?g|png|gif|webp|heic|avif)$/i.test(d.file_name || d.filename || '')
        || (d.mime_type || '').startsWith('image/');
}

// Build an authenticated URL for the thumbnail endpoint (token in query string
// so the <img> src works without custom headers — same pattern as /view)
function _thumbUrl(docId) {
    return `${API_BASE}/documents/${docId}/thumbnail?token=${encodeURIComponent(authToken)}`;
}

// Build an authenticated URL for the inline view endpoint
function _viewUrl(docId) {
    return `${API_BASE}/documents/${docId}/view?token=${encodeURIComponent(authToken)}`;
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

let _lightboxDocs   = [];   // array of doc objects currently shown
let _lightboxIndex  = 0;    // which one is open

// ── Zoom/pan state ───────────────────────────────────────────────────────────────────────
const _lbState = { scale: 1, panX: 0, panY: 0 };

function _lbApplyTransform() {
    const wrap = document.getElementById('pp-lb-img-wrap');
    if (!wrap) return;
    wrap.style.transform = `translate(${_lbState.panX}px, ${_lbState.panY}px) scale(${_lbState.scale})`;
    wrap.style.transformOrigin = 'center center';
    wrap.style.cursor = _lbState.scale > 1 ? 'grab' : 'default';
    // Update zoom label in toolbar
    const label = document.getElementById('pp-lb-zoom-level');
    if (label) label.textContent = Math.round(_lbState.scale * 100) + '%';
}

function _lbResetZoom() {
    _lbState.scale = 1; _lbState.panX = 0; _lbState.panY = 0;
    _lbApplyTransform();
}

function _lbZoom(factor, clientX, clientY) {
    const wrap = document.getElementById('pp-lb-img-wrap');
    if (!wrap) return;
    const rect   = wrap.getBoundingClientRect();
    const cx     = clientX - (rect.left + rect.width  / 2);
    const cy     = clientY - (rect.top  + rect.height / 2);
    const newScale = Math.min(Math.max(_lbState.scale * factor, 1), 8);
    // Zoom towards cursor position
    _lbState.panX = cx - (cx - _lbState.panX) * (newScale / _lbState.scale);
    _lbState.panY = cy - (cy - _lbState.panY) * (newScale / _lbState.scale);
    _lbState.scale = newScale;
    if (_lbState.scale <= 1) { _lbState.panX = 0; _lbState.panY = 0; }
    _lbApplyTransform();
}

function _lbTouchDist(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function _openLightbox(docs, startIndex) {
    _lightboxDocs  = docs;
    _lightboxIndex = startIndex;

    // Create overlay if not exists
    let overlay = document.getElementById('pp-lightbox');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'pp-lightbox';
        overlay.innerHTML = `
            <div id="pp-lb-backdrop"></div>
            <div id="pp-lb-shell">
                <div id="pp-lb-toolbar">
                    <span id="pp-lb-counter"></span>
                    <div style="display:flex;gap:0.5rem;align-items:center;">
                        <button id="pp-lb-zoom-out" title="Намали (−)">−</button>
                        <span id="pp-lb-zoom-level" style="font-size:0.78rem;color:#94a3b8;min-width:3rem;text-align:center;">100%</span>
                        <button id="pp-lb-zoom-in" title="Увеличи (+)">+</button>
                        <button id="pp-lb-zoom-reset" title="Нулирай (0)" style="font-size:0.7rem;">↺</button>
                        <div style="width:1px;height:18px;background:rgba(255,255,255,0.15);margin:0 0.15rem;"></div>
                        <button id="pp-lb-download" title="Изтегли">⬇ Изтегли</button>
                        <button id="pp-lb-close" title="Затвори">✕</button>
                    </div>
                </div>
                <div id="pp-lb-stage">
                    <button id="pp-lb-prev" aria-label="Предишна">‹</button>
                    <div id="pp-lb-img-wrap">
                        <!-- thumb shown first, full-res loads behind it -->
                        <img id="pp-lb-thumb" alt="">
                        <img id="pp-lb-full"  alt="">
                        <div id="pp-lb-spinner">⏳</div>
                    </div>
                    <button id="pp-lb-next" aria-label="Следваща">›</button>
                </div>
                <div id="pp-lb-caption"></div>
            </div>`;
        document.body.appendChild(overlay);

        // Inject styles once
        if (!document.getElementById('pp-lb-style')) {
            const style = document.createElement('style');
            style.id = 'pp-lb-style';
            style.textContent = `
                #pp-lightbox { position:fixed;inset:0;z-index:9999;display:none; }
                #pp-lightbox.pp-lb-open { display:block; }
                #pp-lb-backdrop {
                    position:absolute;inset:0;background:rgba(0,0,0,0.92);
                    cursor:pointer;
                }
                #pp-lb-shell {
                    position:absolute;inset:0;display:flex;flex-direction:column;
                    pointer-events:none;
                }
                #pp-lb-toolbar {
                    pointer-events:all;
                    display:flex;align-items:center;justify-content:space-between;
                    padding:0.6rem 1rem;
                    background:rgba(0,0,0,0.6);
                    backdrop-filter:blur(8px);
                    font-size:0.82rem;color:#94a3b8;
                }
                #pp-lb-toolbar button {
                    pointer-events:all;
                    background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);
                    color:#e2e8f0;border-radius:6px;padding:0.3rem 0.75rem;
                    font-size:0.8rem;cursor:pointer;transition:background 0.15s;
                }
                #pp-lb-toolbar button:hover { background:rgba(232,104,42,0.7); }
                #pp-lb-stage {
                    flex:1;display:flex;align-items:center;justify-content:center;
                    position:relative;min-height:0;pointer-events:all;
                }
                #pp-lb-img-wrap {
                    position:relative;
                    width:min(80vw, 900px);
                    height:min(70vh, 700px);
                    display:flex;align-items:center;justify-content:center;
                    flex-shrink:0;
                }
                #pp-lb-thumb, #pp-lb-full {
                    position:absolute;inset:0;
                    width:100%;height:100%;
                    object-fit:contain;
                    transition:opacity 0.3s ease;
                    border-radius:0;
                    display:block;
                }
                /* thumb dims once full-res is loaded */
                #pp-lb-thumb { opacity:1; filter:blur(3px) scale(1.02); }
                #pp-lb-thumb.pp-lb-hidden { opacity:0; }
                #pp-lb-full  { opacity:0; }
                #pp-lb-full.pp-lb-loaded  { opacity:1; }
                #pp-lb-spinner {
                    position:absolute;font-size:2rem;
                    animation:pp-spin 1s linear infinite;
                    pointer-events:none;
                }
                #pp-lb-spinner.pp-lb-hidden { display:none; }
                @keyframes pp-spin { to { transform:rotate(360deg); } }
                #pp-lb-prev, #pp-lb-next {
                    position:absolute;top:50%;transform:translateY(-50%);
                    background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);
                    color:#fff;font-size:2rem;line-height:1;
                    border-radius:50%;width:44px;height:44px;
                    display:flex;align-items:center;justify-content:center;
                    cursor:pointer;z-index:2;transition:background 0.15s;
                    pointer-events:all;
                }
                #pp-lb-prev { left:8px; }
                #pp-lb-next { right:8px; }
                #pp-lb-prev:hover, #pp-lb-next:hover { background:rgba(232,104,42,0.8); }
                #pp-lb-prev.pp-lb-hidden, #pp-lb-next.pp-lb-hidden { opacity:0;pointer-events:none; }
                #pp-lb-caption {
                    pointer-events:none;
                    padding:0.5rem 1rem;text-align:center;
                    font-size:0.78rem;color:#64748b;
                    background:rgba(0,0,0,0.5);
                }
                @media (max-width:600px) {
                    #pp-lb-img-wrap { width:98vw; height:60vh; }
                    #pp-lb-prev { left:2px; } #pp-lb-next { right:2px; }
                }
            `;
            document.head.appendChild(style);
        }

        // Wire events
        document.getElementById('pp-lb-backdrop').addEventListener('click', _closeLightbox);
        document.getElementById('pp-lb-close').addEventListener('click', _closeLightbox);
        document.getElementById('pp-lb-prev').addEventListener('click', () => _lbNav(-1));
        document.getElementById('pp-lb-next').addEventListener('click', () => _lbNav(+1));
        document.getElementById('pp-lb-download').addEventListener('click', _lbDownload);
        document.getElementById('pp-lb-zoom-in').addEventListener('click',    () => _lbZoom(1.25, window.innerWidth/2, window.innerHeight/2));
        document.getElementById('pp-lb-zoom-out').addEventListener('click',   () => _lbZoom(1/1.25, window.innerWidth/2, window.innerHeight/2));
        document.getElementById('pp-lb-zoom-reset').addEventListener('click', () => _lbResetZoom());
        document.addEventListener('keydown', _lbKeydown);

        // ── Zoom & Pan — desktop (wheel + drag) ──────────────────────────────
        const stage = document.getElementById('pp-lb-stage');

        stage.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            _lbZoom(delta, e.clientX, e.clientY);
        }, { passive: false });

        // drag-to-pan
        let _dragActive = false, _dragStartX = 0, _dragStartY = 0, _panStartX = 0, _panStartY = 0;
        stage.addEventListener('mousedown', (e) => {
            if (_lbState.scale <= 1) return;
            _dragActive = true;
            _dragStartX = e.clientX; _dragStartY = e.clientY;
            _panStartX  = _lbState.panX; _panStartY = _lbState.panY;
            stage.style.cursor = 'grabbing';
            e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
            if (!_dragActive) return;
            _lbState.panX = _panStartX + (e.clientX - _dragStartX);
            _lbState.panY = _panStartY + (e.clientY - _dragStartY);
            _lbApplyTransform();
        });
        window.addEventListener('mouseup', () => {
            if (_dragActive) { _dragActive = false; stage.style.cursor = ''; }
        });

        // double-click to reset
        stage.addEventListener('dblclick', (e) => {
            // don't close lightbox on dblclick
            e.stopPropagation();
            _lbResetZoom();
        });

        // ── Zoom & Pan — touch (pinch + drag) ────────────────────────────────
        let _touches = [], _pinchStartDist = 0, _pinchStartScale = 1;
        let _touchPanStartX = 0, _touchPanStartY = 0, _touchPanOriginX = 0, _touchPanOriginY = 0;
        let _lastTap = 0;

        stage.addEventListener('touchstart', (e) => {
            _touches = Array.from(e.touches);
            if (_touches.length === 2) {
                e.preventDefault();
                _pinchStartDist  = _lbTouchDist(_touches[0], _touches[1]);
                _pinchStartScale = _lbState.scale;
            } else if (_touches.length === 1) {
                // double-tap to reset
                const now = Date.now();
                if (now - _lastTap < 300) { _lbResetZoom(); }
                _lastTap = now;
                if (_lbState.scale > 1) {
                    e.preventDefault();
                    _touchPanOriginX = _lbState.panX; _touchPanOriginY = _lbState.panY;
                    _touchPanStartX  = _touches[0].clientX; _touchPanStartY = _touches[0].clientY;
                }
            }
        }, { passive: false });

        stage.addEventListener('touchmove', (e) => {
            _touches = Array.from(e.touches);
            if (_touches.length === 2) {
                e.preventDefault();
                const dist  = _lbTouchDist(_touches[0], _touches[1]);
                const scale = Math.min(Math.max(_pinchStartScale * (dist / _pinchStartDist), 1), 8);
                const midX  = (_touches[0].clientX + _touches[1].clientX) / 2;
                const midY  = (_touches[0].clientY + _touches[1].clientY) / 2;
                // keep midpoint stationary
                const wrap  = document.getElementById('pp-lb-img-wrap');
                const rect  = wrap.getBoundingClientRect();
                const cx    = midX - (rect.left + rect.width  / 2);
                const cy    = midY - (rect.top  + rect.height / 2);
                _lbState.panX = cx - (cx - _lbState.panX) * (scale / _lbState.scale);
                _lbState.panY = cy - (cy - _lbState.panY) * (scale / _lbState.scale);
                _lbState.scale = scale;
                _lbApplyTransform();
            } else if (_touches.length === 1 && _lbState.scale > 1) {
                e.preventDefault();
                _lbState.panX = _touchPanOriginX + (_touches[0].clientX - _touchPanStartX);
                _lbState.panY = _touchPanOriginY + (_touches[0].clientY - _touchPanStartY);
                _lbApplyTransform();
            }
        }, { passive: false });

        stage.addEventListener('touchend', (e) => {
            _touches = Array.from(e.touches);
            if (_touches.length < 2) {
                _pinchStartDist = 0;
                if (_lbState.scale < 1.05) _lbResetZoom();
            }
        });
    }

    overlay.classList.add('pp-lb-open');
    document.body.style.overflow = 'hidden';
    _lbRender();
}

function _closeLightbox() {
    const overlay = document.getElementById('pp-lightbox');
    if (overlay) overlay.classList.remove('pp-lb-open');
    document.body.style.overflow = '';
    _lbResetZoom();
    // Abort any in-flight full-res load
    const full = document.getElementById('pp-lb-full');
    if (full) { full.src = ''; full.classList.remove('pp-lb-loaded'); }
}

function _lbNav(delta) {
    _lightboxIndex = (_lightboxIndex + delta + _lightboxDocs.length) % _lightboxDocs.length;
    _lbResetZoom();
    _lbRender();
}

function _lbKeydown(e) {
    const overlay = document.getElementById('pp-lightbox');
    if (!overlay || !overlay.classList.contains('pp-lb-open')) return;
    if (e.key === 'Escape')      _closeLightbox();
    if (e.key === 'ArrowLeft')   _lbNav(-1);
    if (e.key === 'ArrowRight')  _lbNav(+1);
    if (e.key === '+' || e.key === '=') _lbZoom(1.25, window.innerWidth/2, window.innerHeight/2);
    if (e.key === '-')                  _lbZoom(1/1.25, window.innerWidth/2, window.innerHeight/2);
    if (e.key === '0')                  _lbResetZoom();
}

function _lbDownload() {
    const doc = _lightboxDocs[_lightboxIndex];
    if (!doc) return;
    // Use download endpoint — forces Save As dialog
    const a = document.createElement('a');
    a.href = `${API_BASE}/documents/${doc.id}/download`;
    // Fetch with auth header via XHR then trigger download
    fetch(`${API_BASE}/documents/${doc.id}/download`, {
        headers: { 'Authorization': 'Bearer ' + authToken }
    }).then(r => r.blob()).then(blob => {
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = doc.file_name || doc.filename || 'download';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }).catch(() => alert('Грешка при изтегляне. Моля, опитайте отново.'));
}

function _lbRender() {
    const doc     = _lightboxDocs[_lightboxIndex];
    const total   = _lightboxDocs.length;
    const imgDocs = _lightboxDocs; // all are images in the proof gallery

    // Counter
    document.getElementById('pp-lb-counter').textContent =
        total > 1 ? `${_lightboxIndex + 1} / ${total}` : '';

    // Nav arrows
    document.getElementById('pp-lb-prev').classList.toggle('pp-lb-hidden', total <= 1);
    document.getElementById('pp-lb-next').classList.toggle('pp-lb-hidden', total <= 1);

    // Caption
    const name = doc.file_name || doc.filename || '';
    const date = doc.uploaded_at ? formatDate(doc.uploaded_at) : '';
    document.getElementById('pp-lb-caption').textContent =
        [name, date].filter(Boolean).join(' · ');

    // Images — show thumb immediately, load full behind it
    const thumbEl   = document.getElementById('pp-lb-thumb');
    const fullEl    = document.getElementById('pp-lb-full');
    const spinner   = document.getElementById('pp-lb-spinner');

    // Reset state
    thumbEl.classList.remove('pp-lb-hidden');
    fullEl.classList.remove('pp-lb-loaded');
    fullEl.src = '';
    spinner.classList.remove('pp-lb-hidden');

    // Load thumbnail immediately (small, fast)
    thumbEl.src = _thumbUrl(doc.id);

    // Start loading full-res in background
    const fullSrc = _viewUrl(doc.id);
    const preload = new Image();
    preload.onload = () => {
        // Only apply if user hasn't navigated away
        if (fullEl.dataset.pendingSrc === fullSrc) {
            fullEl.src = fullSrc;
            fullEl.classList.add('pp-lb-loaded');
            thumbEl.classList.add('pp-lb-hidden');
            spinner.classList.add('pp-lb-hidden');
        }
    };
    preload.onerror = () => {
        spinner.classList.add('pp-lb-hidden');
        // Keep thumbnail visible
    };
    fullEl.dataset.pendingSrc = fullSrc;
    preload.src = fullSrc;
}

// ── Gallery ───────────────────────────────────────────────────────────────────

async function loadDeliveryProof(orderId) {
    const pane = document.getElementById('od-proof');
    if (!pane) return;

    try {
        const res = await apiGet('/documents/order/' + orderId + '?type=delivery_proof');
        const docs = (res.success ? res.documents : []).filter(d => {
            const c = (d.document_type || d.category || '').toLowerCase();
            return c === 'delivery_proof' || c === 'delivery proof' || c === 'other';
        });

        if (!docs.length) {
            pane.innerHTML = '<div class="text-muted" style="font-size:0.85rem;padding:0.5rem 0;">Няма качено доказателство за доставка.</div>';
            return;
        }

        const imageDocs = docs.filter(_isImageDoc);
        const fileDocs  = docs.filter(d => !_isImageDoc(d));

        let html = '';

        // ── Image grid ──────────────────────────────────────────────────────
        if (imageDocs.length) {
            html += `<div style="
                display:grid;
                grid-template-columns:repeat(auto-fill,minmax(120px,1fr));
                gap:0.6rem;
                margin-top:0.5rem;
            ">`;

            imageDocs.forEach((d, idx) => {
                const name = escapeHtml(d.file_name || d.filename || 'Снимка');
                const date = d.uploaded_at ? formatDate(d.uploaded_at) : '';
                html += `
                <div class="pp-proof-card" data-img-idx="${idx}" style="
                    cursor:pointer;border-radius:8px;overflow:hidden;
                    background:#1e293b;border:1px solid #334155;
                    transition:transform 0.15s,border-color 0.15s;
                    position:relative;
                " title="${name}">
                    <!-- Thumbnail loads via <img src=...token=...> — no fetch needed -->
                    <div style="width:100%;aspect-ratio:4/3;background:#0f172a;overflow:hidden;display:flex;align-items:center;justify-content:center;">
                        <img
                            src="${_thumbUrl(d.id)}"
                            alt="${name}"
                            loading="lazy"
                            style="width:100%;height:100%;object-fit:cover;display:block;transition:opacity 0.3s;"
                            onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
                        >
                        <span style="display:none;font-size:2rem;color:#475569;align-items:center;justify-content:center;width:100%;height:100%;">🖼️</span>
                    </div>
                    <div style="padding:0.3rem 0.4rem;">
                        <div style="font-size:0.68rem;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
                        ${date ? `<div style="font-size:0.65rem;color:#475569;">${date}</div>` : ''}
                    </div>
                    <!-- Zoom hint overlay -->
                    <div style="
                        position:absolute;top:4px;right:4px;
                        background:rgba(0,0,0,0.55);border-radius:4px;
                        padding:2px 5px;font-size:0.65rem;color:#cbd5e1;
                        pointer-events:none;
                    ">🔍</div>
                </div>`;
            });

            html += '</div>';
        }

        // ── File list ────────────────────────────────────────────────────────
        if (fileDocs.length) {
            html += `<div style="display:flex;flex-direction:column;gap:0.35rem;margin-top:${imageDocs.length ? '0.6rem' : '0.5rem'};">`;
            fileDocs.forEach(d => {
                const name = escapeHtml(d.file_name || d.filename || 'Файл');
                const size = formatFileSize(d.file_size || 0);
                const date = d.uploaded_at ? formatDate(d.uploaded_at) : '';
                html += `
                <div onclick="openDocumentAuthenticated(${d.id})" style="
                    display:flex;align-items:center;justify-content:space-between;
                    padding:0.45rem 0.75rem;background:#1e293b;
                    border-radius:6px;border:1px solid #334155;cursor:pointer;
                    transition:border-color 0.15s;
                " onmouseenter="this.style.borderColor='#e8682a'" onmouseleave="this.style.borderColor='#334155'">
                    <div>
                        <span style="color:#e8682a;font-size:0.82rem;font-weight:600;">📄 ${name}</span>
                        <div style="font-size:0.7rem;color:#64748b;margin-top:0.1rem;">${size}${date ? ' · ' + date : ''}</div>
                    </div>
                    <span style="color:#64748b;font-size:0.75rem;white-space:nowrap;margin-left:0.5rem;">⬇ Отвори</span>
                </div>`;
            });
            html += '</div>';
        }

        pane.innerHTML = html;

        // Wire click on image cards → lightbox
        pane.querySelectorAll('.pp-proof-card[data-img-idx]').forEach(card => {
            card.addEventListener('click', () => {
                const idx = parseInt(card.getAttribute('data-img-idx'), 10);
                _openLightbox(imageDocs, idx);
            });
            card.addEventListener('mouseenter', () => {
                card.style.transform = 'scale(1.03)';
                card.style.borderColor = '#e8682a';
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = '';
                card.style.borderColor = '#334155';
            });
        });

    } catch (err) {
        pane.innerHTML = '<div class="text-muted" style="font-size:0.85rem;">Грешка при зареждане на доказателствата за доставка.</div>';
        console.error('loadDeliveryProof error:', err);
    }
}

// ── Legacy openDocumentAuthenticated (for non-image files) ────────────────────
// Still used for PDF/doc files in the gallery and elsewhere in app.js
async function openDocumentAuthenticated(docId) {
    try {
        const resp = await fetch(API_BASE + '/documents/' + docId + '/download', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const blob = await resp.blob();
        const url  = URL.createObjectURL(blob);

        if (blob.type.startsWith('image/') || blob.type === 'application/pdf') {
            const win = window.open();
            if (win) {
                win.document.write(
                    '<html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh;">' +
                    '<img src="' + url + '" style="max-width:100%;max-height:100vh;object-fit:contain;"></body></html>'
                );
                win.document.close();
            } else {
                const a = document.createElement('a');
                a.href = url; a.download = 'document'; a.click();
            }
        } else {
            const a = document.createElement('a');
            a.href = url; a.download = 'document'; a.click();
        }
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
        console.error('openDocumentAuthenticated error:', err);
        alert('Неуспешно отваряне на документа. Моля, опитайте отново.');
    }
}
window.openDocumentAuthenticated = openDocumentAuthenticated;

// fetchDocAsDataUrl kept for backward compatibility (used elsewhere in app.js)
async function fetchDocAsDataUrl(docId) {
    const resp = await fetch(API_BASE + '/documents/' + docId + '/download', {
        headers: { 'Authorization': 'Bearer ' + authToken }
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve({ dataUrl: reader.result, mimeType: blob.type });
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// loadAuthThumbnails kept for backward compat (now a no-op — thumbnails load via <img src>)
function loadAuthThumbnails(container) { /* no-op — thumbnails now use /thumbnail endpoint */ }


async function loadOrderDocuments(orderId) {
    const pane = document.getElementById('od-docs');
    if (!pane) return;

    try {
        const res = await apiGet('/documents/order/' + orderId);
        const docs = res.success ? res.documents : [];

        if (!docs.length) {
            pane.innerHTML = '<div class="text-muted" style="font-size:0.85rem;">No documents linked to this order.</div>';
            return;
        }

        let html = '<div style="display:flex;flex-direction:column;gap:0.4rem;margin-top:0.25rem;">';
        docs.forEach(d => {
            const name = escapeHtml(d.file_name || d.filename || 'File');
            const type = escapeHtml(d.document_type || 'other');
            const size = formatFileSize(d.file_size || 0);
            const date = d.uploaded_at ? formatDate(d.uploaded_at) : '';
            html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:0.45rem 0.75rem;background:#1e293b;border-radius:6px;border:1px solid #334155;cursor:pointer;" onclick="openDocumentAuthenticated(${d.id})">
                <div>
                    <span style="color:#e8682a;font-size:0.85rem;font-weight:600;">📄 ${name}</span>
                    <div style="font-size:0.72rem;color:#64748b;margin-top:0.1rem;">${type} · ${size}${date ? ' · ' + date : ''}</div>
                </div>
                <span style="color:#64748b;font-size:0.75rem;">↓ Open</span>
            </div>`;
        });
        html += '</div>';
        pane.innerHTML = html;
    } catch (err) {
        pane.innerHTML = '<div class="text-muted" style="font-size:0.85rem;">Could not load documents.</div>';
        console.error('loadOrderDocuments error:', err);
    }
}

async function uploadDeliveryProof(orderId) {
    const fileInput = document.getElementById('proofFileInput');
    const noteInput = document.getElementById('proofNoteInput');
    const statusDiv = document.getElementById('proofUploadStatus');

    if (!fileInput || !fileInput.files.length) {
        if (statusDiv) statusDiv.innerHTML = '<span style="color:#f87171;">Please select at least one file.</span>';
        return;
    }

    if (statusDiv) statusDiv.innerHTML = '<span style="color:#94a3b8;">Uploading…</span>';

    const fd = new FormData();
    for (let i = 0; i < fileInput.files.length; i++) {
        fd.append('file', fileInput.files[i]);
    }
    fd.append('orderIds', String(orderId));
    fd.append('documentType', 'delivery_proof');
    fd.append('description', (noteInput && noteInput.value.trim()) || 'Delivery proof');

    try {
        const resp = await fetch(API_BASE + '/documents/upload', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + authToken },
            body: fd
        });
        const data = await resp.json();
        if (data.success) {
            if (statusDiv) statusDiv.innerHTML = '<span style="color:#4ade80;">✅ Uploaded successfully!</span>';
            fileInput.value = '';
            if (noteInput) noteInput.value = '';
            // Reload the proof gallery
            setTimeout(() => {
                const proofForm = document.getElementById('proofUploadForm');
                if (proofForm) proofForm.style.display = 'none';
                loadDeliveryProof(orderId);
            }, 1200);
        } else {
            if (statusDiv) statusDiv.innerHTML = '<span style="color:#f87171;">❌ ' + escapeHtml(data.message || 'Upload failed') + '</span>';
        }
    } catch (err) {
        if (statusDiv) statusDiv.innerHTML = '<span style="color:#f87171;">❌ Network error during upload.</span>';
        console.error('uploadDeliveryProof error:', err);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// KPI DRILL-DOWN — slide panel showing filtered orders
// ═══════════════════════════════════════════════════════════════════════════════

// Override _kpiFilter to also open the drill panel
window._kpiFilter = function(type) {
    // Update KPI card highlight
    document.querySelectorAll('.req-kpi-card').forEach(c => c.classList.remove('kpi-selected'));
    const _km = { active: 'kpiActive', transit: 'kpiTransit', late: 'kpiLate', delivered: 'kpiDelivered', pending: 'kpiPending' };
    const _ke = document.getElementById(_km[type]);
    if (_ke) _ke.classList.add('kpi-selected');

    // Also apply filter to main orders table
    filterState.quickFilter = ''; filterState.status = '';
    if (type === 'transit') filterState.quickFilter = 'transit';
    else if (type === 'late') filterState.quickFilter = 'late';
    else if (type === 'delivered') filterState.status = 'Delivered';
    else if (type === 'pending') filterState.status = 'New';
    currentPage = 1; applyFilters();

    // Open drill-down panel
    openKpiDrillPanel(type);
};

function openKpiDrillPanel(type) {
    // Create or reuse the panel
    let panel = document.getElementById('kpiDrillPanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'kpiDrillPanel';
        panel.style.cssText = [
            'position:fixed', 'top:0', 'right:0', 'width:min(480px,100vw)', 'height:100vh',
            'background:#0f172a', 'border-left:1px solid #1e293b', 'z-index:9999',
            'overflow-y:auto', 'padding:1.5rem', 'box-shadow:-8px 0 32px rgba(0,0,0,.5)',
            'transform:translateX(100%)', 'transition:transform 0.25s ease'
        ].join(';');
        document.body.appendChild(panel);
    }

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    // Filter orders by type
    let orders = [];
    let title = '';
    switch (type) {
        case 'active':
            orders = ordersState.filter(o => !['Delivered', 'Cancelled'].includes(o.status));
            title = '📦 Active Orders';
            break;
        case 'transit':
            orders = ordersState.filter(o => o.status === 'In Transit');
            title = '🚚 In Transit';
            break;
        case 'late':
            orders = ordersState.filter(o => {
                if (['Delivered', 'Cancelled'].includes(o.status)) return false;
                const ageDays = Math.floor((Date.now() - new Date(o.submission_date || o.created_at || 0)) / 86400000);
                if (o.priority === 'Urgent' && ageDays >= 5) return true;
                if (o.priority === 'High' && ageDays >= 10) return true;
                return false;
            });
            title = '⚠ Overdue Orders';
            break;
        case 'delivered':
            orders = ordersState.filter(o => {
                if (o.status !== 'Delivered') return false;
                const d = new Date(o.submission_date || o.created_at || 0);
                return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
            });
            title = '✅ Delivered This Month';
            break;
        case 'pending':
            orders = ordersState.filter(o => o.status === 'New');
            title = '⏳ Pending Approval';
            break;
    }

    // Build HTML
    let html = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;">
        <h3 style="margin:0;font-size:1rem;font-weight:700;color:#f1f5f9;">${title}</h3>
        <button onclick="closeKpiDrillPanel()" style="background:none;border:none;color:#94a3b8;font-size:1.25rem;cursor:pointer;padding:0.25rem;">✕</button>
    </div>`;

    if (!orders.length) {
        html += '<div style="color:#64748b;font-size:0.9rem;text-align:center;padding:2rem 0;">No orders in this category.</div>';
    } else {
        html += `<div style="font-size:0.75rem;color:#64748b;margin-bottom:0.75rem;">${orders.length} order${orders.length !== 1 ? 's' : ''}</div>`;
        orders.forEach(o => {
            const sc = o.status.toLowerCase().replace(/ /g, '-');
            const ageDays = Math.floor((Date.now() - new Date(o.submission_date || o.created_at || 0)) / 86400000);
            const ageLabel = ageDays === 0 ? 'Today' : ageDays === 1 ? '1 day ago' : ageDays + ' days ago';
            const prioColor = {Urgent:'#f87171',High:'#fb923c',Normal:'#94a3b8',Low:'#64748b'}[o.priority] || '#94a3b8';
            html += `<div onclick="closeKpiDrillPanel();openOrderDetail(${o.id})" style="
                padding:0.75rem;margin-bottom:0.5rem;
                background:#1e293b;border-radius:8px;border:1px solid #334155;
                cursor:pointer;transition:border-color 0.15s;"
                onmouseover="this.style.borderColor='#e8682a'" onmouseout="this.style.borderColor='#334155'">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.25rem;">
                    <span style="font-weight:700;color:#f1f5f9;font-size:0.85rem;">#${o.id} — ${escapeHtml(o.item_description || '')}</span>
                    <span class="status-badge status-${sc}" style="font-size:0.7rem;">${o.status}</span>
                </div>
                <div style="font-size:0.75rem;color:#64748b;display:flex;gap:0.6rem;align-items:center;flex-wrap:wrap;">
                    <span>${escapeHtml(o.building || '')}</span>
                    <span>· ${ageLabel}</span>
                    <span style="color:${prioColor};font-weight:600;">· ${o.priority || 'Normal'}</span>
                    ${o.cost_center_name ? '<span style="color:#64748b">· ' + escapeHtml(o.cost_center_name) + '</span>' : ''}
                </div>
            </div>`;
        });
    }

    panel.innerHTML = html;

    // Slide in
    requestAnimationFrame(() => {
        panel.style.transform = 'translateX(0)';
    });

    // Click outside to close
    panel._closeHandler = (e) => {
        if (!panel.contains(e.target)) closeKpiDrillPanel();
    };
    setTimeout(() => document.addEventListener('click', panel._closeHandler), 100);
}

function closeKpiDrillPanel() {
    const panel = document.getElementById('kpiDrillPanel');
    if (!panel) return;
    panel.style.transform = 'translateX(100%)';
    if (panel._closeHandler) {
        document.removeEventListener('click', panel._closeHandler);
        panel._closeHandler = null;
    }
}


// ============================================================
//  TOAST NOTIFICATION SYSTEM
// ============================================================
let _toastTimer = null;

function showToast(message, type = 'info', duration = 3500) {
    // Remove existing toast
    const existing = document.getElementById('ppToast');
    if (existing) existing.remove();
    if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }

    const toast = document.createElement('div');
    toast.id = 'ppToast';
    toast.className = 'pp-toast pp-toast-' + type;

    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-msg">${escapeHtml(message)}</span><button class="toast-close" onclick="this.parentElement.classList.remove('show')" aria-label="Close">✕</button>`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('show'));
    });

    _toastTimer = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 350);
    }, duration);
}
window.showToast = showToast;

// ============================================================
//  MOBILE BOTTOM NAVIGATION
// ============================================================
function initMobileNav() {
    const nav = document.getElementById('mobileBottomNav');
    if (!nav) return;

    // Wire nav buttons to tab switching
    nav.querySelectorAll('[data-mob-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.mobTab;
            if (tabId) {
                switchTab(tabId);
                updateMobileNavActive(tabId);
            }
        });
    });

    // FAB — new order
    const fab = document.getElementById('mobFabNewOrder');
    if (fab) {
        fab.addEventListener('click', () => {
            const newOrderCard = document.getElementById('newOrderCard');
            if (newOrderCard) {
                switchTab('ordersTab');
                updateMobileNavActive('ordersTab');
                newOrderCard.scrollIntoView({ behavior: 'smooth' });
                newOrderCard.style.outline = '2px solid var(--accent)';
                setTimeout(() => { newOrderCard.style.outline = ''; }, 1800);
            }
        });
    }

    // Listen for tab switches to keep mobile nav in sync
    document.addEventListener('tabSwitched', (e) => {
        if (e.detail && e.detail.tabId) updateMobileNavActive(e.detail.tabId);
    });
}

function updateMobileNavActive(tabId) {
    const nav = document.getElementById('mobileBottomNav');
    if (!nav) return;
    nav.querySelectorAll('[data-mob-tab]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mobTab === tabId);
    });

    // Sync approvals badge to mobile nav
    const srcBadge = document.getElementById('pendingApprovalBadge');
    const mobBadge = document.getElementById('mobApprovalsBadge');
    if (srcBadge && mobBadge) {
        if (srcBadge.classList.contains('hidden') || !srcBadge.textContent.trim()) {
            mobBadge.classList.add('hidden');
        } else {
            mobBadge.textContent = srcBadge.textContent;
            mobBadge.classList.remove('hidden');
        }
    }
}

// Sync approval badge to mobile nav whenever it changes
function syncMobileApprovalBadge() {
    const srcBadge = document.getElementById('pendingApprovalBadge');
    const mobBadge = document.getElementById('mobApprovalsBadge');
    if (!srcBadge || !mobBadge) return;
    const observer = new MutationObserver(() => {
        if (srcBadge.classList.contains('hidden') || !srcBadge.textContent.trim()) {
            mobBadge.classList.add('hidden');
        } else {
            mobBadge.textContent = srcBadge.textContent;
            mobBadge.classList.remove('hidden');
        }
    });
    observer.observe(srcBadge, { attributes: true, childList: true, subtree: true });
}

// Patch switchTab to emit custom event for mobile nav sync
const _origSwitchTab = switchTab;
// (already hooked — use the tabSwitched event approach instead)
document.addEventListener('DOMContentLoaded', () => {
    initMobileNav();
    syncMobileApprovalBadge();

    // Also patch any direct switchTab calls by overriding and dispatching event
    const origTabs = document.querySelectorAll('.tab');
    origTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            updateMobileNavActive(tab.dataset.tab);
        });
    });
});

// ============================================================
//  PULL-TO-REFRESH (mobile UX enhancement)
// ============================================================
(function initPullToRefresh() {
    let startY = 0;
    let pulling = false;
    let indicator = null;

    document.addEventListener('touchstart', (e) => {
        if (window.scrollY === 0) {
            startY = e.touches[0].clientY;
            pulling = true;
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!pulling) return;
        const diff = e.touches[0].clientY - startY;
        if (diff > 60) {
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;padding:.4rem 1.2rem;border-radius:0 0 1rem 1rem;font-size:.85rem;z-index:9999;opacity:.9;transition:opacity .3s';
                indicator.textContent = '↓ Release to refresh';
                document.body.appendChild(indicator);
            }
        }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!pulling) return;
        pulling = false;
        const diff = e.changedTouches[0].clientY - startY;
        if (diff > 80 && indicator) {
            indicator.textContent = '↻ Refreshing...';
            loadOrders().then(() => {
                if (indicator) { indicator.remove(); indicator = null; }
                showToast('Orders refreshed', 'success', 2000);
            });
        } else if (indicator) {
            indicator.remove();
            indicator = null;
        }
    }, { passive: true });
})();

// ============================================================
//  STATUS-CHANGE TOAST HOOK  (show toast on order status update)
// ============================================================
const _origApiPut = window.apiPut;
// We patch at the usage level — show toast after updateOrderStatus succeeds
const _origUpdateOrderStatus = window.updateOrderStatus;


// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ По доставчик — Procurement Workbench
// Three-section layout:
//   1. ⚠ Без доставчик       — truly unknown (no AI suggestion)
//   2. 🤖 AI предложения     — unassigned but AI has a suggestion, grouped by suggested supplier
//   3. ✅ Назначени           — assigned supplier groups (confirmed)
// ═══════════════════════════════════════════════════════════════════════════════

let _sgFilters  = { building: '', priority: '', search: '' };
let _sgData     = null;
let _sgSection  = 'all'; // 'all' | 'unassigned' | 'ai' | 'assigned'

// ── Entry point ───────────────────────────────────────────────────────────────
async function loadSupplierGroupView() {
    const container = document.getElementById('supplierGroupTab');
    if (!container) return;

    container.innerHTML = `
    <div style="padding:0 2px;">

      <!-- Toolbar -->
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;padding:14px 16px;background:#111e2c;border:1px solid #2a4a7a;border-radius:10px;">
        <h3 style="margin:0;font-size:1.05rem;font-weight:800;color:#e2e8f0;flex:1 1 180px;">
          🏭 Закупуване по доставчик
        </h3>
        <input id="sgSearch" type="text" placeholder="🔍 Търси артикул, заявка..." class="form-control form-control-sm" style="width:200px;background:#0f1923;color:#e2e8f0;border:1px solid #2a4a7a;">
        <select id="sgFilterBuilding" class="form-control form-control-sm" style="width:130px;background:#0f1923;color:#e2e8f0;border:1px solid #2a4a7a;">
          <option value="">Всички сгради</option>
        </select>
        <select id="sgFilterPriority" class="form-control form-control-sm" style="width:130px;background:#0f1923;color:#e2e8f0;border:1px solid #2a4a7a;">
          <option value="">Всички приоритети</option>
          <option value="Urgent">🔴 Спешен</option>
          <option value="High">🟠 Висок</option>
          <option value="Normal">🟡 Нормален</option>
          <option value="Low">⚪ Нисък</option>
        </select>
        <button id="sgRefreshBtn" class="btn btn-sm" style="background:#e8682a;color:#fff;border:none;padding:0.35rem 1rem;border-radius:6px;font-size:0.82rem;white-space:nowrap;">
          ↻ Обнови
        </button>
      </div>

      <!-- Summary KPI bar -->
      <div id="sgSummaryBar" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;"></div>

      <!-- Section filter tabs -->
      <div id="sgSectionTabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px;border-bottom:2px solid #2a4a7a;padding-bottom:10px;">
        <button class="sg-sec-tab active" data-sec="all"        style="${sgTabStyle(true)}">Всички</button>
        <button class="sg-sec-tab"        data-sec="unassigned" style="${sgTabStyle(false)}">⚠ Без доставчик</button>
        <button class="sg-sec-tab"        data-sec="ai"         style="${sgTabStyle(false)}">🤖 AI предложения</button>
        <button class="sg-sec-tab"        data-sec="assigned"   style="${sgTabStyle(false)}">✅ Назначени</button>
      </div>

      <!-- Groups container -->
      <div id="sgGroupsContainer">
        <div style="text-align:center;padding:40px;color:#8bb4d8;">Зареждане…</div>
      </div>

    </div>`;

    // Populate building filter from cache
    const sgBuilding = document.getElementById('sgFilterBuilding');
    if (sgBuilding && window._cachedBuildings) {
        window._cachedBuildings.filter(b => b.active).forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.code;
            opt.textContent = `${b.code} — ${b.name}`;
            sgBuilding.appendChild(opt);
        });
    }

    // Wire controls
    document.getElementById('sgSearch')?.addEventListener('input', e => {
        _sgFilters.search = e.target.value.toLowerCase().trim();
        renderWorkbench(_sgData);
    });
    document.getElementById('sgFilterBuilding')?.addEventListener('change', e => {
        _sgFilters.building = e.target.value;
        renderWorkbench(_sgData);
    });
    document.getElementById('sgFilterPriority')?.addEventListener('change', e => {
        _sgFilters.priority = e.target.value;
        renderWorkbench(_sgData);
    });
    document.getElementById('sgRefreshBtn')?.addEventListener('click', fetchAndRenderSupplierGroups);

    // Section tabs
    document.getElementById('sgSectionTabs')?.addEventListener('click', e => {
        const btn = e.target.closest('.sg-sec-tab');
        if (!btn) return;
        _sgSection = btn.dataset.sec;
        document.querySelectorAll('.sg-sec-tab').forEach(b => {
            b.style.cssText = sgTabStyle(b === btn);
            b.classList.toggle('active', b === btn);
        });
        renderWorkbench(_sgData);
    });

    await fetchAndRenderSupplierGroups();
}

function sgTabStyle(active) {
    return active
        ? 'background:#e8682a;color:#fff;border:none;border-radius:7px 7px 0 0;padding:7px 16px;font-size:0.8rem;font-weight:700;cursor:pointer;margin-bottom:-2px;border-bottom:2px solid #e8682a;'
        : 'background:transparent;color:#8899aa;border:none;border-radius:7px 7px 0 0;padding:7px 16px;font-size:0.8rem;font-weight:500;cursor:pointer;margin-bottom:-2px;';
}

// ── Fetch from API ────────────────────────────────────────────────────────────
async function fetchAndRenderSupplierGroups() {
    const params = {};
    if (_sgFilters.building) params.building = _sgFilters.building;
    if (_sgFilters.priority) params.priority = _sgFilters.priority;

    document.getElementById('sgGroupsContainer').innerHTML =
        `<div style="text-align:center;padding:40px;color:#64748b;">Зареждане…</div>`;

    try {
        const data = await apiGet('/orders/by-supplier', params);
        _sgData = data;
        renderWorkbench(data);
    } catch (err) {
        document.getElementById('sgGroupsContainer').innerHTML =
            `<div style="text-align:center;padding:40px;color:#dc2626;">Грешка: ${escapeHtml(err.message)}</div>`;
    }
}

// ── Main render ───────────────────────────────────────────────────────────────
function renderWorkbench(data) {
    if (!data || !data.success) return;
    const { groups, summary } = data;

    // ── Update summary KPIs ──
    updateSgSummary(summary, groups);

    // ── Apply search + filters ──
    let allOrders = groups.flatMap(g => g.orders.map(o => ({ ...o, _groupSupplierId: g.supplier_id, _groupSupplierName: g.supplier_name })));

    if (_sgFilters.building) allOrders = allOrders.filter(o => o.building === _sgFilters.building);
    if (_sgFilters.priority) allOrders = allOrders.filter(o => o.priority === _sgFilters.priority);
    if (_sgFilters.search) {
        const q = _sgFilters.search;
        allOrders = allOrders.filter(o =>
            (o.item_description || '').toLowerCase().includes(q) ||
            (o.part_number || '').toLowerCase().includes(q) ||
            (o.requester_name || '').toLowerCase().includes(q) ||
            String(o.id).includes(q)
        );
    }

    // ── Split into three buckets ──
    const noSuggestion = allOrders.filter(o => !o.supplier_id && !o.ai_suggestion);
    const aiSuggested  = allOrders.filter(o => !o.supplier_id &&  o.ai_suggestion);
    const assigned     = allOrders.filter(o =>  o.supplier_id);

    // Group AI suggested by suggested supplier
    const aiGroupMap = new Map();
    for (const order of aiSuggested) {
        const key = String(order.ai_suggestion.supplier_id);
        if (!aiGroupMap.has(key)) {
            aiGroupMap.set(key, {
                supplier_id:   order.ai_suggestion.supplier_id,
                supplier_name: order.ai_suggestion.supplier_name,
                avg_confidence: 0,
                orders: []
            });
        }
        aiGroupMap.get(key).orders.push(order);
    }
    // Compute avg confidence per AI group
    for (const g of aiGroupMap.values()) {
        g.avg_confidence = Math.round(g.orders.reduce((s, o) => s + o.ai_suggestion.confidence, 0) / g.orders.length);
    }
    const aiGroups = Array.from(aiGroupMap.values()).sort((a, b) => b.avg_confidence - a.avg_confidence);

    // Group assigned by actual supplier
    const assignedGroupMap = new Map();
    for (const order of assigned) {
        const key = String(order._groupSupplierId);
        if (!assignedGroupMap.has(key)) {
            assignedGroupMap.set(key, {
                supplier_id:   order._groupSupplierId,
                supplier_name: order._groupSupplierName,
                orders: []
            });
        }
        assignedGroupMap.get(key).orders.push(order);
    }
    const assignedGroups = Array.from(assignedGroupMap.values())
        .sort((a, b) => {
            const aU = a.orders.filter(o => o.priority === 'Urgent').length;
            const bU = b.orders.filter(o => o.priority === 'Urgent').length;
            return bU - aU || b.orders.length - a.orders.length;
        });

    // ── Update section tab counters ──
    updateSgTabCounts(noSuggestion.length, aiSuggested.length, assigned.length);

    // ── Render based on active section ──
    const container = document.getElementById('sgGroupsContainer');
    let html = '';

    const showUnassigned = _sgSection === 'all' || _sgSection === 'unassigned';
    const showAi         = _sgSection === 'all' || _sgSection === 'ai';
    const showAssigned   = _sgSection === 'all' || _sgSection === 'assigned';

    // SECTION 1 — No suggestion
    if (showUnassigned && noSuggestion.length > 0) {
        html += renderSectionHeader('⚠ Без доставчик и без AI предложение', noSuggestion.length,
            '#7f1d1d', '#fff7f7',
            'Тези заявки са нови артикули — системата няма историческа информация за тях. Изберете доставчик ръчно.');
        html += noSuggestion.map(o => renderWBOrderRow(o, 'no-suggestion')).join('');
        html += '</div>';
    }

    // SECTION 2 — AI suggested groups
    if (showAi && aiGroups.length > 0) {
        html += `<div style="margin-bottom:8px;">`;
        html += renderSectionHeader('🤖 AI предложения — групирани по доставчик', aiSuggested.length,
            '#1e40af', '#eff6ff',
            'Системата е открила подходящ доставчик на база исторически поръчки. Прегледайте и потвърдете с един клик.');
        html += `</div>`;

        for (const aiGroup of aiGroups) {
            html += renderAiSupplierGroup(aiGroup);
        }
    }

    // SECTION 3 — Assigned supplier groups
    if (showAssigned && assignedGroups.length > 0) {
        html += renderSectionHeader('✅ Назначени доставчици', assigned.length,
            '#14532d', '#f0fdf4',
            'Поръчките с потвърден доставчик. Можете да изпратите запитване или да актуализирате статуса.');
        html += assignedGroups.map(g => renderAssignedSupplierGroup(g)).join('');
        html += '</div>';
    }

    if (!html) {
        html = `<div style="text-align:center;padding:60px;color:#8899aa;font-size:0.9rem;">Няма активни заявки за избраните филтри.</div>`;
    }

    container.innerHTML = html;
    wireWorkbenchEvents(container);
}

// ── Section header ────────────────────────────────────────────────────────────
function renderSectionHeader(title, count, color, bg, hint) {
    return `
    <div style="background:#162032;border:1px solid #2a4a7a;border-radius:10px;
                padding:12px 16px;margin-bottom:12px;margin-top:4px;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:0.95rem;font-weight:800;color:#e2e8f0;flex:1;">${title}</span>
        <span style="background:#1e3a5f;color:#8bb4d8;border-radius:12px;padding:2px 12px;font-size:0.75rem;font-weight:700;border:1px solid #2a4a7a;">${count} заявки</span>
      </div>
      <div style="font-size:0.75rem;color:#7a9bbf;margin-top:4px;">${hint}</div>
    </div>
    <div>`;
}

// ── AI supplier group card ────────────────────────────────────────────────────
function renderAiSupplierGroup(aiGroup) {
    const conf = aiGroup.avg_confidence;
    const confColor = conf >= 80 ? '#16a34a' : conf >= 60 ? '#d97706' : '#dc2626';
    const urgentCount = aiGroup.orders.filter(o => o.priority === 'Urgent').length;

    return `
    <div class="sg-ai-group" style="background:#111e2c;border:1px solid #2a4a7a;border-radius:10px;
                                    margin-bottom:12px;overflow:hidden;">
      <!-- AI Group Header -->
      <div class="sg-group-header" style="background:linear-gradient(135deg,#162840,#1a2f4a);
                  padding:14px 18px;cursor:pointer;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <div style="flex:1 1 200px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
            <span style="font-size:0.75rem;background:#3b82f6;color:#fff;border-radius:10px;padding:1px 8px;font-weight:700;">🤖 AI</span>
            <span style="font-weight:700;font-size:0.93rem;color:#e2e8f0;">${escapeHtml(aiGroup.supplier_name)}</span>
            <span style="background:${confColor}18;color:${confColor};border-radius:10px;padding:2px 10px;font-size:0.75rem;font-weight:700;">
              Увереност: ${conf}%
            </span>
            ${urgentCount > 0 ? `<span style="background:#fee2e2;color:#dc2626;border-radius:10px;padding:2px 8px;font-size:0.72rem;font-weight:700;">🔴 ${urgentCount} спешни</span>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <span style="background:#e0e7ff;color:#3730a3;border-radius:10px;padding:1px 9px;font-size:0.72rem;font-weight:600;">${aiGroup.orders.length} заявки</span>
            ${[...new Set(aiGroup.orders.map(o => o.building))].map(b =>
              `<span style="background:#1e3050;color:#8bb4d8;border-radius:10px;padding:1px 7px;font-size:0.7rem;">${b}</span>`
            ).join('')}
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button class="sg-confirm-all-btn btn btn-sm"
            data-supplier-id="${aiGroup.supplier_id}"
            data-supplier-name="${escapeHtml(aiGroup.supplier_name)}"
            data-order-ids="${aiGroup.orders.map(o => o.id).join(',')}"
            style="background:#3b82f6;color:#fff;border:none;border-radius:7px;padding:6px 14px;
                   font-size:0.78rem;font-weight:700;cursor:pointer;white-space:nowrap;">
            ⚡ Потвърди всички (${aiGroup.orders.length})
          </button>
          <span class="sg-arrow" style="font-size:0.8rem;color:#5a7a9a;">▲</span>
        </div>
      </div>
      <!-- Orders -->
      <div class="sg-group-body" style="padding:12px 14px;background:#0d1823;">
        ${aiGroup.orders.map(o => renderWBOrderRow(o, 'ai')).join('')}
      </div>
    </div>`;
}

// ── Assigned supplier group card ──────────────────────────────────────────────
function renderAssignedSupplierGroup(group) {
    const urgentCount = group.orders.filter(o => o.priority === 'Urgent').length;
    const buildings   = [...new Set(group.orders.map(o => o.building))];

    // Status breakdown
    const statusMap = {};
    group.orders.forEach(o => { statusMap[o.status] = (statusMap[o.status] || 0) + 1; });
    const statusPills = Object.entries(statusMap).map(([s, n]) => {
        const c = { 'New':'#3b82f6','Pending':'#f59e0b','Quote Requested':'#8b5cf6',
                    'Quote Received':'#06b6d4','Approved':'#10b981','Ordered':'#6366f1' }[s] || '#64748b';
        return `<span style="background:${c}18;color:${c};border-radius:10px;padding:1px 8px;font-size:0.7rem;font-weight:600;">${n}× ${s}</span>`;
    }).join('');

    return `
    <div style="background:#111e2c;border:1px solid #1e3a2a;border-radius:10px;
                margin-bottom:12px;overflow:hidden;">
      <div class="sg-group-header" style="background:linear-gradient(135deg,#132213,#1a2f1a);
                  padding:14px 18px;cursor:pointer;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <div style="flex:1 1 200px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
            <span style="font-weight:700;font-size:0.93rem;color:#e2e8f0;">${escapeHtml(group.supplier_name)}</span>
            ${urgentCount > 0 ? `<span style="background:#fee2e2;color:#dc2626;border-radius:10px;padding:2px 8px;font-size:0.72rem;font-weight:700;">🔴 ${urgentCount} спешни</span>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <span style="background:#bbf7d0;color:#14532d;border-radius:10px;padding:1px 9px;font-size:0.72rem;font-weight:700;">${group.orders.length} заявки</span>
            ${buildings.map(b => `<span style="background:#1e3050;color:#8bb4d8;border-radius:10px;padding:1px 7px;font-size:0.7rem;">${b}</span>`).join('')}
            ${statusPills}
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button class="sg-bulk-status-btn btn btn-sm"
            data-supplier-name="${escapeHtml(group.supplier_name)}"
            data-order-ids="${group.orders.map(o => o.id).join(',')}"
            style="background:#10b981;color:#fff;border:none;border-radius:7px;padding:6px 14px;
                   font-size:0.78rem;font-weight:700;cursor:pointer;white-space:nowrap;">
            📋 Актуализирай статус
          </button>
          <span class="sg-arrow" style="font-size:0.8rem;color:#5a7a9a;">▲</span>
        </div>
      </div>
      <div class="sg-group-body" style="padding:12px 14px;background:#0d1823;">
        ${group.orders.map(o => renderWBOrderRow(o, 'assigned')).join('')}
      </div>
    </div>`;
}

// ── Single order row ──────────────────────────────────────────────────────────
function renderWBOrderRow(order, mode) {
    const prio = { Urgent:'🔴', High:'🟠', Normal:'🟡', Low:'⚪' }[order.priority] || '•';
    const statusColors = {
        'New':'#3b82f6','Pending':'#f59e0b','Quote Requested':'#8b5cf6',
        'Quote Received':'#06b6d4','Approved':'#10b981','Ordered':'#6366f1'
    };
    const sc = statusColors[order.status] || '#64748b';

    const dateNeeded = order.date_needed
        ? new Date(order.date_needed).toLocaleDateString('bg-BG')
        : null;

    // Days until needed
    let urgencyTag = '';
    if (order.date_needed) {
        const days = Math.ceil((new Date(order.date_needed) - new Date()) / 86400000);
        if (days < 0)       urgencyTag = `<span style="background:#fee2e2;color:#dc2626;border-radius:8px;padding:1px 7px;font-size:0.68rem;font-weight:700;">ПРОСРОЧЕНА ${Math.abs(days)}д</span>`;
        else if (days <= 3) urgencyTag = `<span style="background:#fef3c7;color:#b45309;border-radius:8px;padding:1px 7px;font-size:0.68rem;font-weight:700;">⏰ ${days}д</span>`;
    }

    // Action buttons depending on mode
    let actionHtml = '';
    if (mode === 'ai') {
        const s = order.ai_suggestion;
        const confColor = s.confidence >= 80 ? '#16a34a' : s.confidence >= 60 ? '#d97706' : '#dc2626';
        actionHtml = `
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="background:${confColor}18;color:${confColor};border-radius:8px;padding:2px 8px;font-size:0.7rem;font-weight:700;">${s.confidence}%</span>
            <button class="sg-assign-btn btn btn-sm"
              data-order-id="${order.id}"
              data-supplier-id="${s.supplier_id}"
              data-supplier-name="${escapeHtml(s.supplier_name)}"
              style="background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:3px 10px;font-size:0.72rem;cursor:pointer;font-weight:600;white-space:nowrap;">
              ⚡ Потвърди
            </button>
            <button class="sg-order-link btn btn-sm" data-order-id="${order.id}"
              style="background:transparent;color:#1e3a5f;border:1px solid #cbd5e1;border-radius:6px;padding:3px 8px;font-size:0.7rem;cursor:pointer;">
              →
            </button>
          </div>`;
    } else if (mode === 'no-suggestion') {
        actionHtml = `
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:0.7rem;color:#5a7a9a;white-space:nowrap;">Нов артикул</span>
            <button class="sg-order-link btn btn-sm" data-order-id="${order.id}"
              style="background:#e8682a;color:#fff;border:none;border-radius:6px;padding:3px 10px;font-size:0.72rem;cursor:pointer;font-weight:600;">
              Избери →
            </button>
          </div>`;
    } else {
        actionHtml = `
          <button class="sg-order-link btn btn-sm" data-order-id="${order.id}"
            style="background:transparent;color:#8bb4d8;border:1px solid #2d4a6a;border-radius:6px;padding:3px 9px;font-size:0.7rem;cursor:pointer;">
            Отвори →
          </button>`;
    }

    return `
    <div style="background:#0d1a26;border:1px solid #1e3050;border-radius:8px;padding:10px 12px;margin-bottom:7px;
                ${order.priority === 'Urgent' ? 'border-left:3px solid #dc2626;' : 'border-left:3px solid transparent;'}">
      <div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div style="flex:1 1 180px;min-width:0;">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:3px;">
            <span style="font-size:0.73rem;color:#5a7a9a;font-weight:600;">#${order.id}</span>
            <span style="background:${sc}18;color:${sc};border-radius:8px;padding:1px 7px;font-size:0.7rem;font-weight:600;">${order.status}</span>
            <span>${prio}</span>
            <span style="background:#1e3050;color:#8bb4d8;border-radius:8px;padding:1px 6px;font-size:0.68rem;">${order.building}</span>
            ${urgencyTag}
          </div>
          <div style="font-weight:600;font-size:0.85rem;color:#e2e8f0;line-height:1.3;margin-bottom:2px;
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:400px;">
            ${escapeHtml(order.item_description)}
          </div>
          <div style="font-size:0.73rem;color:#7a94b0;">
            ${order.part_number ? `<strong>${escapeHtml(order.part_number)}</strong> · ` : ''}
            Кол: <strong>${order.quantity}</strong>
            ${dateNeeded ? ` · До: <strong>${dateNeeded}</strong>` : ''}
            ${order.requester_name ? ` · ${escapeHtml(order.requester_name)}` : ''}
            ${order.cost_center_code ? ` · <span style="color:#7c3aed;">${escapeHtml(order.cost_center_code)}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
          ${actionHtml}
        </div>
      </div>
    </div>`;
}

// ── Summary KPI bar ───────────────────────────────────────────────────────────
function updateSgSummary(summary, groups) {
    const bar = document.getElementById('sgSummaryBar');
    if (!bar) return;

    // Count overdue (date_needed < today, not delivered)
    const today = new Date(); today.setHours(0,0,0,0);
    const allOrders = groups.flatMap(g => g.orders);
    const overdueCount = allOrders.filter(o =>
        o.date_needed && new Date(o.date_needed) < today
    ).length;

    const kpis = [
        { label: 'Общо активни',    value: summary.total_orders,     color: '#1e3a5f', bg: '#eff6ff' },
        { label: 'Без доставчик',   value: summary.unassigned_count, color: summary.unassigned_count > 0 ? '#dc2626' : '#64748b', bg: summary.unassigned_count > 0 ? '#fff7f7' : '#f8fafc' },
        { label: 'AI предложения',  value: summary.with_suggestion,  color: '#2563eb', bg: '#eff6ff' },
        { label: 'Назначени',       value: summary.assigned_count,   color: '#16a34a', bg: '#f0fdf4' },
        { label: 'Доставчици',      value: summary.supplier_count,   color: '#7c3aed', bg: '#faf5ff' },
        { label: '🔴 Спешни',       value: summary.urgent_count,     color: summary.urgent_count > 0 ? '#dc2626' : '#94a3b8', bg: summary.urgent_count > 0 ? '#fff7f7' : '#f8fafc' },
        { label: '⏰ Просрочени',   value: overdueCount,             color: overdueCount > 0 ? '#b45309' : '#94a3b8', bg: overdueCount > 0 ? '#fffbeb' : '#f8fafc' },
    ];

    bar.innerHTML = kpis.map(k => `
        <div style="background:#1e2d3d;border:1px solid #2d3e6b;border-radius:10px;
                    padding:10px 16px;min-width:90px;text-align:center;cursor:default;">
            <div style="font-size:1.3rem;font-weight:800;color:${k.color};line-height:1;">${k.value}</div>
            <div style="font-size:0.68rem;color:#8899aa;font-weight:600;margin-top:3px;white-space:nowrap;">${k.label}</div>
        </div>
    `).join('');
}

// ── Section tab counters ──────────────────────────────────────────────────────
function updateSgTabCounts(noSugg, aiCount, assignedCount) {
    document.querySelectorAll('.sg-sec-tab').forEach(btn => {
        const sec = btn.dataset.sec;
        const counts = { all: noSugg + aiCount + assignedCount, unassigned: noSugg, ai: aiCount, assigned: assignedCount };
        const n = counts[sec] ?? '';
        // Remove old count badge
        btn.textContent = btn.textContent.replace(/\s*\(\d+\)$/, '');
        const labels = { all: 'Всички', unassigned: '⚠ Без доставчик', ai: '🤖 AI предложения', assigned: '✅ Назначени' };
        btn.textContent = `${labels[sec]} (${n})`;
    });
}

// ── Wire all interactive events ───────────────────────────────────────────────
function wireWorkbenchEvents(container) {

    // Collapse/expand group headers
    container.querySelectorAll('.sg-group-header').forEach(header => {
        header.addEventListener('click', e => {
            if (e.target.closest('button')) return; // don't collapse when clicking buttons
            const body  = header.nextElementSibling;
            const arrow = header.querySelector('.sg-arrow');
            const hidden = body.style.display === 'none';
            body.style.display = hidden ? '' : 'none';
            if (arrow) arrow.textContent = hidden ? '▲' : '▼';
        });
    });

    // Single assign button
    container.querySelectorAll('.sg-assign-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const { orderId, supplierId, supplierName } = btn.dataset;
            if (!confirm(`Назначи "${supplierName}" за заявка #${orderId}?`)) return;
            await doAssign([parseInt(orderId)], parseInt(supplierId), supplierName, btn, `✓ Назначен`);
        });
    });

    // Confirm ALL in AI group
    container.querySelectorAll('.sg-confirm-all-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const { supplierId, supplierName, orderIds } = btn.dataset;
            const ids = orderIds.split(',').map(Number);
            if (!confirm(`Назначи "${supplierName}" за ${ids.length} заявки?`)) return;
            btn.disabled = true; btn.textContent = '…';
            let ok = 0;
            for (const id of ids) {
                try {
                    const res = await apiPut(`/orders/${id}`, { supplier_id: parseInt(supplierId) });
                    if (res.success) ok++;
                } catch(_) {}
            }
            btn.textContent = `✓ ${ok}/${ids.length} назначени`;
            btn.style.background = '#16a34a';
            setTimeout(() => fetchAndRenderSupplierGroups(), 1000);
        });
    });

    // Bulk status update for assigned group
    container.querySelectorAll('.sg-bulk-status-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const { supplierName, orderIds } = btn.dataset;
            const ids = orderIds.split(',').map(Number);
            const newStatus = prompt(
                `Актуализирай статуса на ${ids.length} заявки от "${supplierName}":\n\nВъведи нов статус:\nNew / Pending / Quote Requested / Quote Received / Approved / Ordered / Delivered`
            );
            if (!newStatus || !newStatus.trim()) return;
            btn.disabled = true; btn.textContent = '…';
            try {
                const res = await apiPost('/orders/bulk-status', { order_ids: ids, status: newStatus.trim() });
                if (res.success) {
                    btn.textContent = `✓ ${res.updated} актуализирани`;
                    btn.style.background = '#16a34a';
                    setTimeout(() => fetchAndRenderSupplierGroups(), 1200);
                } else {
                    btn.disabled = false; btn.textContent = '📋 Актуализирай статус';
                    alert('Грешка: ' + (res.message || 'Unknown'));
                }
            } catch(err) {
                btn.disabled = false; btn.textContent = '📋 Актуализирай статус';
                alert('Грешка: ' + err.message);
            }
        });
    });

    // Open order detail — opens on top of current tab, no tab switch
    container.querySelectorAll('.sg-order-link').forEach(link => {
        link.addEventListener('click', e => {
            e.stopPropagation();
            openOrderDetail(parseInt(link.dataset.orderId, 10));
        });
    });
}

// ── Assign helper ─────────────────────────────────────────────────────────────
async function doAssign(orderIds, supplierId, supplierName, btn, successText) {
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
        const res = await apiPut(`/orders/${orderIds[0]}`, { supplier_id: supplierId });
        if (res.success) {
            if (btn) { btn.textContent = successText; btn.style.background = '#16a34a'; }
            setTimeout(() => fetchAndRenderSupplierGroups(), 1000);
        } else {
            if (btn) { btn.disabled = false; btn.textContent = '⚡ Потвърди'; }
            alert('Грешка: ' + (res.message || 'Unknown'));
        }
    } catch(err) {
        if (btn) { btn.disabled = false; btn.textContent = '⚡ Потвърди'; }
        alert('Грешка: ' + err.message);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// ⭐ Description Correction — inline editor in Order Details
// ──────────────────────────────────────────────────────────────────────────────

function openDescriptionEditor(orderId) {
    const viewEl   = document.getElementById(`desc-view-${orderId}`);
    const editorEl = document.getElementById(`desc-editor-${orderId}`);
    if (!viewEl || !editorEl) return;
    viewEl.style.display   = 'none';
    editorEl.style.display = 'block';
    const ta = document.getElementById(`desc-text-${orderId}`);
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

function cancelDescriptionEdit(orderId) {
    const viewEl   = document.getElementById(`desc-view-${orderId}`);
    const editorEl = document.getElementById(`desc-editor-${orderId}`);
    const statusEl = document.getElementById(`desc-status-${orderId}`);
    if (viewEl)   viewEl.style.display   = 'block';
    if (editorEl) editorEl.style.display = 'none';
    if (statusEl) statusEl.textContent   = '';
}

async function saveDescriptionCorrection(orderId) {
    const ta       = document.getElementById(`desc-text-${orderId}`);
    const statusEl = document.getElementById(`desc-status-${orderId}`);
    const viewEl   = document.getElementById(`desc-view-${orderId}`);
    const editorEl = document.getElementById(`desc-editor-${orderId}`);
    if (!ta) return;

    const newDesc = ta.value.trim();
    if (!newDesc) { alert('Описанието не може да е празно.'); return; }

    if (statusEl) statusEl.textContent = 'Запазване…';

    try {
        const res = await apiPost(`/orders/${orderId}/correct-description`, {
            item_description: newDesc
        });

        if (res.success) {
            // Update the visible text immediately
            if (viewEl) viewEl.textContent = newDesc;
            if (editorEl) editorEl.style.display = 'none';
            if (viewEl)   viewEl.style.display   = 'block';
            if (statusEl) statusEl.textContent   = '';

            // Update the in-memory order state so table row also reflects it
            const orderInState = ordersState.find(o => o.id === orderId);
            if (orderInState) orderInState.item_description = newDesc;

            // Show a brief toast-style confirmation
            showDescToast('✓ Описанието е коригирано. AI речникът се обогатява на фон.');
        } else {
            if (statusEl) statusEl.textContent = 'Грешка: ' + (res.message || 'unknown');
        }
    } catch (err) {
        if (statusEl) statusEl.textContent = 'Грешка: ' + err.message;
    }
}

function showDescToast(msg) {
    let toast = document.getElementById('descCorrectionToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'descCorrectionToast';
        toast.style.cssText = [
            'position:fixed', 'bottom:24px', 'right:24px', 'z-index:99999',
            'background:#16a34a', 'color:#fff', 'padding:10px 20px',
            'border-radius:8px', 'font-size:0.85rem', 'font-weight:600',
            'box-shadow:0 4px 16px rgba(0,0,0,0.4)', 'transition:opacity 0.4s'
        ].join(';');
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.display = 'block';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; }, 400);
    }, 3000);
}
