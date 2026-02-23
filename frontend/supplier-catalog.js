// frontend/supplier-catalog.js - Supplier Product Catalog UI

// Inject catalog management UI into supplier detail panel
function renderSupplierCatalogUI(supplierId, supplierName) {
    return `
        <div class="catalog-section" style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(148,163,184,0.2);">
            <h4 style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                <span>📦</span> Product Catalog
            </h4>
            
            <div id="catalogStats_${supplierId}" class="catalog-stats" style="margin-bottom: 1rem;">
                <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                    <div class="stat-badge" style="background: rgba(59, 130, 246, 0.1); padding: 0.5rem 1rem; border-radius: 0.5rem;">
                        <div style="font-size: 0.75rem; color: #64748b;">Products</div>
                        <div id="statProducts_${supplierId}" style="font-size: 1.25rem; font-weight: 600; color: #3b82f6;">-</div>
                    </div>
                    <div class="stat-badge" style="background: rgba(16, 185, 129, 0.1); padding: 0.5rem 1rem; border-radius: 0.5rem;">
                        <div style="font-size: 0.75rem; color: #64748b;">Categories</div>
                        <div id="statCategories_${supplierId}" style="font-size: 1.25rem; font-weight: 600; color: #10b981;">-</div>
                    </div>
                    <div class="stat-badge" style="background: rgba(245, 158, 11, 0.1); padding: 0.5rem 1rem; border-radius: 0.5rem;">
                        <div style="font-size: 0.75rem; color: #64748b;">Brands</div>
                        <div id="statBrands_${supplierId}" style="font-size: 1.25rem; font-weight: 600; color: #f59e0b;">-</div>
                    </div>
                </div>
            </div>
            
            <div class="catalog-actions" style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                <button class="btn btn-primary btn-sm" onclick="downloadCatalogTemplate(${supplierId}, '${supplierName}')">
                    ⬇ Download Template
                </button>
                <button class="btn btn-secondary btn-sm" onclick="openCatalogUploadDialog(${supplierId}, '${supplierName}')">
                    ⬆ Upload Catalog
                </button>
                <button class="btn btn-secondary btn-sm" onclick="viewSupplierProducts(${supplierId}, '${supplierName}')">
                    👁 View Products
                </button>
            </div>
            
            <div id="uploadProgress_${supplierId}" class="upload-progress" style="margin-top: 1rem; display: none;">
                <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem; background: rgba(59, 130, 246, 0.1); border-radius: 0.5rem;">
                    <div class="spinner" style="width: 20px; height: 20px; border: 2px solid rgba(59, 130, 246, 0.3); border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <span id="uploadText_${supplierId}">Processing...</span>
                </div>
            </div>
        </div>
    `;
}

// Load catalog statistics
async function loadCatalogStats(supplierId) {
    try {
        const res = await apiGet(`/suppliers/${supplierId}/catalog-stats`);
        if (res.success) {
            const stats = res.stats;
            document.getElementById(`statProducts_${supplierId}`).textContent = stats.total_products || 0;
            document.getElementById(`statCategories_${supplierId}`).textContent = stats.total_categories || 0;
            document.getElementById(`statBrands_${supplierId}`).textContent = stats.total_brands || 0;
        }
    } catch (error) {
        console.error('Error loading catalog stats:', error);
    }
}

