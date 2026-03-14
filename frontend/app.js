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

// =============== DELIVERY TIMELINE LOGIC ===============

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

// =============== FILTERING ===============

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

// =============== AUTH ===============

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
    const procurementTabButton = document.getElementById('procurementTabButton');
    if (procurementTabButton) procurementTabButton.hidden = true;

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
        if (currentUser.role === 'admin') {
            if (usersTabButton) usersTabButton.hidden = false;
            if (buildingsTabButton) buildingsTabButton.hidden = false;
            if (costCentersTabButton) costCentersTabButton.hidden = false;
        }
        // Show procurement tab for admin and procurement roles
        if (procurementTabButton) procurementTabButton.hidden = false;
        const orderActionsContainer = document.getElementById('orderActionsContainer');
        if (orderActionsContainer) orderActionsContainer.style.display = 'flex';
        if (orderActionsBar) orderActionsBar.style.display = 'none';
        const btnProcCreate = document.getElementById('btnProcurementCreateOrder');
        if (btnProcCreate) btnProcCreate.classList.remove('hidden');
    }

    loadInitialData();
}

async function loadInitialData() {
    await Promise.all([loadBuildings(), loadSuppliers(), loadCostCenters()]);
    populateBuildingSelects();
    populateSupplierFilter();
    populateBuildingFilter();
    await loadOrders();
    if (currentUser.role === 'admin' || currentUser.role === 'procurement' || currentUser.role === 'manager') {
        loadQuotes();
    }
    if (currentUser.role === 'admin') {
        loadUsers();
    }
}

// =============== API HELPERS ===============

async function apiGet(path) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    return res.json();
}

async function apiPost(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify(body)
    });
    return res.json();
}

async function apiPut(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
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

// =============== DATA LOADING ===============

async function loadOrders() {
    try {
        const data = await apiGet('/orders');
        if (data.success) {
            ordersState = data.orders;
            applyFilters();
        }
    } catch (err) {
        console.error('Failed to load orders:', err);
    }
}

async function loadSuppliers() {
    try {
        const data = await apiGet('/suppliers');
        if (data.success) { suppliersState = data.suppliers; renderSuppliersTable(); }
    } catch (err) { console.error('Failed to load suppliers:', err); }
}

async function loadBuildings() {
    try {
        const data = await apiGet('/buildings');
        if (data.success) { buildingsState = data.buildings; renderBuildingsTable(); }
    } catch (err) { console.error('Failed to load buildings:', err); }
}

async function loadCostCenters() {
    try {
        const data = await apiGet('/cost-centers');
        if (data.success) { costCentersState = data.cost_centers; renderCostCentersTable(); }
    } catch (err) { console.error('Failed to load cost centers:', err); }
}

async function loadUsers() {
    try {
        const data = await apiGet('/users');
        if (data.success) { usersState = data.users; renderUsersTable(); }
    } catch (err) { console.error('Failed to load users:', err); }
}

async function loadQuotes() {
    try {
        const data = await apiGet('/quotes');
        if (data.success) { quotesState = data.quotes; renderQuotesTable(); }
    } catch (err) { console.error('Failed to load quotes:', err); }
}

// =============== POPULATE SELECTS ===============

function populateBuildingSelects() {
    // For order creation form (requester)
    const activeBuildings = buildingsState.filter(b => b.is_active);
    buildingSelect.innerHTML = '<option value="">-- Select Building --</option>';
    activeBuildings.forEach(b => {
        buildingSelect.innerHTML += `<option value="${b.code}">${b.code} - ${b.name}</option>`;
    });

    // For procurement create order modal
    const procBuildingSelect = document.getElementById('procBuilding');
    if (procBuildingSelect) {
        procBuildingSelect.innerHTML = '<option value="">-- Select Building --</option>';
        activeBuildings.forEach(b => {
            procBuildingSelect.innerHTML += `<option value="${b.code}">${b.code} - ${b.name}</option>`;
        });
    }

    // For user form
    if (userBuildingSelect) {
        userBuildingSelect.innerHTML = '<option value="">-- No Building --</option>';
        activeBuildings.forEach(b => {
            userBuildingSelect.innerHTML += `<option value="${b.code}">${b.code} - ${b.name}</option>`;
        });
    }

    // For cost center form
    if (ccBuildingSelect) {
        ccBuildingSelect.innerHTML = '<option value="">-- Select Building --</option>';
        activeBuildings.forEach(b => {
            ccBuildingSelect.innerHTML += `<option value="${b.id}">${b.code} - ${b.name}</option>`;
        });
    }

    // For cost center filter
    if (ccFilterBuilding) {
        ccFilterBuilding.innerHTML = '<option value="">All Buildings</option>';
        activeBuildings.forEach(b => {
            ccFilterBuilding.innerHTML += `<option value="${b.id}">${b.code} - ${b.name}</option>`;
        });
    }
}

function populateSupplierFilter() {
    if (!filterSupplier) return;
    filterSupplier.innerHTML = '<option value="">All Suppliers</option>';
    suppliersState.filter(s => s.is_active).forEach(s => {
        filterSupplier.innerHTML += `<option value="${s.id}">${s.name}</option>`;
    });
    // Also populate procurement modal supplier select
    const procSupplierSelect = document.getElementById('procSupplier');
    if (procSupplierSelect) {
        procSupplierSelect.innerHTML = '<option value="">-- No Supplier --</option>';
        suppliersState.filter(s => s.is_active).forEach(s => {
            procSupplierSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
        });
    }
}

function populateBuildingFilter() {
    if (!filterBuilding) return;
    filterBuilding.innerHTML = '<option value="">All Buildings</option>';
    buildingsState.filter(b => b.is_active).forEach(b => {
        filterBuilding.innerHTML += `<option value="${b.code}">${b.code} - ${b.name}</option>`;
    });
}

function populateStatusFilter() {
    if (!filterStatus) return;
    filterStatus.innerHTML = '<option value="">All Statuses</option>';
    ORDER_STATUSES.forEach(s => {
        filterStatus.innerHTML += `<option value="${s}">${s}</option>`;
    });
}

function renderCostCenterRadios(buildingCode) {
    if (!costCenterRadios) return;
    const building = buildingsState.find(b => b.code === buildingCode);
    if (!building) { costCenterRadios.innerHTML = '<p class="text-gray-400 text-sm">Select a building first</p>'; return; }
    const ccs = costCentersState.filter(cc => cc.building_id === building.id && cc.is_active);
    if (ccs.length === 0) {
        costCenterRadios.innerHTML = '<p class="text-gray-400 text-sm">No cost centers for this building</p>';
        return;
    }
    costCenterRadios.innerHTML = ccs.map(cc =>
        `<label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="cost_center_id" value="${cc.id}" class="accent-blue-500">
            <span>${cc.code} - ${cc.name}</span>
        </label>`
    ).join('');
}

// =============== ORDERS TABLE ===============

function renderOrdersTable() {
    const tbody = document.getElementById('ordersTableBody');
    if (!tbody) return;
    const totalOrders = filteredOrders.length;
    const totalPages = Math.max(1, Math.ceil(totalOrders / ORDERS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * ORDERS_PER_PAGE;
    const end = start + ORDERS_PER_PAGE;
    const pageOrders = filteredOrders.slice(start, end);

    const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'procurement' || currentUser.role === 'manager');

    // Update thead to show/hide admin-only columns
    const thead = document.getElementById('ordersTableHead');
    if (thead) {
        thead.innerHTML = isAdmin
            ? `<tr><th></th><th>ID</th><th>Description</th><th>Building</th><th>Status</th><th>Priority</th><th>Supplier</th><th>Delivery</th><th>Exp. Delivery</th><th>Created</th></tr>`
            : `<tr><th>ID</th><th>Description</th><th>Status</th><th>Priority</th><th>Delivery</th><th>Created</th></tr>`;
    }

    if (viewMode === 'grouped') {
        renderGroupedView(pageOrders, tbody, isAdmin);
    } else {
        renderFlatView(pageOrders, tbody, isAdmin);
    }
    renderPagination(totalOrders, totalPages);
    updateSelectedCount();
}

function renderFlatView(orders, tbody, isAdmin) {
    if (orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 10 : 6}" class="text-center text-gray-400 py-8">No orders found</td></tr>`;
        return;
    }
    tbody.innerHTML = orders.map(order => renderOrderRow(order, isAdmin)).join('');
    attachOrderRowListeners();
}

function renderGroupedView(orders, tbody, isAdmin) {
    if (orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 10 : 6}" class="text-center text-gray-400 py-8">No orders found</td></tr>`;
        return;
    }
    const grouped = {};
    orders.forEach(order => {
        const key = order.building || 'Unknown';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(order);
    });
    const sortedBuildings = Object.keys(grouped).sort();
    let html = '';
    sortedBuildings.forEach(building => {
        html += `<tr class="bg-gray-750"><td colspan="${isAdmin ? 10 : 6}" class="px-4 py-2 font-semibold text-blue-300 text-sm">Building: ${building} (${grouped[building].length} order${grouped[building].length !== 1 ? 's' : ''})</td></tr>`;
        html += grouped[building].map(order => renderOrderRow(order, isAdmin)).join('');
    });
    tbody.innerHTML = html;
    attachOrderRowListeners();
}

