// frontend/app.js - PartPulse Orders v2.3 - Manager Role & Approvals Support

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
// ... [Rest of the code remains the same until renderQuoteDetail function]

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
    
    html += '<hr class="mt-2" style="border-color: rgba(31,41,55,0.9); margin-bottom: 0.6rem;">';
    html += '<div class="detail-section-title">Update Quote</div>';
    html += `<div class="form-group mt-1"><label>Status</label><select id="quoteStatus" class="form-control form-control-sm">${['Draft','Sent to Supplier','Received','Under Approval','Approved','Rejected'].map(s => `<option value="${s}" ${s===q.status?'selected':''}>${s}</option>`).join('')}</select></div>`;
    html += `<div class="form-group mt-1"><label>Notes</label><textarea id="quoteNotes" class="form-control form-control-sm" rows="2">${q.notes || ''}</textarea></div>`;
    html += '<div class="form-actions"><button id="btnSaveQuote" class="btn btn-primary btn-sm">Save</button></div>';
    quoteDetailBody.innerHTML = html;
    
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

// ... [Rest of the file continues with original functions - helpers, utilities, etc.]

function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] || c)); }
function formatDate(dateStr) { if (!dateStr) return '-'; const d = new Date(dateStr); if (isNaN(d)) return dateStr; return d.toLocaleDateString(); }
function formatDateTime(dateStr) { if (!dateStr) return '-'; const d = new Date(dateStr); if (isNaN(d)) return dateStr; return d.toLocaleString(); }
function formatFileSize(bytes) { if (!bytes) return ''; const kb = bytes / 1024; if (kb < 1024) return kb.toFixed(1) + ' KB'; return (kb / 1024).toFixed(1) + ' MB'; }
