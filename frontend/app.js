// frontend/app.js - PartPulse Orders v2.7 - Procurement Create Order Feature

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

// ⭐ NEW: Priority order for sorting (Urgent first!)
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

    // ⭐ NEW: Procurement Create Order Button
    const btnProcurementCreateOrder = document.getElementById('btnProcurementCreateOrder');
    if (btnProcurementCreateOrder) {
        btnProcurementCreateOrder.addEventListener('click', openProcurementCreateOrderDialog);
    }

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
    
    // Reset pagination
    currentPage = 1;
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
    
    // Try to find the delivered date from history
    if (order.history && order.history.length) {
        const deliveredHistory = order.history
            .filter(h => h.field_name === 'status' && h.new_value === 'Delivered')
            .sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));
        
        if (deliveredHistory.length > 0) {
            return deliveredHistory[0].changed_at;
        }
    }
    
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

    // ⭐ NEW: Sort by priority (Urgent → High → Normal → Low)
    filteredOrders.sort((a, b) => {
        const priorityA = PRIORITY_ORDER[a.priority] || PRIORITY_ORDER['Normal'];
        const priorityB = PRIORITY_ORDER[b.priority] || PRIORITY_ORDER['Normal'];
        
        if (priorityA !== priorityB) {
            return priorityA - priorityB; // Lower number = higher priority
        }
        
        // Secondary sort by ID (newer orders first)
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
        
        // ⭐ FIX: Show view toggle for requesters but hide quote actions
        const orderActionsContainer = document.getElementById('orderActionsContainer');
        if (orderActionsContainer) {
            orderActionsContainer.style.display = 'flex'; // Show container
        }
        
        // Hide only the quote creation bar
        if (orderActionsBar) {
            orderActionsBar.style.display = 'none';
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

        // ⭐ NEW: Show procurement create order button for procurement users
        const btnProcurementCreateOrder = document.getElementById('btnProcurementCreateOrder');
        if (currentUser.role === 'procurement' && btnProcurementCreateOrder) {
            btnProcurementCreateOrder.hidden = false;
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
    // ⭐ FIX: Only load suppliers for admin and procurement roles
    if (currentUser.role === 'admin' || currentUser.role === 'procurement') {
        loadSuppliers().then(() => { populateSupplierFilter(); });
    }
    loadOrders();
    if (currentUser.role !== 'requester') { loadQuotes(); }
    if (currentUser.role === 'admin') { loadUsers(); }
}

// ⭐ NEW: Procurement Create Order Dialog Function
function openProcurementCreateOrderDialog() {
    if (!buildingsState || !buildingsState.length) {
        alert('No buildings available. Please contact administrator.');
        return;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);display:flex;align-items:center;justify-content:center;z-index:50;overflow-y:auto;';
    
    const modal = document.createElement('div');
    modal.style.cssText = 'background:#020617;padding:1.5rem;border-radius:12px;border:1px solid rgba(148,163,184,0.5);max-width:600px;width:90%;color:white;max-height:90vh;overflow-y:auto;';
    
    modal.innerHTML = `
        <h3 style="margin:0 0 1rem 0;font-size:1.2rem;">Create Order (Procurement)</h3>
        <form id="procurementOrderForm">
            <!-- Building Selection -->
            <div class="form-group">
                <label>Building *</label>
                <select id="procBuildingSelect" class="form-control" required>
                    <option value="">Select Building</option>
                    ${buildingsState.filter(b => b.active).map(b => 
                        `<option value="${b.code}">${escapeHtml(b.code)} - ${escapeHtml(b.name)}</option>`
                    ).join('')}
                </select>
            </div>

            <!-- Cost Center Selection -->
            <div class="form-group">
                <label>Cost Center *</label>
                <div id="procCostCenterRadios">
                    <span class="text-muted">Select a building first</span>
                </div>
            </div>

            <!-- Item Details -->
            <div class="form-group">
                <label>Item Description *</label>
                <textarea id="procItemDescription" class="form-control" rows="2" required></textarea>
            </div>

            <div class="form-group">
                <label>Part Number</label>
                <input type="text" id="procPartNumber" class="form-control">
            </div>

            <div class="form-group">
                <label>Category</label>
                <input type="text" id="procCategory" class="form-control">
            </div>

            <div class="form-group">
                <label>Quantity *</label>
                <input type="number" id="procQuantity" class="form-control" min="1" required>
            </div>

            <div class="form-group">
                <label>Date Needed *</label>
                <input type="date" id="procDateNeeded" class="form-control date-picker" required>
            </div>

            <div class="form-group">
                <label>Priority *</label>
                <select id="procPriority" class="form-control" required>
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                    <option value="Low">Low</option>
                </select>
            </div>

            <div class="form-group">
                <label>Notes</label>
                <textarea id="procNotes" class="form-control" rows="2"></textarea>
            </div>

            <div class="form-group">
                <label>Attachments</label>
                <input type="file" id="procAttachments" class="form-control" multiple>
            </div>

            <div class="form-actions" style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:1rem;">
                <button type="button" id="btnCancelProcOrder" class="btn btn-secondary">Cancel</button>
                <button type="submit" class="btn btn-primary">Create Order</button>
            </div>
        </form>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Handle building selection change
    const procBuildingSelect = document.getElementById('procBuildingSelect');
    const procCostCenterRadios = document.getElementById('procCostCenterRadios');
    
    procBuildingSelect.addEventListener('change', () => {
        const buildingCode = procBuildingSelect.value;
        if (!buildingCode) {
            procCostCenterRadios.innerHTML = '<span class="text-muted">Select a building first</span>';
            return;
        }

        const filtered = costCentersState.filter(cc => cc.building_code === buildingCode && cc.active);

        if (!filtered.length) {
            procCostCenterRadios.innerHTML = '<span class="text-muted">No cost centers defined for this building</span>';
            return;
        }

        procCostCenterRadios.innerHTML = filtered.map(cc =>
            `<label class="radio-label">
                <input type="radio" name="procCostCenter" value="${cc.id}" required>
                <span class="radio-text"><strong>${escapeHtml(cc.code)}</strong> — ${escapeHtml(cc.name)}</span>
            </label>`
        ).join('');
    });

    // Handle cancel
    document.getElementById('btnCancelProcOrder').addEventListener('click', () => {
        document.body.removeChild(overlay);
    });

    // Handle form submission
    document.getElementById('procurementOrderForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const selectedCC = document.querySelector('input[name="procCostCenter"]:checked');
        if (!selectedCC) {
            alert('Please select a Cost Center');
            return;
        }

        const formData = new FormData();
        formData.append('building', procBuildingSelect.value);
        formData.append('costCenterId', selectedCC.value);
        formData.append('itemDescription', document.getElementById('procItemDescription').value.trim());
        formData.append('partNumber', document.getElementById('procPartNumber').value.trim());
        formData.append('category', document.getElementById('procCategory').value.trim());
        formData.append('quantity', document.getElementById('procQuantity').value);
        formData.append('dateNeeded', document.getElementById('procDateNeeded').value);
        formData.append('priority', document.getElementById('procPriority').value);
        formData.append('notes', document.getElementById('procNotes').value.trim());
        formData.append('requester', currentUser.name);
        formData.append('requesterEmail', currentUser.email);

        const files = document.getElementById('procAttachments').files;
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }

        // Show progress overlay if available
        if (window.UploadProgress) {
            window.UploadProgress.show();
        }

        try {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable && window.UploadProgress) {
                    const percentComplete = (event.loaded / event.total) * 100;
                    window.UploadProgress.update(percentComplete);
                }
            });

            xhr.addEventListener('load', () => {
                if (window.UploadProgress) {
                    window.UploadProgress.hide();
                }

                try {
                    const data = JSON.parse(xhr.responseText);
                    if (!data.success) {
                        alert('Failed to create order: ' + (data.message || 'Unknown error'));
                        return;
                    }
                    alert('Order created successfully!');
                    document.body.removeChild(overlay);
                    loadOrders();
                } catch (err) {
                    alert('Failed to process server response.');
                }
            });

            xhr.addEventListener('error', () => {
                if (window.UploadProgress) {
                    window.UploadProgress.hide();
                }
                alert('Failed to create order. Network error.');
            });

            xhr.open('POST', `${API_BASE}/orders`);
            xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
            xhr.send(formData);

        } catch (err) {
            if (window.UploadProgress) {
                window.UploadProgress.hide();
            }
            alert('Failed to create order: ' + err.message);
        }
    });
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

// [REST OF THE APP.JS CODE CONTINUES UNCHANGED - including all order management, quotes, suppliers, buildings, users functions]
// Due to length constraints, I'm showing the key changes. The rest of the file remains exactly as it was.

// Note: Insert the rest of your app.js code here starting from the COST CENTERS section through the end of the file
// All functions after this point remain unchanged from your original file