function renderOrderRow(order, isAdmin) {
    const deliveryStatus = getDeliveryStatus(order);
    const deliveryBadge = getDeliveryBadgeHtml(deliveryStatus);
    const isOld = isOldDelivered(order);
    const rowClass = isOld ? 'order-row opacity-50' : 'order-row';
    const checked = selectedOrderIds.has(order.id) ? 'checked' : '';

    if (!isAdmin) {
        return `<tr class="${rowClass} cursor-pointer hover:bg-gray-700" data-id="${order.id}">
            <td class="px-3 py-2 text-xs text-gray-400">#${order.id}</td>
            <td class="px-3 py-2 text-sm">${order.item_description || ''}</td>
            <td class="px-3 py-2">${renderStatusBadge(order.status)}</td>
            <td class="px-3 py-2">${renderPriorityBadge(order.priority)}</td>
            <td class="px-3 py-2 text-sm">${deliveryBadge}</td>
            <td class="px-3 py-2 text-xs text-gray-400">${order.created_at ? new Date(order.created_at).toLocaleDateString() : '-'}</td>
        </tr>`;
    }

    return `<tr class="${rowClass} cursor-pointer hover:bg-gray-700" data-id="${order.id}">
        <td class="px-3 py-2" onclick="event.stopPropagation()">
            <input type="checkbox" class="order-checkbox" data-id="${order.id}" ${checked}>
        </td>
        <td class="px-3 py-2 text-xs text-gray-400">#${order.id}</td>
        <td class="px-3 py-2 text-sm max-w-xs truncate">${order.item_description || ''}</td>
        <td class="px-3 py-2 text-xs">${order.building || '-'}</td>
        <td class="px-3 py-2">${renderStatusBadge(order.status)}</td>
        <td class="px-3 py-2">${renderPriorityBadge(order.priority)}</td>
        <td class="px-3 py-2 text-xs">${order.supplier_name || '-'}</td>
        <td class="px-3 py-2 text-sm">${deliveryBadge}</td>
        <td class="px-3 py-2 text-xs text-gray-400">${order.expected_delivery_date || '-'}</td>
        <td class="px-3 py-2 text-xs text-gray-400">${order.created_at ? new Date(order.created_at).toLocaleDateString() : '-'}</td>
    </tr>`;
}

function attachOrderRowListeners() {
    ordersTable.querySelectorAll('.order-row').forEach(row => {
        row.addEventListener('click', () => {
            const id = parseInt(row.dataset.id);
            showOrderDetail(id);
        });
    });
    ordersTable.querySelectorAll('.order-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const id = parseInt(cb.dataset.id);
            if (cb.checked) selectedOrderIds.add(id);
            else selectedOrderIds.delete(id);
            updateSelectedCount();
        });
    });
}

