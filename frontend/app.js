// frontend/app.js — PartPulse Orders v3.1.0 — Clean Rewrite
// Stack: Vanilla JS, no frameworks. All tabs wired here.

'use strict';

// ============================================================
//  CONSTANTS & GLOBAL STATE
// ============================================================

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
let viewMode = 'flat';

// Pagination
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
    quickFilter: ''
};

const ORDER_STATUSES = [
    'New', 'Pending', 'Quote Requested', 'Quote Received',
    'Quote Under Approval', 'Approved', 'Ordered',
    'In Transit', 'Partially Delivered', 'Delivered',
    'Cancelled', 'On Hold'
];

const PRIORITY_ORDER = { Urgent: 1, High: 2, Normal: 3, Low: 4 };

// ============================================================
//  INIT
// ============================================================

window.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupDatePickers();
    checkAuth();
});

function setupDatePickers() {
    document.addEventListener('click', e => {
        const di = e.target.closest('input[type="date"].date-picker');
        if (di && typeof di.showPicker === 'function') {
            try { di.showPicker(); } catch (_) {}
        }
    });
}

// ============================================================
//  EVENT LISTENERS
// ============================================================

function setupEventListeners() {
    // Auth
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Requester create order
    document.getElementById('createOrderForm').addEventListener('submit', handleCreateOrder);
    document.getElementById('building').addEventListener('change', e => renderCostCenterRadios(e.target.value));

    // Orders filters
    const fs = id => document.getElementById(id);
    fs('filterSearch').addEventListener('input', () => { filterState.search = fs('filterSearch').value.trim(); currentPage = 1; applyFilters(); });
    fs('filterStatus').addEventListener('change', () => { filterState.status = fs('filterStatus').value; currentPage = 1; applyFilters(); });
    fs('filterBuilding').addEventListener('change', () => { filterState.building = fs('filterBuilding').value; currentPage = 1; applyFilters(); });
    fs('filterPriority').addEventListener('change', () => { filterState.priority = fs('filterPriority').value; currentPage = 1; applyFilters(); });
    fs('filterSupplier').addEventListener('change', () => { filterState.supplier = fs('filterSupplier').value; currentPage = 1; applyFilters(); });
    fs('filterDelivery').addEventListener('change', () => { filterState.delivery = fs('filterDelivery').value; currentPage = 1; applyFilters(); });
    fs('btnClearFilters').addEventListener('click', clearFilters);

    // Quick filter chips
    document.querySelectorAll('.quick-filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const f = chip.dataset.filter;
            if (filterState.quickFilter === f) {
                filterState.quickFilter = '';
                chip.classList.remove('active');
            } else {
                document.querySelectorAll('.quick-filter-chip').forEach(c => c.classList.remove('active'));
                filterState.quickFilter = f;
                chip.classList.add('active');
            }
            currentPage = 1;
            applyFilters();
        });
    });

    // View mode
    document.getElementById('btnViewFlat').addEventListener('click', () => setViewMode('flat'));
    document.getElementById('btnViewGrouped').addEventListener('click', () => setViewMode('grouped'));

    // Order detail panel
    document.getElementById('btnCloseDetail').addEventListener('click', () => {
        document.getElementById('orderDetailPanel').classList.add('hidden');
    });

    // Quote detail panel
    document.getElementById('btnCloseQuoteDetail').addEventListener('click', () => {
        document.getElementById('quoteDetailPanel').classList.add('hidden');
    });
    document.getElementById('btnRefreshQuotes').addEventListener('click', loadQuotes);
    document.getElementById('btnNewQuoteFromQuotesTab').addEventListener('click', () => {
        switchTab('ordersTab');
        showToast('Select orders then click "Create Quote from Selected"');
    });

    // Create quote modal
    document.getElementById('btnCreateQuote').addEventListener('click', openCreateQuoteDialog);
    document.getElementById('btnCloseQuoteModal').addEventListener('click', () => closeModal('createQuoteModal'));
    document.getElementById('btnCancelQuoteModal').addEventListener('click', () => closeModal('createQuoteModal'));
    document.getElementById('createQuoteModalOverlay').addEventListener('click', () => closeModal('createQuoteModal'));
    document.getElementById('createQuoteForm').addEventListener('submit', handleCreateQuoteSubmit);

    // Approvals tab
    document.getElementById('btnRefreshApprovals').addEventListener('click', loadApprovals);
    document.getElementById('btnClearApprovalFilters').addEventListener('click', clearApprovalFilters);
    document.getElementById('approvalSearch').addEventListener('input', renderApprovalsTable);
    document.getElementById('approvalStatusFilter').addEventListener('change', renderApprovalsTable);
    document.getElementById('approvalPriorityFilter').addEventListener('change', renderApprovalsTable);
    document.getElementById('btnCloseApprovalDetail').addEventListener('click', () => {
        document.getElementById('approvalDetailPanel').classList.add('hidden');
    });

    // Suppliers
    document.getElementById('btnNewSupplier').addEventListener('click', () => openSupplierForm());
    document.getElementById('btnCancelSupplier').addEventListener('click', () => { document.getElementById('supplierFormCard').hidden = true; });
    document.getElementById('supplierForm').addEventListener('submit', handleSaveSupplier);

    // Buildings
    document.getElementById('btnNewBuilding').addEventListener('click', () => openBuildingForm());
    document.getElementById('btnCancelBuilding').addEventListener('click', () => { document.getElementById('buildingFormCard').hidden = true; });
    document.getElementById('buildingForm').addEventListener('submit', handleSaveBuilding);

    // Cost Centers
    document.getElementById('btnNewCostCenter').addEventListener('click', () => openCostCenterForm());
    document.getElementById('btnCancelCostCenter').addEventListener('click', () => { document.getElementById('costCenterFormCard').hidden = true; });
    document.getElementById('btnDeleteCostCenter').addEventListener('click', handleDeleteCostCenter);
    document.getElementById('costCenterForm').addEventListener('submit', handleSaveCostCenter);
    document.getElementById('ccFilterBuilding').addEventListener('change', renderCostCentersTable);

    // Users
    document.getElementById('btnNewUser').addEventListener('click', () => openUserForm());
    document.getElementById('btnCancelUser').addEventListener('click', () => { document.getElementById('userFormCard').hidden = true; });
    document.getElementById('userForm').addEventListener('submit', handleSaveUser);

    // Procurement create order modal
    document.getElementById('btnCreateOrderGlobal').addEventListener('click', openProcCreateOrderModal);
    document.getElementById('btnCloseProcModal').addEventListener('click', () => closeModal('procCreateOrderModal'));
    document.getElementById('procCreateOrderModalOverlay').addEventListener('click', () => closeModal('procCreateOrderModal'));
    document.getElementById('procBuilding').addEventListener('change', e => renderProcCostCenterRadios(e.target.value));
    document.getElementById('procCreateOrderForm').addEventListener('submit', handleProcCreateOrderSubmit);

    // Language selectors
    const langLogin = document.getElementById('languageSelectorLogin');
    const langMain = document.getElementById('languageSelector');
    if (langLogin) langLogin.addEventListener('change', e => { if (typeof i18n !== 'undefined') i18n.setLanguage(e.target.value); });
    if (langMain) langMain.addEventListener('change', e => { if (typeof i18n !== 'undefined') i18n.setLanguage(e.target.value); });
}

// ============================================================
//  MODAL HELPERS
// ============================================================

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ============================================================
//  AUTH
// ============================================================

async function checkAuth() {
    const token = localStorage.getItem('authToken');
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
    const loginError = document.getElementById('loginError');
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
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('authToken', authToken);
        showDashboard();
    } catch {
        loginError.textContent = 'Connection error. Please try again.';
        loginError.classList.remove('hidden');
    }
}

function handleLogout() {
    localStorage.removeItem('authToken');
    authToken = null;
    currentUser = null;
    resetFiltersOnLogout();
    showLogin();
}

function showLogin() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('dashboardScreen').classList.add('hidden');
    document.getElementById('loginForm').reset();
}

