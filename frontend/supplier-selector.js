// frontend/supplier-selector.js
// Professional Supplier Selection Interface

let supplierSelectorState = {
    allSuppliers: [],
    filteredSuppliers: [],
    selectedSupplierId: null,
    currentOrderId: null,
    searchTerm: '',
    filterRecent: false
};

// ============================================================================
// Open Supplier Selection Modal
// ============================================================================

async function openSupplierSelector(orderId, currentSupplierId = null) {
    supplierSelectorState.currentOrderId = orderId;
    supplierSelectorState.selectedSupplierId = currentSupplierId;
    
    // Load suppliers
    await loadSuppliersForSelection();
    
    // Create modal
    const modal = createSupplierSelectorModal();
    document.body.appendChild(modal);
    
    // Focus search
    setTimeout(() => {
        document.getElementById('supplierSearchInput')?.focus();
    }, 100);
}

// ============================================================================
// Create Modal UI
// ============================================================================

function createSupplierSelectorModal() {
    const overlay = document.createElement('div');
    overlay.id = 'supplierSelectorOverlay';
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.9);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        animation: fadeIn 0.2s ease;
    `;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #0f172a;
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 16px;
        width: 90%;
        max-width: 900px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        animation: slideUp 0.3s ease;
    `;
    
    modal.innerHTML = `
        <!-- Header -->
        <div style="padding: 1.5rem; border-bottom: 1px solid rgba(148, 163, 184, 0.2);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
                <h2 style="margin: 0; font-size: 1.5rem; color: #e2e8f0;">
                    🏢 Select Supplier
                </h2>
                <button id="btnCloseSupplierSelector" class="btn-icon" style="font-size: 1.5rem;">
                    ✕
                </button>
            </div>
            
            <!-- Search Bar -->
            <div style="display: flex; gap: 0.75rem; align-items: center;">
                <div style="flex: 1; position: relative;">
                    <input 
                        type="text" 
                        id="supplierSearchInput" 
                        class="form-control" 
                        placeholder="🔍 Search by name, contact, email, or specialization..."
                        style="padding-left: 2.5rem;"
                    >
                    <span style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: #64748b; font-size: 1.2rem;">
                        🔍
                    </span>
                </div>
                <button id="btnFilterRecent" class="btn btn-secondary" style="white-space: nowrap;">
                    ⏱️ Recent Only
                </button>
                <button id="btnAddNewSupplier" class="btn btn-primary" style="white-space: nowrap;">
                    ➕ New Supplier
                </button>
            </div>
            
            <!-- Quick Stats -->
            <div id="supplierStats" style="display: flex; gap: 1rem; margin-top: 0.75rem; font-size: 0.85rem; color: #94a3b8;">
                <span id="totalSuppliersCount">0 suppliers</span>
                <span id="activeSuppliersCount">0 active</span>
            </div>
        </div>
        
        <!-- Supplier List -->
        <div id="supplierListContainer" style="flex: 1; overflow-y: auto; padding: 1rem;">
            <div id="supplierGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;">
                <!-- Supplier cards will be rendered here -->
            </div>
            <div id="noSuppliersMessage" style="display: none; text-align: center; padding: 3rem; color: #64748b;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📭</div>
                <div style="font-size: 1.1rem;">No suppliers found</div>
                <div style="font-size: 0.9rem; margin-top: 0.5rem;">Try adjusting your search or add a new supplier</div>
            </div>
        </div>
        
        <!-- Footer -->
        <div style="padding: 1rem 1.5rem; border-top: 1px solid rgba(148, 163, 184, 0.2); display: flex; justify-content: space-between; align-items: center;">
            <div style="color: #94a3b8; font-size: 0.85rem;">
                <span id="selectedSupplierName">No supplier selected</span>
            </div>
            <div style="display: flex; gap: 0.75rem;">
                <button id="btnCancelSupplierSelection" class="btn btn-secondary">Cancel</button>
                <button id="btnConfirmSupplierSelection" class="btn btn-primary" disabled>
                    ✓ Assign Supplier
                </button>
            </div>
        </div>
    `;
    
    overlay.appendChild(modal);
    
    // Attach event listeners
    attachSupplierSelectorEvents(overlay);
    
    // Render suppliers
    renderSupplierCards();
    
    return overlay;
}

// ============================================================================
// Load Suppliers
// ============================================================================

async function loadSuppliersForSelection() {
    try {
        const res = await apiGet('/suppliers');
        
        if (res.success) {
            supplierSelectorState.allSuppliers = res.suppliers;
            supplierSelectorState.filteredSuppliers = res.suppliers;
            
            // Update stats
            const total = res.suppliers.length;
            const active = res.suppliers.filter(s => s.active).length;
            
            const totalEl = document.getElementById('totalSuppliersCount');
            const activeEl = document.getElementById('activeSuppliersCount');
            
            if (totalEl) totalEl.textContent = `${total} supplier${total !== 1 ? 's' : ''}`;
            if (activeEl) activeEl.textContent = `${active} active`;
        }
    } catch (error) {
        console.error('Failed to load suppliers:', error);
    }
}

// ============================================================================
// Render Supplier Cards
// ============================================================================