function renderPagination(totalOrders, totalPages) {
    const container = document.getElementById('paginationContainer');
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    let html = `<div class="flex items-center gap-2 mt-4 justify-center">`;
    html += `<button onclick="gotoPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} class="px-3 py-1 rounded bg-gray-700 text-sm ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-600'}">Prev</button>`;
    const maxButtons = 7;
    let startPage = Math.max(1, currentPage - 3);
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage < maxButtons - 1) startPage = Math.max(1, endPage - maxButtons + 1);
    if (startPage > 1) html += `<button onclick="gotoPage(1)" class="px-3 py-1 rounded bg-gray-700 text-sm hover:bg-gray-600">1</button>${startPage > 2 ? '<span class="text-gray-400">...</span>' : ''}`;
    for (let p = startPage; p <= endPage; p++) {
        html += `<button onclick="gotoPage(${p})" class="px-3 py-1 rounded text-sm ${p === currentPage ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}">${p}</button>`;
    }
    if (endPage < totalPages) html += `${endPage < totalPages - 1 ? '<span class="text-gray-400">...</span>' : ''}<button onclick="gotoPage(${totalPages})" class="px-3 py-1 rounded bg-gray-700 text-sm hover:bg-gray-600">${totalPages}</button>`;
    html += `<button onclick="gotoPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} class="px-3 py-1 rounded bg-gray-700 text-sm ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-600'}">Next</button>`;
    html += `<span class="text-gray-400 text-xs ml-2">${totalOrders} orders</span>`;
    html += `</div>`;
    container.innerHTML = html;
}

function gotoPage(page) {
    const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PER_PAGE));
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderOrdersTable();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateSelectedCount() {
    if (selectedCount) selectedCount.textContent = selectedOrderIds.size;
    if (orderActionsBar) orderActionsBar.style.display = selectedOrderIds.size > 0 ? 'flex' : 'none';
}

function renderStatusBadge(status) {
    const colors = {
        'New': 'bg-blue-500', 'Pending': 'bg-yellow-500', 'Quote Requested': 'bg-purple-500',
        'Quote Received': 'bg-indigo-500', 'Quote Under Approval': 'bg-orange-400',
        'Approved': 'bg-green-600', 'Ordered': 'bg-teal-500',
        'In Transit': 'bg-cyan-500', 'Partially Delivered': 'bg-lime-500',
        'Delivered': 'bg-green-500', 'Cancelled': 'bg-red-500', 'On Hold': 'bg-gray-500'
    };
    const color = colors[status] || 'bg-gray-500';
    return `<span class="status-badge ${color} text-white">${status || '-'}</span>`;
}

function renderPriorityBadge(priority) {
    const colors = { 'Urgent': 'bg-red-600', 'High': 'bg-orange-500', 'Normal': 'bg-blue-500', 'Low': 'bg-gray-500' };
    const color = colors[priority] || 'bg-gray-500';
    return `<span class="priority-badge ${color} text-white">${priority || '-'}</span>`;
}

// =============== ORDER DETAIL ===============

async function showOrderDetail(orderId) {
    const order = ordersState.find(o => o.id === orderId);
    if (!order) return;

    const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'procurement' || currentUser.role === 'manager');
    const isRequester = currentUser && currentUser.role === 'requester';

    const deliveryStatus = getDeliveryStatus(order);

    // Build attachment list
    const attachments = (order.files || []).map(f => {
        // Support legacy absolute paths (/uploads/...) and new filename-only values
        let url;
        if (f.path && (f.path.startsWith('/') || f.path.startsWith('http'))) {
            url = f.path;
        } else {
            const filename = f.path || f.name;
            url = `/uploads/${filename}`;
        }
        return `<a href="${url}" target="_blank" class="text-blue-400 hover:underline text-sm flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
            ${f.name || f.path}
        </a>`;
    }).join('');

    // Build history
    const historyHtml = (order.history || []).length > 0
        ? (order.history || []).slice().reverse().map(h =>
            `<div class="text-xs text-gray-400 py-1 border-b border-gray-700">
                <span class="text-gray-300">${h.changed_by_name || 'System'}</span> changed <span class="text-blue-300">${h.field_name}</span> from <span class="text-red-300">${h.old_value || 'none'}</span> to <span class="text-green-300">${h.new_value || 'none'}</span>
                <span class="float-right">${h.changed_at ? new Date(h.changed_at).toLocaleString() : ''}</span>
            </div>`).join('')
        : '<p class="text-gray-500 text-xs">No history</p>';

    // Admin controls
    let adminControls = '';
    if (isAdmin) {
        const statusOptions = ORDER_STATUSES.map(s =>
            `<option value="${s}" ${order.status === s ? 'selected' : ''}>${s}</option>`
        ).join('');
        const supplierOptions = ['<option value="">-- No Supplier --</option>',
            ...suppliersState.filter(s => s.is_active).map(s =>
                `<option value="${s.id}" ${order.supplier_id === s.id ? 'selected' : ''}>${s.name}</option>`
            )].join('');
        adminControls = `
            <div class="mt-4 p-4 bg-gray-750 rounded-lg border border-gray-600">
                <h4 class="text-sm font-semibold text-gray-300 mb-3">Order Management</h4>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="text-xs text-gray-400">Status</label>
                        <select id="detailStatus" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1">${statusOptions}</select>
                    </div>
                    <div>
                        <label class="text-xs text-gray-400">Priority</label>
                        <select id="detailPriority" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1">
                            <option value="Normal" ${order.priority === 'Normal' ? 'selected' : ''}>Normal</option>
                            <option value="High" ${order.priority === 'High' ? 'selected' : ''}>High</option>
                            <option value="Urgent" ${order.priority === 'Urgent' ? 'selected' : ''}>Urgent</option>
                            <option value="Low" ${order.priority === 'Low' ? 'selected' : ''}>Low</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-xs text-gray-400">Supplier</label>
                        <select id="detailSupplier" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1">${supplierOptions}</select>
                    </div>
                    <div>
                        <label class="text-xs text-gray-400">Quote Number</label>
                        <input id="detailQuoteNumber" type="text" value="${order.quote_number || ''}" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1" placeholder="Quote #">
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
                        <textarea id="detailNotes" rows="2" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1" placeholder="Internal notes...">${order.internal_notes || ''}</textarea>
                    </div>
                </div>
                <div class="flex gap-2 mt-3">
                    <button onclick="saveOrderChanges(${order.id})" class="btn-primary text-sm px-4 py-1.5">Save Changes</button>
                    <button onclick="deleteOrder(${order.id})" class="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-1.5 rounded">Delete</button>
                </div>
            </div>`;
    }

    // Requester: cancel button
    let requesterControls = '';
    if (isRequester && (order.status === 'New' || order.status === 'Pending')) {
        requesterControls = `
            <div class="mt-4">
                <button onclick="cancelOrder(${order.id})" class="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-1.5 rounded">Cancel Order</button>
            </div>`;
    }

    orderDetailBody.innerHTML = `
        <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
                <div><span class="text-gray-400 text-xs">Order ID</span><p class="text-sm font-mono">#${order.id}</p></div>
                <div><span class="text-gray-400 text-xs">Status</span><p>${renderStatusBadge(order.status)}</p></div>
                <div><span class="text-gray-400 text-xs">Building</span><p class="text-sm">${order.building || '-'}</p></div>
                <div><span class="text-gray-400 text-xs">Priority</span><p>${renderPriorityBadge(order.priority)}</p></div>
                <div><span class="text-gray-400 text-xs">Cost Center</span><p class="text-sm">${order.cost_center_code ? `${order.cost_center_code} - ${order.cost_center_name || ''}` : '-'}</p></div>
                <div><span class="text-gray-400 text-xs">Requester</span><p class="text-sm">${order.requester_name || '-'}</p></div>
                <div><span class="text-gray-400 text-xs">Item Description</span><p class="text-sm">${order.item_description || '-'}</p></div>
                <div><span class="text-gray-400 text-xs">Part Number</span><p class="text-sm font-mono">${order.part_number || '-'}</p></div>
                <div><span class="text-gray-400 text-xs">Category</span><p class="text-sm">${order.category || '-'}</p></div>
                <div><span class="text-gray-400 text-xs">Quantity</span><p class="text-sm">${order.quantity || '-'} ${order.unit || ''}</p></div>
                <div><span class="text-gray-400 text-xs">Supplier</span><p class="text-sm">${order.supplier_name || '-'}</p></div>
                <div><span class="text-gray-400 text-xs">Unit Price</span><p class="text-sm">${fmtPrice(order.unit_price)}</p></div>
                <div><span class="text-gray-400 text-xs">Quote Number</span><p class="text-sm font-mono">${order.quote_number || '-'}</p></div>
                <div><span class="text-gray-400 text-xs">Delivery Status</span><p>${getDeliveryBadgeHtml(deliveryStatus)}</p></div>
                <div><span class="text-gray-400 text-xs">Expected Delivery</span><p class="text-sm">${order.expected_delivery_date || '-'}</p></div>
                <div><span class="text-gray-400 text-xs">Notes</span><p class="text-sm">${order.notes || '-'}</p></div>
                <div><span class="text-gray-400 text-xs">Created</span><p class="text-sm">${order.created_at ? new Date(order.created_at).toLocaleString() : '-'}</p></div>
            </div>
            ${attachments ? `<div><span class="text-gray-400 text-xs block mb-1">Attachments</span><div class="flex flex-col gap-1">${attachments}</div></div>` : ''}
            ${adminControls}
            ${requesterControls}
            <div>
                <span class="text-gray-400 text-xs block mb-1">History</span>
                <div class="max-h-40 overflow-y-auto">${historyHtml}</div>
            </div>
        </div>`;

    orderDetailPanel.classList.remove('hidden');
}

