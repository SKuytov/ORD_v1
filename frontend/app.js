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

// NEW: Pagination state
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
const orderDetailPanel = document.getElementById('orderDetailPanel');
const orderDetailBody = document.getElementById('orderDetailBody');
const btnCloseDetail = document.getElementById('btnCloseDetail');
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
    'New', 'Pending', 'Quote Requested', 'Quote Received',
    'Quote Under Approval', 'Approved', 'Ordered',
    'In Transit', 'Partially Delivered', 'Delivered',
    'Cancelled', 'On Hold'
];

// NEW: Priority order for sorting (Urgent first!)
const PRIORITY_ORDER = { 'Urgent': 1, 'High': 2, 'Normal': 3, 'Low': 4 };

function fmtPrice(val) {
    const n = parseFloat(val);
    if (isNaN(n) || n === 0) return '-';
    return n.toFixed(2);
}

// Init
window.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupDatePickers();
    checkAuth();
});

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

    btnCloseDetail.addEventListener('click', () => { orderDetailPanel.classList.add('hidden'); });
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

    // NEW: Procurement/Admin/Manager Create Order button
    const btnProcurementCreateOrder = document.getElementById('btnProcurementCreateOrder');
    if (btnProcurementCreateOrder) {
        btnProcurementCreateOrder.addEventListener('click', openProcCreateOrderModal);
    }
}

function setViewMode(mode) {
    viewMode = mode;
    if (mode === 'flat') {
        btnViewFlat.classList.add('active');
        btnViewGrouped.classList.remove('active');
    } else {
        btnViewFlat.classList.remove('active');
        btnViewGrouped.classList.add('active');
    }
    currentPage = 1; // Reset to page 1 when changing view mode
    renderOrdersTable();
}

function clearFilters() {
    filterState = { search: '', status: '', building: '', priority: '', supplier: '', delivery: '', quickFilter: '' };
    if (filterSearch) filterSearch.value = '';
    if (filterStatus) filterStatus.value = '';
    if (filterBuilding) filterBuilding.value = '';
    if (filterPriority) filterPriority.value = '';
    if (filterSupplier) filterSupplier.value = '';
    if (filterDelivery) filterDelivery.value = '';
    document.querySelectorAll('.quick-filter-chip').forEach(c => c.classList.remove('active'));
    currentPage = 1;
    applyFilters();
}

function resetFiltersOnLogout() {
    filterState = { search: '', status: '', building: '', priority: '', supplier: '', delivery: '', quickFilter: '' };
    if (filterSearch) filterSearch.value = '';
    if (filterStatus) filterStatus.value = '';
    if (filterBuilding) filterBuilding.value = '';
    if (filterPriority) filterPriority.value = '';
    if (filterSupplier) filterSupplier.value = '';
    if (filterDelivery) filterDelivery.value = '';
    document.querySelectorAll('.quick-filter-chip').forEach(c => c.classList.remove('active'));
    viewMode = 'flat';
    if (btnViewFlat) btnViewFlat.classList.add('active');
    if (btnViewGrouped) btnViewGrouped.classList.remove('active');
    currentPage = 1;
}

// ===================== DELIVERY TIMELINE LOGIC =====================

function getDeliveryStatus(order) {
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
        'delivered': '<span class="delivery-badge delivery-ontrack">Delivered</span>',
        'late': '<span class="delivery-badge delivery-late">Late</span>',
        'due7': '<span class="delivery-badge delivery-due7">Due 7d</span>',
        'due14': '<span class="delivery-badge delivery-due14">Due 14d</span>',
        'ontrack': '<span class="delivery-badge delivery-ontrack">On Track</span>',
        'none': '-'
    };
    return badges[status] || '-';
}

function getDeliveredDate(order) {
    if (order.status !== 'Delivered') return null;
    if (order.history && order.history.length) {
        const deliveredHistory = order.history
            .filter(h => h.field_name === 'status' && h.new_value === 'Delivered')
            .sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));
        if (deliveredHistory.length > 0) return deliveredHistory[0].changed_at;
    }
    return null;
}

function isOldDelivered(order) {
    if (order.status !== 'Delivered') return false;
    const deliveredDate = getDeliveredDate(order);
    if (deliveredDate) {
        const delivered = new Date(deliveredDate);
        const today = new Date();
        const daysSince = Math.floor((today - delivered) / (1000 * 60 * 60 * 24));
        return daysSince > 7;
    }
    if (order.created_at) {
        const createdDate = new Date(order.created_at);
        const today = new Date();
        const daysSince = Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
        return daysSince > 14;
    }
    return false;
}

// ===================== FILTERING =====================

function applyFilters() {
    filteredOrders = ordersState.filter(order => {
        if (filterState.search) {
            const term = filterState.search.toLowerCase();
            const fileNames = (order.files || []).map(f => f.name || '').join(' ');
            const searchFields = [
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
                fileNames
            ].join(' ').toLowerCase();
            if (!searchFields.includes(term)) return false;
        }
        if (filterState.status && order.status !== filterState.status) return false;
        if (filterState.building && order.building !== filterState.building) return false;
        if (filterState.priority && order.priority !== filterState.priority) return false;
        if (filterState.supplier && order.supplier_id !== parseInt(filterState.supplier, 10)) return false;
        if (filterState.delivery) {
            const deliveryStatus = getDeliveryStatus(order);
            if (filterState.delivery !== deliveryStatus) return false;
        }
        if (filterState.quickFilter) {
            const qf = filterState.quickFilter;
            if (qf === 'late' || qf === 'due7' || qf === 'due14') {
                const deliveryStatus = getDeliveryStatus(order);
                if (deliveryStatus !== qf) return false;
            } else if (qf === 'new' && order.status !== 'New') return false;
            else if (qf === 'ordered' && order.status !== 'Ordered') return false;
            else if (qf === 'transit' && order.status !== 'In Transit') return false;
        }
        return true;
    });

    filteredOrders.sort((a, b) => {
        const priorityA = PRIORITY_ORDER[a.priority] || PRIORITY_ORDER['Normal'];
        const priorityB = PRIORITY_ORDER[b.priority] || PRIORITY_ORDER['Normal'];
        if (priorityA !== priorityB) return priorityA - priorityB;
        return b.id - a.id;
    });

    renderOrdersTable();
}

// ===================== AUTH =====================

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
    } catch (err) {
        loginError.textContent = 'Login failed. Please try again.';
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
    loginScreen.classList.remove('hidden');
    dashboardScreen.classList.add('hidden');
    loginForm.reset();
}

