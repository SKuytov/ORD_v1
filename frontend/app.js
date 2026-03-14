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

async function loadOrders() {
    try {
        const res = await apiGet('/orders');
        if (res.success) {
            ordersState = res.orders;
            applyFilters();
            populateFilterDropdowns();
        }
    } catch (err) { console.error('loadOrders error:', err); }
}

function populateFilterDropdowns() {
    if (filterBuilding) {
        const buildings = [...new Set(ordersState.map(o => o.building).filter(Boolean))].sort();
        filterBuilding.innerHTML = '<option value="">All Buildings</option>' +
            buildings.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
    }
    if (filterSupplier) {
        populateSupplierFilter();
    }
}

function populateStatusFilter() {
    if (!filterStatus) return;
    filterStatus.innerHTML = '<option value="">All Statuses</option>' +
        ORDER_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('');
}

function populateSupplierFilter() {
    if (!filterSupplier) return;
    filterSupplier.innerHTML = '<option value="">All Suppliers</option>' +
        suppliersState.filter(s => s.active).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
}

// ===================== RENDER ORDERS TABLE =====================

function renderOrdersTable() {
    if (!ordersTable) return;

    const totalOrders = filteredOrders.length;
    const totalPages = Math.ceil(totalOrders / ORDERS_PER_PAGE);
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * ORDERS_PER_PAGE;
    const endIdx = startIdx + ORDERS_PER_PAGE;
    const pageOrders = filteredOrders.slice(startIdx, endIdx);

    if (!pageOrders.length) {
        ordersTable.innerHTML = '<p class="text-muted" style="padding:1rem;">No orders found.</p>';
        renderPagination(totalOrders, totalPages);
        return;
    }

    if (viewMode === 'grouped') {
        renderGroupedOrders(pageOrders);
    } else {
        renderFlatOrders(pageOrders);
    }
    renderPagination(totalOrders, totalPages);
}

function renderPagination(totalOrders, totalPages) {
    let paginationEl = document.getElementById('ordersPagination');
    if (!paginationEl) {
        paginationEl = document.createElement('div');
        paginationEl.id = 'ordersPagination';
        paginationEl.style.cssText = 'display:flex;align-items:center;gap:0.5rem;padding:0.75rem 0;justify-content:flex-end;font-size:0.85rem;';
        ordersTable.parentElement.insertBefore(paginationEl, ordersTable.nextSibling);
    }
    if (totalPages <= 1) { paginationEl.innerHTML = ''; return; }
    const startItem = (currentPage - 1) * ORDERS_PER_PAGE + 1;
    const endItem = Math.min(currentPage * ORDERS_PER_PAGE, totalOrders);
    let html = `<span style="color:#94a3b8;">${startItem}-${endItem} of ${totalOrders}</span>`;
    html += `<button onclick="gotoPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} style="padding:0.25rem 0.6rem;background:#1e293b;border:1px solid #334155;color:#e2e8f0;border-radius:4px;cursor:pointer;">&laquo;</button>`;
    const maxButtons = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage < maxButtons - 1) startPage = Math.max(1, endPage - maxButtons + 1);
    for (let p = startPage; p <= endPage; p++) {
        const active = p === currentPage;
        html += `<button onclick="gotoPage(${p})" style="padding:0.25rem 0.6rem;background:${active ? '#3b82f6' : '#1e293b'};border:1px solid ${active ? '#3b82f6' : '#334155'};color:#e2e8f0;border-radius:4px;cursor:pointer;font-weight:${active ? '600' : '400'};">${p}</button>`;
    }
    html += `<button onclick="gotoPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} style="padding:0.25rem 0.6rem;background:#1e293b;border:1px solid #334155;color:#e2e8f0;border-radius:4px;cursor:pointer;">&raquo;</button>`;
    paginationEl.innerHTML = html;
}