function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboardScreen').classList.remove('hidden');
    document.getElementById('userName').textContent = currentUser.name;

    const roleBadge = document.getElementById('userRole');
    const roleLabels = { admin: 'Admin', procurement: 'Procurement', manager: 'Manager' };
    roleBadge.textContent = roleLabels[currentUser.role] || `Requester — ${currentUser.building || ''}`;

    // Hide all conditional tabs first
    ['usersTabBtn', 'buildingsTabBtn', 'costCentersTabBtn', 'approvalsTabBtn', 'procurementTabBtn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.hidden = true;
    });

    const navTabs = document.getElementById('navTabs');
    const createOrderSection = document.getElementById('createOrderSection');
    const orderActionsContainer = document.getElementById('orderActionsContainer');
    const orderActionsBar = document.getElementById('orderActionsBar');
    const btnGlobal = document.getElementById('btnCreateOrderGlobal');

    if (currentUser.role === 'requester') {
        createOrderSection.classList.remove('hidden');
        document.getElementById('requesterBuildingBadge').textContent = `Building ${currentUser.building}`;
        navTabs.classList.add('hidden');
        if (orderActionsContainer) orderActionsContainer.style.display = 'none';
        if (orderActionsBar) orderActionsBar.style.display = 'none';
    } else {
        createOrderSection.classList.add('hidden');
        navTabs.classList.remove('hidden');
        populateStatusFilter();
        if (orderActionsContainer) orderActionsContainer.style.display = 'flex';
        if (btnGlobal) btnGlobal.hidden = false;

        if (currentUser.role === 'admin') {
            document.getElementById('usersTabBtn').hidden = false;
            document.getElementById('buildingsTabBtn').hidden = false;
            document.getElementById('costCentersTabBtn').hidden = false;
            document.getElementById('approvalsTabBtn').hidden = false;
            document.getElementById('procurementTabBtn').hidden = false;
        } else if (currentUser.role === 'procurement') {
            document.getElementById('approvalsTabBtn').hidden = false;
            document.getElementById('procurementTabBtn').hidden = false;
        } else if (currentUser.role === 'manager') {
            document.getElementById('approvalsTabBtn').hidden = false;
        }
    }

    loadInitialData();
}

// ============================================================
//  DATA LOADING
// ============================================================

async function loadInitialData() {
    await Promise.all([loadBuildings(), loadSuppliers(), loadCostCenters()]);
    populateBuildingSelects();
    populateSupplierFilter();
    populateBuildingFilter();
    await loadOrders();
    if (['admin', 'procurement', 'manager'].includes(currentUser.role)) {
        loadQuotes();
        loadApprovals();
        updateApprovalBadge();
    }
    if (currentUser.role === 'admin') {
        loadUsers();
    }
}

async function loadOrders() {
    try {
        const data = await apiGet('/orders');
        if (data.success) { ordersState = data.orders; applyFilters(); }
    } catch (err) { console.error('loadOrders:', err); }
}

async function loadSuppliers() {
    try {
        const data = await apiGet('/suppliers');
        if (data.success) { suppliersState = data.suppliers; renderSuppliersTable(); }
    } catch (err) { console.error('loadSuppliers:', err); }
}

async function loadBuildings() {
    try {
        const data = await apiGet('/buildings');
        if (data.success) { buildingsState = data.buildings; renderBuildingsTable(); }
    } catch (err) { console.error('loadBuildings:', err); }
}

async function loadCostCenters() {
    try {
        const data = await apiGet('/cost-centers');
        if (data.success) { costCentersState = data.cost_centers; renderCostCentersTable(); }
    } catch (err) { console.error('loadCostCenters:', err); }
}

async function loadUsers() {
    try {
        const data = await apiGet('/users');
        if (data.success) { usersState = data.users; renderUsersTable(); }
    } catch (err) { console.error('loadUsers:', err); }
}

async function loadQuotes() {
    try {
        const data = await apiGet('/quotes');
        if (data.success) { quotesState = data.quotes; renderQuotesTable(); }
    } catch (err) { console.error('loadQuotes:', err); }
}

// ============================================================
//  APPROVAL BADGE
// ============================================================

async function updateApprovalBadge() {
    try {
        const data = await apiGet('/approvals/pending-count');
        const badge = document.getElementById('pendingApprovalBadge');
        if (!badge) return;
        if (data.success && data.count > 0) {
            badge.textContent = data.count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    } catch (_) {}
}

// ============================================================
//  API HELPERS
// ============================================================

async function apiGet(path) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    return res.json();
}

async function apiPost(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(body)
    });
    return res.json();
}

async function apiPut(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(body)
    });
    return res.json();
}

