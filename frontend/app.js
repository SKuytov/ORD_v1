// frontend/app.js
// PartPulse Order Management - Frontend Application

const API_BASE = '/api';
let currentUser = null;
let authToken = null;

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const userName = document.getElementById('userName');
const createOrderSection = document.getElementById('createOrderSection');
const createOrderForm = document.getElementById('createOrderForm');
const ordersTable = document.getElementById('ordersTable');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
});

function setupEventListeners() {
    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    createOrderForm.addEventListener('submit', handleCreateOrder);
}

// Authentication
async function checkAuth() {
    const token = localStorage.getItem('authToken');
    if (token) {
        authToken = token;
        try {
            const response = await fetch(`${API_BASE}/auth/verify`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                currentUser = data.user;
                showDashboard();
            } else {
                showLogin();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            showLogin();
        }
    } else {
        showLogin();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            showDashboard();
        } else {
            showError(data.message || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('Login failed. Please try again.');
    }
}

function handleLogout() {
    localStorage.removeItem('authToken');
    authToken = null;
    currentUser = null;
    showLogin();
}

// UI Functions
function showLogin() {
    loginScreen.classList.remove('hidden');
    dashboardScreen.classList.add('hidden');
    loginForm.reset();
    loginError.classList.add('hidden');
}

function showDashboard() {
    loginScreen.classList.add('hidden');
    dashboardScreen.classList.remove('hidden');
    userName.textContent = currentUser.name;
    
    // Show create order section for requesters
    if (currentUser.role === 'requester') {
        createOrderSection.classList.remove('hidden');
        document.getElementById('building').value = currentUser.building;
        document.getElementById('building').disabled = true;
    }
    
    loadOrders();
}

function showError(message) {
    loginError.textContent = message;
    loginError.classList.remove('hidden');
}

// Order Functions
async function handleCreateOrder(e) {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('building', document.getElementById('building').value);
    formData.append('itemDescription', document.getElementById('itemDescription').value);
    formData.append('quantity', document.getElementById('quantity').value);
    formData.append('dateNeeded', document.getElementById('dateNeeded').value);
    formData.append('notes', document.getElementById('notes').value);
    formData.append('requester', currentUser.name);
    formData.append('requesterEmail', currentUser.email);
    
    // Add files
    const files = document.getElementById('files').files;
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }
    
    try {
        const response = await fetch(`${API_BASE}/orders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Order created successfully!');
            createOrderForm.reset();
            if (currentUser.role === 'requester') {
                document.getElementById('building').value = currentUser.building;
            }
            loadOrders();
        } else {
            alert('Failed to create order: ' + data.message);
        }
    } catch (error) {
        console.error('Create order error:', error);
        alert('Failed to create order. Please try again.');
    }
}

async function loadOrders() {
    try {
        const response = await fetch(`${API_BASE}/orders`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderOrdersTable(data.orders);
        }
    } catch (error) {
        console.error('Load orders error:', error);
        ordersTable.innerHTML = '<p>Failed to load orders.</p>';
    }
}

function renderOrdersTable(orders) {
    if (orders.length === 0) {
        ordersTable.innerHTML = '<p>No orders found.</p>';
        return;
    }
    
    let html = `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Building</th>
                    <th>Item</th>
                    <th>Quantity</th>
                    <th>Date Needed</th>
                    <th>Status</th>
                    <th>Requester</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    orders.forEach(order => {
        const statusClass = order.status.toLowerCase().replace(/ /g, '-');
        html += `
            <tr>
                <td>#${order.id}</td>
                <td>${order.building}</td>
                <td>${order.item_description.substring(0, 50)}${order.item_description.length > 50 ? '...' : ''}</td>
                <td>${order.quantity}</td>
                <td>${new Date(order.date_needed).toLocaleDateString()}</td>
                <td><span class="status-badge status-${statusClass}">${order.status}</span></td>
                <td>${order.requester_name}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    ordersTable.innerHTML = html;
}
