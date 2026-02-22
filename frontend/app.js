// frontend/app.js - PartPulse Orders v2.3 - Manager Role Support

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
    if (filterSearch) filterSearch.addEventListener('input', () => { filterState.search = filterSearch.value.trim(); applyFilters(); });
    if (filterStatus) filterStatus.addEventListener('change', () => { filterState.status = filterStatus.value; applyFilters(); });
    if (filterBuilding) filterBuilding.addEventListener('change', () => { filterState.building = filterBuilding.value; applyFilters(); });
    if (filterPriority) filterPriority.addEventListener('change', () => { filterState.priority = filterPriority.value; applyFilters(); });
    if (filterSupplier) filterSupplier.addEventListener('change', () => { filterState.supplier = filterSupplier.value; applyFilters(); });
    if (filterDelivery) filterDelivery.addEventListener('change', () => { filterState.delivery = filterDelivery.value; applyFilters(); });

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
    applyFilters();
}

function resetFiltersOnLogout() {
    // Reset filter state
    filterState = { search: '', status: '', building: '', priority: '', supplier: '', delivery: '', quickFilter: '' };
    
    // Reset filter UI elements
    if (filterSearch) filterSearch.value = '';
    if (filterStatus) filterStatus.value = '';
    if (filterBuilding) filterBuilding.value = '';
    if (filterPriority) filterPriority.value = '';
    if (filterSupplier) filterSupplier.value = '';
    if (filterDelivery) filterDelivery.value = '';
    
    // Clear quick filter chips
    document.querySelectorAll('.quick-filter-chip').forEach(c => c.classList.remove('active'));
    
    // Reset view mode
    viewMode = 'flat';
    if (btnViewFlat) btnViewFlat.classList.add('active');
    if (btnViewGrouped) btnViewGrouped.classList.remove('active');
}

// ===================== DELIVERY TIMELINE LOGIC =====================

function getDeliveryStatus(order) {
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
        'late': '<span class="delivery-badge delivery-late">⚠ Late</span>',
        'due7': '<span class="delivery-badge delivery-due7">🕒 Due 7d</span>',
        'due14': '<span class="delivery-badge delivery-due14">📅 Due 14d</span>',
        'ontrack': '<span class="delivery-badge delivery-ontrack">✓ On Track</span>',
        'none': '-'
    };
    return badges[status] || '-';
}

// ===================== FILTERING =====================