async function apiDelete(path) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` }
    });
    return res.json();
}

// ============================================================
//  POPULATE SELECTS
// ============================================================

function populateBuildingSelects() {
    const active = buildingsState.filter(b => b.is_active);
    const makeOptions = (placeholder, valFn, labelFn) =>
        `<option value="">${placeholder}</option>` +
        active.map(b => `<option value="${valFn(b)}">${labelFn(b)}</option>`).join('');

    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

    set('building', makeOptions('Select Building', b => b.code, b => `${b.code} - ${b.name}`));
    set('procBuilding', makeOptions('Select Building', b => b.code, b => `${b.code} - ${b.name}`));
    set('userBuilding', makeOptions('No Building', b => b.code, b => `${b.code} - ${b.name}`));
    set('ccBuilding', makeOptions('Select Building', b => b.id, b => `${b.code} - ${b.name}`));
    set('ccFilterBuilding', makeOptions('All Buildings', b => b.id, b => `${b.code} - ${b.name}`));
}

function populateSupplierFilter() {
    const active = suppliersState.filter(s => s.is_active);
    const set = (id, placeholder) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = `<option value="">${placeholder}</option>` +
            active.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    };
    set('filterSupplier', 'Supplier: All');
    set('procSupplier', 'No Supplier');
    set('quoteSupplier', 'Select Supplier');
}

function populateBuildingFilter() {
    const el = document.getElementById('filterBuilding');
    if (!el) return;
    el.innerHTML = '<option value="">Building: All</option>' +
        buildingsState.filter(b => b.is_active)
            .map(b => `<option value="${b.code}">${b.code} - ${b.name}</option>`).join('');
}

function populateStatusFilter() {
    const el = document.getElementById('filterStatus');
    if (!el) return;
    el.innerHTML = '<option value="">All Statuses</option>' +
        ORDER_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('');
}

// ============================================================
//  DELIVERY / DATE HELPERS
// ============================================================

function getDeliveryStatus(order) {
    if (order.status === 'Delivered') return 'delivered';
    if (!order.expected_delivery_date) return 'none';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const exp = new Date(order.expected_delivery_date); exp.setHours(0, 0, 0, 0);
    const diff = Math.ceil((exp - today) / 86400000);
    if (diff < 0) return 'late';
    if (diff <= 7) return 'due7';
    if (diff <= 14) return 'due14';
    return 'ontrack';
}

function getDeliveryBadgeHtml(status) {
    const map = {
        delivered: '<span class="delivery-badge delivery-ontrack">Delivered</span>',
        late:      '<span class="delivery-badge delivery-late">Late</span>',
        due7:      '<span class="delivery-badge delivery-due7">Due 7d</span>',
        due14:     '<span class="delivery-badge delivery-due14">Due 14d</span>',
        ontrack:   '<span class="delivery-badge delivery-ontrack">On Track</span>',
        none:      '-'
    };
    return map[status] || '-';
}

function isOldDelivered(order) {
    if (order.status !== 'Delivered') return false;
    const ref = order.created_at ? new Date(order.created_at) : null;
    if (!ref) return false;
    return (Date.now() - ref) / 86400000 > 14;
}

function fmtPrice(val) {
    const n = parseFloat(val);
    return isNaN(n) || n === 0 ? '-' : n.toFixed(2);
}

function fmtDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString();
}

function fmtDateTime(d) {
    if (!d) return '-';
    return new Date(d).toLocaleString();
}

// ============================================================
//  FILTERING
// ============================================================

function applyFilters() {
    filteredOrders = ordersState.filter(order => {
        if (filterState.search) {
            const term = filterState.search.toLowerCase();
            const hay = [
                String(order.id || ''),
                order.item_description || '',
                order.part_number || '',
                order.category || '',
                order.notes || '',
                order.requester_name || '',
                order.cost_center_code || '',
                order.cost_center_name || '',
                order.supplier_name || '',
                order.building || '',
                order.status || '',
                order.quote_number || '',
                (order.files || []).map(f => f.name || '').join(' ')
            ].join(' ').toLowerCase();
            if (!hay.includes(term)) return false;
        }
        if (filterState.status && order.status !== filterState.status) return false;
        if (filterState.building && order.building !== filterState.building) return false;
        if (filterState.priority && order.priority !== filterState.priority) return false;
        if (filterState.supplier && order.supplier_id !== parseInt(filterState.supplier, 10)) return false;
        if (filterState.delivery) {
            if (getDeliveryStatus(order) !== filterState.delivery) return false;
        }
        if (filterState.quickFilter) {
            const qf = filterState.quickFilter;
            if (qf === 'late' || qf === 'due7' || qf === 'due14') {
                if (getDeliveryStatus(order) !== qf) return false;
            } else if (qf === 'new' && order.status !== 'New') return false;
            else if (qf === 'ordered' && order.status !== 'Ordered') return false;
            else if (qf === 'transit' && order.status !== 'In Transit') return false;
        }
        return true;
    });

    filteredOrders.sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] || 3;
        const pb = PRIORITY_ORDER[b.priority] || 3;
        return pa !== pb ? pa - pb : b.id - a.id;
    });

    renderOrdersTable();
}

function clearFilters() {
    filterState = { search: '', status: '', building: '', priority: '', supplier: '', delivery: '', quickFilter: '' };
    ['filterSearch', 'filterStatus', 'filterBuilding', 'filterPriority', 'filterSupplier', 'filterDelivery'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.querySelectorAll('.quick-filter-chip').forEach(c => c.classList.remove('active'));
    currentPage = 1;
    applyFilters();
}

function resetFiltersOnLogout() {
    clearFilters();
    viewMode = 'flat';
    document.getElementById('btnViewFlat').classList.add('active');
    document.getElementById('btnViewGrouped').classList.remove('active');
}

// ============================================================
//  TAB SWITCHING
// ============================================================

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

    const target = document.getElementById(tabId);
    if (target) target.classList.remove('hidden');
    const btn = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');
    currentTab = tabId;

    // Trigger data refresh for the newly active tab
    if (tabId === 'quotesTab') loadQuotes();
    if (tabId === 'approvalsTab') loadApprovals();
    if (tabId === 'suppliersTab') renderSuppliersTable();
    if (tabId === 'buildingsTab') renderBuildingsTable();
    if (tabId === 'costCentersTab') renderCostCentersTable();
    if (tabId === 'usersTab') renderUsersTable();
    if (tabId === 'procurementTab' && typeof initProcurementDashboard === 'function') {
        initProcurementDashboard();
    }
}

// ============================================================
//  VIEW MODE
// ============================================================

function setViewMode(mode) {
    viewMode = mode;
    document.getElementById('btnViewFlat').classList.toggle('active', mode === 'flat');
    document.getElementById('btnViewGrouped').classList.toggle('active', mode === 'grouped');
    currentPage = 1;
    renderOrdersTable();
}

// ============================================================
//  ORDERS TABLE
// ============================================================

function renderOrdersTable() {
    const tbody = document.getElementById('ordersTableBody');
    if (!tbody) return;

    const total = filteredOrders.length;
    const totalPages = Math.max(1, Math.ceil(total / ORDERS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * ORDERS_PER_PAGE;
    const pageOrders = filteredOrders.slice(start, start + ORDERS_PER_PAGE);

    const isAdmin = currentUser && currentUser.role !== 'requester';

    // Update thead based on role
    const thead = document.getElementById('ordersTableHead');
    if (thead) {
        thead.innerHTML = isAdmin
            ? `<tr><th style="width:30px;"></th><th>ID</th><th>Description</th><th>Building</th><th>Status</th><th>Priority</th><th>Supplier</th><th>Delivery</th><th>Exp. Delivery</th><th>Created</th></tr>`
            : `<tr><th>ID</th><th>Description</th><th>Status</th><th>Priority</th><th>Delivery</th><th>Created</th></tr>`;
    }

    if (viewMode === 'grouped') {
        renderGroupedView(pageOrders, tbody, isAdmin);
    } else {
        renderFlatView(pageOrders, tbody, isAdmin);
    }

    renderPagination(total, totalPages);
    updateSelectedCount();
}

function renderFlatView(orders, tbody, isAdmin) {
    const cols = isAdmin ? 10 : 6;
    if (!orders.length) {
        tbody.innerHTML = `<tr><td colspan="${cols}" class="text-center text-gray-400 py-8">No orders found</td></tr>`;
        return;
    }
    tbody.innerHTML = orders.map(o => renderOrderRow(o, isAdmin)).join('');
    attachOrderRowListeners();
}

function renderGroupedView(orders, tbody, isAdmin) {
    const cols = isAdmin ? 10 : 6;
    if (!orders.length) {
        tbody.innerHTML = `<tr><td colspan="${cols}" class="text-center text-gray-400 py-8">No orders found</td></tr>`;
        return;
    }
    const grouped = {};
    orders.forEach(o => { const k = o.building || 'Unknown'; (grouped[k] = grouped[k] || []).push(o); });
    let html = '';
    Object.keys(grouped).sort().forEach(bldg => {
        const cnt = grouped[bldg].length;
        html += `<tr class="bg-gray-750"><td colspan="${cols}" class="px-4 py-2 font-semibold text-blue-300 text-sm">Building: ${bldg} (${cnt} order${cnt !== 1 ? 's' : ''})</td></tr>`;
        html += grouped[bldg].map(o => renderOrderRow(o, isAdmin)).join('');
    });
    tbody.innerHTML = html;
    attachOrderRowListeners();
}

function renderOrderRow(order, isAdmin) {
    const ds = getDeliveryStatus(order);
    const rowCls = `order-row cursor-pointer hover:bg-gray-700${isOldDelivered(order) ? ' opacity-50' : ''}`;
    const chk = selectedOrderIds.has(order.id) ? 'checked' : '';

    if (!isAdmin) {
        return `<tr class="${rowCls}" data-id="${order.id}">
            <td class="px-3 py-2 text-xs text-gray-400">#${order.id}</td>
            <td class="px-3 py-2 text-sm">${escHtml(order.item_description || '')}</td>
            <td class="px-3 py-2">${renderStatusBadge(order.status)}</td>
            <td class="px-3 py-2">${renderPriorityBadge(order.priority)}</td>
            <td class="px-3 py-2 text-sm">${getDeliveryBadgeHtml(ds)}</td>
            <td class="px-3 py-2 text-xs text-gray-400">${fmtDate(order.created_at)}</td>
        </tr>`;
    }

    return `<tr class="${rowCls}" data-id="${order.id}">
        <td class="px-3 py-2" onclick="event.stopPropagation()">
            <input type="checkbox" class="order-checkbox" data-id="${order.id}" ${chk}>
        </td>
        <td class="px-3 py-2 text-xs text-gray-400">#${order.id}</td>
        <td class="px-3 py-2 text-sm max-w-xs truncate" title="${escHtml(order.item_description || '')}">${escHtml(order.item_description || '')}</td>
        <td class="px-3 py-2 text-xs">${order.building || '-'}</td>
        <td class="px-3 py-2">${renderStatusBadge(order.status)}</td>
        <td class="px-3 py-2">${renderPriorityBadge(order.priority)}</td>
        <td class="px-3 py-2 text-xs">${escHtml(order.supplier_name || '-')}</td>
        <td class="px-3 py-2 text-sm">${getDeliveryBadgeHtml(ds)}</td>
        <td class="px-3 py-2 text-xs text-gray-400">${order.expected_delivery_date || '-'}</td>
        <td class="px-3 py-2 text-xs text-gray-400">${fmtDate(order.created_at)}</td>
    </tr>`;
}

function attachOrderRowListeners() {
    const table = document.getElementById('ordersTable');
    if (!table) return;
    table.querySelectorAll('.order-row').forEach(row => {
        row.addEventListener('click', () => showOrderDetail(parseInt(row.dataset.id)));
    });
    table.querySelectorAll('.order-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const id = parseInt(cb.dataset.id);
            if (cb.checked) selectedOrderIds.add(id);
            else selectedOrderIds.delete(id);
            updateSelectedCount();
        });
    });
}

function renderPagination(total, totalPages) {
    const container = document.getElementById('paginationContainer');
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }

    const btn = (p, label, disabled = false, active = false) =>
        `<button onclick="gotoPage(${p})" ${disabled ? 'disabled' : ''} class="px-3 py-1 rounded text-sm ${active ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}">${label}</button>`;

    let html = `<div class="flex items-center gap-2 mt-4 justify-center">`;
    html += btn(currentPage - 1, 'Prev', currentPage === 1);

    const maxBtns = 7;
    let s = Math.max(1, currentPage - 3);
    let e = Math.min(totalPages, s + maxBtns - 1);
    if (e - s < maxBtns - 1) s = Math.max(1, e - maxBtns + 1);

    if (s > 1) { html += btn(1, '1'); if (s > 2) html += '<span class="text-gray-400">…</span>'; }
    for (let p = s; p <= e; p++) html += btn(p, p, false, p === currentPage);
    if (e < totalPages) { if (e < totalPages - 1) html += '<span class="text-gray-400">…</span>'; html += btn(totalPages, totalPages); }

    html += btn(currentPage + 1, 'Next', currentPage === totalPages);
    html += `<span class="text-gray-400 text-xs ml-2">${total} orders</span></div>`;
    container.innerHTML = html;
}

function gotoPage(page) {
    const total = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PER_PAGE));
    if (page < 1 || page > total) return;
    currentPage = page;
    renderOrdersTable();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateSelectedCount() {
    const sc = document.getElementById('selectedCount');
    const bar = document.getElementById('orderActionsBar');
    if (sc) sc.textContent = `${selectedOrderIds.size} selected`;
    if (bar) bar.style.display = selectedOrderIds.size > 0 ? 'flex' : 'none';
}

function renderStatusBadge(status) {
    const colors = {
        New: 'bg-blue-500', Pending: 'bg-yellow-500', 'Quote Requested': 'bg-purple-500',
        'Quote Received': 'bg-indigo-500', 'Quote Under Approval': 'bg-orange-400',
        Approved: 'bg-green-600', Ordered: 'bg-teal-500',
        'In Transit': 'bg-cyan-500', 'Partially Delivered': 'bg-lime-500',
        Delivered: 'bg-green-500', Cancelled: 'bg-red-500', 'On Hold': 'bg-gray-500'
    };
    return `<span class="status-badge ${colors[status] || 'bg-gray-500'} text-white">${status || '-'}</span>`;
}

function renderPriorityBadge(priority) {
    const colors = { Urgent: 'bg-red-600', High: 'bg-orange-500', Normal: 'bg-blue-500', Low: 'bg-gray-500' };
    return `<span class="priority-badge ${colors[priority] || 'bg-gray-500'} text-white">${priority || '-'}</span>`;
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ============================================================
//  ORDER DETAIL PANEL
// ============================================================

async function showOrderDetail(orderId) {
    const order = ordersState.find(o => o.id === orderId);
    if (!order) return;

    const isAdmin = currentUser.role !== 'requester';
    const isRequester = currentUser.role === 'requester';
    const ds = getDeliveryStatus(order);

    // Attachments
    const attachments = (order.files || []).map(f => {
        const filename = f.path && (f.path.startsWith('/') || f.path.startsWith('http'))
            ? f.path
            : `/uploads/${f.path || f.name}`;
        return `<a href="${filename}" target="_blank" rel="noopener" class="text-blue-400 hover:underline text-sm flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
            ${escHtml(f.name || f.path)}
        </a>`;
    }).join('');

    // History
    const historyHtml = (order.history || []).length
        ? [...order.history].reverse().map(h =>
            `<div class="text-xs text-gray-400 py-1 border-b border-gray-700">
                <span class="text-gray-300">${escHtml(h.changed_by_name || 'System')}</span> changed
                <span class="text-blue-300">${h.field_name}</span> from
                <span class="text-red-300">${escHtml(h.old_value || 'none')}</span> to
                <span class="text-green-300">${escHtml(h.new_value || 'none')}</span>
                <span class="float-right">${fmtDateTime(h.changed_at)}</span>
            </div>`).join('')
        : '<p class="text-gray-500 text-xs">No history</p>';

    // Admin management block
    let adminBlock = '';
    if (isAdmin) {
        const statusOpts = ORDER_STATUSES.map(s =>
            `<option value="${s}" ${order.status === s ? 'selected' : ''}>${s}</option>`).join('');
        const supplierOpts = '<option value="">— No Supplier —</option>' +
            suppliersState.filter(s => s.is_active).map(s =>
                `<option value="${s.id}" ${order.supplier_id === s.id ? 'selected' : ''}>${escHtml(s.name)}</option>`).join('');

        adminBlock = `
        <div class="mt-4 p-4 rounded-lg border border-gray-600" style="background:rgba(255,255,255,0.03);">
            <h4 class="text-sm font-semibold text-gray-300 mb-3">Order Management</h4>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="text-xs text-gray-400">Status</label>
                    <select id="detailStatus" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1">${statusOpts}</select>
                </div>
                <div>
                    <label class="text-xs text-gray-400">Priority</label>
                    <select id="detailPriority" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1">
                        ${['Normal','High','Urgent','Low'].map(p =>
                            `<option value="${p}" ${order.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="text-xs text-gray-400">Supplier</label>
                    <select id="detailSupplier" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1">${supplierOpts}</select>
                </div>
                <div>
                    <label class="text-xs text-gray-400">Quote Number</label>
                    <input id="detailQuoteNumber" type="text" value="${escHtml(order.quote_number || '')}" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1" placeholder="Quote #">
                </div>
                <div>
                    <label class="text-xs text-gray-400">Unit Price</label>
                    <input id="detailUnitPrice" type="number" step="0.01" min="0" value="${order.unit_price || ''}" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1">
                </div>
                <div>
                    <label class="text-xs text-gray-400">Expected Delivery</label>
                    <input id="detailDeliveryDate" type="date" value="${order.expected_delivery_date || ''}" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1 date-picker">
                </div>
                <div class="col-span-2">
                    <label class="text-xs text-gray-400">Internal Notes</label>
                    <textarea id="detailNotes" rows="2" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1" placeholder="Internal notes...">${escHtml(order.internal_notes || '')}</textarea>
                </div>
            </div>
            <div class="flex gap-2 mt-3 flex-wrap">
                <button onclick="saveOrderChanges(${order.id})" class="btn btn-primary btn-sm">Save Changes</button>
                ${currentUser.role === 'admin' ? `<button onclick="deleteOrder(${order.id})" class="btn btn-sm" style="background:#ef4444;color:#fff;">Delete</button>` : ''}
                ${typeof openAssignmentPanel === 'function' ? `<button onclick="openAssignmentPanel(${order.id})" class="btn btn-secondary btn-sm">Assign</button>` : ''}
                ${typeof openApprovalSubmission === 'function' && ['New','Pending'].includes(order.status) ? `<button onclick="openApprovalSubmission(${order.id})" class="btn btn-sm" style="background:#7c3aed;color:#fff;">Request Approval</button>` : ''}
                <button onclick="loadAiSuggestions(${order.id})" class="btn btn-secondary btn-sm">🤖 AI Supplier</button>
            </div>
            <div id="aiSuggestionsBox${order.id}" style="display:none;margin-top:1rem;"></div>
        </div>`;
    }

    // Requester cancel
    let requesterBlock = '';
    if (isRequester && ['New', 'Pending'].includes(order.status)) {
        requesterBlock = `<div class="mt-4"><button onclick="cancelOrder(${order.id})" class="btn btn-sm" style="background:#ef4444;color:#fff;">Cancel Order</button></div>`;
    }

    document.getElementById('orderDetailBody').innerHTML = `
    <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
            <div><span class="text-gray-400 text-xs">Order ID</span><p class="text-sm font-mono">#${order.id}</p></div>
            <div><span class="text-gray-400 text-xs">Status</span><p>${renderStatusBadge(order.status)}</p></div>
            <div><span class="text-gray-400 text-xs">Building</span><p class="text-sm">${order.building || '-'}</p></div>
            <div><span class="text-gray-400 text-xs">Priority</span><p>${renderPriorityBadge(order.priority)}</p></div>
            <div><span class="text-gray-400 text-xs">Cost Center</span><p class="text-sm">${order.cost_center_code ? `${order.cost_center_code} — ${order.cost_center_name || ''}` : '-'}</p></div>
            <div><span class="text-gray-400 text-xs">Requester</span><p class="text-sm">${escHtml(order.requester_name || '-')}</p></div>
            <div class="col-span-2"><span class="text-gray-400 text-xs">Item Description</span><p class="text-sm">${escHtml(order.item_description || '-')}</p></div>
            <div><span class="text-gray-400 text-xs">Part Number</span><p class="text-sm font-mono">${escHtml(order.part_number || '-')}</p></div>
            <div><span class="text-gray-400 text-xs">Category</span><p class="text-sm">${escHtml(order.category || '-')}</p></div>
            <div><span class="text-gray-400 text-xs">Quantity</span><p class="text-sm">${order.quantity || '-'} ${order.unit || ''}</p></div>
            <div><span class="text-gray-400 text-xs">Supplier</span><p class="text-sm">${escHtml(order.supplier_name || '-')}</p></div>
            <div><span class="text-gray-400 text-xs">Unit Price</span><p class="text-sm">${fmtPrice(order.unit_price)}</p></div>
            <div><span class="text-gray-400 text-xs">Quote Number</span><p class="text-sm font-mono">${escHtml(order.quote_number || '-')}</p></div>
            <div><span class="text-gray-400 text-xs">Delivery Status</span><p>${getDeliveryBadgeHtml(ds)}</p></div>
            <div><span class="text-gray-400 text-xs">Expected Delivery</span><p class="text-sm">${order.expected_delivery_date || '-'}</p></div>
            <div><span class="text-gray-400 text-xs">Notes</span><p class="text-sm">${escHtml(order.notes || '-')}</p></div>
            <div><span class="text-gray-400 text-xs">Created</span><p class="text-sm">${fmtDateTime(order.created_at)}</p></div>
        </div>
        ${attachments ? `<div><span class="text-gray-400 text-xs block mb-1">Attachments</span><div class="flex flex-col gap-1">${attachments}</div></div>` : ''}
        ${adminBlock}
        ${requesterBlock}
        <div>
            <span class="text-gray-400 text-xs block mb-1">History</span>
            <div class="max-h-48 overflow-y-auto">${historyHtml}</div>
        </div>
    </div>`;

    document.getElementById('orderDetailPanel').classList.remove('hidden');

    // Load documents section if available
    const docsSection = document.getElementById('documentsSection');
    if (docsSection) {
        docsSection.style.display = 'block';
        if (typeof loadDocumentsForOrder === 'function') loadDocumentsForOrder(order.id);
        else if (typeof renderDocumentsSection === 'function') renderDocumentsSection(order.id);
    }
}