function renderSupplierCards() {
    const grid = document.getElementById('supplierGrid');
    const noMessage = document.getElementById('noSuppliersMessage');
    
    if (!grid) return;
    
    const suppliers = supplierSelectorState.filteredSuppliers;
    
    if (suppliers.length === 0) {
        grid.style.display = 'none';
        if (noMessage) noMessage.style.display = 'block';
        return;
    }
    
    grid.style.display = 'grid';
    if (noMessage) noMessage.style.display = 'none';
    
    grid.innerHTML = suppliers.map(supplier => createSupplierCard(supplier)).join('');
    
    // Attach click handlers
    suppliers.forEach(supplier => {
        const card = document.getElementById(`supplierCard_${supplier.id}`);
        if (card) {
            card.addEventListener('click', () => selectSupplier(supplier.id, supplier.name));
        }
    });
}

function createSupplierCard(supplier) {
    const isSelected = supplierSelectorState.selectedSupplierId === supplier.id;
    const isActive = supplier.active;
    
    // Performance score color
    let scoreColor = '#64748b';
    if (supplier.performance_score >= 7) scoreColor = '#22c55e';
    else if (supplier.performance_score >= 5) scoreColor = '#f59e0b';
    else if (supplier.performance_score < 5) scoreColor = '#ef4444';
    
    // Last order badge
    let lastOrderBadge = '';
    if (supplier.last_order_date) {
        const daysSince = Math.floor((new Date() - new Date(supplier.last_order_date)) / (1000 * 60 * 60 * 24));
        if (daysSince <= 30) {
            lastOrderBadge = `<span style="background: rgba(34, 197, 94, 0.1); color: #22c55e; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.7rem;">📦 ${daysSince}d ago</span>`;
        }
    }
    
    return `
        <div 
            id="supplierCard_${supplier.id}"
            class="supplier-card ${isSelected ? 'selected' : ''}"
            style="
                background: ${isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(30, 41, 59, 0.5)'};
                border: 2px solid ${isSelected ? '#3b82f6' : 'rgba(148, 163, 184, 0.2)'};
                border-radius: 12px;
                padding: 1rem;
                cursor: pointer;
                transition: all 0.2s ease;
                opacity: ${isActive ? '1' : '0.5'};
                position: relative;
            "
            onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 16px rgba(0,0,0,0.2)';"
            onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';"
        >
            <!-- Selection Indicator -->
            ${isSelected ? `
                <div style="position: absolute; top: 0.5rem; right: 0.5rem; background: #3b82f6; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem;">
                    ✓
                </div>
            ` : ''}
            
            <!-- Supplier Name -->
            <div style="font-weight: 600; font-size: 1rem; color: #e2e8f0; margin-bottom: 0.5rem; padding-right: 2rem;">
                ${supplier.name}
                ${!isActive ? '<span style="color: #ef4444; font-size: 0.75rem; margin-left: 0.5rem;">(Inactive)</span>' : ''}
            </div>
            
            <!-- Specialization -->
            ${supplier.specialization ? `
                <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.75rem;">
                    🏷️ ${supplier.specialization}
                </div>
            ` : ''}
            
            <!-- Contact Info -->
            <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem;">
                ${supplier.contact_person ? `<div>👤 ${supplier.contact_person}</div>` : ''}
                ${supplier.email ? `<div>📧 ${supplier.email}</div>` : ''}
                ${supplier.phone ? `<div>📞 ${supplier.phone}</div>` : ''}
            </div>
            
            <!-- Stats Row -->
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.1);">
                <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                    ${lastOrderBadge}
                    ${supplier.total_orders > 0 ? `
                        <span style="font-size: 0.7rem; color: #64748b;">
                            ${supplier.total_orders} order${supplier.total_orders !== 1 ? 's' : ''}
                        </span>
                    ` : ''}
                </div>
                ${supplier.performance_score ? `
                    <div style="display: flex; align-items: center; gap: 0.25rem;">
                        <span style="color: ${scoreColor}; font-size: 0.85rem;">⭐</span>
                        <span style="color: ${scoreColor}; font-size: 0.8rem; font-weight: 600;">
                            ${supplier.performance_score.toFixed(1)}
                        </span>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// ============================================================================
// Supplier Selection
// ============================================================================

function selectSupplier(supplierId, supplierName) {
    supplierSelectorState.selectedSupplierId = supplierId;
    
    // Update UI
    document.querySelectorAll('.supplier-card').forEach(card => {
        card.classList.remove('selected');
        card.style.background = 'rgba(30, 41, 59, 0.5)';
        card.style.border = '2px solid rgba(148, 163, 184, 0.2)';
    });
    
    const selectedCard = document.getElementById(`supplierCard_${supplierId}`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
        selectedCard.style.background = 'rgba(59, 130, 246, 0.15)';
        selectedCard.style.border = '2px solid #3b82f6';
    }
    
    // Update footer
    const nameEl = document.getElementById('selectedSupplierName');
    if (nameEl) nameEl.textContent = `Selected: ${supplierName}`;
    
    const confirmBtn = document.getElementById('btnConfirmSupplierSelection');
    if (confirmBtn) confirmBtn.disabled = false;
}

// ============================================================================
// Event Handlers
// ============================================================================

function attachSupplierSelectorEvents(overlay) {
    // Close button
    const closeBtn = document.getElementById('btnCloseSupplierSelector');
    if (closeBtn) {
        closeBtn.onclick = () => closeSupplierSelector(overlay);
    }
    
    // Cancel button
    const cancelBtn = document.getElementById('btnCancelSupplierSelection');
    if (cancelBtn) {
        cancelBtn.onclick = () => closeSupplierSelector(overlay);
    }
    
    // Confirm button
    const confirmBtn = document.getElementById('btnConfirmSupplierSelection');
    if (confirmBtn) {
        confirmBtn.onclick = () => confirmSupplierSelection(overlay);
    }
    
    // Search input
    const searchInput = document.getElementById('supplierSearchInput');
    if (searchInput) {
        searchInput.oninput = (e) => filterSuppliers(e.target.value);
    }
    
    // Recent filter
    const recentBtn = document.getElementById('btnFilterRecent');
    if (recentBtn) {
        recentBtn.onclick = () => toggleRecentFilter(recentBtn);
    }
    
    // Add new supplier
    const addBtn = document.getElementById('btnAddNewSupplier');
    if (addBtn) {
        addBtn.onclick = () => openQuickAddSupplier();
    }
    
    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) closeSupplierSelector(overlay);
    };
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            closeSupplierSelector(overlay);
            document.removeEventListener('keydown', escHandler);
        }
    });
}