async function saveOrderChanges(orderId) {
    const status = document.getElementById('detailStatus').value;
    const priority = document.getElementById('detailPriority').value;
    const supplier_id = document.getElementById('detailSupplier').value;
    const quote_number = document.getElementById('detailQuoteNumber').value.trim();
    const unit_price = document.getElementById('detailUnitPrice').value;
    const expected_delivery_date = document.getElementById('detailDeliveryDate').value;
    const internal_notes = document.getElementById('detailNotes').value.trim();

    try {
        const res = await apiPut(`/orders/${orderId}`, {
            status, priority,
            supplier_id: supplier_id ? parseInt(supplier_id) : null,
            quote_number, unit_price: unit_price ? parseFloat(unit_price) : null,
            expected_delivery_date: expected_delivery_date || null,
            internal_notes
        });
        if (res.success) {
            showToast('Order updated!');
            await loadOrders();
            showOrderDetail(orderId);
        } else {
            showToast(res.message || 'Update failed', true);
        }
    } catch (err) {
        showToast('Update failed', true);
    }
}

async function deleteOrder(orderId) {
    if (!confirm('Delete this order?')) return;
    try {
        const res = await apiDelete(`/orders/${orderId}`);
        if (res.success) {
            showToast('Order deleted');
            orderDetailPanel.classList.add('hidden');
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
            orderDetailPanel.classList.add('hidden');
            await loadOrders();
        } else {
            showToast(res.message || 'Cancel failed', true);
        }
    } catch { showToast('Cancel failed', true); }
}

// =============== CREATE ORDER (REQUESTER) ===============

async function handleCreateOrder(e) {
    e.preventDefault();
    const formData = new FormData(createOrderForm);
    const costCenterId = formData.get('cost_center_id');
    if (!costCenterId) { showToast('Please select a cost center', true); return; }

    try {
        const res = await fetch(`${API_BASE}/orders`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            showToast('Order created!');
            createOrderForm.reset();
            costCenterRadios.innerHTML = '<p class="text-gray-400 text-sm">Select a building first</p>';
            await loadOrders();
        } else {
            showToast(data.message || 'Failed to create order', true);
        }
    } catch (err) {
        showToast('Failed to create order', true);
    }
}

// =============== PROC CREATE ORDER MODAL ===============