// ============================================================
//  AI SUPPLIER SUGGESTIONS
// ============================================================

async function loadAiSuggestions(orderId) {
    const box = document.getElementById(`aiSuggestionsBox${orderId}`);
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = '<p class="text-xs text-gray-400">Loading suggestions…</p>';
    try {
        const data = await apiGet(`/suppliers/suggestions/${orderId}`);
        if (!data.success || !data.suggestions || !data.suggestions.length) {
            box.innerHTML = '<p class="text-xs text-gray-500">No suggestions available.</p>';
            return;
        }
        box.innerHTML = `<h5 class="text-xs font-semibold text-gray-300 mb-2">AI Supplier Suggestions</h5>` +
            data.suggestions.map(s => `
            <div class="text-xs border border-gray-700 rounded p-2 mb-1">
                <div class="font-semibold text-gray-200">${escHtml(s.name)}</div>
                <div class="text-gray-400">Score: ${s.score || '-'} · ${escHtml(s.reason || '')}</div>
            </div>`).join('');
    } catch {
        box.innerHTML = '<p class="text-xs text-red-400">Failed to load suggestions.</p>';
    }
}

// ============================================================
//  ORDER SAVE / DELETE / CANCEL
// ============================================================

async function saveOrderChanges(orderId) {
    const g = id => document.getElementById(id);
    const body = {
        status: g('detailStatus').value,
        priority: g('detailPriority').value,
        supplier_id: g('detailSupplier').value ? parseInt(g('detailSupplier').value) : null,
        quote_number: g('detailQuoteNumber').value.trim(),
        unit_price: g('detailUnitPrice').value ? parseFloat(g('detailUnitPrice').value) : null,
        expected_delivery_date: g('detailDeliveryDate').value || null,
        internal_notes: g('detailNotes').value.trim()
    };
    try {
        const res = await apiPut(`/orders/${orderId}`, body);
        if (res.success) {
            showToast('Order updated');
            await loadOrders();
            showOrderDetail(orderId);
            updateApprovalBadge();
        } else {
            showToast(res.message || 'Update failed', true);
        }
    } catch { showToast('Update failed', true); }
}