function showDashboard() {
    loginScreen.classList.add('hidden');
    dashboardScreen.classList.remove('hidden');
    userName.textContent = currentUser.name;
    
    if (currentUser.role === 'admin') {
        userRoleBadge.textContent = 'Admin';
    } else if (currentUser.role === 'procurement') {
        userRoleBadge.textContent = 'Procurement';
    } else if (currentUser.role === 'manager') {
        userRoleBadge.textContent = 'Manager';
    } else {
        userRoleBadge.textContent = `Requester - ${currentUser.building || ''}`;
    }

    if (usersTabButton) usersTabButton.hidden = true;
    if (buildingsTabButton) buildingsTabButton.hidden = true;
    if (costCentersTabButton) costCentersTabButton.hidden = true;
    if (approvalsTabButton) approvalsTabButton.hidden = true;

    if (currentUser.role === 'requester') {
        createOrderSection.classList.remove('hidden');
        requesterBuildingBadge.textContent = `Building ${currentUser.building}`;
        navTabs.classList.add('hidden');
        const orderActionsContainer = document.getElementById('orderActionsContainer');
        if (orderActionsContainer) orderActionsContainer.style.display = 'none';
        if (orderActionsBar) orderActionsBar.style.display = 'none';
    } else if (currentUser.role === 'manager') {
        createOrderSection.classList.add('hidden');
        navTabs.classList.remove('hidden');
        populateStatusFilter();
        if (approvalsTabButton) approvalsTabButton.hidden = false;
        const orderActionsContainer = document.getElementById('orderActionsContainer');
        if (orderActionsContainer) orderActionsContainer.style.display = 'flex';
        if (orderActionsBar) orderActionsBar.style.display = 'none';
        const btnProcCreateMgr = document.getElementById('btnProcurementCreateOrder');
        if (btnProcCreateMgr) btnProcCreateMgr.classList.remove('hidden');
        if (typeof loadApprovals === 'function') loadApprovals();
    } else {
        createOrderSection.classList.add('hidden');
        navTabs.classList.remove('hidden');
        populateStatusFilter();
        const orderActionsContainer = document.getElementById('orderActionsContainer');
        if (orderActionsContainer) orderActionsContainer.style.display = 'flex';
        if (currentUser.role === 'admin') {
            if (usersTabButton) usersTabButton.hidden = false;
            if (buildingsTabButton) buildingsTabButton.hidden = false;
            if (costCentersTabButton) costCentersTabButton.hidden = false;
        }
        const btnProcCreate = document.getElementById('btnProcurementCreateOrder');
        if (btnProcCreate) btnProcCreate.classList.remove('hidden');
    }

    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    const ordersTabEl = document.getElementById('ordersTab');
    if (ordersTabEl) ordersTabEl.classList.remove('hidden');
    currentTab = 'ordersTab';

    loadBuildings();
    loadCostCenters();
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
            if (currentUser && currentUser.role === 'requester') renderCostCenterRadios(currentUser.building);
            if (currentUser && currentUser.role === 'admin') { renderCostCentersTable(); populateCCBuildingSelects(); }
        }
    } catch (err) { console.error('loadCostCenters error:', err); }
}

function renderCostCenterRadios(buildingCode) {
    if (!costCenterRadios) return;
    if (!buildingCode) { costCenterRadios.innerHTML = '<span class="text-muted">Select a building first</span>'; return; }
    const filtered = costCentersState.filter(cc => cc.building_code === buildingCode && cc.active);
    if (!filtered.length) { costCenterRadios.innerHTML = '<span class="text-muted">No cost centers defined for this building</span>'; return; }
    costCenterRadios.innerHTML = filtered.map(cc =>
        `<label class="radio-label"><input type="radio" name="costCenter" value="${cc.id}" required><span class="radio-text"><strong>${escapeHtml(cc.code)}</strong> - ${escapeHtml(cc.name)}</span></label>`
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
    if (!filtered.length) { costCentersTable.innerHTML = '<p class="text-muted">No cost centers found.</p>'; return; }
    let html = '<div class="table-wrapper"><table><thead><tr><th>Building</th><th>Code</th><th>Name</th><th>Active</th><th></th></tr></thead><tbody>';
    for (const cc of filtered) {
        html += `<tr data-id="${cc.id}"><td>${escapeHtml(cc.building_code)}</td><td>${escapeHtml(cc.code)}</td><td>${escapeHtml(cc.name)}</td><td>${cc.active ? 'Yes' : 'No'}</td><td><button class="btn btn-secondary btn-sm btn-edit-cc" data-id="${cc.id}">Edit</button></td></tr>`;
    }
    html += '</tbody></table></div>';
    costCentersTable.innerHTML = html;
    document.querySelectorAll('.btn-edit-cc').forEach(btn => {
        btn.addEventListener('click', () => { const id = parseInt(btn.dataset.id, 10); const cc = costCentersState.find(x => x.id === id); if (cc) openCostCenterForm(cc); });
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
    if (!payload.building_code || !payload.code || !payload.name) { alert('Building, code, and name are required'); return; }
    const id = costCenterIdInput.value;
    const res = id ? await apiPut(`/cost-centers/${id}`, payload) : await apiPost('/cost-centers', payload);
    if (res.success) { alert('Cost center saved'); costCenterFormCard.hidden = true; loadCostCenters(); }
    else { alert('Failed to save cost center: ' + (res.message || 'Unknown error')); }
}

async function handleDeleteCostCenter() {
    const id = costCenterIdInput.value;
    if (!id) return;
    if (!confirm('Are you sure you want to delete this cost center?')) return;
    const res = await apiDelete(`/cost-centers/${id}`);
    if (res.success) { alert('Cost center deleted'); costCenterFormCard.hidden = true; loadCostCenters(); }
    else { alert('Failed to delete: ' + (res.message || 'Unknown error')); }
}

// ===================== ORDERS =====================

async function handleCreateOrder(e) {
    e.preventDefault();
    const selectedCC = document.querySelector('input[name="costCenter"]:checked');
    if (!selectedCC) { alert('Please select a Cost Center'); return; }
    const formData = new FormData();
    formData.append('building', buildingSelect.value);
    formData.append('costCenterId', selectedCC.value);
    formData.append('itemDescription', document.getElementById('itemDescription').value.trim());
    formData.append('partNumber', document.getElementById('partNumber').value.trim());
    formData.append('category', document.getElementById('category').value.trim());
    formData.append('quantity', document.getElementById('quantity').value);
    formData.append('dateNeeded', document.getElementById('dateNeeded').value);
    formData.append('priority', document.getElementById('priority').value);
    formData.append('notes', document.getElementById('notes').value.trim());
    formData.append('requester', currentUser.name);
    formData.append('requesterEmail', currentUser.email);
    const files = document.getElementById('attachments').files;
    for (let i = 0; i < files.length; i++) formData.append('files', files[i]);
    if (window.UploadProgress) window.UploadProgress.show();
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && window.UploadProgress) window.UploadProgress.update((e.loaded / e.total) * 100);
        });
        xhr.addEventListener('load', () => {
            if (window.UploadProgress) window.UploadProgress.hide();
            try {
                const data = JSON.parse(xhr.responseText);
                if (!data.success) { alert('Failed to create order: ' + (data.message || 'Unknown error')); reject(new Error(data.message)); return; }
                alert('Order created successfully!');
                createOrderForm.reset();
                if (currentUser.role === 'requester') { buildingSelect.value = currentUser.building; renderCostCenterRadios(currentUser.building); }
                loadOrders();
                resolve(data);
            } catch (err) { alert('Failed to process server response.'); reject(err); }
        });
        xhr.addEventListener('error', () => { if (window.UploadProgress) window.UploadProgress.hide(); alert('Failed to create order. Network error.'); reject(new Error('Network error')); });
        xhr.addEventListener('abort', () => { if (window.UploadProgress) window.UploadProgress.hide(); alert('Upload cancelled.'); reject(new Error('Upload cancelled')); });
        xhr.open('POST', `${API_BASE}/orders`);
        xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
        xhr.send(formData);
    });
}