// Download Excel template
async function downloadCatalogTemplate(supplierId, supplierName) {
    try {
        const response = await fetch(`${API_BASE}/suppliers/${supplierId}/catalog-template`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to download template');
        }

        // Get filename from Content-Disposition header or generate one
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `PartPulse_Catalog_${supplierName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
        
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/i);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }

        // Download file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showToast('Template downloaded successfully', 'success');
    } catch (error) {
        console.error('Error downloading template:', error);
        showToast('Failed to download template', 'error');
    }
}

// Open upload dialog
function openCatalogUploadDialog(supplierId, supplierName) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3>Upload Product Catalog</h3>
                <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                <p style="margin-bottom: 1rem; color: #64748b;">
                    Upload the completed Excel template for <strong>${supplierName}</strong>.
                </p>
                
                <div class="form-group">
                    <label for="catalogFile">Select Excel File</label>
                    <input type="file" id="catalogFile" accept=".xlsx,.xls,.csv" class="form-control">
                    <small style="color: #64748b;">Accepted formats: .xlsx, .xls, .csv</small>
                </div>
                
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input type="checkbox" id="replaceExisting" style="width: auto;">
                        <span>Replace all existing products</span>
                    </label>
                    <small style="color: #64748b; margin-left: 1.5rem;">
                        If unchecked, existing products will be updated and new ones added.
                    </small>
                </div>
                
                <div id="uploadError" class="error-message hidden" style="margin-top: 1rem;"></div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="uploadCatalogFile(${supplierId}, '${supplierName}')">
                    Upload Catalog
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// Upload catalog file
async function uploadCatalogFile(supplierId, supplierName) {
    const fileInput = document.getElementById('catalogFile');
    const replaceExisting = document.getElementById('replaceExisting').checked;
    const errorDiv = document.getElementById('uploadError');
    
    errorDiv.classList.add('hidden');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        errorDiv.textContent = 'Please select a file';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    const file = fileInput.files[0];
    
    // Validate file type
    const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv'
    ];
    
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
        errorDiv.textContent = 'Invalid file type. Please upload an Excel (.xlsx, .xls) or CSV file';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    // Show progress
    const progressDiv = document.getElementById(`uploadProgress_${supplierId}`);
    const progressText = document.getElementById(`uploadText_${supplierId}`);
    if (progressDiv) {
        progressDiv.style.display = 'block';
        progressText.textContent = 'Uploading and processing catalog...';
    }
    
    try {
        const formData = new FormData();
        formData.append('catalog', file);
        formData.append('replaceExisting', replaceExisting);
        
        const response = await fetch(`${API_BASE}/suppliers/${supplierId}/catalog-upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.message || 'Upload failed');
        }
        
        // Hide progress
        if (progressDiv) {
            progressDiv.style.display = 'none';
        }
        
        // Close modal
        document.querySelector('.modal-overlay').remove();
        
        // Show success message
        showToast(
            `Catalog uploaded: ${result.inserted} new, ${result.updated} updated (${result.total} total)`,
            'success'
        );
        
        // Reload stats
        loadCatalogStats(supplierId);
        
    } catch (error) {
        console.error('Error uploading catalog:', error);
        
        if (progressDiv) {
            progressDiv.style.display = 'none';
        }
        
        errorDiv.textContent = error.message || 'Failed to upload catalog';
        errorDiv.classList.remove('hidden');
    }
}

// View supplier products
async function viewSupplierProducts(supplierId, supplierName) {
    try {
        const res = await apiGet(`/suppliers/${supplierId}/products`);
        
        if (!res.success) {
            throw new Error(res.message || 'Failed to load products');
        }
        
        const products = res.products;
        
        if (products.length === 0) {
            showToast('No products found. Upload a catalog first.', 'info');
            return;
        }
        
        // Open modal with products table
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 1200px; max-height: 80vh;">
                <div class="modal-header">
                    <h3>Products - ${supplierName}</h3>
                    <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()">✕</button>
                </div>
                <div class="modal-body" style="overflow-y: auto;">
                    <div style="margin-bottom: 1rem;">
                        <input type="text" id="productSearch" class="form-control" placeholder="🔍 Search products..." 
                            oninput="filterProductsTable()" style="max-width: 400px;">
                    </div>
                    <div style="overflow-x: auto;">
                        <table class="table" id="productsTable">
                            <thead>
                                <tr>
                                    <th>Part Number</th>
                                    <th>Description</th>
                                    <th>Brand</th>
                                    <th>Category</th>
                                    <th>Price</th>
                                    <th>Lead Time</th>
                                    <th>Stock</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${products.map(p => `
                                    <tr data-search="${(p.part_number + ' ' + p.description + ' ' + p.brand_name + ' ' + p.category).toLowerCase()}">
                                        <td><strong>${p.part_number}</strong></td>
                                        <td style="max-width: 300px;">${p.description}</td>
                                        <td><span class="badge">${p.brand_name}</span></td>
                                        <td>${p.category}</td>
                                        <td>${p.unit_price.toFixed(2)} ${p.currency}</td>
                                        <td>${p.lead_time_days} days</td>
                                        <td><span class="badge ${p.stock_status === 'In Stock' ? 'badge-success' : 'badge-warning'}">
                                            ${p.stock_status}
                                        </span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
    } catch (error) {
        console.error('Error viewing products:', error);
        showToast('Failed to load products', 'error');
    }
}

// Filter products table in modal
function filterProductsTable() {
    const searchTerm = document.getElementById('productSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#productsTable tbody tr');
    
    rows.forEach(row => {
        const searchText = row.getAttribute('data-search');
        if (searchText.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// Toast notification helper
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        border-radius: 0.5rem;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add animation styles
if (!document.getElementById('catalogAnimations')) {
    const style = document.createElement('style');
    style.id = 'catalogAnimations';
    style.textContent = `
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            padding: 1rem;
        }
        .modal-content {
            background: white;
            border-radius: 0.5rem;
            width: 100%;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }
        .modal-header {
            padding: 1.5rem;
            border-bottom: 1px solid rgba(148, 163, 184, 0.2);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .modal-body {
            padding: 1.5rem;
            overflow-y: auto;
        }
        .modal-footer {
            padding: 1rem 1.5rem;
            border-top: 1px solid rgba(148, 163, 184, 0.2);
            display: flex;
            justify-content: flex-end;
            gap: 0.75rem;
        }
    `;
    document.head.appendChild(style);
}

console.log('✅ Supplier Catalog UI loaded');
