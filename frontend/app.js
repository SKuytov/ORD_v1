// frontend/app.js - PartPulse Orders v2

const API_BASE = '/api';
let currentUser = null;
let authToken = null;

let ordersState = [];
let suppliersState = [];
let quotesState = [];
let usersState = [];
let buildingsState = [];
let selectedOrderIds = new Set();
let currentTab = 'ordersTab';

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
const ordersTable = document.getElementById('ordersTable');
const navTabs = document.getElementById('navTabs');
const filtersBar = document.getElementById('filtersBar');
const filterStatus = document.getElementById('filterStatus');
const filterBuilding = document.getElementById('filterBuilding');
const filterPriority = document.getElementById('filterPriority');
const filterSupplier = document.getElementById('filterSupplier');
const filterSearch = document.getElementById('filterSearch');
const btnApplyFilters = document.getElementById('btnApplyFilters');
const btnClearFilters = document.getElementById('btnClearFilters');
const orderDetailPanel = document.getElementById('orderDetailPanel');
const orderDetailBody = document.getElementById('orderDetailBody');
const btnCloseDetail = document.getElementById('btnCloseDetail');
const selectedCount = document.getElementById('selectedCount');
const orderActionsBar = document.getElementById('orderActionsBar');
const btnCreateQuote = document.getElementById('btnCreateQuote');

const quotesTable = document.getElementById('quotesTable');
const quoteDetailPanel = document.getElementById('quoteDetailPanel');
const quoteDetailBody = document.getElementById('quoteDetailBody');
const btnCloseQuoteDetail = document.getElementById('btnCloseQuoteDetail');
const btnRefreshQuotes = document.getElementById('btnRefreshQuotes');

const suppliersTable = document.getElementById('suppliersTable');
const supplierFormCard = document.getElementById('supplierFormCard');
const supplierFormTitle = document.getElementById('supplierFormTitle');
const supplierForm = document.getElementById('supplierForm');
const btnNewSupplier = document.getElementById('btnNewSupplier');
const btnCancelSupplier = document.getElementById('btnCancelSupplier');

// Supplier form inputs
const supplierIdInput = document.getElementById('supplierId');
const supplierNameInput = document.getElementById('supplierName');
const supplierContactInput = document.getElementById('supplierContact');
const supplierEmailInput = document.getElementById('supplierEmail');
const supplierPhoneInput = document.getElementById('supplierPhone');
const supplierWebsiteInput = document.getElementById('supplierWebsite');
const supplierAddressInput = document.getElementById('supplierAddress');
const supplierNotesInput = document.getElementById('supplierNotes');
const supplierActiveInput = document.getElementById('supplierActive');

// Buildings admin DOM
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

// Users admin DOM
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

// Constants
const ORDER_STATUSES = [
    'New', 'Pending', 'Quote Requested', 'Quote Received',
    'Quote Under Approval', 'Approved', 'Ordered',
    'In Transit', 'Partially Delivered', 'Delivered',
    'Cancelled', 'On Hold'
];

// Helper: safely format a price value (handles string decimals from MySQL)
function fmtPrice(val) {
    const n = parseFloat(val);
    if (isNaN(n) || n === 0) return '-';
    return n.toFixed(2);
}

// Init
window.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    checkAuth();
});

function setupEventListeners() {
    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    createOrderForm.addEventListener('submit', handleCreateOrder);

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    btnApplyFilters.addEventListener('click', () => loadOrders());
    btnClearFilters.addEventListener('click', () => {
        filterStatus.value = '';
        filterBuilding.value = '';
        filterPriority.value = '';
        filterSupplier.value = '';
        filterSearch.value = '';
        loadOrders();
    });

    btnCloseDetail.addEventListener('click', () => {
        orderDetailPanel.classList.add('hidden');
    });

    btnCloseQuoteDetail.addEventListener('click', () => {
        quoteDetailPanel.classList.add('hidden');
    });

    btnCreateQuote.addEventListener('click', openCreateQuoteDialog);
    btnRefreshQuotes.addEventListener('click', loadQuotes);

    btnNewSupplier.addEventListener('click', () => openSupplierForm());
    btnCancelSupplier.addEventListener('click', () => {
        supplierFormCard.hidden = true;
    });
    supplierForm.addEventListener('submit', handleSaveSupplier);

    if (btnNewBuilding) {
        btnNewBuilding.addEventListener('click', () => openBuildingForm());
    }
    if (btnCancelBuilding) {
        btnCancelBuilding.addEventListener('click', () => {
            buildingFormCard.hidden = true;
        });
    }
    if (buildingForm) {
        buildingForm.addEventListener('submit', handleSaveBuilding);
    }

    if (btnNewUser) {
        btnNewUser.addEventListener('click', () => openUserForm());
    }
    if (btnCancelUser) {
        btnCancelUser.addEventListener('click', () => {
            userFormCard.hidden = true;
        });
    }
    if (userForm) {
        userForm.addEventListener('submit', handleSaveUser);
    }
}