function applyFilters() {
    filteredOrders = ordersState.filter(order => {
        // Full-text search (across all fields)
        if (filterState.search) {
            const term = filterState.search.toLowerCase();
            const searchFields = [
                order.item_description || '',
                order.part_number || '',
                order.category || '',
                order.notes || '',
                order.requester_name || '',
                order.cost_center_code || '',
                order.cost_center_name || '',
                order.supplier_name || '',
                order.building || '',
                order.status || ''
            ].join(' ').toLowerCase();

            if (!searchFields.includes(term)) return false;
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
            if (qf === 'late' || qf === 'due7' || qf === 'due14') {
                const deliveryStatus = getDeliveryStatus(order);
                if (deliveryStatus !== qf) return false;
            } else if (qf === 'new' && order.status !== 'New') return false;
            else if (qf === 'ordered' && order.status !== 'Ordered') return false;
            else if (qf === 'transit' && order.status !== 'In Transit') return false;
        }

        return true;
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
        
        const orderActionsContainer = document.getElementById('orderActionsContainer');
        if (orderActionsContainer) {
            orderActionsContainer.style.display = 'none';
        }
    } else if (currentUser.role === 'manager') {
        // ⭐ MANAGER: Show navigation with approvals tab, read-only orders view
        createOrderSection.classList.add('hidden');
        navTabs.classList.remove('hidden');
        populateStatusFilter();
        
        // Show approvals tab for managers
        if (approvalsTabButton) approvalsTabButton.hidden = false;
        
        // Hide order actions (quote creation) for managers
        const orderActionsContainer = document.getElementById('orderActionsContainer');
        if (orderActionsContainer) {
            orderActionsContainer.style.display = 'none';
        }
        
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
    }

    // Show orders tab by default
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    const ordersTabEl = document.getElementById('ordersTab');
    if (ordersTabEl) ordersTabEl.classList.remove('hidden');
    currentTab = 'ordersTab';

    loadBuildings();
    loadCostCenters();
    loadSuppliers().then(() => { populateSupplierFilter(); });
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
    formData.append('dateNeeded', document.getElementById('dateNeeded').value);
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
    try {
        const res = await apiGet('/orders');
        if (res.success) {
            ordersState = res.orders;
            filteredOrders = ordersState;
            selectedOrderIds.clear();
            updateSelectionUi();
            applyFilters();
        }
    } catch (err) {
        console.error('loadOrders error:', err);
        ordersTable.innerHTML = '<p>Failed to load orders.</p>';
    }
}

function renderOrdersTable() {
    if (!filteredOrders.length) {
        ordersTable.innerHTML = '<p class="text-muted">No orders found.</p>';
        return;
    }

    if (viewMode === 'grouped') {
        renderGroupedOrders();
    } else {
        renderFlatOrders();
    }
}

function renderFlatOrders() {
    const isAdminView = currentUser.role !== 'requester';
    const canSelectOrders = currentUser.role === 'admin' || currentUser.role === 'procurement';

    let html = '<div class="table-wrapper"><table><thead><tr>';
    if (canSelectOrders) html += '<th class="sticky"><input type="checkbox" id="selectAllOrders"></th>';
    
    // NEW COLUMN ORDER: ID, View Button, Item, Cost Center, Qty, Status, Priority, Files, Requester, Delivery, Needed, Supplier, Building, Unit, Total
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
        html += '<th>Needed</th>';
        html += '<th>Supplier</th>';
        html += '<th>Building</th>';
        html += '<th>Unit</th>';
        html += '<th>Total</th>';
    } else {
        html += '<th>Delivery</th>';
        html += '<th>Needed</th>';
    }
    
    html += '</tr></thead><tbody>';

    for (const order of filteredOrders) {
        const statusClass = 'status-' + order.status.toLowerCase().replace(/ /g, '-');
        const priorityClass = 'priority-' + (order.priority || 'Normal').toLowerCase();
        const hasFiles = order.files && order.files.length > 0;
        const deliveryStatus = getDeliveryStatus(order);

        html += '<tr data-id="' + order.id + '">';
        
        if (canSelectOrders) {
            html += `<td class="sticky"><input type="checkbox" class="row-select" data-id="${order.id}"></td>`;
        }
        
        // ID
        html += `<td>#${order.id}</td>`;
        
        // View Button (moved here!)
        html += `<td><button class="btn btn-secondary btn-sm btn-view-order" data-id="${order.id}">View</button></td>`;
        
        // Item
        html += `<td title="${escapeHtml(order.item_description)}">${escapeHtml(order.item_description.substring(0, 40))}${order.item_description.length > 40 ? '…' : ''}</td>`;
        
        // Cost Center
        html += `<td>${order.cost_center_code || '-'}</td>`;
        
        // Qty
        html += `<td>${order.quantity}</td>`;
        
        // Status
        html += `<td><span class="status-badge ${statusClass}">${order.status}</span></td>`;
        
        // Priority
        html += `<td><span class="priority-pill ${priorityClass}">${order.priority || 'Normal'}</span></td>`;
        
        // Files
        html += `<td>${hasFiles ? '📎 ' + order.files.length : '-'}</td>`;

        if (isAdminView) {
            // Requester
            html += `<td>${order.requester_name}</td>`;
            
            // Delivery
            html += `<td>${getDeliveryBadgeHtml(deliveryStatus)}</td>`;
            
            // Needed
            html += `<td>${formatDate(order.date_needed)}</td>`;
            
            // Supplier
            html += `<td>${order.supplier_name || '-'}</td>`;
            
            // Building
            html += `<td>${order.building}</td>`;
            
            // Unit
            html += `<td class="text-right">${fmtPrice(order.unit_price)}</td>`;
            
            // Total
            html += `<td class="text-right">${fmtPrice(order.total_price)}</td>`;
        } else {
            // Delivery
            html += `<td>${getDeliveryBadgeHtml(deliveryStatus)}</td>`;
            
            // Needed
            html += `<td>${formatDate(order.date_needed)}</td>`;
        }

        html += '</tr>';
    }
    html += '</tbody></table></div>';

    ordersTable.innerHTML = html;
    attachOrderEventListeners(canSelectOrders);
}