function filterSuppliers(searchTerm) {
    supplierSelectorState.searchTerm = searchTerm.toLowerCase();
    
    let filtered = supplierSelectorState.allSuppliers;
    
    // Apply search
    if (searchTerm) {
        filtered = filtered.filter(s => {
            return (
                s.name?.toLowerCase().includes(searchTerm) ||
                s.contact_person?.toLowerCase().includes(searchTerm) ||
                s.email?.toLowerCase().includes(searchTerm) ||
                s.specialization?.toLowerCase().includes(searchTerm) ||
                s.category_tags?.toLowerCase().includes(searchTerm)
            );
        });
    }
    
    // Apply recent filter
    if (supplierSelectorState.filterRecent) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        filtered = filtered.filter(s => {
            return s.last_order_date && new Date(s.last_order_date) > thirtyDaysAgo;
        });
    }
    
    // Sort: active first, then by performance score
    filtered.sort((a, b) => {
        if (a.active !== b.active) return b.active - a.active;
        return (b.performance_score || 0) - (a.performance_score || 0);
    });
    
    supplierSelectorState.filteredSuppliers = filtered;
    renderSupplierCards();
}

function toggleRecentFilter(btn) {
    supplierSelectorState.filterRecent = !supplierSelectorState.filterRecent;
    
    if (supplierSelectorState.filterRecent) {
        btn.style.background = '#3b82f6';
        btn.style.color = 'white';
    } else {
        btn.style.background = '';
        btn.style.color = '';
    }
    
    filterSuppliers(supplierSelectorState.searchTerm);
}

function closeSupplierSelector(overlay) {
    document.body.removeChild(overlay);
}

async function confirmSupplierSelection(overlay) {
    const supplierId = supplierSelectorState.selectedSupplierId;
    const orderId = supplierSelectorState.currentOrderId;
    
    if (!supplierId || !orderId) return;
    
    try {
        // Update order with selected supplier
        const res = await apiPut(`/orders/${orderId}`, {
            supplier_id: supplierId
        });
        
        if (res.success) {
            showNotification('✅ Supplier assigned successfully', 'success');
            closeSupplierSelector(overlay);
            
            // Reload order detail if open
            if (typeof openOrderDetail === 'function') {
                await openOrderDetail(orderId);
            }
            
            // Reload orders list
            if (typeof loadOrders === 'function') {
                await loadOrders();
            }
        } else {
            showNotification('❌ ' + (res.message || 'Failed to assign supplier'), 'error');
        }
    } catch (error) {
        console.error('Failed to assign supplier:', error);
        showNotification('❌ Failed to assign supplier', 'error');
    }
}

function openQuickAddSupplier() {
    // Close current modal and open supplier form
    const overlay = document.getElementById('supplierSelectorOverlay');
    if (overlay) closeSupplierSelector(overlay);
    
    // Switch to suppliers tab and open form
    if (typeof switchTab === 'function') {
        switchTab('suppliersTab');
    }
    
    // Trigger new supplier form
    setTimeout(() => {
        const newBtn = document.getElementById('btnNewSupplier');
        if (newBtn) newBtn.click();
    }, 300);
}

// ============================================================================
// Helper: Show Notification
// ============================================================================

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        font-size: 0.9rem;
        font-weight: 500;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => document.body.removeChild(notification), 300);
    }, 3000);
}

// Add animations
if (!document.getElementById('supplierSelectorAnimations')) {
    const style = document.createElement('style');
    style.id = 'supplierSelectorAnimations';
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes slideUp {
            from { transform: translateY(50px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(400px); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

console.log('📦 Professional Supplier Selector loaded');