async function deleteOrder(orderId) {
    if (!confirm('Delete this order?')) return;
    try {
        const res = await apiDelete(`/orders/${orderId}`);
        if (res.success) {
            showToast('Order deleted');
            document.getElementById('orderDetailPanel').classList.add('hidden');
            await loadOrders();
        } else {
            showToast(res.message || 'Delete failed', true);
        }
    } catch { showToast('Delete failed', true); }
}

async function cancelOrder(orderId) {
    if (!confirm('Cancel this order?')) return;
    try {
        const res = await apiPut(`/orders/${orderId}`, { status: 'Cancelled' });
        if (res.success) {
            showToast('Order cancelled');
            document.getElementById('orderDetailPanel').classList.add('hidden');
            await loadOrders();
        } else {
            showToast(res.message || 'Cancel failed', true);
        }
    } catch { showToast('Cancel failed', true); }
}

// ============================================================
//  REQUESTER CREATE ORDER
// ============================================================

async function handleCreateOrder(e) {
    e.preventDefault();
    const form = document.getElementById('createOrderForm');
    const formData = new FormData(form);
    if (!formData.get('cost_center_id')) { showToast('Please select a cost center', true); return; }
    try {
        const res = await fetch(`${API_BASE}/orders`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${authToken}` },
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            showToast('Order submitted');
            form.reset();
            document.getElementById('costCenterRadios').innerHTML = '<span class="text-muted">Select a building first</span>';
            await loadOrders();
        } else {
            showToast(data.message || 'Failed to create order', true);
        }
    } catch { showToast('Failed to create order', true); }
}

function renderCostCenterRadios(buildingCode) {
    const container = document.getElementById('costCenterRadios');
    if (!container) return;
    const bldg = buildingsState.find(b => b.code === buildingCode);
    if (!bldg) { container.innerHTML = '<span class="text-muted">Select a building first</span>'; return; }
    const ccs = costCentersState.filter(cc => cc.building_id === bldg.id && cc.is_active);
    if (!ccs.length) { container.innerHTML = '<span class="text-muted">No cost centers for this building</span>'; return; }
    container.innerHTML = ccs.map(cc =>
        `<label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="cost_center_id" value="${cc.id}" class="accent-blue-500">
            <span>${cc.code} — ${cc.name}</span>
        </label>`).join('');
}

// ============================================================
//  PROCUREMENT / ADMIN CREATE ORDER MODAL
// ============================================================

function openProcCreateOrderModal() {
    populateBuildingSelects();
    populateSupplierFilter();
    document.getElementById('procCreateOrderForm').reset();
    document.getElementById('procCostCenterRadios').innerHTML = '<span class="text-muted">Select a building first</span>';
    openModal('procCreateOrderModal');
}

function renderProcCostCenterRadios(buildingCode) {
    const container = document.getElementById('procCostCenterRadios');
    if (!container) return;
    const bldg = buildingsState.find(b => b.code === buildingCode);
    if (!bldg) { container.innerHTML = '<span class="text-muted">Select a building first</span>'; return; }
    const ccs = costCentersState.filter(cc => cc.building_id === bldg.id && cc.is_active);
    if (!ccs.length) { container.innerHTML = '<span class="text-muted">No cost centers for this building</span>'; return; }
    container.innerHTML = ccs.map(cc =>
        `<label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="proc_cost_center_id" value="${cc.id}" class="accent-blue-500">
            <span>${cc.code} — ${cc.name}</span>
        </label>`).join('');
}

async function handleProcCreateOrderSubmit(e) {
    e.preventDefault();
    const form = document.getElementById('procCreateOrderForm');
    const formData = new FormData(form);
    const ccId = formData.get('proc_cost_center_id');
    if (!ccId) { showToast('Please select a cost center', true); return; }
    formData.set('cost_center_id', ccId);
    formData.delete('proc_cost_center_id');
    try {
        const res = await fetch(`${API_BASE}/orders`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${authToken}` },
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            showToast('Order created');
            closeModal('procCreateOrderModal');
            form.reset();
            await loadOrders();
        } else {
            showToast(data.message || 'Failed to create order', true);
        }
    } catch { showToast('Failed to create order', true); }
}

// ============================================================
//  QUOTES
// ============================================================

function renderQuotesTable() {
    const tbody = document.getElementById('quotesTableBody');
    if (!tbody) return;
    if (!quotesState.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400 py-8">No quotes found</td></tr>';
        return;
    }
    tbody.innerHTML = quotesState.map(q => `
        <tr class="hover:bg-gray-700 cursor-pointer" onclick="showQuoteDetail(${q.id})">
            <td class="px-3 py-2 text-sm font-mono">${escHtml(q.quote_number || '-')}</td>
            <td class="px-3 py-2 text-xs">${escHtml(q.supplier_name || '-')}</td>
            <td class="px-3 py-2 text-xs">${renderStatusBadge(q.status)}</td>
            <td class="px-3 py-2 text-xs">${q.order_count || 0} orders</td>
            <td class="px-3 py-2 text-xs">${q.total_amount ? fmtPrice(q.total_amount) : '-'}</td>
            <td class="px-3 py-2 text-xs">${escHtml(q.created_by_name || '-')}</td>
            <td class="px-3 py-2 text-xs text-gray-400">${fmtDate(q.created_at)}</td>
        </tr>`).join('');
}