async function loadOrders() {
    try {
        const res = await apiGet('/orders');
        if (res.success) {
            ordersState = res.orders;
            filteredOrders = ordersState;
            selectedOrderIds.clear();
            updateSelectionUi();
            currentPage = 1;
            applyFilters();
        }
    } catch (err) {
        console.error('loadOrders error:', err);
        ordersTable.innerHTML = '<p>Failed to load orders.</p>';
    }
}

function renderPaginationControls(totalOrders) {
    const totalPages = Math.ceil(totalOrders / ORDERS_PER_PAGE);
    if (totalPages <= 1) return '';
    let html = '<div class="pagination-controls">';
    html += `<div class="pagination-info">Page ${currentPage} of ${totalPages} (${totalOrders} orders)</div>`;
    html += '<div class="pagination-buttons">';
    html += `<button class="btn-pagination" data-page="1" ${currentPage === 1 ? 'disabled' : ''}>First</button>`;
    html += `<button class="btn-pagination" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>`;
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    if (startPage > 1) html += '<span class="pagination-ellipsis">...</span>';
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="btn-pagination ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    if (endPage < totalPages) html += '<span class="pagination-ellipsis">...</span>';
    html += `<button class="btn-pagination" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>`;
    html += `<button class="btn-pagination" data-page="${totalPages}" ${currentPage === totalPages ? 'disabled' : ''}>Last</button>`;
    html += '</div></div>';
    return html;
}