function openProcCreateOrderModal() {
    const modal = document.getElementById('procCreateOrderModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    const procBuildingSelect = document.getElementById('procBuilding');
    if (procBuildingSelect) {
        procBuildingSelect.addEventListener('change', () => {
            renderProcCostCenterRadios(procBuildingSelect.value);
        });
    }
}

function renderProcCostCenterRadios(buildingCode) {
    const container = document.getElementById('procCostCenterRadios');
    if (!container) return;
    const building = buildingsState.find(b => b.code === buildingCode);
    if (!building) { container.innerHTML = '<p class="text-gray-400 text-sm">Select a building first</p>'; return; }
    const ccs = costCentersState.filter(cc => cc.building_id === building.id && cc.is_active);
    if (ccs.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm">No cost centers for this building</p>';
        return;
    }
    container.innerHTML = ccs.map(cc =>
        `<label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="proc_cost_center_id" value="${cc.id}" class="accent-blue-500">
            <span>${cc.code} - ${cc.name}</span>
        </label>`
    ).join('');
}

const procCreateOrderModal = document.getElementById('procCreateOrderModal');
if (procCreateOrderModal) {
    const closeBtn = document.getElementById('btnCloseProcModal');
    if (closeBtn) closeBtn.addEventListener('click', () => procCreateOrderModal.classList.add('hidden'));

    const procForm = document.getElementById('procCreateOrderForm');
    if (procForm) {
        procForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(procForm);
            const costCenterId = formData.get('proc_cost_center_id');
            if (!costCenterId) { showToast('Please select a cost center', true); return; }
            // Rename key for backend
            formData.set('cost_center_id', costCenterId);
            formData.delete('proc_cost_center_id');
            try {
                const res = await fetch(`${API_BASE}/orders`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${authToken}` },
                    body: formData
                });
                const data = await res.json();
                if (data.success) {
                    showToast('Order created!');
                    procCreateOrderModal.classList.add('hidden');
                    procForm.reset();
                    await loadOrders();
                } else {
                    showToast(data.message || 'Failed to create order', true);
                }
            } catch (err) {
                showToast('Failed to create order', true);
            }
        });
    }
}

// =============== QUOTES ===============

function renderQuotesTable() {
    const tbody = document.getElementById('quotesTableBody');
    if (!tbody) return;
    if (quotesState.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400 py-8">No quotes found</td></tr>';
        return;
    }
    tbody.innerHTML = quotesState.map(q => `
        <tr class="hover:bg-gray-700 cursor-pointer" onclick="showQuoteDetail(${q.id})">
            <td class="px-3 py-2 text-sm font-mono">${q.quote_number || '-'}</td>
            <td class="px-3 py-2 text-xs">${q.supplier_name || '-'}</td>
            <td class="px-3 py-2 text-xs">${q.status || '-'}</td>
            <td class="px-3 py-2 text-xs">${q.order_count || 0} orders</td>
            <td class="px-3 py-2 text-xs">${q.total_amount ? fmtPrice(q.total_amount) : '-'}</td>
            <td class="px-3 py-2 text-xs">${q.created_by_name || '-'}</td>
            <td class="px-3 py-2 text-xs text-gray-400">${q.created_at ? new Date(q.created_at).toLocaleDateString() : '-'}</td>
        </tr>`).join('');
}

async function showQuoteDetail(quoteId) {
    const quote = quotesState.find(q => q.id === quoteId);
    if (!quote) return;

    try {
        const data = await apiGet(`/quotes/${quoteId}`);
        if (!data.success) { showToast('Failed to load quote', true); return; }
        const q = data.quote;

        const ordersHtml = (q.orders || []).map(o =>
            `<tr class="hover:bg-gray-700">
                <td class="px-2 py-1 text-xs">#${o.id}</td>
                <td class="px-2 py-1 text-xs">${o.item_description || ''}</td>
                <td class="px-2 py-1 text-xs">${o.building || ''}</td>
                <td class="px-2 py-1 text-xs">${fmtPrice(o.unit_price)}</td>
                <td class="px-2 py-1 text-xs">${o.quantity || ''}</td>
            </tr>`
        ).join('');

        const statusOptions = ['Draft', 'Sent', 'Received', 'Approved', 'Rejected'].map(s =>
            `<option value="${s}" ${q.status === s ? 'selected' : ''}>${s}</option>`
        ).join('');

        // Attachments for quote
        const quoteAttachments = (q.files || []).map(f => {
            let url;
            if (f.path && (f.path.startsWith('/') || f.path.startsWith('http'))) {
                url = f.path;
            } else {
                const filename = f.path || f.name;
                url = `/uploads/${filename}`;
            }
            return `<a href="${url}" target="_blank" class="text-blue-400 hover:underline text-sm">${f.name || f.path}</a>`;
        }).join(', ');

        quoteDetailBody.innerHTML = `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div><span class="text-gray-400 text-xs">Quote Number</span><p class="text-sm font-mono">${q.quote_number}</p></div>
                    <div><span class="text-gray-400 text-xs">Supplier</span><p class="text-sm">${q.supplier_name || '-'}</p></div>
                    <div><span class="text-gray-400 text-xs">Status</span><p class="text-sm">${q.status}</p></div>
                    <div><span class="text-gray-400 text-xs">Total Amount</span><p class="text-sm">${fmtPrice(q.total_amount)}</p></div>
                    <div><span class="text-gray-400 text-xs">Created By</span><p class="text-sm">${q.created_by_name || '-'}</p></div>
                    <div><span class="text-gray-400 text-xs">Created At</span><p class="text-sm">${q.created_at ? new Date(q.created_at).toLocaleString() : '-'}</p></div>
                    ${q.notes ? `<div class="col-span-2"><span class="text-gray-400 text-xs">Notes</span><p class="text-sm">${q.notes}</p></div>` : ''}
                    ${quoteAttachments ? `<div class="col-span-2"><span class="text-gray-400 text-xs">Attachments</span><p class="text-sm">${quoteAttachments}</p></div>` : ''}
                </div>
                <div>
                    <h4 class="text-sm font-semibold text-gray-300 mb-2">Orders in Quote</h4>
                    <table class="w-full text-left">
                        <thead><tr class="text-gray-400 text-xs border-b border-gray-700">
                            <th class="px-2 py-1">ID</th><th class="px-2 py-1">Description</th><th class="px-2 py-1">Building</th><th class="px-2 py-1">Unit Price</th><th class="px-2 py-1">Qty</th>
                        </tr></thead>
                        <tbody>${ordersHtml}</tbody>
                    </table>
                </div>
                <div class="mt-4 p-4 bg-gray-750 rounded-lg border border-gray-600">
                    <h4 class="text-sm font-semibold text-gray-300 mb-3">Update Quote</h4>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-xs text-gray-400">Status</label>
                            <select id="quoteDetailStatus" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1">${statusOptions}</select>
                        </div>
                        <div>
                            <label class="text-xs text-gray-400">Total Amount</label>
                            <input id="quoteDetailAmount" type="number" step="0.01" min="0" value="${q.total_amount || ''}" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1">
                        </div>
                        <div class="col-span-2">
                            <label class="text-xs text-gray-400">Upload Quote Document</label>
                            <input id="quoteDetailFile" type="file" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1">
                        </div>
                        <div class="col-span-2">
                            <label class="text-xs text-gray-400">Notes</label>
                            <textarea id="quoteDetailNotes" rows="2" class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm mt-1">${q.notes || ''}</textarea>
                        </div>
                    </div>
                    <div class="flex gap-2 mt-3">
                        <button onclick="saveQuoteChanges(${q.id})" class="btn-primary text-sm px-4 py-1.5">Save Changes</button>
                        <button onclick="deleteQuote(${q.id})" class="bg-red-600 hover:bg-red-700 text-white text-sm px-4 py-1.5 rounded">Delete Quote</button>
                    </div>
                </div>
            </div>`;
        quoteDetailPanel.classList.remove('hidden');
    } catch (err) {
        showToast('Failed to load quote details', true);
    }
}

async function saveQuoteChanges(quoteId) {
    const status = document.getElementById('quoteDetailStatus').value;
    const total_amount = document.getElementById('quoteDetailAmount').value;
    const notes = document.getElementById('quoteDetailNotes').value.trim();
    const fileInput = document.getElementById('quoteDetailFile');

    try {
        const formData = new FormData();
        formData.append('status', status);
        formData.append('total_amount', total_amount || '');
        formData.append('notes', notes);
        if (fileInput && fileInput.files.length > 0) {
            formData.append('file', fileInput.files[0]);
        }
        const res = await fetch(`${API_BASE}/quotes/${quoteId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            showToast('Quote updated!');
            await loadQuotes();
            showQuoteDetail(quoteId);
        } else {
            showToast(data.message || 'Update failed', true);
        }
    } catch (err) {
        showToast('Update failed', true);
    }
}

async function deleteQuote(quoteId) {
    if (!confirm('Delete this quote?')) return;
    try {
        const res = await apiDelete(`/quotes/${quoteId}`);
        if (res.success) {
            showToast('Quote deleted');
            quoteDetailPanel.classList.add('hidden');
            await loadQuotes();
        } else {
            showToast(res.message || 'Delete failed', true);
        }
    } catch { showToast('Delete failed', true); }
}

function openCreateQuoteDialog() {
    if (selectedOrderIds.size === 0) { showToast('Select at least one order', true); return; }
    const modal = document.getElementById('createQuoteModal');
    if (!modal) return;
    const supplierSelect = document.getElementById('quoteSupplier');
    if (supplierSelect) {
        supplierSelect.innerHTML = '<option value="">-- Select Supplier --</option>' +
            suppliersState.filter(s => s.is_active).map(s =>
                `<option value="${s.id}">${s.name}</option>`).join('');
    }
    modal.classList.remove('hidden');
}

const createQuoteModal = document.getElementById('createQuoteModal');
if (createQuoteModal) {
    const closeBtn = document.getElementById('btnCloseQuoteModal');
    if (closeBtn) closeBtn.addEventListener('click', () => createQuoteModal.classList.add('hidden'));

    const quoteForm = document.getElementById('createQuoteForm');
    if (quoteForm) {
        quoteForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const supplier_id = document.getElementById('quoteSupplier').value;
            const notes = document.getElementById('quoteNotes').value.trim();
            if (!supplier_id) { showToast('Select a supplier', true); return; }
            const order_ids = Array.from(selectedOrderIds);
            try {
                const res = await apiPost('/quotes', { supplier_id: parseInt(supplier_id), order_ids, notes });
                if (res.success) {
                    showToast('Quote created!');
                    createQuoteModal.classList.add('hidden');
                    selectedOrderIds.clear();
                    updateSelectedCount();
                    await loadQuotes();
                    await loadOrders();
                    switchTab('quotesTab');
                } else {
                    showToast(res.message || 'Failed', true);
                }
            } catch { showToast('Failed to create quote', true); }
        });
    }
}

// =============== APPROVALS ===============

async function loadApprovals() {
    try {
        const data = await apiGet('/approvals/pending');
        const approvalsTableBody = document.getElementById('approvalsTableBody');
        if (!approvalsTableBody) return;
        if (!data.success || data.orders.length === 0) {
            approvalsTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-8">No pending approvals</td></tr>';
            return;
        }
        approvalsTableBody.innerHTML = data.orders.map(o => `
            <tr class="hover:bg-gray-700">
                <td class="px-3 py-2 text-xs">#${o.id}</td>
                <td class="px-3 py-2 text-sm">${o.item_description}</td>
                <td class="px-3 py-2 text-xs">${o.building}</td>
                <td class="px-3 py-2 text-xs">${o.requester_name}</td>
                <td class="px-3 py-2">${renderStatusBadge(o.status)}</td>
                <td class="px-3 py-2">
                    <button onclick="approveOrder(${o.id})" class="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1 rounded mr-2">Approve</button>
                    <button onclick="rejectOrder(${o.id})" class="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded">Reject</button>
                </td>
            </tr>`).join('');
    } catch (err) { console.error('Failed to load approvals:', err); }
}

async function approveOrder(orderId) {
    try {
        const res = await apiPut(`/orders/${orderId}`, { status: 'Approved' });
        if (res.success) { showToast('Order approved!'); loadApprovals(); loadOrders(); }
        else showToast(res.message || 'Failed', true);
    } catch { showToast('Failed', true); }
}

async function rejectOrder(orderId) {
    const reason = prompt('Rejection reason (optional):');
    try {
        const res = await apiPut(`/orders/${orderId}`, { status: 'Cancelled', internal_notes: reason || '' });
        if (res.success) { showToast('Order rejected'); loadApprovals(); loadOrders(); }
        else showToast(res.message || 'Failed', true);
    } catch { showToast('Failed', true); }
}

// =============== TAB SWITCHING ===============

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.remove('hidden');
    const tabButton = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (tabButton) tabButton.classList.add('active');
    currentTab = tabId;
    if (tabId === 'quotesTab') loadQuotes();
    if (tabId === 'approvalsTab' && typeof loadApprovals === 'function') loadApprovals();
    if (tabId === 'suppliersTab') renderSuppliersTable();
    if (tabId === 'buildingsTab') renderBuildingsTable();
    if (tabId === 'costCentersTab') renderCostCentersTable();
    if (tabId === 'usersTab') renderUsersTable();
    if (tabId === 'procurementTab' && typeof initProcurementDashboard === 'function') initProcurementDashboard();
}