async function showQuoteDetail(quoteId) {
    try {
        const data = await apiGet(`/quotes/${quoteId}`);
        if (!data.success) { showToast('Failed to load quote', true); return; }
        const q = data.quote;

        const ordersHtml = (q.orders || []).map(o =>
            `<tr class="hover:bg-gray-700">
                <td class="px-2 py-1 text-xs">#${o.id}</td>
                <td class="px-2 py-1 text-xs">${escHtml(o.item_description || '')}</td>
                <td class="px-2 py-1 text-xs">${o.building || ''}</td>
                <td class="px-2 py-1 text-xs">${renderStatusBadge(o.status)}</td>
                <td class="px-2 py-1 text-xs">${fmtPrice(o.unit_price)}</td>
            </tr>`).join('');

        const statusOpts = ['Draft','Sent','Received','Accepted','Rejected','Cancelled'].map(s =>
            `<option value="${s}" ${q.status === s ? 'selected' : ''}>${s}</option>`).join('');

        document.getElementById('quoteDetailBody').innerHTML = `
        <div class="space-y-4">
            <div class="grid grid-cols-2 gap-3">
                <div><span class="text-gray-400 text-xs">Quote #</span><p class="font-mono text-sm">${escHtml(q.quote_number || '-')}</p></div>
                <div><span class="text-gray-400 text-xs">Supplier</span><p class="text-sm">${escHtml(q.supplier_name || '-')}</p></div>
                <div><span class="text-gray-400 text-xs">Status</span><p>${renderStatusBadge(q.status)}</p></div>
                <div><span class="text-gray-400 text-xs">Total</span><p class="text-sm">${fmtPrice(q.total_amount)}</p></div>
                <div><span class="text-gray-400 text-xs">Created By</span><p class="text-sm">${escHtml(q.created_by_name || '-')}</p></div>
                <div><span class="text-gray-400 text-xs">Created</span><p class="text-sm">${fmtDate(q.created_at)}</p></div>
            </div>
            ${q.notes ? `<div><span class="text-gray-400 text-xs">Notes</span><p class="text-sm">${escHtml(q.notes)}</p></div>` : ''}

            <div>
                <span class="text-gray-400 text-xs block mb-2">Orders in this Quote (${(q.orders || []).length})</span>
                <div class="table-wrapper" style="max-height:200px;overflow-y:auto;">
                    <table><thead><tr><th>ID</th><th>Description</th><th>Building</th><th>Status</th><th>Price</th></tr></thead>
                    <tbody>${ordersHtml || '<tr><td colspan="5" class="text-center text-gray-400 py-2">No orders</td></tr>'}</tbody></table>
                </div>
            </div>

            <div class="p-4 rounded-lg border border-gray-600" style="background:rgba(255,255,255,0.03);">
                <h4 class="text-sm font-semibold text-gray-300 mb-3">Update Quote</h4>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="text-xs text-gray-400">Status</label>
                        <select id="quoteDetailStatus" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1">${statusOpts}</select>
                    </div>
                    <div>
                        <label class="text-xs text-gray-400">Total Amount</label>
                        <input id="quoteDetailAmount" type="number" step="0.01" min="0" value="${q.total_amount || ''}" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1">
                    </div>
                    <div class="col-span-2">
                        <label class="text-xs text-gray-400">Notes</label>
                        <textarea id="quoteDetailNotes" rows="2" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1">${escHtml(q.notes || '')}</textarea>
                    </div>
                </div>
                <div class="flex gap-2 mt-3">
                    <button onclick="saveQuoteChanges(${q.id})" class="btn btn-primary btn-sm">Save</button>
                    ${typeof openQuoteSendPanel === 'function' ? `<button onclick="openQuoteSendPanel(${q.id})" class="btn btn-secondary btn-sm">📧 Send to Supplier</button>` : ''}
                    ${currentUser.role === 'admin' ? `<button onclick="deleteQuote(${q.id})" class="btn btn-sm" style="background:#ef4444;color:#fff;">Delete</button>` : ''}
                </div>
            </div>
        </div>`;

        document.getElementById('quoteDetailPanel').classList.remove('hidden');
    } catch (err) {
        console.error('showQuoteDetail:', err);
        showToast('Failed to load quote', true);
    }
}

async function saveQuoteChanges(quoteId) {
    const body = {
        status: document.getElementById('quoteDetailStatus').value,
        total_amount: document.getElementById('quoteDetailAmount').value
            ? parseFloat(document.getElementById('quoteDetailAmount').value) : null,
        notes: document.getElementById('quoteDetailNotes').value.trim()
    };
    try {
        const res = await apiPut(`/quotes/${quoteId}`, body);
        if (res.success) {
            showToast('Quote updated');
            await loadQuotes();
            showQuoteDetail(quoteId);
        } else {
            showToast(res.message || 'Update failed', true);
        }
    } catch { showToast('Update failed', true); }
}

async function deleteQuote(quoteId) {
    if (!confirm('Delete this quote?')) return;
    try {
        const res = await apiDelete(`/quotes/${quoteId}`);
        if (res.success) {
            showToast('Quote deleted');
            document.getElementById('quoteDetailPanel').classList.add('hidden');
            await loadQuotes();
        } else {
            showToast(res.message || 'Delete failed', true);
        }
    } catch { showToast('Delete failed', true); }
}

// ============================================================
//  CREATE QUOTE MODAL
// ============================================================

function openCreateQuoteDialog() {
    if (selectedOrderIds.size === 0) { showToast('Select at least one order first', true); return; }
    populateSupplierFilter();
    const listEl = document.getElementById('quoteOrdersList');
    if (listEl) {
        const ids = Array.from(selectedOrderIds);
        listEl.innerHTML = `<strong>${ids.length} order${ids.length > 1 ? 's' : ''} selected:</strong> ${ids.map(id => `#${id}`).join(', ')}`;
    }
    openModal('createQuoteModal');
}

async function handleCreateQuoteSubmit(e) {
    e.preventDefault();
    const supplierId = document.getElementById('quoteSupplier').value;
    const notes = document.getElementById('quoteNotes').value.trim();
    if (!supplierId) { showToast('Select a supplier', true); return; }
    const order_ids = Array.from(selectedOrderIds);
    try {
        const res = await apiPost('/quotes', { supplier_id: parseInt(supplierId), order_ids, notes });
        if (res.success) {
            showToast('Quote created');
            closeModal('createQuoteModal');
            selectedOrderIds.clear();
            updateSelectedCount();
            await loadQuotes();
            await loadOrders();
            switchTab('quotesTab');
        } else {
            showToast(res.message || 'Failed', true);
        }
    } catch { showToast('Failed to create quote', true); }
}

// ============================================================
//  APPROVALS
// ============================================================

let approvalsData = [];

async function loadApprovals() {
    try {
        const data = await apiGet('/approvals?status=pending');
        if (data.success) {
            approvalsData = data.approvals || [];
            renderApprovalsTable();
            updateApprovalBadge();
        }
    } catch (err) { console.error('loadApprovals:', err); }
}