function attachPaginationListeners() {
    document.querySelectorAll('.btn-pagination').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page, 10);
            if (!isNaN(page) && page > 0) {
                currentPage = page;
                renderOrdersTable();
                ordersTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

function renderOrdersTable() {
    const activeOrders = filteredOrders.filter(o => !isOldDelivered(o));
    const oldDelivered = filteredOrders.filter(o => isOldDelivered(o));
    if (!activeOrders.length && !oldDelivered.length) {
        ordersTable.innerHTML = '<p class="text-muted">No orders found.</p>';
        return;
    }
    if (viewMode === 'grouped') renderGroupedOrders(activeOrders, oldDelivered);
    else renderFlatOrders(activeOrders, oldDelivered);
}

function renderFlatOrders(activeOrders, oldDelivered) {
    const isAdminView = currentUser.role !== 'requester';
    const canSelectOrders = currentUser.role === 'admin' || currentUser.role === 'procurement';
    let html = '';
    if (activeOrders.length > 0) {
        const startIdx = (currentPage - 1) * ORDERS_PER_PAGE;
        const endIdx = startIdx + ORDERS_PER_PAGE;
        const paginatedOrders = activeOrders.slice(startIdx, endIdx);
        html += '<div class="table-wrapper"><table><thead><tr>';
        if (canSelectOrders) html += '<th class="sticky"><input type="checkbox" id="selectAllOrders"></th>';
        html += '<th>ID</th><th></th><th>Item</th><th>Cost Center</th><th>Qty</th><th>Status</th><th>Priority</th><th>Files</th>';
        if (isAdminView) {
            html += '<th>Requester</th><th>Delivery</th><th>Needed</th><th>Supplier</th><th>Lifecycle</th><th>Building</th><th>Unit</th><th>Total</th>';
        } else {
            html += '<th>Delivery</th><th>Needed</th>';
        }
        html += '</tr></thead><tbody>';
        for (const order of paginatedOrders) html += renderOrderRow(order, canSelectOrders, isAdminView);
        html += '</tbody></table></div>';
        html += renderPaginationControls(activeOrders.length);
    }
    if (oldDelivered.length > 0) {
        html += '<div class="old-delivered-section" style="margin-top: 1.5rem;">';
        html += `<div class="old-delivered-header" onclick="this.parentElement.classList.toggle('expanded')">`;
        html += `<span class="old-delivered-title">Delivered Orders (>7 days ago)</span>`;
        html += `<span class="old-delivered-count">${oldDelivered.length} orders</span>`;
        html += `<span class="old-delivered-chevron">v</span></div>`;
        html += '<div class="old-delivered-body"><div class="table-wrapper"><table><thead><tr>';
        if (canSelectOrders) html += '<th class="sticky"><input type="checkbox" id="selectAllOldOrders"></th>';
        html += '<th>ID</th><th></th><th>Item</th><th>Cost Center</th><th>Qty</th><th>Status</th><th>Priority</th><th>Files</th>';
        if (isAdminView) html += '<th>Requester</th><th>Delivered</th><th>Supplier</th><th>Building</th><th>Unit</th><th>Total</th>';
        else html += '<th>Delivered</th>';
        html += '</tr></thead><tbody>';
        for (const order of oldDelivered) html += renderOrderRow(order, canSelectOrders, isAdminView);
        html += '</tbody></table></div></div></div>';
    }
    ordersTable.innerHTML = html;
    attachOrderEventListeners(canSelectOrders);
    attachPaginationListeners();
}

function renderGroupedOrders(activeOrders, oldDelivered) {
    const isAdminView = currentUser.role !== 'requester';
    const canSelectOrders = currentUser.role === 'admin' || currentUser.role === 'procurement';
    const grouped = {};
    for (const order of activeOrders) {
        if (!grouped[order.status]) grouped[order.status] = [];
        grouped[order.status].push(order);
    }
    let html = '';
    for (const status of ORDER_STATUSES) {
        if (!grouped[status] || grouped[status].length === 0) continue;
        const statusClass = 'status-' + status.toLowerCase().replace(/ /g, '-');
        html += `<div class="status-group"><div class="status-group-header" data-status="${status}"><div class="status-group-title"><span class="status-badge ${statusClass}">${status}</span><span class="status-group-count">${grouped[status].length}</span></div><span class="status-group-chevron">v</span></div><div class="status-group-body" data-status="${status}">`;
        html += '<div class="table-wrapper"><table><thead><tr>';
        if (canSelectOrders) html += '<th class="sticky"><input type="checkbox" class="select-all-group" data-status="${status}"></th>';
        html += '<th>ID</th><th></th><th>Item</th><th>Cost Center</th><th>Qty</th><th>Priority</th><th>Files</th>';
        if (isAdminView) html += '<th>Requester</th><th>Delivery</th><th>Needed</th><th>Supplier</th><th>Building</th><th>Unit</th><th>Total</th>';
        else html += '<th>Delivery</th><th>Needed</th>';
        html += '</tr></thead><tbody>';
        for (const order of grouped[status]) html += renderOrderRow(order, canSelectOrders, isAdminView);
        html += '</tbody></table></div></div></div>';
    }
    if (oldDelivered.length > 0) {
        html += '<div class="old-delivered-section" style="margin-top: 1.5rem;">';
        html += `<div class="old-delivered-header" onclick="this.parentElement.classList.toggle('expanded')">`;
        html += `<span class="old-delivered-title">Delivered Orders (>7 days ago)</span><span class="old-delivered-count">${oldDelivered.length} orders</span><span class="old-delivered-chevron">v</span></div>`;
        html += '<div class="old-delivered-body"><div class="table-wrapper"><table><thead><tr>';
        if (canSelectOrders) html += '<th class="sticky"></th>';
        html += '<th>ID</th><th></th><th>Item</th><th>Cost Center</th><th>Qty</th><th>Priority</th><th>Files</th>';
        if (isAdminView) html += '<th>Requester</th><th>Delivered</th><th>Supplier</th><th>Building</th><th>Unit</th><th>Total</th>';
        else html += '<th>Delivered</th>';
        html += '</tr></thead><tbody>';
        for (const order of oldDelivered) html += renderOrderRow(order, canSelectOrders, isAdminView);
        html += '</tbody></table></div></div></div>';
    }
    ordersTable.innerHTML = html;
    attachOrderEventListeners(canSelectOrders);
    document.querySelectorAll('.status-group-header').forEach(header => {
        header.addEventListener('click', () => header.closest('.status-group').classList.toggle('collapsed'));
    });
}

function renderOrderRow(order, canSelect, isAdminView) {
    const statusClass = 'status-' + (order.status || 'new').toLowerCase().replace(/ /g, '-');
    const priorityClass = 'priority-' + (order.priority || 'normal').toLowerCase();
    const deliveryStatus = getDeliveryStatus(order);
    const deliveryBadge = isAdminView ? getDeliveryBadgeHtml(deliveryStatus) : '';
    const filesHtml = (order.files && order.files.length)
        ? `<span class="file-count-badge" title="${order.files.length} file(s)">${order.files.length} file${order.files.length > 1 ? 's' : ''}</span>`
        : '-';
    const isChecked = selectedOrderIds.has(order.id) ? 'checked' : '';
    const lifecycleBadge = (isAdminView && typeof renderLifecycleBadge === 'function')
        ? renderLifecycleBadge(order)
        : '';

    let row = '<tr class="order-row" data-id="' + order.id + '">';
    if (canSelect) row += `<td class="sticky"><input type="checkbox" class="order-checkbox" data-id="${order.id}" ${isChecked}></td>`;
    row += `<td>${order.id}</td>`;
    row += `<td><button class="btn btn-secondary btn-sm btn-view-order" data-id="${order.id}">View</button></td>`;
    row += `<td title="${escapeHtml(order.item_description || '')}"><div class="item-desc">${escapeHtml((order.item_description || '').substring(0, 60))}${(order.item_description || '').length > 60 ? '...' : ''}</div>${order.part_number ? '<div class="part-number">' + escapeHtml(order.part_number) + '</div>' : ''}</td>`;
    row += `<td>${escapeHtml(order.cost_center_code || '')}${order.cost_center_name ? '<br><span class="text-muted small">' + escapeHtml(order.cost_center_name) + '</span>' : ''}</td>`;
    row += `<td>${order.quantity || 1}</td>`;
    row += `<td><span class="status-badge ${statusClass}">${escapeHtml(order.status || 'New')}</span></td>`;
    row += `<td><span class="priority-badge ${priorityClass}">${escapeHtml(order.priority || 'Normal')}</span></td>`;
    row += `<td>${filesHtml}</td>`;
    if (isAdminView) {
        row += `<td>${escapeHtml(order.requester_name || '')}</td>`;
        if (order.status === 'Delivered' && isOldDelivered(order)) {
            const deliveredDate = getDeliveredDate(order);
            row += `<td>${deliveredDate ? fmtDate(deliveredDate) : '-'}</td>`;
        } else {
            row += `<td>${getDeliveryBadgeHtml(deliveryStatus)}</td>`;
        }
        row += `<td>${order.expected_delivery_date ? fmtDate(order.expected_delivery_date) : '-'}</td>`;
        row += `<td>${escapeHtml(order.supplier_name || '-')}</td>`;
        row += `<td>${lifecycleBadge}</td>`;
        row += `<td>${escapeHtml(order.building || '')}</td>`;
        row += `<td>${order.unit_price ? fmtPrice(order.unit_price) : '-'}</td>`;
        row += `<td>${order.total_price ? fmtPrice(order.total_price) : '-'}</td>`;
    } else {
        if (order.status === 'Delivered') {
            const deliveredDate = getDeliveredDate(order);
            row += `<td>${deliveredDate ? fmtDate(deliveredDate) : '-'}</td>`;
        } else {
            row += `<td>${getDeliveryBadgeHtml(deliveryStatus)}</td>`;
        }
        row += `<td>${order.expected_delivery_date ? fmtDate(order.expected_delivery_date) : '-'}</td>`;
    }
    row += '</tr>';
    return row;
}

function attachOrderEventListeners(canSelectOrders) {
    document.querySelectorAll('.btn-view-order').forEach(btn => {
        btn.addEventListener('click', () => showOrderDetail(parseInt(btn.dataset.id, 10)));
    });
    if (!canSelectOrders) return;
    document.querySelectorAll('.order-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const id = parseInt(cb.dataset.id, 10);
            if (cb.checked) selectedOrderIds.add(id); else selectedOrderIds.delete(id);
            updateSelectionUi();
        });
    });
    const selectAll = document.getElementById('selectAllOrders');
    if (selectAll) {
        selectAll.addEventListener('change', () => {
            const ids = filteredOrders.filter(o => !isOldDelivered(o)).map(o => o.id);
            const startIdx = (currentPage - 1) * ORDERS_PER_PAGE;
            const endIdx = startIdx + ORDERS_PER_PAGE;
            const pageIds = ids.slice(startIdx, endIdx);
            if (selectAll.checked) pageIds.forEach(id => selectedOrderIds.add(id));
            else pageIds.forEach(id => selectedOrderIds.delete(id));
            updateSelectionUi();
            renderOrdersTable();
        });
    }
    const selectAllOld = document.getElementById('selectAllOldOrders');
    if (selectAllOld) {
        selectAllOld.addEventListener('change', () => {
            const ids = filteredOrders.filter(o => isOldDelivered(o)).map(o => o.id);
            if (selectAllOld.checked) ids.forEach(id => selectedOrderIds.add(id));
            else ids.forEach(id => selectedOrderIds.delete(id));
            updateSelectionUi();
            renderOrdersTable();
        });
    }
    document.querySelectorAll('.select-all-group').forEach(cb => {
        cb.addEventListener('change', () => {
            const status = cb.dataset.status;
            const ids = filteredOrders.filter(o => o.status === status).map(o => o.id);
            if (cb.checked) ids.forEach(id => selectedOrderIds.add(id));
            else ids.forEach(id => selectedOrderIds.delete(id));
            updateSelectionUi();
        });
    });
}

function updateSelectionUi() {
    const count = selectedOrderIds.size;
    if (selectedCount) selectedCount.textContent = count + ' selected';
    if (orderActionsBar) orderActionsBar.classList.toggle('hidden', count === 0);
}