// =============== SUPPLIERS ===============

function renderSuppliersTable() {
    const tbody = suppliersTable ? suppliersTable.querySelector('tbody') : null;
    if (!tbody) return;
    if (suppliersState.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-4">No suppliers</td></tr>';
        return;
    }
    tbody.innerHTML = suppliersState.map(s => `
        <tr class="hover:bg-gray-700">
            <td class="px-3 py-2 text-sm">${s.name}</td>
            <td class="px-3 py-2 text-xs">${s.contact_name || '-'}</td>
            <td class="px-3 py-2 text-xs">${s.email || '-'}</td>
            <td class="px-3 py-2 text-xs">${s.phone || '-'}</td>
            <td class="px-3 py-2 text-xs">${s.is_active ? '<span class="text-green-400">Active</span>' : '<span class="text-gray-500">Inactive</span>'}</td>
            <td class="px-3 py-2">
                <button onclick="openSupplierForm(${s.id})" class="text-blue-400 hover:text-blue-300 text-xs mr-2">Edit</button>
            </td>
        </tr>`).join('');
}

function openSupplierForm(supplierId) {
    supplierFormCard.hidden = false;
    if (!supplierId) {
        supplierFormTitle.textContent = 'New Supplier';
        supplierIdInput.value = '';
        supplierNameInput.value = '';
        supplierContactInput.value = '';
        supplierEmailInput.value = '';
        supplierPhoneInput.value = '';
        supplierWebsiteInput.value = '';
        supplierAddressInput.value = '';
        supplierNotesInput.value = '';
        supplierActiveInput.checked = true;
    } else {
        const s = suppliersState.find(x => x.id === supplierId);
        if (!s) return;
        supplierFormTitle.textContent = 'Edit Supplier';
        supplierIdInput.value = s.id;
        supplierNameInput.value = s.name;
        supplierContactInput.value = s.contact_name || '';
        supplierEmailInput.value = s.email || '';
        supplierPhoneInput.value = s.phone || '';
        supplierWebsiteInput.value = s.website || '';
        supplierAddressInput.value = s.address || '';
        supplierNotesInput.value = s.notes || '';
        supplierActiveInput.checked = s.is_active;
    }
    supplierFormCard.scrollIntoView({ behavior: 'smooth' });
}