function gotoPage(page) {
    const totalPages = Math.ceil(filteredOrders.length / ORDERS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderOrdersTable();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderFlatOrders(orders) {
    let html = '<div class="table-wrapper"><table><thead><tr>';
    if (currentUser.role !== 'requester') {
        html += '<th><input type="checkbox" id="selectAllOrders" title="Select all on page"></th>';
    }
    html += '<th>ID</th><th>Description</th><th>Part #</th>';
    if (currentUser.role !== 'requester') html += '<th>Building</th>';
    html += '<th>Qty</th><th>Priority</th><th>Status</th>';
    if (currentUser.role !== 'requester') html += '<th>Supplier</th><th>Quote</th><th>Price</th>';
    html += '<th>Needed By</th><th>Delivery</th><th>Cost Center</th><th>Files</th>';
    html += '</tr></thead><tbody>';

    for (const o of orders) {
        const deliveryStatus = getDeliveryStatus(o);
        const deliveryBadge = getDeliveryBadgeHtml(deliveryStatus);
        const isSelected = selectedOrderIds.has(o.id);
        if (isOldDelivered(o)) continue;
        html += `<tr class="order-row${isSelected ? ' selected' : ''}" data-id="${o.id}" style="cursor:pointer;">`;
        if (currentUser.role !== 'requester') {
            html += `<td onclick="event.stopPropagation()"><input type="checkbox" class="order-checkbox" data-id="${o.id}" ${isSelected ? 'checked' : ''}></td>`;
        }
        html += `<td>${o.id}</td>`;
        html += `<td>${escapeHtml(o.item_description || '')}${o.files && o.files.length ? ` <span class="file-count-badge" title="${o.files.length} file(s) attached">${o.files.length}</span>` : ''}</td>`;
        html += `<td>${escapeHtml(o.part_number || '-')}</td>`;
        if (currentUser.role !== 'requester') html += `<td>${escapeHtml(o.building || '-')}</td>`;
        html += `<td>${o.quantity}</td>`;
        html += `<td><span class="badge priority-${(o.priority || 'normal').toLowerCase()}">${o.priority || 'Normal'}</span></td>`;
        html += `<td><span class="status-badge status-${(o.status || '').toLowerCase().replace(/ /g, '-')}">${o.status || '-'}</span></td>`;
        if (currentUser.role !== 'requester') {
            html += `<td>${escapeHtml(o.supplier_name || '-')}</td>`;
            html += `<td>${o.quote_number ? `<span class="quote-ref-badge">${escapeHtml(o.quote_number)}</span>` : '-'}</td>`;
            html += `<td>${o.total_price ? fmtPrice(o.total_price) + ' ' + (o.currency || '') : '-'}</td>`;
        }
        html += `<td>${o.date_needed ? formatDate(o.date_needed) : '-'}</td>`;
        html += `<td>${deliveryBadge}</td>`;
        html += `<td>${escapeHtml(o.cost_center_code || '-')}</td>`;
        html += `<td>${o.files && o.files.length ? o.files.map(f => `<a href="/uploads/${f.path}" target="_blank" title="${escapeHtml(f.name)}" style="font-size:0.75rem;color:#06b6d4;">${escapeHtml(f.name)}</a>`).join(', ') : '-'}</td>`;
        html += '</tr>';
    }
    html += '</tbody></table></div>';
    ordersTable.innerHTML = html;
    setupOrderTableEvents();
}

function renderGroupedOrders(orders) {
    const groups = {};
    for (const o of orders) {
        if (isOldDelivered(o)) continue;
        const key = o.building || 'Unknown';
        if (!groups[key]) groups[key] = [];
        groups[key].push(o);
    }
    let html = '';
    for (const building of Object.keys(groups).sort()) {
        const groupOrders = groups[building];
        html += `<div class="group-header">${escapeHtml(building)} <span class="group-count">${groupOrders.length}</span></div>`;
        html += '<div class="table-wrapper"><table><thead><tr>';
        if (currentUser.role !== 'requester') {
            html += '<th><input type="checkbox" class="select-group-all" data-building="' + escapeHtml(building) + '"></th>';
        }
        html += '<th>ID</th><th>Description</th><th>Part #</th><th>Qty</th><th>Priority</th><th>Status</th>';
        if (currentUser.role !== 'requester') html += '<th>Supplier</th><th>Quote</th><th>Price</th>';
        html += '<th>Needed By</th><th>Delivery</th><th>Cost Center</th></tr></thead><tbody>';
        for (const o of groupOrders) {
            const deliveryStatus = getDeliveryStatus(o);
            const deliveryBadge = getDeliveryBadgeHtml(deliveryStatus);
            const isSelected = selectedOrderIds.has(o.id);
            html += `<tr class="order-row${isSelected ? ' selected' : ''}" data-id="${o.id}" style="cursor:pointer;">`;
            if (currentUser.role !== 'requester') {
                html += `<td onclick="event.stopPropagation()"><input type="checkbox" class="order-checkbox" data-id="${o.id}" ${isSelected ? 'checked' : ''}></td>`;
            }
            html += `<td>${o.id}</td><td>${escapeHtml(o.item_description || '')}</td><td>${escapeHtml(o.part_number || '-')}</td><td>${o.quantity}</td>`;
            html += `<td><span class="badge priority-${(o.priority || 'normal').toLowerCase()}">${o.priority || 'Normal'}</span></td>`;
            html += `<td><span class="status-badge status-${(o.status || '').toLowerCase().replace(/ /g, '-')}">${o.status || '-'}</span></td>`;
            if (currentUser.role !== 'requester') {
                html += `<td>${escapeHtml(o.supplier_name || '-')}</td>`;
                html += `<td>${o.quote_number ? `<span class="quote-ref-badge">${escapeHtml(o.quote_number)}</span>` : '-'}</td>`;
                html += `<td>${o.total_price ? fmtPrice(o.total_price) + ' ' + (o.currency || '') : '-'}</td>`;
            }
            html += `<td>${o.date_needed ? formatDate(o.date_needed) : '-'}</td><td>${deliveryBadge}</td><td>${escapeHtml(o.cost_center_code || '-')}</td></tr>`;
        }
        html += '</tbody></table></div>';
    }
    ordersTable.innerHTML = html;
    setupOrderTableEvents();
}

function setupOrderTableEvents() {
    // Row click -> open detail
    document.querySelectorAll('.order-row').forEach(row => {
        row.addEventListener('click', () => {
            const id = parseInt(row.dataset.id, 10);
            openOrderDetail(id);
        });
    });

    // Checkbox selection
    document.querySelectorAll('.order-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const id = parseInt(cb.dataset.id, 10);
            if (cb.checked) selectedOrderIds.add(id);
            else selectedOrderIds.delete(id);
            updateSelectionUI();
        });
    });

    // Select all on page
    const selectAll = document.getElementById('selectAllOrders');
    if (selectAll) {
        selectAll.addEventListener('change', () => {
            document.querySelectorAll('.order-checkbox').forEach(cb => {
                cb.checked = selectAll.checked;
                const id = parseInt(cb.dataset.id, 10);
                if (selectAll.checked) selectedOrderIds.add(id);
                else selectedOrderIds.delete(id);
            });
            updateSelectionUI();
        });
    }

    // Group select all
    document.querySelectorAll('.select-group-all').forEach(gCb => {
        gCb.addEventListener('change', () => {
            const building = gCb.dataset.building;
            const groupRows = ordersState.filter(o => o.building === building);
            groupRows.forEach(o => {
                if (gCb.checked) selectedOrderIds.add(o.id);
                else selectedOrderIds.delete(o.id);
            });
            document.querySelectorAll('.order-checkbox').forEach(cb => {
                const o = ordersState.find(x => x.id === parseInt(cb.dataset.id, 10));
                if (o && o.building === building) cb.checked = gCb.checked;
            });
            updateSelectionUI();
        });
    });
}

function updateSelectionUI() {
    const count = selectedOrderIds.size;
    if (selectedCount) selectedCount.textContent = count;
    if (orderActionsBar) {
        orderActionsBar.style.display = count > 0 ? 'flex' : 'none';
    }
    // Highlight rows
    document.querySelectorAll('.order-row').forEach(row => {
        const id = parseInt(row.dataset.id, 10);
        if (selectedOrderIds.has(id)) row.classList.add('selected');
        else row.classList.remove('selected');
    });
}

// ===================== ORDER DETAIL =====================

async function openOrderDetail(orderId) {
    try {
        const res = await apiGet(`/orders/${orderId}`);
        if (!res.success) { alert('Failed to load order detail'); return; }
        const order = res.order;
        const history = res.history || [];
        renderOrderDetail(order, history);
        orderDetailPanel.classList.remove('hidden');
    } catch (err) { console.error('openOrderDetail error:', err); }
}