function showOrderDetail(orderId) {
    const order = ordersState.find(o => o.id === orderId);
    if (!order) return;
    const statusClass = 'status-' + (order.status || 'new').toLowerCase().replace(/ /g, '-');
    const priorityClass = 'priority-' + (order.priority || 'normal').toLowerCase();
    const canEdit = currentUser.role !== 'requester';
    const deliveryStatus = getDeliveryStatus(order);

    let filesHtml = '';
    if (order.files && order.files.length) {
        filesHtml = '<div class="detail-files"><strong>Attachments:</strong><ul>';
        order.files.forEach(f => {
            filesHtml += `<li><a href="/api/files/${f.filename}" target="_blank" class="file-link">${escapeHtml(f.name || f.filename)}</a></li>`;
        });
        filesHtml += '</ul></div>';
    }

    let statusEditHtml = '';
    if (canEdit) {
        const statusOptions = ORDER_STATUSES.map(s => `<option value="${s}" ${s === order.status ? 'selected' : ''}>${s}</option>`).join('');
        statusEditHtml = `
            <div class="detail-edit-section">
                <strong>Update Status:</strong>
                <select id="orderStatusSelect" class="detail-select">${statusOptions}</select>
                <input type="text" id="orderStatusNote" class="detail-input" placeholder="Add a note (optional)">
                <div class="detail-edit-row">
                    <div class="detail-edit-col">
                        <label>Supplier</label>
                        <select id="orderSupplierSelect" class="detail-select">
                            <option value="">No supplier</option>
                            ${suppliersState.filter(s => s.active).map(s => `<option value="${s.id}" ${order.supplier_id === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="detail-edit-col">
                        <label>Expected Delivery</label>
                        <input type="date" id="orderExpectedDelivery" class="detail-input date-picker" value="${order.expected_delivery_date || ''}">
                    </div>
                    <div class="detail-edit-col">
                        <label>Unit Price</label>
                        <input type="number" id="orderUnitPrice" class="detail-input" value="${order.unit_price || ''}" step="0.01" min="0">
                    </div>
                    <div class="detail-edit-col">
                        <label>Total Price</label>
                        <input type="number" id="orderTotalPrice" class="detail-input" value="${order.total_price || ''}" step="0.01" min="0">
                    </div>
                </div>
                <button id="btnUpdateOrder" class="btn btn-primary">Update Order</button>
                <button id="btnAddAttachment" class="btn btn-secondary" style="margin-left: 0.5rem;">+ Add Attachment</button>
                <input type="file" id="attachmentInput" style="display:none" multiple>
            </div>`;
    }

    let historyHtml = '';
    if (order.history && order.history.length) {
        historyHtml = '<div class="detail-history"><strong>History:</strong><table class="history-table"><thead><tr><th>Date</th><th>Field</th><th>From</th><th>To</th><th>Note</th></tr></thead><tbody>';
        order.history.slice().reverse().forEach(h => {
            historyHtml += `<tr><td>${fmtDateTime(h.changed_at)}</td><td>${escapeHtml(h.field_name || '')}</td><td>${escapeHtml(h.old_value || '-')}</td><td>${escapeHtml(h.new_value || '-')}</td><td>${escapeHtml(h.note || '')}</td></tr>`;
        });
        historyHtml += '</tbody></table></div>';
    }

    const deliveryInfo = order.status !== 'Delivered' && order.expected_delivery_date
        ? `<div class="detail-delivery">${getDeliveryBadgeHtml(deliveryStatus)} Expected: ${fmtDate(order.expected_delivery_date)}</div>`
        : '';

    orderDetailBody.innerHTML = `
        <div class="detail-header">
            <span class="status-badge ${statusClass}">${escapeHtml(order.status || 'New')}</span>
            <span class="priority-badge ${priorityClass}">${escapeHtml(order.priority || 'Normal')}</span>
        </div>
        <table class="detail-table">
            <tr><th>ID</th><td>${order.id}</td></tr>
            <tr><th>Item</th><td>${escapeHtml(order.item_description || '')}</td></tr>
            ${order.part_number ? `<tr><th>Part #</th><td>${escapeHtml(order.part_number)}</td></tr>` : ''}
            ${order.category ? `<tr><th>Category</th><td>${escapeHtml(order.category)}</td></tr>` : ''}
            <tr><th>Building</th><td>${escapeHtml(order.building || '')}</td></tr>
            <tr><th>Cost Center</th><td>${escapeHtml(order.cost_center_code || '')}${order.cost_center_name ? ' - ' + escapeHtml(order.cost_center_name) : ''}</td></tr>
            <tr><th>Quantity</th><td>${order.quantity || 1}</td></tr>
            <tr><th>Requester</th><td>${escapeHtml(order.requester_name || '')}</td></tr>
            ${order.requester_email ? `<tr><th>Email</th><td>${escapeHtml(order.requester_email)}</td></tr>` : ''}
            <tr><th>Date Needed</th><td>${order.expected_delivery_date ? fmtDate(order.expected_delivery_date) : '-'}</td></tr>
            ${order.notes ? `<tr><th>Notes</th><td>${escapeHtml(order.notes)}</td></tr>` : ''}
            ${order.supplier_name ? `<tr><th>Supplier</th><td>${escapeHtml(order.supplier_name)}</td></tr>` : ''}
            ${order.unit_price ? `<tr><th>Unit Price</th><td>${fmtPrice(order.unit_price)}</td></tr>` : ''}
            ${order.total_price ? `<tr><th>Total Price</th><td>${fmtPrice(order.total_price)}</td></tr>` : ''}
            ${order.quote_number ? `<tr><th>Quote</th><td>${escapeHtml(order.quote_number)}</td></tr>` : ''}
        </table>
        ${deliveryInfo}
        ${filesHtml}
        ${statusEditHtml}
        ${historyHtml}
    `;
    orderDetailPanel.classList.remove('hidden');

    if (canEdit) {
        const btnUpdate = document.getElementById('btnUpdateOrder');
        if (btnUpdate) {
            btnUpdate.addEventListener('click', () => handleUpdateOrder(order.id));
        }
        const btnAdd = document.getElementById('btnAddAttachment');
        const attachInput = document.getElementById('attachmentInput');
        if (btnAdd && attachInput) {
            btnAdd.addEventListener('click', () => attachInput.click());
            attachInput.addEventListener('change', () => handleAddAttachment(order.id, attachInput.files));
        }
    }
}

async function handleUpdateOrder(orderId) {
    const status = document.getElementById('orderStatusSelect').value;
    const note = document.getElementById('orderStatusNote').value.trim();
    const supplierId = document.getElementById('orderSupplierSelect')?.value || null;
    const expectedDelivery = document.getElementById('orderExpectedDelivery')?.value || null;
    const unitPrice = document.getElementById('orderUnitPrice')?.value || null;
    const totalPrice = document.getElementById('orderTotalPrice')?.value || null;
    const payload = { status, note };
    if (supplierId) payload.supplier_id = parseInt(supplierId, 10);
    if (expectedDelivery) payload.expected_delivery_date = expectedDelivery;
    if (unitPrice) payload.unit_price = parseFloat(unitPrice);
    if (totalPrice) payload.total_price = parseFloat(totalPrice);
    try {
        const res = await apiPut(`/orders/${orderId}`, payload);
        if (res.success) { alert('Order updated'); orderDetailPanel.classList.add('hidden'); loadOrders(); }
        else { alert('Failed: ' + (res.message || 'Unknown error')); }
    } catch (err) { alert('Failed to update order. Network error.'); }
}

async function handleAddAttachment(orderId, files) {
    if (!files || !files.length) return;
    const formData = new FormData();
    for (const f of files) formData.append('files', f);
    try {
        const res = await fetch(`${API_BASE}/orders/${orderId}/attachments`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });
        const data = await res.json();
        if (data.success) { alert('File(s) uploaded'); loadOrders(); showOrderDetail(orderId); }
        else { alert('Upload failed: ' + (data.message || '')); }
    } catch (err) { alert('Upload failed. Network error.'); }
}

// ===================== QUOTES =====================

async function loadQuotes() {
    if (typeof window.loadQuotes === 'function' && window.loadQuotes !== loadQuotes) {
        return window.loadQuotes();
    }
    const tbody = document.getElementById('quotesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
    try {
        const res = await apiGet('/quotes');
        if (!res.success || !res.quotes || !res.quotes.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-muted" style="text-align:center;padding:2rem;">No quotes found.</td></tr>';
            return;
        }
        quotesState = res.quotes;
        tbody.innerHTML = res.quotes.map(q => `
            <tr class="quote-row" data-id="${q.id}">
                <td style="font-weight:600;">${escapeHtml(q.quote_number || '-')}</td>
                <td>${escapeHtml(q.supplier_name || '-')}</td>
                <td>${fmtDate(q.created_at)}</td>
                <td>${fmtDate(q.valid_until)}</td>
                <td><span class="status-badge status-${(q.status || '').toLowerCase().replace(/ /g, '-')}">${escapeHtml(q.status || '-')}</span></td>
                <td>${q.total_value ? fmtPrice(q.total_value) : '-'}</td>
                <td>
                    <button class="btn btn-secondary btn-sm btn-open-lifecycle" data-id="${q.id}">Open</button>
                </td>
            </tr>`
        ).join('');
        document.querySelectorAll('.btn-open-lifecycle').forEach(btn => {
            btn.addEventListener('click', () => {
                if (typeof openQuoteLifecyclePanel === 'function') {
                    openQuoteLifecyclePanel(parseInt(btn.dataset.id, 10));
                }
            });
        });
    } catch (err) {
        console.error('loadQuotes error:', err);
        tbody.innerHTML = '<tr><td colspan="7" style="color:red;">Error loading quotes.</td></tr>';
    }
}

function openCreateQuoteDialog() {
    if (selectedOrderIds.size === 0) {
        alert('Please select at least one order first.');
        return;
    }
    if (typeof openEnhancedCreateQuoteModal === 'function') {
        openEnhancedCreateQuoteModal();
    } else {
        alert('Enhanced quote creation not available. Please refresh the page.');
    }
}

// ===================== SUPPLIERS =====================

async function loadSuppliers() {
    try {
        const res = await apiGet('/suppliers');
        if (res.success) {
            suppliersState = res.suppliers;
            renderSuppliersTable();
        }
    } catch (err) { console.error('loadSuppliers error:', err); }
}

function populateSupplierFilter() {
    if (!filterSupplier) return;
    filterSupplier.innerHTML = '<option value="">All Suppliers</option>' +
        suppliersState.filter(s => s.active).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
}

function renderSuppliersTable() {
    if (!suppliersTable) return;
    if (!suppliersState.length) { suppliersTable.innerHTML = '<p class="text-muted">No suppliers found.</p>'; return; }
    let html = '<div class="table-wrapper"><table><thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th>Active</th><th></th></tr></thead><tbody>';
    for (const s of suppliersState) {
        html += `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.contact_person || '')}</td><td>${escapeHtml(s.email || '')}</td><td>${escapeHtml(s.phone || '')}</td><td>${s.active ? 'Yes' : 'No'}</td><td><button class="btn btn-secondary btn-sm btn-edit-supplier" data-id="${s.id}">Edit</button></td></tr>`;
    }
    html += '</tbody></table></div>';
    suppliersTable.innerHTML = html;
    document.querySelectorAll('.btn-edit-supplier').forEach(btn => {
        btn.addEventListener('click', () => { const id = parseInt(btn.dataset.id, 10); const s = suppliersState.find(x => x.id === id); if (s) openSupplierForm(s); });
    });
}

function openSupplierForm(supplier) {
    if (!supplierFormCard) return;
    if (supplier) {
        supplierFormTitle.textContent = 'Edit Supplier';
        supplierIdInput.value = supplier.id;
        supplierNameInput.value = supplier.name || '';
        supplierContactInput.value = supplier.contact_person || '';
        supplierEmailInput.value = supplier.email || '';
        supplierPhoneInput.value = supplier.phone || '';
        supplierWebsiteInput.value = supplier.website || '';
        supplierAddressInput.value = supplier.address || '';
        supplierNotesInput.value = supplier.notes || '';
        supplierActiveInput.value = supplier.active ? '1' : '0';
    } else {
        supplierFormTitle.textContent = 'Add Supplier';
        supplierForm.reset();
        supplierIdInput.value = '';
        supplierActiveInput.value = '1';
    }
    supplierFormCard.hidden = false;
}

async function handleSaveSupplier(e) {
    e.preventDefault();
    const payload = {
        name: supplierNameInput.value.trim(),
        contact_person: supplierContactInput.value.trim(),
        email: supplierEmailInput.value.trim(),
        phone: supplierPhoneInput.value.trim(),
        website: supplierWebsiteInput.value.trim(),
        address: supplierAddressInput.value.trim(),
        notes: supplierNotesInput.value.trim(),
        active: supplierActiveInput.value === '1'
    };
    if (!payload.name) { alert('Supplier name is required'); return; }
    const id = supplierIdInput.value;
    const res = id ? await apiPut(`/suppliers/${id}`, payload) : await apiPost('/suppliers', payload);
    if (res.success) { alert('Supplier saved'); supplierFormCard.hidden = true; loadSuppliers().then(() => populateSupplierFilter()); }
    else { alert('Failed to save supplier: ' + (res.message || 'Unknown error')); }
}

// ===================== BUILDINGS =====================

async function loadBuildings() {
    try {
        const res = await apiGet('/buildings');
        if (res.success) {
            buildingsState = res.buildings;
            populateBuildingFilter();
            populateBuildingSelect();
            if (currentUser.role === 'requester') {
                const userBuilding = buildingsState.find(b => b.code === currentUser.building);
                buildingSelect.value = currentUser.building;
                renderCostCenterRadios(currentUser.building);
            }
            if (currentUser.role === 'admin') {
                renderBuildingsTable();
                populateCCBuildingSelects();
            }
        }
    } catch (err) { console.error('loadBuildings error:', err); }
}

function populateBuildingFilter() {
    if (!filterBuilding) return;
    filterBuilding.innerHTML = '<option value="">All Buildings</option>' +
        buildingsState.filter(b => b.active).map(b => `<option value="${b.code}">${escapeHtml(b.code)} - ${escapeHtml(b.name)}</option>`).join('');
}

function populateBuildingSelect() {
    if (!buildingSelect) return;
    const current = buildingSelect.value;
    buildingSelect.innerHTML = '<option value="">Select Building</option>' +
        buildingsState.filter(b => b.active).map(b => `<option value="${b.code}">${escapeHtml(b.code)} - ${escapeHtml(b.name)}</option>`).join('');
    if (current) buildingSelect.value = current;
}

function renderBuildingsTable() {
    if (!buildingsTable) return;
    if (!buildingsState.length) { buildingsTable.innerHTML = '<p class="text-muted">No buildings found.</p>'; return; }
    let html = '<div class="table-wrapper"><table><thead><tr><th>Code</th><th>Name</th><th>Description</th><th>Active</th><th></th></tr></thead><tbody>';
    for (const b of buildingsState) {
        html += `<tr><td>${escapeHtml(b.code)}</td><td>${escapeHtml(b.name)}</td><td>${escapeHtml(b.description || '')}</td><td>${b.active ? 'Yes' : 'No'}</td><td><button class="btn btn-secondary btn-sm btn-edit-building" data-id="${b.id}">Edit</button></td></tr>`;
    }
    html += '</tbody></table></div>';
    buildingsTable.innerHTML = html;
    document.querySelectorAll('.btn-edit-building').forEach(btn => {
        btn.addEventListener('click', () => { const id = parseInt(btn.dataset.id, 10); const b = buildingsState.find(x => x.id === id); if (b) openBuildingForm(b); });
    });
}

function openBuildingForm(building) {
    if (!buildingFormCard) return;
    if (building) {
        buildingFormTitle.textContent = 'Edit Building';
        buildingIdInput.value = building.id;
        buildingCodeInput.value = building.code || '';
        buildingNameInput.value = building.name || '';
        buildingDescriptionInput.value = building.description || '';
        buildingActiveSelect.value = building.active ? '1' : '0';
    } else {
        buildingFormTitle.textContent = 'Add Building';
        buildingForm.reset();
        buildingIdInput.value = '';
        buildingActiveSelect.value = '1';
    }
    buildingFormCard.hidden = false;
}

async function handleSaveBuilding(e) {
    e.preventDefault();
    const payload = {
        code: buildingCodeInput.value.trim(),
        name: buildingNameInput.value.trim(),
        description: buildingDescriptionInput.value.trim(),
        active: buildingActiveSelect.value === '1'
    };
    if (!payload.code || !payload.name) { alert('Building code and name are required'); return; }
    const id = buildingIdInput.value;
    const res = id ? await apiPut(`/buildings/${id}`, payload) : await apiPost('/buildings', payload);
    if (res.success) { alert('Building saved'); buildingFormCard.hidden = true; loadBuildings(); }
    else { alert('Failed to save building: ' + (res.message || 'Unknown error')); }
}

// ===================== USERS =====================

async function loadUsers() {
    try {
        const res = await apiGet('/users');
        if (res.success) { usersState = res.users; renderUsersTable(); }
    } catch (err) { console.error('loadUsers error:', err); }
}

function renderUsersTable() {
    if (!usersTable) return;
    if (!usersState.length) { usersTable.innerHTML = '<p class="text-muted">No users found.</p>'; return; }
    let html = '<div class="table-wrapper"><table><thead><tr><th>Username</th><th>Name</th><th>Email</th><th>Role</th><th>Building</th><th>Active</th><th></th></tr></thead><tbody>';
    for (const u of usersState) {
        html += `<tr><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.name || '')}</td><td>${escapeHtml(u.email || '')}</td><td>${escapeHtml(u.role)}</td><td>${escapeHtml(u.building || '-')}</td><td>${u.active ? 'Yes' : 'No'}</td><td><button class="btn btn-secondary btn-sm btn-edit-user" data-id="${u.id}">Edit</button></td></tr>`;
    }
    html += '</tbody></table></div>';
    usersTable.innerHTML = html;
    document.querySelectorAll('.btn-edit-user').forEach(btn => {
        btn.addEventListener('click', () => { const id = parseInt(btn.dataset.id, 10); const u = usersState.find(x => x.id === id); if (u) openUserForm(u); });
    });
}

function openUserForm(user) {
    if (!userFormCard) return;
    populateUserBuildingSelect();
    if (user) {
        userFormTitle.textContent = 'Edit User';
        userIdInput.value = user.id;
        userUsernameInput.value = user.username || '';
        userNameInput.value = user.name || '';
        userEmailInput.value = user.email || '';
        userRoleSelect.value = user.role || 'requester';
        userBuildingSelect.value = user.building || '';
        userActiveSelect.value = user.active ? '1' : '0';
        if (userPasswordGroup) userPasswordGroup.style.display = 'none';
        if (userPasswordInput) userPasswordInput.removeAttribute('required');
    } else {
        userFormTitle.textContent = 'Add User';
        userForm.reset();
        userIdInput.value = '';
        userActiveSelect.value = '1';
        if (userPasswordGroup) userPasswordGroup.style.display = 'block';
        if (userPasswordInput) userPasswordInput.setAttribute('required', '');
    }
    userFormCard.hidden = false;
}

function populateUserBuildingSelect() {
    if (!userBuildingSelect) return;
    userBuildingSelect.innerHTML = '<option value="">No building (admin/procurement)</option>' +
        buildingsState.filter(b => b.active).map(b => `<option value="${b.code}">${escapeHtml(b.code)} - ${escapeHtml(b.name)}</option>`).join('');
}

async function handleSaveUser(e) {
    e.preventDefault();
    const id = userIdInput.value;
    const payload = {
        username: userUsernameInput.value.trim(),
        name: userNameInput.value.trim(),
        email: userEmailInput.value.trim(),
        role: userRoleSelect.value,
        building: userBuildingSelect.value || null,
        active: userActiveSelect.value === '1'
    };
    if (!id && userPasswordInput) payload.password = userPasswordInput.value;
    if (!payload.username || !payload.name || !payload.role) { alert('Username, name, and role are required'); return; }
    const res = id ? await apiPut(`/users/${id}`, payload) : await apiPost('/users', payload);
    if (res.success) { alert('User saved'); userFormCard.hidden = true; loadUsers(); }
    else { alert('Failed to save user: ' + (res.message || 'Unknown error')); }
}

// ===================== TAB SWITCHING =====================

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const el = document.getElementById(tabId);
    if (el) el.classList.remove('hidden');
    const btn = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');
    currentTab = tabId;
    if (tabId === 'quotesTab') loadQuotes();
    if (tabId === 'suppliersTab') loadSuppliers();
    if (tabId === 'usersTab') loadUsers();
    if (tabId === 'buildingsTab') loadBuildings();
    if (tabId === 'costCentersTab') loadCostCenters();
    if (tabId === 'approvalsTab' && typeof loadApprovals === 'function') loadApprovals();
}

// ===================== STATUS / BUILDING FILTERS =====================

function populateStatusFilter() {
    if (!filterStatus) return;
    filterStatus.innerHTML = '<option value="">All Statuses</option>' +
        ORDER_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('');
}

// ===================== FORMAT HELPERS =====================

function fmtDate(d) {
    if (!d) return '-';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '-';
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(d) {
    if (!d) return '-';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '-';
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ===================== PROCUREMENT CREATE ORDER MODAL =====================

function openProcCreateOrderModal() {
    const existing = document.getElementById('procCreateOrderModal');
    if (existing) existing.remove();

    const suppliers = suppliersState.filter(s => s.active);
    const buildings = buildingsState.filter(b => b.active);

    const modal = document.createElement('div');
    modal.id = 'procCreateOrderModal';
    modal.className = 'pw-modal-overlay';
    modal.innerHTML = `
        <div class="pw-modal-card" style="max-width:600px;width:100%;">
            <div class="pw-modal-header">
                <h3 class="pw-modal-title">Create Order</h3>
                <button class="pw-close-btn" id="btnCloseProcModal">X</button>
            </div>
            <form id="procCreateOrderForm" style="padding:1.5rem;">
                <div class="pw-form-row">
                    <div class="pw-form-group">
                        <label class="pw-label">Building *</label>
                        <select id="procBuilding" class="pw-form-control" required>
                            <option value="">Select building</option>
                            ${buildings.map(b => `<option value="${b.code}">${escapeHtml(b.code)} - ${escapeHtml(b.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="pw-form-group">
                        <label class="pw-label">Cost Center *</label>
                        <select id="procCostCenter" class="pw-form-control" required>
                            <option value="">Select building first</option>
                        </select>
                    </div>
                </div>
                <div class="pw-form-group">
                    <label class="pw-label">Item Description *</label>
                    <input type="text" id="procItemDesc" class="pw-form-control" required placeholder="Describe the item needed">
                </div>
                <div class="pw-form-row">
                    <div class="pw-form-group">
                        <label class="pw-label">Part Number</label>
                        <input type="text" id="procPartNumber" class="pw-form-control" placeholder="Optional">
                    </div>
                    <div class="pw-form-group">
                        <label class="pw-label">Category</label>
                        <input type="text" id="procCategory" class="pw-form-control" placeholder="Optional">
                    </div>
                </div>
                <div class="pw-form-row">
                    <div class="pw-form-group">
                        <label class="pw-label">Quantity *</label>
                        <input type="number" id="procQuantity" class="pw-form-control" value="1" min="1" required>
                    </div>
                    <div class="pw-form-group">
                        <label class="pw-label">Priority</label>
                        <select id="procPriority" class="pw-form-control">
                            <option value="Normal">Normal</option>
                            <option value="High">High</option>
                            <option value="Urgent">Urgent</option>
                            <option value="Low">Low</option>
                        </select>
                    </div>
                    <div class="pw-form-group">
                        <label class="pw-label">Date Needed</label>
                        <input type="date" id="procDateNeeded" class="pw-form-control date-picker">
                    </div>
                </div>
                <div class="pw-form-group">
                    <label class="pw-label">Requester Name *</label>
                    <input type="text" id="procRequester" class="pw-form-control" required placeholder="Name of the person requesting">
                </div>
                <div class="pw-form-group">
                    <label class="pw-label">Notes</label>
                    <textarea id="procNotes" class="pw-form-control" rows="2" placeholder="Additional notes"></textarea>
                </div>
                <div class="pw-wizard-footer" style="padding:0;margin-top:1.5rem;">
                    <button type="button" class="btn btn-secondary" id="btnCancelProcModal">Cancel</button>
                    <div style="flex:1"></div>
                    <button type="submit" class="btn btn-primary" id="btnSubmitProcOrder">Create Order</button>
                </div>
            </form>
        </div>`;

    document.body.appendChild(modal);

    document.getElementById('btnCloseProcModal').addEventListener('click', () => modal.remove());
    document.getElementById('btnCancelProcModal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    const procBuildingSel = document.getElementById('procBuilding');
    const procCCsel = document.getElementById('procCostCenter');
    procBuildingSel.addEventListener('change', () => {
        const bCode = procBuildingSel.value;
        const ccs = costCentersState.filter(cc => cc.building_code === bCode && cc.active);
        procCCsel.innerHTML = ccs.length
            ? '<option value="">Select cost center</option>' + ccs.map(cc => `<option value="${cc.id}">${escapeHtml(cc.code)} - ${escapeHtml(cc.name)}</option>`).join('')
            : '<option value="">No cost centers for this building</option>';
    });

    document.getElementById('procCreateOrderForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnSubmitProcOrder');
        btn.disabled = true;
        btn.textContent = 'Creating...';
        const payload = {
            building: procBuildingSel.value,
            costCenterId: procCCsel.value || null,
            itemDescription: document.getElementById('procItemDesc').value.trim(),
            partNumber: document.getElementById('procPartNumber').value.trim(),
            category: document.getElementById('procCategory').value.trim(),
            quantity: parseInt(document.getElementById('procQuantity').value, 10) || 1,
            priority: document.getElementById('procPriority').value,
            dateNeeded: document.getElementById('procDateNeeded').value || null,
            requester: document.getElementById('procRequester').value.trim(),
            notes: document.getElementById('procNotes').value.trim()
        };
        if (!payload.building || !payload.itemDescription || !payload.requester) {
            alert('Building, item description, and requester name are required');
            btn.disabled = false;
            btn.textContent = 'Create Order';
            return;
        }
        try {
            const res = await apiPost('/orders/create-direct', payload);
            if (res.success) {
                modal.remove();
                alert('Order #' + (res.orderId || '') + ' created successfully');
                loadOrders();
            } else {
                alert('Failed to create order: ' + (res.message || 'Unknown error'));
                btn.disabled = false;
                btn.textContent = 'Create Order';
            }
        } catch (err) {
            console.error('procCreateOrder error:', err);
            alert('Network error creating order');
            btn.disabled = false;
            btn.textContent = 'Create Order';
        }
    });
}

