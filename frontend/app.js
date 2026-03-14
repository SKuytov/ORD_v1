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

    // ⭐ NEW: Procurement/Admin/Manager Create Order button
    const btnProcurementCreateOrder = document.getElementById('btnProcurementCreateOrder');
    if (btnProcurementCreateOrder) {
        btnProcurementCreateOrder.addEventListener('click', openProcCreateOrderModal);
    }
}