async function handleSaveSupplier(e) {
    e.preventDefault();
    const id = supplierIdInput.value;
    const body = {
        name: supplierNameInput.value.trim(),
        contact_name: supplierContactInput.value.trim(),
        email: supplierEmailInput.value.trim(),
        phone: supplierPhoneInput.value.trim(),
        website: supplierWebsiteInput.value.trim(),
        address: supplierAddressInput.value.trim(),
        notes: supplierNotesInput.value.trim(),
        is_active: supplierActiveInput.checked
    };
    try {
        const res = id ? await apiPut(`/suppliers/${id}`, body) : await apiPost('/suppliers', body);
        if (res.success) {
            showToast(id ? 'Supplier updated' : 'Supplier created');
            supplierFormCard.hidden = true;
            await loadSuppliers();
            populateSupplierFilter();
        } else {
            showToast(res.message || 'Save failed', true);
        }
    } catch { showToast('Save failed', true); }
}

// =============== BUILDINGS ===============

function renderBuildingsTable() {
    const tbody = buildingsTable ? buildingsTable.querySelector('tbody') : null;
    if (!tbody) return;
    if (buildingsState.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-4">No buildings</td></tr>';
        return;
    }
    tbody.innerHTML = buildingsState.map(b => `
        <tr class="hover:bg-gray-700">
            <td class="px-3 py-2 text-sm font-mono">${b.code}</td>
            <td class="px-3 py-2 text-sm">${b.name}</td>
            <td class="px-3 py-2 text-xs">${b.is_active ? '<span class="text-green-400">Active</span>' : '<span class="text-gray-500">Inactive</span>'}</td>
            <td class="px-3 py-2">
                <button onclick="openBuildingForm(${b.id})" class="text-blue-400 hover:text-blue-300 text-xs">Edit</button>
            </td>
        </tr>`).join('');
}

function openBuildingForm(buildingId) {
    buildingFormCard.hidden = false;
    if (!buildingId) {
        buildingFormTitle.textContent = 'New Building';
        buildingIdInput.value = '';
        buildingCodeInput.value = '';
        buildingNameInput.value = '';
        buildingDescriptionInput.value = '';
        buildingActiveSelect.value = 'true';
    } else {
        const b = buildingsState.find(x => x.id === buildingId);
        if (!b) return;
        buildingFormTitle.textContent = 'Edit Building';
        buildingIdInput.value = b.id;
        buildingCodeInput.value = b.code;
        buildingNameInput.value = b.name;
        buildingDescriptionInput.value = b.description || '';
        buildingActiveSelect.value = String(b.is_active);
    }
    buildingFormCard.scrollIntoView({ behavior: 'smooth' });
}

async function handleSaveBuilding(e) {
    e.preventDefault();
    const id = buildingIdInput.value;
    const body = {
        code: buildingCodeInput.value.trim().toUpperCase(),
        name: buildingNameInput.value.trim(),
        description: buildingDescriptionInput.value.trim(),
        is_active: buildingActiveSelect.value === 'true'
    };
    try {
        const res = id ? await apiPut(`/buildings/${id}`, body) : await apiPost('/buildings', body);
        if (res.success) {
            showToast(id ? 'Building updated' : 'Building created');
            buildingFormCard.hidden = true;
            await loadBuildings();
            populateBuildingSelects();
            populateBuildingFilter();
        } else {
            showToast(res.message || 'Save failed', true);
        }
    } catch { showToast('Save failed', true); }
}

// =============== COST CENTERS ===============