// Auth
async function checkAuth() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        showLogin();
        return;
    }

    authToken = token;
    try {
        const res = await apiGet('/auth/verify');
        if (res.success) {
            currentUser = res.user;
            showDashboard();
        } else {
            showLogin();
        }
    } catch {
        showLogin();
    }
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
    userRoleBadge.textContent = currentUser.role === 'admin' ? 'Admin' : currentUser.role === 'procurement' ? 'Procurement' : `Requester · ${currentUser.building}`;

    // Reset tab visibility and admin-only buttons on every login
    if (usersTabButton) usersTabButton.hidden = true;
    if (buildingsTabButton) buildingsTabButton.hidden = true;

    if (currentUser.role === 'requester') {
        createOrderSection.classList.remove('hidden');
        requesterBuildingBadge.textContent = `Building ${currentUser.building}`;
        navTabs.classList.add('hidden');
        filtersBar.classList.add('hidden');
    } else {
        createOrderSection.classList.add('hidden');
        navTabs.classList.remove('hidden');
        filtersBar.classList.remove('hidden');
        populateStatusFilter();

        if (currentUser.role === 'admin') {
            if (usersTabButton) usersTabButton.hidden = false;
            if (buildingsTabButton) buildingsTabButton.hidden = false;
        }
    }

    // Always default to Orders tab and hide all others on (re)login
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    const ordersTabEl = document.getElementById('ordersTab');
    if (ordersTabEl) ordersTabEl.classList.remove('hidden');
    currentTab = 'ordersTab';

    loadBuildings();

    loadSuppliers().then(() => {
        populateSupplierFilter();
    });
    loadOrders();
    if (currentUser.role !== 'requester') {
        loadQuotes();
    }
    if (currentUser.role === 'admin') {
        loadUsers();
    }
}

// API helper
async function apiGet(path, params = {}) {
    const url = new URL(`${API_BASE}${path}`, window.location.origin);
    Object.entries(params).forEach(([k, v]) => {
        if (v !== '' && v !== undefined && v !== null) url.searchParams.set(k, v);
    });
    const res = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    return res.json();
}

async function apiPut(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    return res.json();
}

async function apiPost(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    return res.json();
}

// Orders
async function handleCreateOrder(e) {
    e.preventDefault();

    const formData = new FormData();
    formData.append('building', buildingSelect.value);
    formData.append('itemDescription', document.getElementById('itemDescription').value.trim());
    formData.append('partNumber', document.getElementById('partNumber').value.trim());
    formData.append('category', document.getElementById('category').value.trim());
    formData.append('quantity', document.getElementById('quantity').value);
    formData.append('dateNeeded', document.getElementById('dateNeeded').value);
    formData.append('priority', document.getElementById('priority').value);
    formData.append('notes', document.getElementById('notes').value.trim());
    formData.append('requester', currentUser.name);
    formData.append('requesterEmail', currentUser.email);

    const files = document.getElementById('files').files;
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }

    try {
        const res = await fetch(`${API_BASE}/orders`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });
        const data = await res.json();
        if (!data.success) {
            alert('Failed to create order: ' + (data.message || 'Unknown error'));
            return;
        }
        alert('Order created successfully!');
        createOrderForm.reset();
        if (currentUser.role === 'requester') {
            buildingSelect.value = currentUser.building;
        }
        loadOrders();
    } catch (err) {
        alert('Failed to create order.');
    }
}