function renderOrderDetail(order, history) {
    const canEdit = currentUser.role === 'admin' || currentUser.role === 'procurement';
    const deliveryStatus = getDeliveryStatus(order);

    let statusOptions = ORDER_STATUSES.map(s =>
        `<option value="${s}" ${order.status === s ? 'selected' : ''}>${s}</option>`
    ).join('');

    let priorityOptions = ['Normal', 'Urgent', 'High', 'Low'].map(p =>
        `<option value="${p}" ${order.priority === p ? 'selected' : ''}>${p}</option>`
    ).join('');

    let supplierOptions = '<option value="">-- None --</option>' +
        suppliersState.filter(s => s.active).map(s =>
            `<option value="${s.id}" ${order.supplier_id === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
        ).join('');

    const filesHtml = (order.files || []).map(f => `
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.35rem;">
            <a href="/uploads/${f.path}" target="_blank" style="color:#06b6d4;font-size:0.8rem;text-decoration:none;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</a>
            <button class="btn btn-secondary btn-sm" style="padding:0.1rem 0.4rem;font-size:0.7rem;" onclick="deleteOrderFile(${f.id}, ${order.id})" title="Remove file">✕</button>
        </div>
    `).join('');

    const historyHtml = history.length > 0 ? history.map(h =>
        `<div style="font-size:0.75rem;color:#94a3b8;padding:0.2rem 0;border-bottom:1px solid rgba(148,163,184,0.1);">
            <span style="color:#64748b;">${formatDateTime(h.changed_at)}</span>
            <strong style="color:#e2e8f0;">${escapeHtml(h.field_name)}</strong>:
            <span style="color:#ef4444;">${escapeHtml(h.old_value || 'none')}</span> →
            <span style="color:#10b981;">${escapeHtml(h.new_value || 'none')}</span>
            ${h.changed_by_name ? `<span style="color:#64748b;"> by ${escapeHtml(h.changed_by_name)}</span>` : ''}
        </div>`
    ).join('') : '<div style="color:#64748b;font-size:0.8rem;">No history yet.</div>';

    orderDetailBody.innerHTML = `
        <div class="detail-section-title">Order #${order.id}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;">
            <div><div class="detail-label">Item Description</div><div class="detail-value">${escapeHtml(order.item_description || '')}</div></div>
            <div><div class="detail-label">Part Number</div><div class="detail-value">${escapeHtml(order.part_number || '-')}</div></div>
            <div><div class="detail-label">Quantity</div><div class="detail-value">${order.quantity}</div></div>
            <div><div class="detail-label">Building</div><div class="detail-value">${escapeHtml(order.building || '-')}</div></div>
            <div><div class="detail-label">Cost Center</div><div class="detail-value">${escapeHtml(order.cost_center_code || '-')} ${order.cost_center_name ? '— ' + escapeHtml(order.cost_center_name) : ''}</div></div>
            <div><div class="detail-label">Requester</div><div class="detail-value">${escapeHtml(order.requester_name || '-')}</div></div>
            <div><div class="detail-label">Priority</div><div class="detail-value"><span class="badge priority-${(order.priority || 'normal').toLowerCase()}">${order.priority || 'Normal'}</span></div></div>
            <div><div class="detail-label">Status</div><div class="detail-value"><span class="status-badge status-${(order.status || '').toLowerCase().replace(/ /g, '-')}">${order.status || '-'}</span></div></div>
            <div><div class="detail-label">Date Needed</div><div class="detail-value">${order.date_needed ? formatDate(order.date_needed) : '-'}</div></div>
            <div><div class="detail-label">Expected Delivery</div><div class="detail-value">${order.expected_delivery_date ? formatDate(order.expected_delivery_date) : '-'}</div></div>
            <div><div class="detail-label">Supplier</div><div class="detail-value">${escapeHtml(order.supplier_name || '-')}</div></div>
            <div><div class="detail-label">Quote</div><div class="detail-value">${order.quote_number ? `<span class="quote-ref-badge">${escapeHtml(order.quote_number)}</span>` : '-'}</div></div>
            <div><div class="detail-label">Unit Price</div><div class="detail-value">${order.unit_price ? fmtPrice(order.unit_price) + ' ' + (order.currency || '') : '-'}</div></div>
            <div><div class="detail-label">Total Price</div><div class="detail-value">${order.total_price ? fmtPrice(order.total_price) + ' ' + (order.currency || '') : '-'}</div></div>
            <div><div class="detail-label">Delivery</div><div class="detail-value">${getDeliveryBadgeHtml(deliveryStatus)}</div></div>
            <div><div class="detail-label">Notes</div><div class="detail-value">${escapeHtml(order.notes || '-')}</div></div>
        </div>

        ${order.files && order.files.length ? `
        <div class="detail-section-title" style="margin-top:0.5rem;">Attached Files</div>
        <div style="margin-bottom:1rem;">${filesHtml}</div>` : ''}

        <div class="detail-section-title" style="margin-top:0.5rem;">Upload File</div>
        <div style="margin-bottom:1rem;">
            <input type="file" id="detailFileInput" multiple style="font-size:0.8rem;color:#e2e8f0;">
            <button class="btn btn-secondary btn-sm" style="margin-top:0.4rem;" onclick="uploadOrderFiles(${order.id})">Upload</button>
        </div>

        ${canEdit ? `
        <div class="detail-section-title" style="margin-top:0.5rem;">Update Order</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;">
            <div>
                <label class="detail-label">Status</label>
                <select id="detailStatus" class="form-control form-control-sm">${statusOptions}</select>
            </div>
            <div>
                <label class="detail-label">Priority</label>
                <select id="detailPriority" class="form-control form-control-sm">${priorityOptions}</select>
            </div>
            <div>
                <label class="detail-label">Supplier</label>
                <select id="detailSupplier" class="form-control form-control-sm">${supplierOptions}</select>
            </div>
            <div>
                <label class="detail-label">Expected Delivery</label>
                <input type="date" id="detailExpectedDelivery" class="form-control form-control-sm date-picker" value="${order.expected_delivery_date ? order.expected_delivery_date.split('T')[0] : ''}">
            </div>
            <div>
                <label class="detail-label">Unit Price</label>
                <input type="number" id="detailUnitPrice" class="form-control form-control-sm" step="0.01" value="${order.unit_price || ''}">
            </div>
            <div>
                <label class="detail-label">Total Price</label>
                <input type="number" id="detailTotalPrice" class="form-control form-control-sm" step="0.01" value="${order.total_price || ''}">
            </div>
            <div>
                <label class="detail-label">Notes</label>
                <textarea id="detailNotes" class="form-control form-control-sm" rows="2">${escapeHtml(order.notes || '')}</textarea>
            </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveOrderDetail(${order.id})">Save Changes</button>
        <button class="btn btn-danger btn-sm" style="margin-left:0.5rem;" onclick="deleteOrder(${order.id})">Delete Order</button>
        ` : ''}

        <div class="detail-section-title" style="margin-top:1rem;">Order History</div>
        <div style="max-height:200px;overflow-y:auto;">${historyHtml}</div>
    `;
}

async function saveOrderDetail(orderId) {
    const status = document.getElementById('detailStatus').value;
    const priority = document.getElementById('detailPriority').value;
    const supplierId = document.getElementById('detailSupplier').value;
    const expectedDelivery = document.getElementById('detailExpectedDelivery').value;
    const unitPrice = document.getElementById('detailUnitPrice').value;
    const totalPrice = document.getElementById('detailTotalPrice').value;
    const notes = document.getElementById('detailNotes').value;
    const payload = {
        status, priority,
        supplier_id: supplierId || null,
        expected_delivery_date: expectedDelivery || null,
        unit_price: unitPrice || null,
        total_price: totalPrice || null,
        notes: notes || null
    };
    const res = await apiPut(`/orders/${orderId}`, payload);
    if (res.success) {
        showToast('Order updated', 'success');
        await loadOrders();
        openOrderDetail(orderId);
    } else {
        alert('Failed to update: ' + (res.message || 'Unknown error'));
    }
}

async function deleteOrder(orderId) {
    if (!confirm('Delete this order? This cannot be undone.')) return;
    const res = await apiDelete(`/orders/${orderId}`);
    if (res.success) {
        showToast('Order deleted', 'success');
        orderDetailPanel.classList.add('hidden');
        loadOrders();
    } else {
        alert('Failed to delete: ' + (res.message || 'Unknown error'));
    }
}

async function uploadOrderFiles(orderId) {
    const input = document.getElementById('detailFileInput');
    if (!input.files.length) { alert('Please select files to upload'); return; }
    const formData = new FormData();
    for (const file of input.files) formData.append('files', file);
    try {
        const res = await fetch(`${API_BASE}/orders/${orderId}/files`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });
        const data = await res.json();
        if (data.success) { showToast('Files uploaded', 'success'); await loadOrders(); openOrderDetail(orderId); }
        else { alert('Upload failed: ' + (data.message || 'Unknown error')); }
    } catch (err) { alert('Upload error: ' + err.message); }
}

async function deleteOrderFile(fileId, orderId) {
    if (!confirm('Remove this file?')) return;
    const res = await apiDelete(`/orders/${orderId}/files/${fileId}`);
    if (res.success) { showToast('File removed', 'success'); await loadOrders(); openOrderDetail(orderId); }
    else { alert('Failed to remove file'); }
}

// ===================== CREATE ORDER (requester) =====================

async function handleCreateOrder(e) {
    e.preventDefault();
    const building = buildingSelect.value;
    const costCenterRadio = document.querySelector('input[name="costCenter"]:checked');
    const costCenterId = costCenterRadio ? costCenterRadio.value : null;
    const itemDescription = document.getElementById('itemDescription').value.trim();
    const partNumber = document.getElementById('partNumber').value.trim();
    const quantity = parseInt(document.getElementById('quantity').value, 10);
    const priority = document.getElementById('priority').value;
    const dateNeeded = document.getElementById('dateNeeded').value;
    const notes = document.getElementById('orderNotes').value.trim();
    if (!building || !itemDescription || !quantity || !costCenterId) {
        alert('Please fill in all required fields including selecting a cost center.');
        return;
    }
    const payload = {
        building, item_description: itemDescription, part_number: partNumber || null,
        quantity, priority, date_needed: dateNeeded || null,
        notes: notes || null, cost_center_id: costCenterId
    };
    const res = await apiPost('/orders', payload);
    if (res.success) {
        showToast('Order submitted successfully!', 'success');
        createOrderForm.reset();
        renderCostCenterRadios(building);
        await loadOrders();
    } else {
        alert('Failed to create order: ' + (res.message || 'Unknown error'));
    }
}

// ===================== PROCUREMENT CREATE ORDER MODAL =====================

function openProcCreateOrderModal() {
    const overlay = document.createElement('div');
    overlay.id = 'procOrderOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);display:flex;align-items:center;justify-content:center;z-index:100;';
    const activeBldgs = buildingsState.filter(b => b.active);
    const bldgOptions = activeBldgs.map(b => `<option value="${escapeHtml(b.code)}">${escapeHtml(b.code)} — ${escapeHtml(b.name)}</option>`).join('');
    const suppOptions = '<option value="">-- None --</option>' + suppliersState.filter(s => s.active).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    overlay.innerHTML = `
    <div style="background:#020617;padding:1.5rem;border-radius:12px;border:1px solid rgba(148,163,184,0.5);min-width:420px;max-width:560px;max-height:90vh;overflow-y:auto;color:white;">
        <h3 style="margin:0 0 1rem 0;font-size:1.05rem;font-weight:600;">Create New Order</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
            <div style="grid-column:1/-1;">
                <label class="detail-label">Item Description *</label>
                <input id="pocItemDesc" type="text" class="form-control form-control-sm" required placeholder="e.g. Steel Bolts M8">
            </div>
            <div>
                <label class="detail-label">Part Number</label>
                <input id="pocPartNum" type="text" class="form-control form-control-sm" placeholder="Optional">
            </div>
            <div>
                <label class="detail-label">Quantity *</label>
                <input id="pocQty" type="number" class="form-control form-control-sm" min="1" value="1" required>
            </div>
            <div>
                <label class="detail-label">Building *</label>
                <select id="pocBuilding" class="form-control form-control-sm" required>
                    <option value="">Select</option>${bldgOptions}
                </select>
            </div>
            <div>
                <label class="detail-label">Priority</label>
                <select id="pocPriority" class="form-control form-control-sm">
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                    <option value="Low">Low</option>
                </select>
            </div>
            <div>
                <label class="detail-label">Date Needed</label>
                <input id="pocDateNeeded" type="date" class="form-control form-control-sm date-picker">
            </div>
            <div>
                <label class="detail-label">Supplier</label>
                <select id="pocSupplier" class="form-control form-control-sm">${suppOptions}</select>
            </div>
            <div id="pocCCContainer" style="grid-column:1/-1;">
                <label class="detail-label">Cost Center *</label>
                <div id="pocCostCenterRadios" style="margin-top:0.3rem;"><span style="color:#64748b;font-size:0.85rem;">Select building first</span></div>
            </div>
            <div style="grid-column:1/-1;">
                <label class="detail-label">Notes</label>
                <textarea id="pocNotes" class="form-control form-control-sm" rows="2"></textarea>
            </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:1rem;">
            <button id="pocCancelBtn" class="btn btn-secondary btn-sm">Cancel</button>
            <button id="pocSubmitBtn" class="btn btn-primary btn-sm">Create Order</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    document.getElementById('pocBuilding').addEventListener('change', function() {
        const bCode = this.value;
        const container = document.getElementById('pocCostCenterRadios');
        if (!bCode) { container.innerHTML = '<span style="color:#64748b;font-size:0.85rem;">Select building first</span>'; return; }
        const filtered = costCentersState.filter(cc => cc.building_code === bCode && cc.active);
        if (!filtered.length) { container.innerHTML = '<span style="color:#64748b;font-size:0.85rem;">No cost centers for this building</span>'; return; }
        container.innerHTML = filtered.map(cc =>
            `<label class="radio-label" style="font-size:0.85rem;"><input type="radio" name="pocCC" value="${cc.id}" required> <strong>${escapeHtml(cc.code)}</strong> — ${escapeHtml(cc.name)}</label>`
        ).join('');
    });
    document.getElementById('pocCancelBtn').addEventListener('click', () => document.body.removeChild(overlay));
    document.getElementById('pocSubmitBtn').addEventListener('click', async () => {
        const desc = document.getElementById('pocItemDesc').value.trim();
        const qty = parseInt(document.getElementById('pocQty').value, 10);
        const bldg = document.getElementById('pocBuilding').value;
        const ccRadio = document.querySelector('input[name="pocCC"]:checked');
        const ccId = ccRadio ? ccRadio.value : null;
        if (!desc || !qty || !bldg || !ccId) { alert('Item description, quantity, building and cost center are required'); return; }
        const payload = {
            item_description: desc,
            part_number: document.getElementById('pocPartNum').value.trim() || null,
            quantity: qty,
            building: bldg,
            priority: document.getElementById('pocPriority').value,
            date_needed: document.getElementById('pocDateNeeded').value || null,
            supplier_id: document.getElementById('pocSupplier').value || null,
            notes: document.getElementById('pocNotes').value.trim() || null,
            cost_center_id: ccId
        };
        const res = await apiPost('/orders', payload);
        if (res.success) { showToast('Order created', 'success'); document.body.removeChild(overlay); await loadOrders(); }
        else { alert('Failed: ' + (res.message || 'Error')); }
    });
}

// ===================== QUOTES =====================

async function loadQuotes() {
    try {
        const res = await apiGet('/quotes');
        if (res.success) {
            quotesState = res.quotes;
            renderQuotesTable();
        }
    } catch (err) { console.error('loadQuotes error:', err); }
}

async function openCreateQuoteDialog() {
    if (selectedOrderIds.size === 0) { alert('Please select at least one order first'); return; }
    const orderIds = [...selectedOrderIds];
    const selectedOrders = ordersState.filter(o => orderIds.includes(o.id));
    await openQuoteWizardStep1(selectedOrders);
}

function renderQuotesTable() {
    if (!quotesTable) return;
    if (!quotesState.length) { quotesTable.innerHTML = '<p class="text-muted">No quotes found.</p>'; return; }
    let html = '<div class="table-wrapper"><table><thead><tr><th>Quote #</th><th>Supplier</th><th>Items</th><th>Total</th><th>Status</th><th>Valid Until</th><th>Created</th></tr></thead><tbody>';
    for (const q of quotesState) {
        html += `<tr class="quote-row" data-id="${q.id}" style="cursor:pointer;">`;
        html += `<td><span class="quote-ref-badge">${escapeHtml(q.quote_number)}</span></td>`;
        html += `<td>${escapeHtml(q.supplier_name || '-')}</td>`;
        html += `<td>${q.item_count || 0}</td>`;
        html += `<td>${q.total_amount ? fmtPrice(q.total_amount) + ' ' + (q.currency || '') : '-'}</td>`;
        html += `<td><span class="status-badge status-${(q.status || '').toLowerCase().replace(/ /g, '-')}">${q.status || '-'}</span></td>`;
        html += `<td>${q.valid_until ? formatDate(q.valid_until) : '-'}</td>`;
        html += `<td>${q.created_at ? formatDate(q.created_at) : '-'}</td>`;
        html += '</tr>';
    }
    html += '</tbody></table></div>';
    quotesTable.innerHTML = html;
    document.querySelectorAll('.quote-row').forEach(row => {
        row.addEventListener('click', () => {
            const id = parseInt(row.dataset.id, 10);
            openQuoteDetail(id);
        });
    });
}

async function openQuoteDetail(quoteId) {
    try {
        const [quoteRes, lifecycleRes] = await Promise.all([
            apiGet(`/quotes/${quoteId}`),
            apiGet(`/procurement/lifecycle/quote/${quoteId}`)
        ]);
        if (!quoteRes.success) { alert('Failed to load quote detail'); return; }
        renderQuoteDetail(quoteRes, lifecycleRes.success ? lifecycleRes.lifecycle : null);
        quoteDetailPanel.classList.remove('hidden');
    } catch (err) { console.error('openQuoteDetail error:', err); }
}

function renderQuoteDetail(quoteRes, lifecycle) {
    const quote = quoteRes.quote;
    const items = quoteRes.items || [];
    const canEdit = currentUser.role === 'admin' || currentUser.role === 'procurement';

    let statusOpts = ['Draft','Sent to Supplier','Received','Under Approval','Approved','Rejected','Cancelled'].map(s =>
        `<option value="${s}" ${quote.status === s ? 'selected' : ''}>${s}</option>`
    ).join('');

    let suppOpts = '<option value="">-- None --</option>' +
        suppliersState.filter(s => s.active).map(s =>
            `<option value="${s.id}" ${quote.supplier_id === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
        ).join('');

    // ===== Items table (with response data if available) =====
    const responseMap = {};
    if (lifecycle && lifecycle.responses) {
        for (const r of lifecycle.responses) {
            if (!responseMap[r.order_id]) responseMap[r.order_id] = r;
        }
    }

    let itemsHtml = '';
    if (items.length > 0) {
        itemsHtml = '<div class="table-wrapper" style="margin-top:0.5rem;"><table style="font-size:0.8rem;"><thead><tr>';
        itemsHtml += '<th>Order ID</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th>';
        if (lifecycle && lifecycle.responses && lifecycle.responses.length > 0) {
            itemsHtml += '<th>Supplier Response</th><th>Delivery</th><th>PDF</th>';
        }
        itemsHtml += '</tr></thead><tbody>';
        for (const item of items) {
            const resp = responseMap[item.order_id];
            itemsHtml += `<tr>`;
            itemsHtml += `<td>${item.order_id}</td>`;
            itemsHtml += `<td>${escapeHtml(item.item_description || '')}</td>`;
            itemsHtml += `<td>${item.quantity}</td>`;
            itemsHtml += `<td>${item.unit_price ? fmtPrice(item.unit_price) : '-'}</td>`;
            itemsHtml += `<td>${item.total_price ? fmtPrice(item.total_price) : '-'}</td>`;
            if (lifecycle && lifecycle.responses && lifecycle.responses.length > 0) {
                itemsHtml += `<td>${resp ? `<span class="status-badge">${escapeHtml(resp.status || '')}</span> ${resp.unit_price ? fmtPrice(resp.unit_price) + ' ' + (resp.currency || '') : ''}` : '-'}</td>`;
                itemsHtml += `<td>${resp && resp.promised_delivery_date ? formatDate(resp.promised_delivery_date) : '-'}</td>`;
                itemsHtml += `<td>${resp && resp.response_document_id ? `<a href="/api/documents/${resp.response_document_id}/download" target="_blank" style="color:#06b6d4;font-size:0.75rem;">PDF</a>` : '-'}</td>`;
            }
            itemsHtml += '</tr>';
        }
        itemsHtml += '</tbody></table></div>';
    }

    // ===== PO section =====
    let poHtml = '';
    if (lifecycle && lifecycle.purchase_orders && lifecycle.purchase_orders.length > 0) {
        const po = lifecycle.purchase_orders[0];
        poHtml = `<div style="background:#0f172a;padding:0.75rem;border-radius:6px;margin-bottom:1rem;">
            <div class="detail-section-title" style="margin:0 0 0.4rem 0;">Purchase Order</div>
            <div style="font-size:0.85rem;display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;">
                <div>PO Number: <strong>${escapeHtml(po.po_number)}</strong></div>
                <div>Status: <span class="status-badge status-${(po.status || '').toLowerCase()}">${po.status || '-'}</span></div>
                <div>Total: <strong>${fmtPrice(po.total_amount)} ${po.currency || ''}</strong></div>
                <div>Created: ${po.created_at ? formatDate(po.created_at) : '-'}</div>
                ${po.expected_delivery_date ? `<div>Expected Delivery: ${formatDate(po.expected_delivery_date)}</div>` : ''}
            </div>
        </div>`;
    }

    // ===== Invoice section =====
    let invoiceHtml = '';
    if (lifecycle && lifecycle.invoices && lifecycle.invoices.length > 0) {
        const inv = lifecycle.invoices[0];
        invoiceHtml = `<div style="background:#0f172a;padding:0.75rem;border-radius:6px;margin-bottom:1rem;">
            <div class="detail-section-title" style="margin:0 0 0.4rem 0;">Invoice</div>
            <div style="font-size:0.85rem;display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;">
                <div>Invoice #: <strong>${escapeHtml(inv.invoice_number || '-')}</strong></div>
                <div>Status: <span class="status-badge">${inv.status || '-'}</span></div>
                <div>Amount: <strong>${fmtPrice(inv.total_amount)} ${inv.currency || ''}</strong></div>
                <div>Due: ${inv.due_date ? formatDate(inv.due_date) : '-'}</div>
            </div>
        </div>`;
    }

    // ===== Send log =====
    let sendLogHtml = '';
    if (lifecycle && lifecycle.sendLog && lifecycle.sendLog.length > 0) {
        sendLogHtml = `<div class="detail-section-title" style="margin-top:0.5rem;">Send History</div><div style="font-size:0.75rem;color:#94a3b8;">`;
        for (const entry of lifecycle.sendLog) {
            sendLogHtml += `<div style="padding:0.2rem 0;">Sent by ${escapeHtml(entry.sent_by_name || '-')} on ${formatDateTime(entry.sent_at)} to ${escapeHtml(entry.sent_to_email || '-')}</div>`;
        }
        sendLogHtml += '</div>';
    }

    quoteDetailBody.innerHTML = `
        <div class="detail-section-title">Quote ${escapeHtml(quote.quote_number)}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;">
            <div><div class="detail-label">Supplier</div><div class="detail-value">${escapeHtml(quote.supplier_name || '-')}</div></div>
            <div><div class="detail-label">Status</div><div class="detail-value"><span class="status-badge status-${(quote.status || '').toLowerCase().replace(/ /g, '-')}">${quote.status || '-'}</span></div></div>
            <div><div class="detail-label">Total Amount</div><div class="detail-value">${quote.total_amount ? fmtPrice(quote.total_amount) + ' ' + (quote.currency || '') : '-'}</div></div>
            <div><div class="detail-label">Valid Until</div><div class="detail-value">${quote.valid_until ? formatDate(quote.valid_until) : '-'}</div></div>
            <div><div class="detail-label">Created</div><div class="detail-value">${quote.created_at ? formatDate(quote.created_at) : '-'}</div></div>
            <div><div class="detail-label">Notes</div><div class="detail-value">${escapeHtml(quote.notes || '-')}</div></div>
        </div>

        <div class="detail-section-title">Quote Items</div>
        ${itemsHtml}

        ${poHtml}
        ${invoiceHtml}
        ${sendLogHtml}

        ${canEdit ? `
        <div class="detail-section-title" style="margin-top:1rem;">Record Supplier Response</div>
        <div id="responseFormContainer" style="margin-bottom:1rem;">
            <p style="font-size:0.8rem;color:#94a3b8;margin-bottom:0.5rem;">Record a supplier response for an item in this quote.</p>
            ${renderResponseForm(quote.id, items)}
        </div>

        <div class="detail-section-title">Upload Supplier Quote PDF</div>
        <div style="margin-bottom:1rem;">
            <input type="file" id="quotePdfInput" accept=".pdf" style="font-size:0.8rem;color:#e2e8f0;">
            <button class="btn btn-secondary btn-sm" style="margin-top:0.4rem;" onclick="uploadQuotePDF(${quote.id})">Upload PDF</button>
        </div>

        <div class="detail-section-title">Update Quote</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;">
            <div>
                <label class="detail-label">Status</label>
                <select id="quoteDetailStatus" class="form-control form-control-sm">${statusOpts}</select>
            </div>
            <div>
                <label class="detail-label">Supplier</label>
                <select id="quoteDetailSupplier" class="form-control form-control-sm">${suppOpts}</select>
            </div>
            <div>
                <label class="detail-label">Total Amount</label>
                <input type="number" id="quoteDetailTotal" class="form-control form-control-sm" step="0.01" value="${quote.total_amount || ''}">
            </div>
            <div>
                <label class="detail-label">Valid Until</label>
                <input type="date" id="quoteDetailValidUntil" class="form-control form-control-sm date-picker" value="${quote.valid_until ? quote.valid_until.split('T')[0] : ''}">
            </div>
            <div style="grid-column:1/-1;">
                <label class="detail-label">Notes</label>
                <textarea id="quoteDetailNotes" class="form-control form-control-sm" rows="2">${escapeHtml(quote.notes || '')}</textarea>
            </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveQuoteDetail(${quote.id})">Update Quote</button>
        <button class="btn btn-secondary btn-sm" style="margin-left:0.5rem;" onclick="openSendQuoteDialog(${quote.id})">Send to Supplier</button>
        <button class="btn btn-secondary btn-sm" style="margin-left:0.5rem;" onclick="openSubmitForApprovalDialog(${quote.id})">Submit for Approval</button>
        ` : ''}
    `;

    // If approval submission module is loaded, add the button
    if (canEdit && typeof addSubmitForApprovalButton === 'function') {
        addSubmitForApprovalButton(quoteDetailBody, quote);
    }
}

function renderResponseForm(quoteId, items) {
    if (!items || !items.length) return '<p style="font-size:0.8rem;color:#64748b;">No items in this quote.</p>';
    const orderOpts = items.map(i => `<option value="${i.order_id}">${escapeHtml(i.item_description || 'Order #' + i.order_id)}</option>`).join('');
    return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
        <div style="grid-column:1/-1;">
            <label class="detail-label">Order Item</label>
            <select id="respOrderId" class="form-control form-control-sm">${orderOpts}</select>
        </div>
        <div>
            <label class="detail-label">Unit Price</label>
            <input type="number" id="respUnitPrice" class="form-control form-control-sm" step="0.01" placeholder="0.00">
        </div>
        <div>
            <label class="detail-label">Currency</label>
            <select id="respCurrency" class="form-control form-control-sm">
                <option value="EUR">EUR</option><option value="USD">USD</option><option value="BGN">BGN</option>
            </select>
        </div>
        <div>
            <label class="detail-label">Delivery Date</label>
            <input type="date" id="respDeliveryDate" class="form-control form-control-sm date-picker">
        </div>
        <div>
            <label class="detail-label">Status</label>
            <select id="respStatus" class="form-control form-control-sm">
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="rejected">Rejected</option>
                <option value="alternative">Alternative</option>
            </select>
        </div>
        <div>
            <label class="detail-label">Lead Time (days)</label>
            <input type="number" id="respLeadTime" class="form-control form-control-sm" min="0">
        </div>
        <div style="grid-column:1/-1;">
            <label class="detail-label">Supplier Notes</label>
            <textarea id="respNotes" class="form-control form-control-sm" rows="2"></textarea>
        </div>
    </div>
    <button class="btn btn-primary btn-sm" style="margin-top:0.5rem;" onclick="saveQuoteResponse(${quoteId})">Save Response</button>
    `;
}

async function saveQuoteResponse(quoteId) {
    const orderId = document.getElementById('respOrderId').value;
    const unitPrice = document.getElementById('respUnitPrice').value;
    const currency = document.getElementById('respCurrency').value;
    const deliveryDate = document.getElementById('respDeliveryDate').value;
    const status = document.getElementById('respStatus').value;
    const leadTime = document.getElementById('respLeadTime').value;
    const notes = document.getElementById('respNotes').value;
    const payload = {
        order_id: orderId ? parseInt(orderId, 10) : null,
        unit_price: unitPrice ? parseFloat(unitPrice) : null,
        currency, status,
        promised_delivery_date: deliveryDate || null,
        lead_time_days: leadTime ? parseInt(leadTime, 10) : null,
        supplier_notes: notes || null
    };
    const res = await apiPost(`/procurement/quotes/${quoteId}/responses`, payload);
    if (res.success) { showToast('Response saved', 'success'); openQuoteDetail(quoteId); }
    else { alert('Failed: ' + (res.message || 'Error')); }
}

async function uploadQuotePDF(quoteId) {
    const input = document.getElementById('quotePdfInput');
    if (!input.files.length) { alert('Please select a PDF file'); return; }
    const formData = new FormData();
    formData.append('file', input.files[0]);
    try {
        const res = await fetch(`${API_BASE}/procurement/quotes/${quoteId}/upload-pdf`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });
        const data = await res.json();
        if (data.success) { showToast('PDF uploaded', 'success'); openQuoteDetail(quoteId); }
        else { alert('Upload failed: ' + (data.message || 'Error')); }
    } catch (err) { alert('Upload error: ' + err.message); }
}

async function saveQuoteDetail(quoteId) {
    const payload = {
        status: document.getElementById('quoteDetailStatus').value,
        supplier_id: document.getElementById('quoteDetailSupplier').value || null,
        total_amount: document.getElementById('quoteDetailTotal').value || null,
        valid_until: document.getElementById('quoteDetailValidUntil').value || null,
        notes: document.getElementById('quoteDetailNotes').value || null
    };
    const res = await apiPut(`/quotes/${quoteId}`, payload);
    if (res.success) { showToast('Quote updated', 'success'); await loadQuotes(); openQuoteDetail(quoteId); }
    else { alert('Failed: ' + (res.message || 'Error')); }
}

// ===================== QUOTE WIZARD =====================

async function openQuoteWizardStep1(selectedOrders) {
    const overlay = document.createElement('div');
    overlay.id = 'quoteWizardOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);display:flex;align-items:center;justify-content:center;z-index:100;';
    const suppOpts = suppliersState.filter(s => s.active).map(s =>
        `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    overlay.innerHTML = `
    <div style="background:#020617;padding:1.5rem;border-radius:12px;border:1px solid rgba(148,163,184,0.5);min-width:480px;max-width:600px;max-height:90vh;overflow-y:auto;color:white;">
        <h3 style="margin:0 0 1rem 0;font-size:1.05rem;font-weight:600;">Create Quote — Step 1: Select Supplier</h3>
        <p style="font-size:0.85rem;color:#94a3b8;margin-bottom:1rem;">Creating quote for ${selectedOrders.length} order(s).</p>
        <div style="margin-bottom:1rem;">
            <label class="detail-label">Supplier *</label>
            <select id="wizSupplier" class="form-control form-control-sm" required>
                <option value="">Select Supplier</option>${suppOpts}
            </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;">
            <div>
                <label class="detail-label">Currency</label>
                <select id="wizCurrency" class="form-control form-control-sm">
                    <option value="EUR">EUR</option><option value="USD">USD</option><option value="BGN">BGN</option>
                </select>
            </div>
            <div>
                <label class="detail-label">Valid Until</label>
                <input type="date" id="wizValidUntil" class="form-control form-control-sm date-picker">
            </div>
        </div>
        <div style="margin-bottom:1rem;">
            <label class="detail-label">Notes</label>
            <textarea id="wizNotes" class="form-control form-control-sm" rows="2"></textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
            <button id="wizCancel" class="btn btn-secondary btn-sm">Cancel</button>
            <button id="wizNext" class="btn btn-primary btn-sm">Create Quote</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    document.getElementById('wizCancel').addEventListener('click', () => document.body.removeChild(overlay));
    document.getElementById('wizNext').addEventListener('click', async () => {
        const supplierId = document.getElementById('wizSupplier').value;
        const currency = document.getElementById('wizCurrency').value;
        const validUntil = document.getElementById('wizValidUntil').value;
        const notes = document.getElementById('wizNotes').value;
        if (!supplierId) { alert('Please select a supplier'); return; }
        const payload = {
            supplier_id: parseInt(supplierId, 10),
            currency,
            valid_until: validUntil || null,
            notes: notes || null,
            order_ids: selectedOrders.map(o => o.id)
        };
        const res = await apiPost('/quotes', payload);
        if (res.success) {
            showToast(`Quote ${res.quoteNumber} created`, 'success');
            document.body.removeChild(overlay);
            selectedOrderIds.clear();
            updateSelectionUI();
            await loadQuotes();
            await loadOrders();
            switchTab('quotesTab');
        } else {
            alert('Failed to create quote: ' + (res.message || 'Error'));
        }
    });
}

// ===================== SEND QUOTE TO SUPPLIER =====================

async function openSendQuoteDialog(quoteId) {
    try {
        const quoteRes = await apiGet(`/quotes/${quoteId}`);
        if (!quoteRes.success) { alert('Failed to load quote'); return; }
        const quote = quoteRes.quote;
        const items = quoteRes.items || [];
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);display:flex;align-items:center;justify-content:center;z-index:100;';
        const suppEmail = quote.supplier_email || '';
        let itemsPreview = items.map(i =>
            `<div style="font-size:0.8rem;padding:0.2rem 0;border-bottom:1px solid rgba(148,163,184,0.1);">${escapeHtml(i.item_description || '')} x${i.quantity}${i.unit_price ? ' — ' + fmtPrice(i.unit_price) + ' ' + (quote.currency || '') : ''}</div>`
        ).join('');
        overlay.innerHTML = `
        <div style="background:#020617;padding:1.5rem;border-radius:12px;border:1px solid rgba(148,163,184,0.5);min-width:480px;max-width:580px;max-height:90vh;overflow-y:auto;color:white;">
            <h3 style="margin:0 0 1rem 0;font-size:1.05rem;font-weight:600;">Send Quote to Supplier</h3>
            <div style="margin-bottom:1rem;">
                <label class="detail-label">Supplier Email *</label>
                <input id="sendQuoteEmail" type="email" class="form-control form-control-sm" value="${escapeHtml(suppEmail)}" placeholder="supplier@example.com">
            </div>
            <div style="margin-bottom:1rem;">
                <label class="detail-label">Additional Message (optional)</label>
                <textarea id="sendQuoteMessage" class="form-control form-control-sm" rows="3" placeholder="Add any message..."></textarea>
            </div>
            <div style="background:#0f172a;padding:0.75rem;border-radius:6px;margin-bottom:1rem;">
                <div style="font-size:0.8rem;color:#94a3b8;margin-bottom:0.4rem;">Items in this quote:</div>
                ${itemsPreview}
            </div>
            <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
                <button id="sendQuoteCancel" class="btn btn-secondary btn-sm">Cancel</button>
                <button id="sendQuoteConfirm" class="btn btn-primary btn-sm">Send Email</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        document.getElementById('sendQuoteCancel').addEventListener('click', () => document.body.removeChild(overlay));
        document.getElementById('sendQuoteConfirm').addEventListener('click', async () => {
            const email = document.getElementById('sendQuoteEmail').value.trim();
            const message = document.getElementById('sendQuoteMessage').value.trim();
            if (!email) { alert('Please enter supplier email'); return; }
            const btn = document.getElementById('sendQuoteConfirm');
            btn.disabled = true; btn.textContent = 'Sending...';
            try {
                const res = await apiPost(`/quotes/${quoteId}/send`, { supplier_email: email, message: message || null });
                if (res.success) {
                    showToast('Quote sent to supplier', 'success');
                    document.body.removeChild(overlay);
                    openQuoteDetail(quoteId);
                } else {
                    alert('Send failed: ' + (res.message || 'Error'));
                    btn.disabled = false; btn.textContent = 'Send Email';
                }
            } catch (err) {
                alert('Error: ' + err.message);
                btn.disabled = false; btn.textContent = 'Send Email';
            }
        });
    } catch (err) { console.error('openSendQuoteDialog error:', err); }
}

// ===================== APPROVALS =====================

async function loadApprovals() {
    try {
        const res = await apiGet('/approvals');
        if (res.success) renderApprovalsTable(res.approvals);
    } catch (err) { console.error('loadApprovals error:', err); }
}

function renderApprovalsTable(approvals) {
    const approvalsTable = document.getElementById('approvalsTable');
    if (!approvalsTable) return;
    if (!approvals.length) { approvalsTable.innerHTML = '<p class="text-muted">No approval requests.</p>'; return; }
    let html = '<div class="table-wrapper"><table><thead><tr><th>ID</th><th>Order</th><th>Description</th><th>Supplier</th><th>Cost</th><th>Priority</th><th>Status</th><th>Requested</th><th>Actions</th></tr></thead><tbody>';
    for (const a of approvals) {
        html += `<tr>`;
        html += `<td>${a.id}</td>`;
        html += `<td>${a.order_id}</td>`;
        html += `<td>${escapeHtml(a.item_description || '-')}</td>`;
        html += `<td>${escapeHtml(a.supplier_name || '-')}</td>`;
        html += `<td>${a.estimated_cost ? fmtPrice(a.estimated_cost) + ' EUR' : '-'}</td>`;
        html += `<td><span class="badge priority-${(a.priority || 'normal').toLowerCase()}">${a.priority || 'Normal'}</span></td>`;
        html += `<td><span class="status-badge status-${(a.status || '').toLowerCase()}">${a.status || '-'}</span></td>`;
        html += `<td>${a.created_at ? formatDate(a.created_at) : '-'}</td>`;
        html += `<td>`;
        if (a.status === 'Pending' && currentUser.role === 'manager') {
            html += `<button class="btn btn-primary btn-sm" style="margin-right:0.3rem;" onclick="handleApprovalAction(${a.id}, 'Approved')">Approve</button>`;
            html += `<button class="btn btn-danger btn-sm" onclick="handleApprovalAction(${a.id}, 'Rejected')">Reject</button>`;
        }
        html += '</td></tr>';
    }
    html += '</tbody></table></div>';
    approvalsTable.innerHTML = html;
}

async function handleApprovalAction(approvalId, action) {
    const comments = action === 'Rejected' ? prompt('Reason for rejection (optional):') : null;
    const res = await apiPut(`/approvals/${approvalId}`, { status: action, comments: comments || null });
    if (res.success) {
        showToast(`Approval ${action.toLowerCase()}`, 'success');
        loadApprovals();
        loadOrders();
    } else {
        alert('Action failed: ' + (res.message || 'Error'));
    }
}

// ===================== SUPPLIERS =====================

async function loadSuppliers() {
    try {
        const res = await apiGet('/suppliers');
        if (res.success) {
            suppliersState = res.suppliers;
            if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'procurement')) renderSuppliersTable();
        }
    } catch (err) { console.error('loadSuppliers error:', err); }
}

function renderSuppliersTable() {
    if (!suppliersTable) return;
    if (!suppliersState.length) { suppliersTable.innerHTML = '<p class="text-muted">No suppliers found.</p>'; return; }
    let html = '<div class="table-wrapper"><table><thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th>Active</th><th></th></tr></thead><tbody>';
    for (const s of suppliersState) {
        html += `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.contact_person || '-')}</td><td>${escapeHtml(s.email || '-')}</td><td>${escapeHtml(s.phone || '-')}</td><td>${s.active ? 'Yes' : 'No'}</td><td><button class="btn btn-secondary btn-sm" onclick="openSupplierForm(${s.id})">Edit</button></td></tr>`;
    }
    html += '</tbody></table></div>';
    suppliersTable.innerHTML = html;
}

function openSupplierForm(supplierId) {
    if (!supplierFormCard) return;
    if (supplierId) {
        const s = suppliersState.find(x => x.id === supplierId);
        if (!s) return;
        supplierFormTitle.textContent = 'Edit Supplier';
        supplierIdInput.value = s.id;
        supplierNameInput.value = s.name || '';
        supplierContactInput.value = s.contact_person || '';
        supplierEmailInput.value = s.email || '';
        supplierPhoneInput.value = s.phone || '';
        supplierWebsiteInput.value = s.website || '';
        supplierAddressInput.value = s.address || '';
        supplierNotesInput.value = s.notes || '';
        supplierActiveInput.value = s.active ? '1' : '0';
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
    if (res.success) { alert('Supplier saved'); supplierFormCard.hidden = true; loadSuppliers(); }
    else { alert('Failed: ' + (res.message || 'Error')); }
}

// ===================== BUILDINGS =====================

async function loadBuildings() {
    try {
        const res = await apiGet('/buildings');
        if (res.success) {
            buildingsState = res.buildings;
            populateBuildingSelect();
            if (currentUser && currentUser.role === 'admin') { renderBuildingsTable(); populateCCBuildingSelects(); }
        }
    } catch (err) { console.error('loadBuildings error:', err); }
}

function populateBuildingSelect() {
    if (!buildingSelect) return;
    const active = buildingsState.filter(b => b.active);
    buildingSelect.innerHTML = '<option value="">Select Building</option>' +
        active.map(b => `<option value="${b.code}">${escapeHtml(b.code)} — ${escapeHtml(b.name)}</option>`).join('');
}

function renderBuildingsTable() {
    if (!buildingsTable) return;
    if (!buildingsState.length) { buildingsTable.innerHTML = '<p class="text-muted">No buildings found.</p>'; return; }
    let html = '<div class="table-wrapper"><table><thead><tr><th>Code</th><th>Name</th><th>Active</th><th></th></tr></thead><tbody>';
    for (const b of buildingsState) {
        html += `<tr><td>${escapeHtml(b.code)}</td><td>${escapeHtml(b.name)}</td><td>${b.active ? 'Yes' : 'No'}</td><td><button class="btn btn-secondary btn-sm" onclick="openBuildingForm(${b.id})">Edit</button></td></tr>`;
    }
    html += '</tbody></table></div>';
    buildingsTable.innerHTML = html;
}

function openBuildingForm(buildingId) {
    if (!buildingFormCard) return;
    if (buildingId) {
        const b = buildingsState.find(x => x.id === buildingId);
        if (!b) return;
        buildingFormTitle.textContent = 'Edit Building';
        buildingIdInput.value = b.id;
        buildingCodeInput.value = b.code || '';
        buildingNameInput.value = b.name || '';
        buildingDescriptionInput.value = b.description || '';
        buildingActiveSelect.value = b.active ? '1' : '0';
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
        code: buildingCodeInput.value.trim().toUpperCase(),
        name: buildingNameInput.value.trim(),
        description: buildingDescriptionInput.value.trim(),
        active: buildingActiveSelect.value === '1'
    };
    if (!payload.code || !payload.name) { alert('Code and name are required'); return; }
    const id = buildingIdInput.value;
    const res = id ? await apiPut(`/buildings/${id}`, payload) : await apiPost('/buildings', payload);
    if (res.success) { alert('Building saved'); buildingFormCard.hidden = true; loadBuildings(); }
    else { alert('Failed: ' + (res.message || 'Error')); }
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
    let html = '<div class="table-wrapper"><table><thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Building</th><th>Active</th><th></th></tr></thead><tbody>';
    for (const u of usersState) {
        html += `<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.email || '-')}</td><td>${escapeHtml(u.role)}</td><td>${escapeHtml(u.building || '-')}</td><td>${u.active ? 'Yes' : 'No'}</td><td><button class="btn btn-secondary btn-sm" onclick="openUserForm(${u.id})">Edit</button></td></tr>`;
    }
    html += '</tbody></table></div>';
    usersTable.innerHTML = html;
}

function openUserForm(userId) {
    if (!userFormCard) return;
    if (userId) {
        const u = usersState.find(x => x.id === userId);
        if (!u) return;
        userFormTitle.textContent = 'Edit User';
        userIdInput.value = u.id;
        userUsernameInput.value = u.username || '';
        userNameInput.value = u.name || '';
        userEmailInput.value = u.email || '';
        userRoleSelect.value = u.role || 'requester';
        userBuildingSelect.value = u.building || '';
        userActiveSelect.value = u.active ? '1' : '0';
        if (userPasswordGroup) userPasswordGroup.style.display = 'none';
        if (userPasswordInput) userPasswordInput.required = false;
    } else {
        userFormTitle.textContent = 'Create User';
        userForm.reset();
        userIdInput.value = '';
        userActiveSelect.value = '1';
        if (userPasswordGroup) userPasswordGroup.style.display = 'block';
        if (userPasswordInput) userPasswordInput.required = true;
    }
    userBuildingSelect.innerHTML = '<option value="">-- None --</option>' +
        buildingsState.filter(b => b.active).map(b => `<option value="${b.code}">${escapeHtml(b.code)} — ${escapeHtml(b.name)}</option>`).join('');
    if (userId) {
        const u = usersState.find(x => x.id === userId);
        if (u) userBuildingSelect.value = u.building || '';
    }
    userFormCard.hidden = false;
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
    if (!payload.username || !payload.name) { alert('Username and name are required'); return; }
    const res = id ? await apiPut(`/users/${id}`, payload) : await apiPost('/users', payload);
    if (res.success) { alert('User saved'); userFormCard.hidden = true; loadUsers(); }
    else { alert('Failed: ' + (res.message || 'Error')); }
}

// ===================== TAB SWITCHING =====================

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const tabEl = document.getElementById(tabId);
    if (tabEl) tabEl.classList.remove('hidden');
    const tabBtn = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (tabBtn) tabBtn.classList.add('active');
    currentTab = tabId;
    if (tabId === 'approvalsTab' && typeof loadApprovals === 'function') loadApprovals();
}

// ===================== UTILITY =====================

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return dateStr; }
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return dateStr; }
}

function showToast(message, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const colors = { success: '#10b981', error: '#ef4444', info: '#06b6d4', warning: '#f59e0b' };
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = `background:${colors[type] || colors.success};color:white;padding:0.75rem 1rem;border-radius:8px;margin-top:0.5rem;display:flex;align-items:center;gap:0.5rem;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-size:0.9rem;min-width:200px;`;
    toast.innerHTML = `<span style="font-weight:bold;">${icons[type] || icons.success}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) container.removeChild(toast); }, 3500);
}