function renderGroupedOrders() {
    const isAdminView = currentUser.role !== 'requester';
    const canSelectOrders = currentUser.role === 'admin' || currentUser.role === 'procurement';
    const grouped = {};

    // Group by status
    for (const order of filteredOrders) {
        if (!grouped[order.status]) grouped[order.status] = [];
        grouped[order.status].push(order);
    }

    let html = '';

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
        
        // NEW COLUMN ORDER (without Status since we're grouped by status)
        html += '<th>ID</th>';
        html += '<th></th>'; // View button column
        html += '<th>Item</th>';
        html += '<th>Cost Center</th>';
        html += '<th>Qty</th>';
        html += '<th>Priority</th>';
        html += '<th>Files</th>';
        
        if (isAdminView) {
            html += '<th>Requester</th>';
            html += '<th>Delivery</th>';
            html += '<th>Needed</th>';
            html += '<th>Supplier</th>';
            html += '<th>Building</th>';
            html += '<th>Unit</th>';
            html += '<th>Total</th>';
        } else {
            html += '<th>Delivery</th>';
            html += '<th>Needed</th>';
        }
        
        html += '</tr></thead><tbody>';

        for (const order of grouped[status]) {
            const priorityClass = 'priority-' + (order.priority || 'Normal').toLowerCase();
            const hasFiles = order.files && order.files.length > 0;
            const deliveryStatus = getDeliveryStatus(order);

            html += '<tr data-id="' + order.id + '">';
            
            if (canSelectOrders) {
                html += `<td class="sticky"><input type="checkbox" class="row-select" data-id="${order.id}"></td>`;
            }
            
            // ID
            html += `<td>#${order.id}</td>`;
            
            // View Button (moved here!)
            html += `<td><button class="btn btn-secondary btn-sm btn-view-order" data-id="${order.id}">View</button></td>`;
            
            // Item
            html += `<td title="${escapeHtml(order.item_description)}">${escapeHtml(order.item_description.substring(0, 40))}${order.item_description.length > 40 ? '…' : ''}</td>`;
            
            // Cost Center
            html += `<td>${order.cost_center_code || '-'}</td>`;
            
            // Qty
            html += `<td>${order.quantity}</td>`;
            
            // Priority
            html += `<td><span class="priority-pill ${priorityClass}">${order.priority || 'Normal'}</span></td>`;
            
            // Files
            html += `<td>${hasFiles ? '📎 ' + order.files.length : '-'}</td>`;

            if (isAdminView) {
                // Requester
                html += `<td>${order.requester_name}</td>`;
                
                // Delivery
                html += `<td>${getDeliveryBadgeHtml(deliveryStatus)}</td>`;
                
                // Needed
                html += `<td>${formatDate(order.date_needed)}</td>`;
                
                // Supplier
                html += `<td>${order.supplier_name || '-'}</td>`;
                
                // Building
                html += `<td>${order.building}</td>`;
                
                // Unit
                html += `<td class="text-right">${fmtPrice(order.unit_price)}</td>`;
                
                // Total
                html += `<td class="text-right">${fmtPrice(order.total_price)}</td>`;
            } else {
                // Delivery
                html += `<td>${getDeliveryBadgeHtml(deliveryStatus)}</td>`;
                
                // Needed
                html += `<td>${formatDate(order.date_needed)}</td>`;
            }

            html += '</tr>';
        }

        html += '</tbody></table></div></div></div>';
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

function attachOrderEventListeners(canSelectOrders) {
    if (canSelectOrders) {
        const selectAll = document.getElementById('selectAllOrders');
        if (selectAll) {
            selectAll.addEventListener('change', e => {
                const checked = e.target.checked;
                selectedOrderIds.clear();
                if (checked) { filteredOrders.forEach(o => selectedOrderIds.add(o.id)); }
                document.querySelectorAll('.row-select').forEach(cb => { cb.checked = checked; });
                updateSelectionUi();
            });
        }

        document.querySelectorAll('.row-select').forEach(cb => {
            cb.addEventListener('change', e => {
                const id = parseInt(e.target.dataset.id, 10);
                if (e.target.checked) selectedOrderIds.add(id);
                else selectedOrderIds.delete(id);
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
        const res = await apiGet(`/orders/${orderId}`);
        if (!res.success) return;
        renderOrderDetail(res.order);
        orderDetailPanel.classList.remove('hidden');
        
        // ⭐ LOAD DOCUMENTS FOR THIS ORDER (Phase 2 Integration)
        if (typeof loadOrderDocuments === 'function') {
            loadOrderDocuments(orderId);
        }
    } catch { 
        alert('Failed to load order details'); 
    }
}

function renderOrderDetail(o) {
    const statusClass = 'status-' + o.status.toLowerCase().replace(/ /g, '-');
    const priorityClass = 'priority-' + (o.priority || 'Normal').toLowerCase();
    const deliveryStatus = getDeliveryStatus(o);

    let html = '';
    html += `<div class="detail-grid">
        <div><div class="detail-label">Order ID</div><div class="detail-value">#${o.id}</div></div>
        <div><div class="detail-label">Building</div><div class="detail-value">${o.building}</div></div>
        <div><div class="detail-label">Cost Center</div><div class="detail-value">${o.cost_center_code ? `${o.cost_center_code} — ${o.cost_center_name}` : '-'}</div></div>
        <div><div class="detail-label">Status</div><div class="detail-value"><span class="status-badge ${statusClass}">${o.status}</span></div></div>
        <div><div class="detail-label">Priority</div><div class="detail-value"><span class="priority-pill ${priorityClass}">${o.priority || 'Normal'}</span></div></div>
        <div><div class="detail-label">Date Needed</div><div class="detail-value">${formatDate(o.date_needed)}</div></div>
        <div><div class="detail-label">Expected Delivery</div><div class="detail-value">${o.expected_delivery_date ? formatDate(o.expected_delivery_date) : '-'}</div></div>
        <div><div class="detail-label">Delivery Status</div><div class="detail-value">${getDeliveryBadgeHtml(deliveryStatus)}</div></div>
        <div><div class="detail-label">Requester</div><div class="detail-value">${o.requester_name}</div></div>
        <div><div class="detail-label">Supplier</div><div class="detail-value">${o.supplier_name || '-'}</div></div>
        <div><div class="detail-label">Unit Price</div><div class="detail-value">${fmtPrice(o.unit_price)}</div></div>
        <div><div class="detail-label">Total Price</div><div class="detail-value">${fmtPrice(o.total_price)}</div></div>
    </div>`;

    html += `<div class="detail-section-title">Item Description</div>
        <div class="text-muted mt-1">${escapeHtml(o.item_description)}</div>`;

    if (o.part_number || o.category) {
        html += '<div class="detail-grid mt-1">';
        if (o.part_number) html += `<div><div class="detail-label">Part Number</div><div class="detail-value">${escapeHtml(o.part_number)}</div></div>`;
        if (o.category) html += `<div><div class="detail-label">Category</div><div class="detail-value">${escapeHtml(o.category)}</div></div>`;
        html += '</div>';
    }

    if (o.notes) {
        html += `<div class="detail-section-title mt-1">Notes</div><div class="text-muted mt-1">${escapeHtml(o.notes)}</div>`;
    }

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

    // Only admin/procurement can edit orders
    if (currentUser.role === 'admin' || currentUser.role === 'procurement') {
        html += '<hr class="mt-2" style="border-color: rgba(31,41,55,0.9); margin-bottom: 0.6rem;">';
        html += '<div class="detail-section-title">Update Order</div>';
        html += `<div class="form-group mt-1"><label>Status</label><select id="detailStatus" class="form-control form-control-sm">${ORDER_STATUSES.map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>`;
        html += `<div class="form-group"><label>Supplier</label><select id="detailSupplier" class="form-control form-control-sm"><option value="">None</option>${suppliersState.map(s => `<option value="${s.id}" ${o.supplier_id === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}</select></div>`;
        html += `<div class="detail-grid"><div><div class="form-group"><label>Expected Delivery</label><input type="date" id="detailExpected" class="form-control form-control-sm date-picker" value="${o.expected_delivery_date ? o.expected_delivery_date.substring(0,10) : ''}"></div></div><div><div class="form-group"><label>Unit Price</label><input type="number" step="0.01" id="detailUnitPrice" class="form-control form-control-sm" value="${parseFloat(o.unit_price) || ''}"></div></div></div>`;
        html += `<div class="form-group"><label>Total Price</label><input type="number" step="0.01" id="detailTotalPrice" class="form-control form-control-sm" value="${parseFloat(o.total_price) || ''}"></div>`;
        html += `<div class="form-actions"><button id="btnSaveOrder" class="btn btn-primary btn-sm">Save</button></div>`;
    }

    orderDetailBody.innerHTML = html;

    const btnSave = document.getElementById('btnSaveOrder');
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const payload = {
                status: document.getElementById('detailStatus').value,
                supplier_id: document.getElementById('detailSupplier').value || null,
                expected_delivery_date: document.getElementById('detailExpected').value || null,
                unit_price: parseFloat(document.getElementById('detailUnitPrice').value || 0) || null,
                total_price: parseFloat(document.getElementById('detailTotalPrice').value || 0) || null
            };
            const res = await apiPut(`/orders/${o.id}`, payload);
            if (res.success) { alert('Order updated'); loadOrders(); openOrderDetail(o.id); }
            else { alert('Failed to update order: ' + (res.message || 'Unknown error')); }
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
        html += `<tr data-id="${q.id}"><td>${q.quote_number}</td><td>${q.supplier_name || '-'}</td><td>${q.status}</td><td>${q.item_count || 0}</td><td class="text-right">${fmtPrice(q.total_amount)}</td><td>${q.valid_until ? formatDate(q.valid_until) : '-'}</td><td>${formatDateTime(q.created_at)}</td><td><button class="btn btn-secondary btn-sm btn-view-quote" data-id="${q.id}">View</button></td></tr>`;
    }
    html += '</tbody></table></div>';
    quotesTable.innerHTML = html;
    document.querySelectorAll('.btn-view-quote').forEach(btn => {
        btn.addEventListener('click', () => openQuoteDetail(parseInt(btn.dataset.id, 10)));
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
    html += '<div class="detail-section-title mt-2">Update Quote</div>';
    html += `<div class="form-group mt-1"><label>Status</label><select id="quoteStatus" class="form-control form-control-sm">${['Draft','Sent to Supplier','Received','Under Approval','Approved','Rejected'].map(s => `<option value="${s}" ${s===q.status?'selected':''}>${s}</option>`).join('')}</select></div>`;
    html += `<div class="form-group mt-1"><label>Notes</label><textarea id="quoteNotes" class="form-control form-control-sm" rows="2">${q.notes || ''}</textarea></div>`;
    html += '<div class="form-actions"><button id="btnSaveQuote" class="btn btn-primary btn-sm">Save</button></div>';
    quoteDetailBody.innerHTML = html;
    document.getElementById('btnSaveQuote').addEventListener('click', async () => {
        const payload = { status: document.getElementById('quoteStatus').value, notes: document.getElementById('quoteNotes').value };
        const res = await apiPut(`/quotes/${q.id}`, payload);
        if (res.success) { alert('Quote updated'); loadQuotes(); } else { alert('Failed to update quote'); }
    });
}

function openCreateQuoteDialog() {
    if (!selectedOrderIds.size) return;
    const orders = ordersState.filter(o => selectedOrderIds.has(o.id));
    const supplierOptions = suppliersState.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    const html = `Create quote for <strong>${orders.length}</strong> orders.\nSupplier: <select id="dlgSupplier">${supplierOptions}</select>\nValid until (YYYY-MM-DD): <input id="dlgValid" type="text" placeholder="optional">`;
    promptHtml(html).then(supplierId => {
        if (!supplierId) return;
        const body = {
            supplier_id: parseInt(document.getElementById('dlgSupplier').value, 10),
            order_ids: orders.map(o => o.id),
            valid_until: document.getElementById('dlgValid')?.value || null
        };
        apiPost('/quotes', body).then(res => {
            if (res.success) { alert(`Quote ${res.quoteNumber} created`); selectedOrderIds.clear(); updateSelectionUi(); loadOrders(); loadQuotes(); }
            else { alert('Failed to create quote: ' + (res.message || 'Unknown error')); }
        });
    });
}

function promptHtml(messageHtml) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);display:flex;align-items:center;justify-content:center;z-index:50;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#020617;padding:1rem 1.25rem;border-radius:12px;border:1px solid rgba(148,163,184,0.5);min-width:320px;color:white;';
    box.innerHTML = `<div style="font-size:0.9rem;margin-bottom:0.7rem;">${messageHtml}</div>`;
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:0.4rem;';
    const btnCancel = document.createElement('button'); btnCancel.textContent = 'Cancel'; btnCancel.className = 'btn btn-secondary btn-sm';
    const btnOk = document.createElement('button'); btnOk.textContent = 'Create'; btnOk.className = 'btn btn-primary btn-sm';
    actions.appendChild(btnCancel); actions.appendChild(btnOk); box.appendChild(actions); overlay.appendChild(box); document.body.appendChild(overlay);
    return new Promise(resolve => {
        btnCancel.onclick = () => { document.body.removeChild(overlay); resolve(null); };
        btnOk.onclick = () => { const v = document.getElementById('dlgSupplier')?.value; document.body.removeChild(overlay); resolve(v); };
    });
}

// ===================== BUILDINGS =====================

async function loadBuildings() {
    try {
        const res = await apiGet('/buildings');
        if (res.success) {
            buildingsState = res.buildings;
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

function renderBuildingsTable() {
    if (!buildingsTable) return;
    if (!buildingsState.length) { buildingsTable.innerHTML = '<p class="text-muted">No buildings yet.</p>'; return; }
    let html = '<div class="table-wrapper"><table><thead><tr><th>Code</th><th>Name</th><th>Active</th><th></th></tr></thead><tbody>';
    for (const b of buildingsState) {
        html += `<tr data-id="${b.id}"><td>${escapeHtml(b.code)}</td><td>${escapeHtml(b.name)}</td><td>${b.active ? 'Yes' : 'No'}</td><td><button class="btn btn-secondary btn-sm btn-edit-building" data-id="${b.id}">Edit</button></td></tr>`;
    }
    html += '</tbody></table></div>';
    buildingsTable.innerHTML = html;
    document.querySelectorAll('.btn-edit-building').forEach(btn => {
        btn.addEventListener('click', () => { const b = buildingsState.find(x => x.id === parseInt(btn.dataset.id, 10)); if (b) openBuildingForm(b); });
    });
}

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
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
    currentTab = tabId;
}

function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] || c)); }
function formatDate(dateStr) { if (!dateStr) return '-'; const d = new Date(dateStr); if (isNaN(d)) return dateStr; return d.toLocaleDateString(); }
function formatDateTime(dateStr) { if (!dateStr) return '-'; const d = new Date(dateStr); if (isNaN(d)) return dateStr; return d.toLocaleString(); }
function formatFileSize(bytes) { if (!bytes) return ''; const kb = bytes / 1024; if (kb < 1024) return kb.toFixed(1) + ' KB'; return (kb / 1024).toFixed(1) + ' MB'; }