async function loadOrders() {
    try {
        const params = {};
        if (currentUser.role !== 'requester') {
            params.status = filterStatus.value;
            params.building = filterBuilding.value;
            params.priority = filterPriority.value;
            params.supplier_id = filterSupplier.value;
            params.search = filterSearch.value.trim();
        }

        const res = await apiGet('/orders', params);
        if (res.success) {
            ordersState = res.orders;
            selectedOrderIds.clear();
            updateSelectionUi();
            renderOrdersTable();
        }
    } catch (err) {
        console.error('loadOrders error:', err);
        ordersTable.innerHTML = '<p>Failed to load orders.</p>';
    }
}

function renderOrdersTable() {
    if (!ordersState.length) {
        ordersTable.innerHTML = '<p class="text-muted">No orders found.</p>';
        return;
    }

    const isAdminView = currentUser.role !== 'requester';

    let html = '<div class="table-wrapper"><table><thead><tr>';
    if (isAdminView) html += '<th class="sticky"><input type="checkbox" id="selectAllOrders"></th>';
    html += '<th>ID</th><th>Building</th><th>Item</th><th>Qty</th><th>Needed</th><th>Status</th>';
    if (isAdminView) {
        html += '<th>Priority</th><th>Supplier</th><th>Unit</th><th>Total</th><th>Files</th><th>Requester</th>';
    } else {
        html += '<th>Priority</th><th>Files</th>';
    }
    html += '<th></th></tr></thead><tbody>';

    for (const order of ordersState) {
        const statusClass = 'status-' + order.status.toLowerCase().replace(/ /g, '-');
        const priorityClass = 'priority-' + (order.priority || 'Normal').toLowerCase();
        const hasFiles = order.files && order.files.length > 0;

        html += '<tr data-id="' + order.id + '">';
        if (isAdminView) {
            html += `<td class="sticky"><input type="checkbox" class="row-select" data-id="${order.id}"></td>`;
        }
        html += `<td>#${order.id}</td>`;
        html += `<td>${order.building}</td>`;
        html += `<td title="${escapeHtml(order.item_description)}">${escapeHtml(order.item_description.substring(0, 40))}${order.item_description.length > 40 ? '…' : ''}</td>`;
        html += `<td>${order.quantity}</td>`;
        html += `<td>${formatDate(order.date_needed)}</td>`;
        html += `<td><span class="status-badge ${statusClass}">${order.status}</span></td>`;
        html += `<td><span class="priority-pill ${priorityClass}">${order.priority || 'Normal'}</span></td>`;

        if (isAdminView) {
            html += `<td>${order.supplier_name || '-'}</td>`;
            html += `<td class="text-right">${fmtPrice(order.unit_price)}</td>`;
            html += `<td class="text-right">${fmtPrice(order.total_price)}</td>`;
            html += `<td>${hasFiles ? '📎 ' + order.files.length : '-'}</td>`;
            html += `<td>${order.requester_name}</td>`;
        } else {
            html += `<td>${hasFiles ? '📎 ' + order.files.length : '-'}</td>`;
        }

        html += `<td><button class="btn btn-secondary btn-sm btn-view-order" data-id="${order.id}">View</button></td>`;
        html += '</tr>';
    }
    html += '</tbody></table></div>';

    ordersTable.innerHTML = html;

    if (currentUser.role !== 'requester') {
        document.getElementById('selectAllOrders').addEventListener('change', e => {
            const checked = e.target.checked;
            selectedOrderIds.clear();
            if (checked) {
                ordersState.forEach(o => selectedOrderIds.add(o.id));
            }
            document.querySelectorAll('.row-select').forEach(cb => {
                cb.checked = checked;
            });
            updateSelectionUi();
        });

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
    if (count > 0) {
        orderActionsBar.hidden = false;
        selectedCount.textContent = `${count} selected`;
    } else {
        orderActionsBar.hidden = true;
    }
}

async function openOrderDetail(orderId) {
    try {
        const res = await apiGet(`/orders/${orderId}`);
        if (!res.success) return;
        const o = res.order;
        renderOrderDetail(o);
        orderDetailPanel.classList.remove('hidden');
    } catch {
        alert('Failed to load order details');
    }
}

function renderOrderDetail(o) {
    const statusClass = 'status-' + o.status.toLowerCase().replace(/ /g, '-');
    const priorityClass = 'priority-' + (o.priority || 'Normal').toLowerCase();

    let html = '';
    html += `<div class="detail-grid">
        <div>
            <div class="detail-label">Order ID</div>
            <div class="detail-value">#${o.id}</div>
        </div>
        <div>
            <div class="detail-label">Building</div>
            <div class="detail-value">${o.building}</div>
        </div>
        <div>
            <div class="detail-label">Status</div>
            <div class="detail-value"><span class="status-badge ${statusClass}">${o.status}</span></div>
        </div>
        <div>
            <div class="detail-label">Priority</div>
            <div class="detail-value"><span class="priority-pill ${priorityClass}">${o.priority || 'Normal'}</span></div>
        </div>
        <div>
            <div class="detail-label">Date Needed</div>
            <div class="detail-value">${formatDate(o.date_needed)}</div>
        </div>
        <div>
            <div class="detail-label">Expected Delivery</div>
            <div class="detail-value">${o.expected_delivery_date ? formatDate(o.expected_delivery_date) : '-'}</div>
        </div>
        <div>
            <div class="detail-label">Requester</div>
            <div class="detail-value">${o.requester_name}</div>
        </div>
        <div>
            <div class="detail-label">Supplier</div>
            <div class="detail-value">${o.supplier_name || '-'}</div>
        </div>
        <div>
            <div class="detail-label">Unit Price</div>
            <div class="detail-value">${fmtPrice(o.unit_price)}</div>
        </div>
        <div>
            <div class="detail-label">Total Price</div>
            <div class="detail-value">${fmtPrice(o.total_price)}</div>
        </div>
    </div>`;

    html += `<div class="detail-section-title">Item Description</div>
        <div class="text-muted mt-1">${escapeHtml(o.item_description)}</div>`;

    if (o.part_number || o.category) {
        html += '<div class="detail-grid mt-1">';
        if (o.part_number) {
            html += `<div><div class="detail-label">Part Number</div><div class="detail-value">${escapeHtml(o.part_number)}</div></div>`;
        }
        if (o.category) {
            html += `<div><div class="detail-label">Category</div><div class="detail-value">${escapeHtml(o.category)}</div></div>`;
        }
        html += '</div>';
    }

    if (o.notes) {
        html += `<div class="detail-section-title mt-1">Notes</div>
            <div class="text-muted mt-1">${escapeHtml(o.notes)}</div>`;
    }

    // Files
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

    // History (admin/procurement only)
    if (currentUser.role !== 'requester' && o.history && o.history.length) {
        html += '<div class="detail-section-title mt-2">History</div>';
        html += '<div class="text-muted" style="max-height: 120px; overflow-y: auto; font-size: 0.78rem;">';
        for (const h of o.history) {
            html += `<div>[${formatDateTime(h.changed_at)}] <strong>${escapeHtml(h.changed_by)}</strong> changed <strong>${escapeHtml(h.field_name)}</strong> from \"${escapeHtml(h.old_value || '')}\" to \"${escapeHtml(h.new_value || '')}\"</div>`;
        }
        html += '</div>';
    }

    // Edit section for admin/procurement
    if (currentUser.role !== 'requester') {
        html += '<hr class="mt-2" style="border-color: rgba(31,41,55,0.9); margin-bottom: 0.6rem;">';
        html += '<div class="detail-section-title">Update Order</div>';
        html += `<div class="form-group mt-1">
            <label>Status</label>
            <select id="detailStatus" class="form-control form-control-sm">${ORDER_STATUSES.map(s => `<option value=\"${s}\" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>`;
        html += `<div class="form-group">
            <label>Supplier</label>
            <select id="detailSupplier" class="form-control form-control-sm">
                <option value=\"\">None</option>
                ${suppliersState.map(s => `<option value=\"${s.id}\" ${o.supplier_id === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
            </select>
        </div>`;
        html += `<div class="detail-grid">
            <div>
                <div class="form-group">
                    <label>Expected Delivery</label>
                    <input type="date" id="detailExpected" class="form-control form-control-sm" value="${o.expected_delivery_date ? o.expected_delivery_date.substring(0,10) : ''}">
                </div>
            </div>
            <div>
                <div class="form-group">
                    <label>Unit Price</label>
                    <input type="number" step="0.01" id="detailUnitPrice" class="form-control form-control-sm" value="${parseFloat(o.unit_price) || ''}">
                </div>
            </div>
        </div>`;
        html += `<div class="form-group">
            <label>Total Price</label>
            <input type="number" step="0.01" id="detailTotalPrice" class="form-control form-control-sm" value="${parseFloat(o.total_price) || ''}">
        </div>`;
        html += `<div class="form-actions">
            <button id="btnSaveOrder" class="btn btn-primary btn-sm">Save</button>
        </div>`;
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
            if (res.success) {
                alert('Order updated');
                loadOrders();
                openOrderDetail(o.id);
            } else {
                alert('Failed to update order: ' + (res.message || 'Unknown error'));
            }
        });
    }
}

// Quotes
async function loadQuotes() {
    try {
        const res = await apiGet('/quotes');
        if (res.success) {
            quotesState = res.quotes;
            renderQuotesTable();
        }
    } catch {
        quotesTable.innerHTML = '<p>Failed to load quotes.</p>';
    }
}

function renderQuotesTable() {
    if (!quotesState.length) {
        quotesTable.innerHTML = '<p class="text-muted">No quotes yet.</p>';
        return;
    }

    let html = '<div class="table-wrapper"><table><thead><tr>';
    html += '<th>Quote #</th><th>Supplier</th><th>Status</th><th>Items</th><th>Total</th><th>Valid Until</th><th>Created</th><th></th>';
    html += '</tr></thead><tbody>';

    for (const q of quotesState) {
        html += `<tr data-id="${q.id}">
            <td>${q.quote_number}</td>
            <td>${q.supplier_name || '-'}</td>
            <td>${q.status}</td>
            <td>${q.item_count || 0}</td>
            <td class="text-right">${fmtPrice(q.total_amount)}</td>
            <td>${q.valid_until ? formatDate(q.valid_until) : '-'}</td>
            <td>${formatDateTime(q.created_at)}</td>
            <td><button class="btn btn-secondary btn-sm btn-view-quote" data-id="${q.id}">View</button></td>
        </tr>`;
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
    } catch {
        alert('Failed to load quote details');
    }
}

function renderQuoteDetail(q) {
    let html = '';
    html += `<div class="detail-grid">
        <div><div class="detail-label">Quote #</div><div class="detail-value">${q.quote_number}</div></div>
        <div><div class="detail-label">Status</div><div class="detail-value">${q.status}</div></div>
        <div><div class="detail-label">Supplier</div><div class="detail-value">${q.supplier_name || '-'}</div></div>
        <div><div class="detail-label">Valid Until</div><div class="detail-value">${q.valid_until ? formatDate(q.valid_until) : '-'}</div></div>
        <div><div class="detail-label">Total Amount</div><div class="detail-value">${fmtPrice(q.total_amount)}</div></div>
        <div><div class="detail-label">Currency</div><div class="detail-value">${q.currency}</div></div>
    </div>`;

    if (q.notes) {
        html += `<div class="detail-section-title mt-1">Notes</div><div class="text-muted mt-1">${escapeHtml(q.notes)}</div>`;
    }

    if (q.items && q.items.length) {
        html += '<div class="detail-section-title mt-2">Items</div>';
        html += '<div class="table-wrapper"><table><thead><tr><th>Order</th><th>Building</th><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>';
        for (const it of q.items) {
            html += `<tr>
                <td>#${it.order_id}</td>
                <td>${it.building}</td>
                <td>${escapeHtml(it.item_description.substring(0,40))}${it.item_description.length>40?'…':''}</td>
                <td>${it.quantity}</td>
                <td class="text-right">${fmtPrice(it.unit_price)}</td>
                <td class="text-right">${fmtPrice(it.total_price)}</td>
            </tr>`;
        }
        html += '</tbody></table></div>';
    }

    // Simple status update controls
    html += '<div class="detail-section-title mt-2">Update Quote</div>';
    html += `<div class="form-group mt-1">
        <label>Status</label>
        <select id="quoteStatus" class="form-control form-control-sm">
            ${['Draft','Sent to Supplier','Received','Under Approval','Approved','Rejected'].map(s => `<option value="${s}" ${s===q.status?'selected':''}>${s}</option>`).join('')}
        </select>
    </div>`;
    html += `<div class="form-group mt-1">
        <label>Notes</label>
        <textarea id="quoteNotes" class="form-control form-control-sm" rows="2">${q.notes || ''}</textarea>
    </div>`;
    html += '<div class="form-actions"><button id="btnSaveQuote" class="btn btn-primary btn-sm">Save</button></div>';

    quoteDetailBody.innerHTML = html;

    document.getElementById('btnSaveQuote').addEventListener('click', async () => {
        const payload = {
            status: document.getElementById('quoteStatus').value,
            notes: document.getElementById('quoteNotes').value
        };
        const res = await apiPut(`/quotes/${q.id}`, payload);
        if (res.success) {
            alert('Quote updated');
            loadQuotes();
        } else {
            alert('Failed to update quote');
        }
    });
}

// Create quote from selected orders
function openCreateQuoteDialog() {
    if (!selectedOrderIds.size) return;
    const orders = ordersState.filter(o => selectedOrderIds.has(o.id));

    const supplierOptions = suppliersState.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');

    const html = `Create quote for <strong>${orders.length}</strong> orders.\nSupplier: <select id="dlgSupplier">${supplierOptions}</select>\nValid until (YYYY-MM-DD): <input id="dlgValid" type="text" placeholder="optional">`;

    const supplierIdPromise = promptHtml(html);
    supplierIdPromise.then(supplierId => {
        if (!supplierId) return;

        const validUntilInput = document.getElementById('dlgValid')?.value || null;

        const body = {
            supplier_id: parseInt(document.getElementById('dlgSupplier').value, 10),
            order_ids: orders.map(o => o.id),
            valid_until: validUntilInput
        };

        apiPost('/quotes', body).then(res => {
            if (res.success) {
                alert(`Quote ${res.quoteNumber} created`);
                selectedOrderIds.clear();
                updateSelectionUi();
                loadOrders();
                loadQuotes();
            } else {
                alert('Failed to create quote: ' + (res.message || 'Unknown error'));
            }
        });
    });
}

// Simple prompt replacement that shows a small overlay
function promptHtml(messageHtml) {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(15,23,42,0.85)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '50';

    const box = document.createElement('div');
    box.style.background = '#020617';
    box.style.padding = '1rem 1.25rem';
    box.style.borderRadius = '12px';
    box.style.border = '1px solid rgba(148,163,184,0.5)';
    box.style.minWidth = '320px';
    box.style.color = 'white';
    box.innerHTML = `<div style="font-size:0.9rem; margin-bottom:0.7rem;">${messageHtml}</div>`;

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '0.4rem';

    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancel';
    btnCancel.className = 'btn btn-secondary btn-sm';
    const btnOk = document.createElement('button');
    btnOk.textContent = 'Create';
    btnOk.className = 'btn btn-primary btn-sm';

    actions.appendChild(btnCancel);
    actions.appendChild(btnOk);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    return new Promise(resolve => {
        btnCancel.onclick = () => {
            document.body.removeChild(overlay);
            resolve(null);
        };
        btnOk.onclick = () => {
            const supplierSelect = document.getElementById('dlgSupplier');
            const supplierVal = supplierSelect ? supplierSelect.value : null;
            document.body.removeChild(overlay);
            resolve(supplierVal);
        };
    });
}

// Buildings (admin)
async function loadBuildings() {
    try {
        const res = await apiGet('/buildings');
        if (res.success) {
            buildingsState = res.buildings;
            populateBuildingSelects();
            if (currentUser && currentUser.role === 'admin') {
                renderBuildingsTable();
            }
        }
    } catch (err) {
        console.error('loadBuildings error:', err);
        if (buildingsTable) {
            buildingsTable.innerHTML = '<p>Failed to load buildings.</p>';
        }
    }
}

function populateBuildingSelects() {
    // Order form select
    if (buildingSelect) {
        buildingSelect.innerHTML = '<option value="">Select Building</option>' +
            buildingsState.filter(b => b.active).map(b => `<option value="${b.code}">${escapeHtml(b.code)} - ${escapeHtml(b.name)}</option>`).join('');
        if (currentUser && currentUser.role === 'requester') {
            buildingSelect.value = currentUser.building;
            buildingSelect.disabled = true;
        }
    }

    // User form select
    if (userBuildingSelect) {
        userBuildingSelect.innerHTML = '<option value="">None</option>' +
            buildingsState.filter(b => b.active).map(b => `<option value="${b.code}">${escapeHtml(b.code)} - ${escapeHtml(b.name)}</option>`).join('');
    }

    // Filters
    if (filterBuilding) {
        const currentVal = filterBuilding.value;
        filterBuilding.innerHTML = '<option value="">Building: All</option>' +
            buildingsState.filter(b => b.active).map(b => `<option value="${b.code}">${escapeHtml(b.code)} - ${escapeHtml(b.name)}</option>`).join('');
        if (currentVal) filterBuilding.value = currentVal;
    }
}

function renderBuildingsTable() {
    if (!buildingsTable) return;

    if (!buildingsState.length) {
        buildingsTable.innerHTML = '<p class="text-muted">No buildings yet.</p>';
        return;
    }

    let html = '<div class="table-wrapper"><table><thead><tr>';
    html += '<th>Code</th><th>Name</th><th>Active</th><th></th>';
    html += '</tr></thead><tbody>';

    for (const b of buildingsState) {
        html += `<tr data-id="${b.id}">
            <td>${escapeHtml(b.code)}</td>
            <td>${escapeHtml(b.name)}</td>
            <td>${b.active ? 'Yes' : 'No'}</td>
            <td><button class="btn btn-secondary btn-sm btn-edit-building" data-id="${b.id}">Edit</button></td>
        </tr>`;
    }

    html += '</tbody></table></div>';
    buildingsTable.innerHTML = html;

    document.querySelectorAll('.btn-edit-building').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.id, 10);
            const b = buildingsState.find(x => x.id === id);
            if (b) openBuildingForm(b);
        });
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
        buildingFormTitle.textContent = 'Create Building';
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

    if (!payload.code || !payload.name) {
        alert('Code and name are required');
        return;
    }

    const id = buildingIdInput.value;
    let res;
    if (id) {
        res = await apiPut(`/buildings/${id}`, payload);
    } else {
        res = await apiPost('/buildings', payload);
    }

    if (res.success) {
        alert('Building saved');
        buildingFormCard.hidden = true;
        loadBuildings();
    } else {
        alert('Failed to save building: ' + (res.message || 'Unknown error'));
    }
}

// Users (admin)
async function loadUsers() {
    try {
        const res = await apiGet('/users');
        if (res.success) {
            usersState = res.users;
            renderUsersTable();
        }
    } catch (err) {
        console.error('loadUsers error:', err);
        usersTable.innerHTML = '<p>Failed to load users.</p>';
    }
}

function renderUsersTable() {
    if (!usersState.length) {
        usersTable.innerHTML = '<p class="text-muted">No users yet.</p>';
        return;
    }

    let html = '<div class="table-wrapper"><table><thead><tr>';
    html += '<th>Username</th><th>Name</th><th>Email</th><th>Role</th><th>Building</th><th>Active</th><th></th>';
    html += '</tr></thead><tbody>';

    for (const u of usersState) {
        html += `<tr data-id="${u.id}">
            <td>${escapeHtml(u.username)}</td>
            <td>${escapeHtml(u.name || '')}</td>
            <td>${escapeHtml(u.email || '')}</td>
            <td>${u.role}</td>
            <td>${u.building || ''}</td>
            <td>${u.active ? 'Yes' : 'No'}</td>
            <td>
                <button class="btn btn-secondary btn-sm btn-edit-user" data-id="${u.id}">Edit</button>
                <button class="btn btn-secondary btn-sm btn-reset-pass" data-id="${u.id}">Reset Password</button>
            </td>
        </tr>`;
    }

    html += '</tbody></table></div>';
    usersTable.innerHTML = html;

    document.querySelectorAll('.btn-edit-user').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.id, 10);
            const u = usersState.find(x => x.id === id);
            if (u) openUserForm(u);
        });
    });

    document.querySelectorAll('.btn-reset-pass').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.id, 10);
            resetUserPassword(id);
        });
    });
}

function openUserForm(user) {
    if (user) {
        userFormTitle.textContent = 'Edit User';
        userIdInput.value = user.id;
        userUsernameInput.value = user.username || '';
        userNameInput.value = user.name || '';
        userEmailInput.value = user.email || '';
        userRoleSelect.value = user.role || 'requester';
        userBuildingSelect.value = user.building || '';
        userActiveSelect.value = user.active ? '1' : '0';
        userPasswordInput.value = '';
        userPasswordGroup.style.display = 'none';
    } else {
        userFormTitle.textContent = 'Create User';
        userForm.reset();
        userIdInput.value = '';
        userActiveSelect.value = '1';
        userPasswordGroup.style.display = '';
    }
    userFormCard.hidden = false;
}

async function handleSaveUser(e) {
    e.preventDefault();

    const payload = {
        username: userUsernameInput.value.trim(),
        name: userNameInput.value.trim(),
        email: userEmailInput.value.trim(),
        role: userRoleSelect.value,
        building: userBuildingSelect.value || null,
        active: userActiveSelect.value === '1',
        password: userPasswordGroup.style.display !== 'none' ? userPasswordInput.value.trim() : undefined
    };

    if (!payload.username || !payload.name || !payload.email || !payload.role) {
        alert('Username, name, email and role are required');
        return;
    }

    const id = userIdInput.value;
    let res;
    if (id) {
        // Edit mode: do not send password here
        delete payload.password;
        res = await apiPut(`/users/${id}`, payload);
    } else {
        res = await apiPost('/users', payload);
    }

    if (res.success) {
        if (!id && res.password) {
            alert(`User created. Initial password: ${res.password}`);
        } else {
            alert('User saved');
        }
        userFormCard.hidden = true;
        loadUsers();
    } else {
        alert('Failed to save user: ' + (res.message || 'Unknown error'));
    }
}

async function resetUserPassword(id) {
    const pwd = prompt('Enter new password (min 6 characters):');
    if (!pwd || pwd.trim().length < 6) {
        alert('Password too short. Nothing changed.');
        return;
    }
    const confirmPwd = prompt('Confirm new password:');
    if (confirmPwd !== pwd) {
        alert('Passwords do not match. Nothing changed.');
        return;
    }

    try {
        const res = await apiPost(`/users/${id}/reset-password`, { password: pwd });
        if (res.success) {
            alert('Password reset successfully.');
        } else {
            alert('Password reset failed: ' + (res.message || 'Unknown error'));
        }
    } catch (err) {
        alert('Password reset failed');
    }
}

// Suppliers
async function loadSuppliers() {
    try {
        const res = await apiGet('/suppliers');
        if (res.success) {
            suppliersState = res.suppliers;
            renderSuppliersTable();
        }
    } catch {
        suppliersTable.innerHTML = '<p>Failed to load suppliers.</p>';
    }
}

function renderSuppliersTable() {
    if (!suppliersState.length) {
        suppliersTable.innerHTML = '<p class="text-muted">No suppliers yet.</p>';
        return;
    }

    let html = '<div class="table-wrapper"><table><thead><tr>';
    html += '<th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th>Active</th><th></th>';
    html += '</tr></thead><tbody>';

    for (const s of suppliersState) {
        html += `<tr data-id="${s.id}">
            <td>${escapeHtml(s.name)}</td>
            <td>${escapeHtml(s.contact_person || '')}</td>
            <td>${escapeHtml(s.email || '')}</td>
            <td>${escapeHtml(s.phone || '')}</td>
            <td>${s.active ? 'Yes' : 'No'}</td>
            <td><button class="btn btn-secondary btn-sm btn-edit-supplier" data-id="${s.id}">Edit</button></td>
        </tr>`;
    }

    html += '</tbody></table></div>';
    suppliersTable.innerHTML = html;

    document.querySelectorAll('.btn-edit-supplier').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.id, 10);
            const s = suppliersState.find(x => x.id === id);
            if (s) openSupplierForm(s);
        });
    });
}

// Filters helpers
function populateStatusFilter() {
    filterStatus.innerHTML = '<option value="">Status: All</option>' + ORDER_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('');
}

function populateSupplierFilter() {
    filterSupplier.innerHTML = '<option value="">Supplier: All</option>' + suppliersState.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
}

// Tabs
function switchTab(tabId) {
    if (currentTab === tabId) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
    currentTab = tabId;
}

// Utils
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] || c));
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString();
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleString();
}

function formatFileSize(bytes) {
    if (!bytes) return '';
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(1) + ' KB';
    return (kb / 1024).toFixed(1) + ' MB';
}