function renderApprovalsTable() {
    const tbody = document.getElementById('approvalsTableBody');
    if (!tbody) return;

    const search = (document.getElementById('approvalSearch')?.value || '').toLowerCase();
    const statusF = document.getElementById('approvalStatusFilter')?.value || '';
    const priorityF = document.getElementById('approvalPriorityFilter')?.value || '';

    let filtered = approvalsData.filter(a => {
        if (search) {
            const hay = [String(a.order_id || a.id || ''), a.item_description || '', a.building || '', a.requester_name || ''].join(' ').toLowerCase();
            if (!hay.includes(search)) return false;
        }
        if (statusF && a.status !== statusF) return false;
        if (priorityF && a.priority !== priorityF) return false;
        return true;
    });

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-gray-400 py-8">No approvals found</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(a => `
        <tr class="hover:bg-gray-700">
            <td class="px-3 py-2 text-xs">#${a.order_id || a.id}</td>
            <td class="px-3 py-2 text-sm max-w-xs truncate">${escHtml(a.item_description || '-')}</td>
            <td class="px-3 py-2 text-xs">${a.building || '-'}</td>
            <td class="px-3 py-2 text-xs">${escHtml(a.supplier_name || '-')}</td>
            <td class="px-3 py-2 text-xs">${a.estimated_cost ? fmtPrice(a.estimated_cost) : '-'}</td>
            <td class="px-3 py-2">${renderPriorityBadge(a.priority)}</td>
            <td class="px-3 py-2 text-xs capitalize">${a.status || '-'}</td>
            <td class="px-3 py-2 text-xs">${escHtml(a.requester_name || '-')}</td>
            <td class="px-3 py-2 text-xs text-gray-400">${fmtDate(a.created_at)}</td>
            <td class="px-3 py-2">
                <button onclick="showApprovalDetail(${a.id})" class="btn btn-sm" style="background:#3b82f6;color:#fff;">Review</button>
            </td>
        </tr>`).join('');
}

function clearApprovalFilters() {
    const ids = ['approvalSearch', 'approvalStatusFilter', 'approvalPriorityFilter'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    renderApprovalsTable();
}

async function showApprovalDetail(approvalId) {
    const a = approvalsData.find(x => x.id === approvalId);
    if (!a) return;

    document.getElementById('approvalDetailBody').innerHTML = `
    <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
            <div><span class="text-gray-400 text-xs">Order</span><p class="text-sm font-mono">#${a.order_id || a.id}</p></div>
            <div><span class="text-gray-400 text-xs">Status</span><p class="text-sm capitalize">${a.status}</p></div>
            <div class="col-span-2"><span class="text-gray-400 text-xs">Item</span><p class="text-sm">${escHtml(a.item_description || '-')}</p></div>
            <div><span class="text-gray-400 text-xs">Building</span><p class="text-sm">${a.building || '-'}</p></div>
            <div><span class="text-gray-400 text-xs">Priority</span><p>${renderPriorityBadge(a.priority)}</p></div>
            <div><span class="text-gray-400 text-xs">Supplier</span><p class="text-sm">${escHtml(a.supplier_name || '-')}</p></div>
            <div><span class="text-gray-400 text-xs">Est. Cost</span><p class="text-sm">${a.estimated_cost ? fmtPrice(a.estimated_cost) : '-'}</p></div>
            <div><span class="text-gray-400 text-xs">Requested By</span><p class="text-sm">${escHtml(a.requester_name || '-')}</p></div>
            <div><span class="text-gray-400 text-xs">Requested</span><p class="text-sm">${fmtDateTime(a.created_at)}</p></div>
        </div>
        ${a.notes ? `<div><span class="text-gray-400 text-xs">Notes</span><p class="text-sm">${escHtml(a.notes)}</p></div>` : ''}
        <div class="form-group">
            <label class="text-xs text-gray-400">Comments</label>
            <textarea id="approvalComment" rows="3" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1" placeholder="Optional comments…"></textarea>
        </div>
        <div class="flex gap-2">
            <button onclick="doApprove(${a.id})" class="btn btn-sm" style="background:#16a34a;color:#fff;">✓ Approve</button>
            <button onclick="doReject(${a.id})" class="btn btn-sm" style="background:#dc2626;color:#fff;">✗ Reject</button>
        </div>
    </div>`;

    document.getElementById('approvalDetailPanel').classList.remove('hidden');
}

async function doApprove(approvalId) {
    const comment = document.getElementById('approvalComment')?.value.trim();
    try {
        const res = await apiPut(`/approvals/${approvalId}/approve`, { comments: comment || '' });
        if (res.success) {
            showToast('Approved');
            document.getElementById('approvalDetailPanel').classList.add('hidden');
            await loadApprovals();
            await loadOrders();
        } else {
            showToast(res.message || 'Failed', true);
        }
    } catch { showToast('Failed', true); }
}

async function doReject(approvalId) {
    const comment = document.getElementById('approvalComment')?.value.trim();
    try {
        const res = await apiPut(`/approvals/${approvalId}/reject`, { comments: comment || 'Rejected' });
        if (res.success) {
            showToast('Rejected');
            document.getElementById('approvalDetailPanel').classList.add('hidden');
            await loadApprovals();
            await loadOrders();
        } else {
            showToast(res.message || 'Failed', true);
        }
    } catch { showToast('Failed', true); }
}

// ============================================================
//  SUPPLIERS
// ============================================================

function renderSuppliersTable() {
    const tbody = document.getElementById('suppliersTableBody');
    if (!tbody) return;
    if (!suppliersState.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-4">No suppliers</td></tr>';
        return;
    }
    tbody.innerHTML = suppliersState.map(s => `
        <tr class="hover:bg-gray-700">
            <td class="px-3 py-2 text-sm">${escHtml(s.name)}</td>
            <td class="px-3 py-2 text-xs">${escHtml(s.contact_name || '-')}</td>
            <td class="px-3 py-2 text-xs">${s.email ? `<a href="mailto:${s.email}" class="text-blue-400">${s.email}</a>` : '-'}</td>
            <td class="px-3 py-2 text-xs">${s.phone || '-'}</td>
            <td class="px-3 py-2 text-xs">${s.is_active ? '<span class="text-green-400">Active</span>' : '<span class="text-gray-500">Inactive</span>'}</td>
            <td class="px-3 py-2">
                <button onclick="openSupplierForm(${s.id})" class="text-blue-400 hover:text-blue-300 text-xs">Edit</button>
            </td>
        </tr>`).join('');
}

function openSupplierForm(supplierId) {
    const card = document.getElementById('supplierFormCard');
    const title = document.getElementById('supplierFormTitle');
    const s = supplierId ? suppliersState.find(x => x.id === supplierId) : null;
    title.textContent = s ? 'Edit Supplier' : 'New Supplier';
    document.getElementById('supplierId').value = s ? s.id : '';
    document.getElementById('supplierName').value = s ? s.name : '';
    document.getElementById('supplierContact').value = s ? (s.contact_name || '') : '';
    document.getElementById('supplierEmail').value = s ? (s.email || '') : '';
    document.getElementById('supplierPhone').value = s ? (s.phone || '') : '';
    document.getElementById('supplierWebsite').value = s ? (s.website || '') : '';
    document.getElementById('supplierAddress').value = s ? (s.address || '') : '';
    document.getElementById('supplierNotes').value = s ? (s.notes || '') : '';
    document.getElementById('supplierActive').value = s ? (s.is_active ? '1' : '0') : '1';
    card.hidden = false;
    card.scrollIntoView({ behavior: 'smooth' });
}

async function handleSaveSupplier(e) {
    e.preventDefault();
    const id = document.getElementById('supplierId').value;
    const body = {
        name: document.getElementById('supplierName').value.trim(),
        contact_name: document.getElementById('supplierContact').value.trim(),
        email: document.getElementById('supplierEmail').value.trim(),
        phone: document.getElementById('supplierPhone').value.trim(),
        website: document.getElementById('supplierWebsite').value.trim(),
        address: document.getElementById('supplierAddress').value.trim(),
        notes: document.getElementById('supplierNotes').value.trim(),
        is_active: document.getElementById('supplierActive').value === '1'
    };
    try {
        const res = id ? await apiPut(`/suppliers/${id}`, body) : await apiPost('/suppliers', body);
        if (res.success) {
            showToast(id ? 'Supplier updated' : 'Supplier created');
            document.getElementById('supplierFormCard').hidden = true;
            await loadSuppliers();
            populateSupplierFilter();
        } else {
            showToast(res.message || 'Save failed', true);
        }
    } catch { showToast('Save failed', true); }
}

// ============================================================
//  BUILDINGS
// ============================================================

function renderBuildingsTable() {
    const tbody = document.getElementById('buildingsTableBody');
    if (!tbody) return;
    if (!buildingsState.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-4">No buildings</td></tr>';
        return;
    }
    tbody.innerHTML = buildingsState.map(b => `
        <tr class="hover:bg-gray-700">
            <td class="px-3 py-2 text-sm font-mono">${b.code}</td>
            <td class="px-3 py-2 text-sm">${escHtml(b.name)}</td>
            <td class="px-3 py-2 text-xs">${b.is_active ? '<span class="text-green-400">Active</span>' : '<span class="text-gray-500">Inactive</span>'}</td>
            <td class="px-3 py-2">
                <button onclick="openBuildingForm(${b.id})" class="text-blue-400 hover:text-blue-300 text-xs">Edit</button>
            </td>
        </tr>`).join('');
}

function openBuildingForm(buildingId) {
    const card = document.getElementById('buildingFormCard');
    const b = buildingId ? buildingsState.find(x => x.id === buildingId) : null;
    document.getElementById('buildingFormTitle').textContent = b ? 'Edit Building' : 'New Building';
    document.getElementById('buildingId').value = b ? b.id : '';
    document.getElementById('buildingCode').value = b ? b.code : '';
    document.getElementById('buildingName').value = b ? b.name : '';
    document.getElementById('buildingDescription').value = b ? (b.description || '') : '';
    document.getElementById('buildingActive').value = b ? String(b.is_active) : 'true';
    card.hidden = false;
    card.scrollIntoView({ behavior: 'smooth' });
}

async function handleSaveBuilding(e) {
    e.preventDefault();
    const id = document.getElementById('buildingId').value;
    const body = {
        code: document.getElementById('buildingCode').value.trim().toUpperCase(),
        name: document.getElementById('buildingName').value.trim(),
        description: document.getElementById('buildingDescription').value.trim(),
        is_active: document.getElementById('buildingActive').value === 'true'
    };
    try {
        const res = id ? await apiPut(`/buildings/${id}`, body) : await apiPost('/buildings', body);
        if (res.success) {
            showToast(id ? 'Building updated' : 'Building created');
            document.getElementById('buildingFormCard').hidden = true;
            await loadBuildings();
            populateBuildingSelects();
            populateBuildingFilter();
        } else {
            showToast(res.message || 'Save failed', true);
        }
    } catch { showToast('Save failed', true); }
}

// ============================================================
//  COST CENTERS
// ============================================================

function renderCostCentersTable() {
    const tbody = document.getElementById('costCentersTableBody');
    if (!tbody) return;
    const filterVal = parseInt(document.getElementById('ccFilterBuilding')?.value) || null;
    const rows = filterVal
        ? costCentersState.filter(cc => cc.building_id === filterVal)
        : costCentersState;
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-4">No cost centers</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(cc => {
        const bldg = buildingsState.find(b => b.id === cc.building_id);
        return `<tr class="hover:bg-gray-700">
            <td class="px-3 py-2 text-sm font-mono">${cc.code}</td>
            <td class="px-3 py-2 text-sm">${escHtml(cc.name)}</td>
            <td class="px-3 py-2 text-xs">${bldg ? bldg.code : '-'}</td>
            <td class="px-3 py-2 text-xs">${cc.is_active ? '<span class="text-green-400">Active</span>' : '<span class="text-gray-500">Inactive</span>'}</td>
            <td class="px-3 py-2">
                <button onclick="openCostCenterForm(${cc.id})" class="text-blue-400 hover:text-blue-300 text-xs">Edit</button>
            </td>
        </tr>`;
    }).join('');
}

function openCostCenterForm(costCenterId) {
    const card = document.getElementById('costCenterFormCard');
    const delBtn = document.getElementById('btnDeleteCostCenter');
    const cc = costCenterId ? costCentersState.find(x => x.id === costCenterId) : null;
    document.getElementById('costCenterFormTitle').textContent = cc ? 'Edit Cost Center' : 'New Cost Center';
    document.getElementById('costCenterId').value = cc ? cc.id : '';
    document.getElementById('ccBuilding').value = cc ? cc.building_id : '';
    document.getElementById('ccCode').value = cc ? cc.code : '';
    document.getElementById('ccName').value = cc ? cc.name : '';
    document.getElementById('ccDescription').value = cc ? (cc.description || '') : '';
    document.getElementById('ccActive').value = cc ? String(cc.is_active) : 'true';
    if (delBtn) delBtn.hidden = !cc;
    card.hidden = false;
    card.scrollIntoView({ behavior: 'smooth' });
}

async function handleSaveCostCenter(e) {
    e.preventDefault();
    const id = document.getElementById('costCenterId').value;
    const body = {
        building_id: parseInt(document.getElementById('ccBuilding').value),
        code: document.getElementById('ccCode').value.trim().toUpperCase(),
        name: document.getElementById('ccName').value.trim(),
        description: document.getElementById('ccDescription').value.trim(),
        is_active: document.getElementById('ccActive').value === 'true'
    };
    try {
        const res = id ? await apiPut(`/cost-centers/${id}`, body) : await apiPost('/cost-centers', body);
        if (res.success) {
            showToast(id ? 'Cost center updated' : 'Cost center created');
            document.getElementById('costCenterFormCard').hidden = true;
            await loadCostCenters();
            populateBuildingSelects();
        } else {
            showToast(res.message || 'Save failed', true);
        }
    } catch { showToast('Save failed', true); }
}

async function handleDeleteCostCenter() {
    const id = document.getElementById('costCenterId').value;
    if (!id || !confirm('Delete this cost center?')) return;
    try {
        const res = await apiDelete(`/cost-centers/${id}`);
        if (res.success) {
            showToast('Cost center deleted');
            document.getElementById('costCenterFormCard').hidden = true;
            await loadCostCenters();
        } else {
            showToast(res.message || 'Delete failed', true);
        }
    } catch { showToast('Delete failed', true); }
}

// ============================================================
//  USERS
// ============================================================

function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    if (!usersState.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-4">No users</td></tr>';
        return;
    }
    tbody.innerHTML = usersState.map(u => `
        <tr class="hover:bg-gray-700">
            <td class="px-3 py-2 text-sm">${escHtml(u.username)}</td>
            <td class="px-3 py-2 text-sm">${escHtml(u.name)}</td>
            <td class="px-3 py-2 text-xs">${u.email || '-'}</td>
            <td class="px-3 py-2 text-xs capitalize">${u.role}</td>
            <td class="px-3 py-2 text-xs">${u.building || '-'}</td>
            <td class="px-3 py-2">
                <button onclick="openUserForm(${u.id})" class="text-blue-400 hover:text-blue-300 text-xs">Edit</button>
            </td>
        </tr>`).join('');
}

function openUserForm(userId) {
    const card = document.getElementById('userFormCard');
    const pwGroup = document.getElementById('userPasswordGroup');
    const u = userId ? usersState.find(x => x.id === userId) : null;
    document.getElementById('userFormTitle').textContent = u ? 'Edit User' : 'New User';
    document.getElementById('userId').value = u ? u.id : '';
    const unameInput = document.getElementById('userUsername');
    unameInput.value = u ? u.username : '';
    unameInput.readOnly = !!u;
    document.getElementById('userNameInput').value = u ? u.name : '';
    document.getElementById('userEmail').value = u ? (u.email || '') : '';
    document.getElementById('userRoleSelect').value = u ? u.role : 'requester';
    document.getElementById('userBuilding').value = u ? (u.building || '') : '';
    document.getElementById('userActive').value = u ? String(u.is_active) : 'true';
    document.getElementById('userPassword').value = '';
    if (pwGroup) pwGroup.classList.toggle('hidden', !!u);
    card.hidden = false;
    card.scrollIntoView({ behavior: 'smooth' });
}

async function handleSaveUser(e) {
    e.preventDefault();
    const id = document.getElementById('userId').value;
    const pwd = document.getElementById('userPassword').value;
    const body = {
        username: document.getElementById('userUsername').value.trim(),
        name: document.getElementById('userNameInput').value.trim(),
        email: document.getElementById('userEmail').value.trim(),
        role: document.getElementById('userRoleSelect').value,
        building: document.getElementById('userBuilding').value || null,
        is_active: document.getElementById('userActive').value === 'true'
    };
    if (pwd) body.password = pwd;
    try {
        const res = id ? await apiPut(`/users/${id}`, body) : await apiPost('/users', body);
        if (res.success) {
            showToast(id ? 'User updated' : 'User created');
            document.getElementById('userFormCard').hidden = true;
            await loadUsers();
        } else {
            showToast(res.message || 'Save failed', true);
        }
    } catch { showToast('Save failed', true); }
}

// ============================================================
//  TOAST NOTIFICATIONS
// ============================================================

function showToast(message, isError = false) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'toast-error' : 'toast-success'}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ============================================================
//  EXPOSE GLOBALS (for module JS files)
// ============================================================

// These are used by approvals.js, documents.js, order-assignment.js, etc.
window.showToast = showToast;
window.apiGet = apiGet;
window.apiPost = apiPost;
window.apiPut = apiPut;
window.apiDelete = apiDelete;
window.currentUser = currentUser; // live reference not needed — modules read window.currentUser
window.getAuthToken = () => authToken;
window.ordersState = ordersState;
window.suppliersState = suppliersState;
window.buildingsState = buildingsState;
window.costCentersState = costCentersState;
window.switchTab = switchTab;
window.loadOrders = loadOrders;
window.loadApprovals = loadApprovals;
window.renderStatusBadge = renderStatusBadge;
window.renderPriorityBadge = renderPriorityBadge;
window.escHtml = escHtml;
window.fmtDate = fmtDate;
window.fmtDateTime = fmtDateTime;
window.fmtPrice = fmtPrice;

// Keep openEnhancedCreateQuoteModal alias for procurement-workspace.js
window.openEnhancedCreateQuoteModal = openCreateQuoteDialog;