// ===================== APPROVALS =====================

async function loadApprovals() {
    const tbody = document.getElementById('approvalsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';
    try {
        const res = await apiGet('/procurement/approvals/pending');
        if (!res.success || !res.approvals || !res.approvals.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:2rem;">No pending approvals.</td></tr>';
            return;
        }
        tbody.innerHTML = res.approvals.map(a => `
            <tr>
                <td style="font-weight:600;">${escapeHtml(a.quote_number || '-')}</td>
                <td>${escapeHtml(a.supplier_name || '-')}</td>
                <td>${a.total_value ? fmtPrice(a.total_value) + ' ' + (a.currency || 'EUR') : '-'}</td>
                <td>${fmtDate(a.created_at)}</td>
                <td><span class="status-badge status-under-approval">${escapeHtml(a.status || 'Under Approval')}</span></td>
                <td>
                    <button class="btn btn-primary btn-sm btn-approve-quote" data-id="${a.id}" style="margin-right:0.5rem;">Approve</button>
                    <button class="btn btn-sm btn-reject-quote" data-id="${a.id}" style="background:#ef4444;color:#fff;">Reject</button>
                    <button class="btn btn-secondary btn-sm btn-view-approval" data-id="${a.id}" style="margin-left:0.5rem;">View</button>
                </td>
            </tr>`
        ).join('');
        document.querySelectorAll('.btn-approve-quote').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Approve this quote?')) return;
                const res = await apiPost('/procurement/approve-quote', { quote_id: parseInt(btn.dataset.id, 10), decision: 'approved' });
                if (res.success) { alert('Quote approved'); loadApprovals(); loadOrders(); }
                else alert('Failed: ' + (res.message || ''));
            });
        });
        document.querySelectorAll('.btn-reject-quote').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Reject this quote?')) return;
                const res = await apiPost('/procurement/approve-quote', { quote_id: parseInt(btn.dataset.id, 10), decision: 'rejected' });
                if (res.success) { alert('Quote rejected'); loadApprovals(); loadOrders(); }
                else alert('Failed: ' + (res.message || ''));
            });
        });
        document.querySelectorAll('.btn-view-approval').forEach(btn => {
            btn.addEventListener('click', () => {
                if (typeof openQuoteLifecyclePanel === 'function') openQuoteLifecyclePanel(parseInt(btn.dataset.id, 10));
            });
        });
    } catch (err) {
        console.error('loadApprovals error:', err);
        tbody.innerHTML = '<tr><td colspan="6" style="color:red;">Error loading approvals.</td></tr>';
    }
}