function renderCostCentersTable() {
    const tbody = costCentersTable ? costCentersTable.querySelector('tbody') : null;
    if (!tbody) return;
    const filterVal = ccFilterBuilding ? parseInt(ccFilterBuilding.value) : null;
    let filtered = costCentersState;
    if (filterVal) filtered = filtered.filter(cc => cc.building_id === filterVal);
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-4">No cost centers</td></tr>';
        return;
    }
    tbody.innerHTML = filtered.map(cc => {
        const building = buildingsState.find(b => b.id === cc.building_id);
        return `<tr class="hover:bg-gray-700">
            <td class="px-3 py-2 text-sm font-mono">${cc.code}</td>
            <td class="px-3 py-2 text-sm">${cc.name}</td>
            <td class="px-3 py-2 text-xs">${building ? building.code : '-'}</td>
            <td class="px-3 py-2 text-xs">${cc.is_active ? '<span class="text-green-400">Active</span>' : '<span class="text-gray-500">Inactive</span>'}</td>
            <td class="px-3 py-2">
                <button onclick="openCostCenterForm(${cc.id})" class="text-blue-400 hover:text-blue-300 text-xs">Edit</button>
            </td>
        </tr>`;
    }).join('');
}

function openCostCenterForm(costCenterId) {
    costCenterFormCard.hidden = false;
    if (btnDeleteCostCenter) btnDeleteCostCenter.hidden = !costCenterId;
    if (!costCenterId) {
        costCenterFormTitle.textContent = 'New Cost Center';
        costCenterIdInput.value = '';
        ccBuildingSelect.value = '';
        ccCodeInput.value = '';
        ccNameInput.value = '';
        ccDescriptionInput.value = '';
        ccActiveSelect.value = 'true';
    } else {
        const cc = costCentersState.find(x => x.id === costCenterId);
        if (!cc) return;
        costCenterFormTitle.textContent = 'Edit Cost Center';
        costCenterIdInput.value = cc.id;
        ccBuildingSelect.value = cc.building_id;
        ccCodeInput.value = cc.code;
        ccNameInput.value = cc.name;
        ccDescriptionInput.value = cc.description || '';
        ccActiveSelect.value = String(cc.is_active);
    }
    costCenterFormCard.scrollIntoView({ behavior: 'smooth' });
}

async function handleSaveCostCenter(e) {
    e.preventDefault();
    const id = costCenterIdInput.value;
    const body = {
        building_id: parseInt(ccBuildingSelect.value),
        code: ccCodeInput.value.trim().toUpperCase(),
        name: ccNameInput.value.trim(),
        description: ccDescriptionInput.value.trim(),
        is_active: ccActiveSelect.value === 'true'
    };
    try {
        const res = id ? await apiPut(`/cost-centers/${id}`, body) : await apiPost('/cost-centers', body);
        if (res.success) {
            showToast(id ? 'Cost center updated' : 'Cost center created');
            costCenterFormCard.hidden = true;
            await loadCostCenters();
            populateBuildingSelects();
        } else {
            showToast(res.message || 'Save failed', true);
        }
    } catch { showToast('Save failed', true); }
}

async function handleDeleteCostCenter() {
    const id = costCenterIdInput.value;
    if (!id || !confirm('Delete this cost center?')) return;
    try {
        const res = await apiDelete(`/cost-centers/${id}`);
        if (res.success) {
            showToast('Cost center deleted');
            costCenterFormCard.hidden = true;
            await loadCostCenters();
        } else {
            showToast(res.message || 'Delete failed', true);
        }
    } catch { showToast('Delete failed', true); }
}

// =============== USERS ===============

function renderUsersTable() {
    const tbody = usersTable ? usersTable.querySelector('tbody') : null;
    if (!tbody) return;
    if (usersState.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-400 py-4">No users</td></tr>';
        return;
    }
    tbody.innerHTML = usersState.map(u => `
        <tr class="hover:bg-gray-700">
            <td class="px-3 py-2 text-sm">${u.username}</td>
            <td class="px-3 py-2 text-sm">${u.name}</td>
            <td class="px-3 py-2 text-xs">${u.email || '-'}</td>
            <td class="px-3 py-2 text-xs capitalize">${u.role}</td>
            <td class="px-3 py-2 text-xs">${u.building || '-'}</td>
            <td class="px-3 py-2">
                <button onclick="openUserForm(${u.id})" class="text-blue-400 hover:text-blue-300 text-xs">Edit</button>
            </td>
        </tr>`).join('');
}

function openUserForm(userId) {
    userFormCard.hidden = false;
    if (!userId) {
        userFormTitle.textContent = 'New User';
        userIdInput.value = '';
        userUsernameInput.value = '';
        userNameInput.value = '';
        userEmailInput.value = '';
        userRoleSelect.value = 'requester';
        userBuildingSelect.value = '';
        userActiveSelect.value = 'true';
        userPasswordInput.value = '';
        userPasswordGroup.classList.remove('hidden');
        userUsernameInput.readOnly = false;
    } else {
        const u = usersState.find(x => x.id === userId);
        if (!u) return;
        userFormTitle.textContent = 'Edit User';
        userIdInput.value = u.id;
        userUsernameInput.value = u.username;
        userNameInput.value = u.name;
        userEmailInput.value = u.email || '';
        userRoleSelect.value = u.role;
        userBuildingSelect.value = u.building || '';
        userActiveSelect.value = String(u.is_active);
        userPasswordInput.value = '';
        userPasswordGroup.classList.add('hidden');
        userUsernameInput.readOnly = true;
    }
    userFormCard.scrollIntoView({ behavior: 'smooth' });
}

async function handleSaveUser(e) {
    e.preventDefault();
    const id = userIdInput.value;
    const body = {
        username: userUsernameInput.value.trim(),
        name: userNameInput.value.trim(),
        email: userEmailInput.value.trim(),
        role: userRoleSelect.value,
        building: userBuildingSelect.value || null,
        is_active: userActiveSelect.value === 'true',
        password: userPasswordInput.value || undefined
    };
    try {
        const res = id ? await apiPut(`/users/${id}`, body) : await apiPost('/users', body);
        if (res.success) {
            showToast(id ? 'User updated' : 'User created');
            userFormCard.hidden = true;
            await loadUsers();
        } else {
            showToast(res.message || 'Save failed', true);
        }
    } catch { showToast('Save failed', true); }
}

// =============== TOAST ===============

function showToast(message, isError = false) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'toast-error' : 'toast-success'}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3500);
}
