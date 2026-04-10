// frontend/advanced-filters.js - Advanced Sorting, Filtering & Saved Presets
// PartPulse Orders v3.0

(function() {
    'use strict';

    // Multi-column sort state
    let sortColumns = []; // [{column: 'priority', direction: 'asc'}, ...]
    let savedFilters = [];
    let activeFilterPresetId = null;

    // Column definitions for sorting
    const SORT_COLUMNS = {
        id: { label: 'ID', getter: o => o.id, type: 'number' },
        item: { label: 'Item', getter: o => (o.item_description || '').toLowerCase(), type: 'string' },
        status: { label: 'Status', getter: o => {
            const ORDER = { 'New': 0, 'Pending': 1, 'Quote Requested': 2, 'Quote Received': 3, 'Quote Under Approval': 4, 'Approved': 5, 'Ordered': 6, 'In Transit': 7, 'Partially Delivered': 8, 'Delivered': 9, 'Cancelled': 10, 'On Hold': 11 };
            return ORDER[o.status] !== undefined ? ORDER[o.status] : 99;
        }, type: 'number' },
        priority: { label: 'Priority', getter: o => {
            const ORDER = { 'Urgent': 0, 'High': 1, 'Normal': 2, 'Low': 3 };
            return ORDER[o.priority] !== undefined ? ORDER[o.priority] : 2;
        }, type: 'number' },
        quantity: { label: 'Qty', getter: o => o.quantity || 0, type: 'number' },
        building: { label: 'Building', getter: o => (o.building || '').toLowerCase(), type: 'string' },
        requester: { label: 'Requester', getter: o => (o.requester_name || '').toLowerCase(), type: 'string' },
        supplier: { label: 'Supplier', getter: o => (o.supplier_name || '').toLowerCase(), type: 'string' },
        date_needed: { label: 'Date Needed', getter: o => o.date_needed ? new Date(o.date_needed).getTime() : 0, type: 'number' },
        total_price: { label: 'Total', getter: o => parseFloat(o.total_price) || 0, type: 'number' },
        created: { label: 'Created', getter: o => o.created_at ? new Date(o.created_at).getTime() : 0, type: 'number' }
    };

    function init() {
        loadSavedFilters();
        initDateRangeFilters();
        initSavedFilterUI();
        updateURLFromFilters();
        loadFiltersFromURL();
    }

    // ===================== MULTI-COLUMN SORT =====================

    function handleColumnSort(column, shiftKey) {
        const existing = sortColumns.findIndex(s => s.column === column);

        if (shiftKey) {
            // Multi-sort: toggle this column
            if (existing >= 0) {
                if (sortColumns[existing].direction === 'asc') {
                    sortColumns[existing].direction = 'desc';
                } else {
                    sortColumns.splice(existing, 1);
                }
            } else {
                sortColumns.push({ column, direction: 'asc' });
            }
        } else {
            // Single sort: replace
            if (existing >= 0 && sortColumns.length === 1) {
                if (sortColumns[0].direction === 'asc') {
                    sortColumns[0].direction = 'desc';
                } else {
                    sortColumns = [];
                }
            } else {
                sortColumns = [{ column, direction: 'asc' }];
            }
        }

        applySortAndRender();
    }

    function applySortAndRender() {
        if (sortColumns.length > 0 && window.filteredOrders) {
            window.filteredOrders.sort((a, b) => {
                // Pinned orders always first
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;

                for (const sc of sortColumns) {
                    const def = SORT_COLUMNS[sc.column];
                    if (!def) continue;
                    const va = def.getter(a);
                    const vb = def.getter(b);
                    let cmp = 0;
                    if (def.type === 'number') {
                        cmp = va - vb;
                    } else {
                        cmp = String(va).localeCompare(String(vb));
                    }
                    if (cmp !== 0) {
                        return sc.direction === 'desc' ? -cmp : cmp;
                    }
                }
                return 0;
            });
        }

        if (typeof renderOrdersTable === 'function') renderOrdersTable();
        updateSortIndicators();
    }

    function updateSortIndicators() {
        document.querySelectorAll('th.sortable').forEach(th => {
            const col = th.dataset.sortCol;
            th.classList.remove('sort-asc', 'sort-desc');
            const indicator = th.querySelector('.sort-indicator');

            const sc = sortColumns.find(s => s.column === col);
            if (sc) {
                th.classList.add(sc.direction === 'asc' ? 'sort-asc' : 'sort-desc');
                if (indicator) indicator.textContent = sc.direction === 'asc' ? '\u25B2' : '\u25BC';
            } else {
                if (indicator) indicator.textContent = '\u25B2';
            }
        });
    }

    function getSortColumnState() {
        return sortColumns;
    }

    // ===================== DATE RANGE FILTER =====================

    function initDateRangeFilters() {
        const dateFrom = document.getElementById('filterDateFrom');
        const dateTo = document.getElementById('filterDateTo');
        const costRangeMin = document.getElementById('filterCostMin');
        const costRangeMax = document.getElementById('filterCostMax');

        if (dateFrom) dateFrom.addEventListener('change', () => {
            if (window.filterState) window.filterState.dateFrom = dateFrom.value;
            if (typeof applyFilters === 'function') applyFilters();
        });
        if (dateTo) dateTo.addEventListener('change', () => {
            if (window.filterState) window.filterState.dateTo = dateTo.value;
            if (typeof applyFilters === 'function') applyFilters();
        });
        if (costRangeMin) costRangeMin.addEventListener('change', () => {
            if (window.filterState) window.filterState.costMin = costRangeMin.value;
            if (typeof applyFilters === 'function') applyFilters();
        });
        if (costRangeMax) costRangeMax.addEventListener('change', () => {
            if (window.filterState) window.filterState.costMax = costRangeMax.value;
            if (typeof applyFilters === 'function') applyFilters();
        });
    }

    // ===================== ACTIVE FILTER CHIPS =====================

    function renderActiveFilterChips() {
        const container = document.getElementById('activeFiltersBar');
        if (!container) return;

        const fs = window.filterState || {};
        const chips = [];

        if (fs.search) chips.push({ label: `Search: "${fs.search}"`, clear: () => { fs.search = ''; const el = document.getElementById('filterSearch'); if (el) el.value = ''; }});
        if (fs.status) chips.push({ label: `Status: ${fs.status}`, clear: () => { fs.status = ''; const el = document.getElementById('filterStatus'); if (el) el.value = ''; }});
        if (fs.building) chips.push({ label: `Building: ${fs.building}`, clear: () => { fs.building = ''; const el = document.getElementById('filterBuilding'); if (el) el.value = ''; }});
        if (fs.priority) chips.push({ label: `Priority: ${fs.priority}`, clear: () => { fs.priority = ''; const el = document.getElementById('filterPriority'); if (el) el.value = ''; }});
        if (fs.supplier) chips.push({ label: 'Supplier filter active', clear: () => { fs.supplier = ''; const el = document.getElementById('filterSupplier'); if (el) el.value = ''; }});
        if (fs.delivery) chips.push({ label: `Delivery: ${fs.delivery}`, clear: () => { fs.delivery = ''; const el = document.getElementById('filterDelivery'); if (el) el.value = ''; }});
        if (fs.dateFrom) chips.push({ label: `From: ${fs.dateFrom}`, clear: () => { fs.dateFrom = ''; const el = document.getElementById('filterDateFrom'); if (el) el.value = ''; }});
        if (fs.dateTo) chips.push({ label: `To: ${fs.dateTo}`, clear: () => { fs.dateTo = ''; const el = document.getElementById('filterDateTo'); if (el) el.value = ''; }});
        if (fs.quickFilter) chips.push({ label: `Quick: ${fs.quickFilter}`, clear: () => { fs.quickFilter = ''; document.querySelectorAll('.quick-filter-chip').forEach(c => c.classList.remove('active')); }});

        if (chips.length === 0) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        let html = '';
        chips.forEach((chip, i) => {
            html += `<span class="active-filter-chip" data-idx="${i}">${escapeHtml(chip.label)} <span class="chip-remove" data-idx="${i}">&times;</span></span>`;
        });
        html += `<button class="btn-link btn-sm" id="clearAllChips" style="font-size:0.72rem;">Clear All</button>`;
        container.innerHTML = html;

        container.querySelectorAll('.chip-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.idx);
                chips[idx].clear();
                if (typeof applyFilters === 'function') applyFilters();
                renderActiveFilterChips();
            });
        });

        const clearAll = container.querySelector('#clearAllChips');
        if (clearAll) {
            clearAll.addEventListener('click', () => {
                if (typeof clearFilters === 'function') clearFilters();
                renderActiveFilterChips();
            });
        }
    }

    // ===================== SAVED FILTER PRESETS =====================

    async function loadSavedFilters() {
        if (!window.authToken) return;
        try {
            const res = await fetch('/api/saved-filters', {
                headers: { 'Authorization': `Bearer ${window.authToken}` }
            });
            const data = await res.json();
            if (data.success) {
                savedFilters = data.filters || [];
                renderSavedFilterButtons();
            }
        } catch (err) {
            // API might not exist yet - use localStorage fallback
            savedFilters = JSON.parse(localStorage.getItem('pp_saved_filters') || '[]');
            renderSavedFilterButtons();
        }
    }

    function initSavedFilterUI() {
        const saveBtn = document.getElementById('btnSaveFilter');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveCurrentFilter);
        }
    }

    async function saveCurrentFilter() {
        const name = prompt('Save filter preset as:');
        if (!name) return;

        const config = { ...(window.filterState || {}) };

        try {
            const res = await fetch('/api/saved-filters', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, filter_config: config })
            });
            const data = await res.json();
            if (data.success) {
                savedFilters.push(data.filter);
                renderSavedFilterButtons();
                if (window.Toast) window.Toast.show(`Filter "${name}" saved`, 'success');
            }
        } catch (err) {
            // Fallback to localStorage
            savedFilters.push({ id: Date.now(), name, filter_config: config });
            localStorage.setItem('pp_saved_filters', JSON.stringify(savedFilters));
            renderSavedFilterButtons();
            if (window.Toast) window.Toast.show(`Filter "${name}" saved locally`, 'success');
        }
    }

    function renderSavedFilterButtons() {
        const container = document.getElementById('savedFiltersRow');
        if (!container) return;

        if (savedFilters.length === 0) {
            container.innerHTML = '';
            return;
        }

        let html = '<span style="font-size:0.72rem;color:var(--color-muted);margin-right:0.3rem;">Saved:</span>';
        savedFilters.forEach(f => {
            const isActive = activeFilterPresetId === f.id;
            html += `<button class="saved-filter-btn ${isActive ? 'active' : ''}" data-id="${f.id}" title="Click to apply, right-click to delete">${escapeHtml(f.name)}</button>`;
        });
        container.innerHTML = html;

        container.querySelectorAll('.saved-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id) || btn.dataset.id;
                applySavedFilter(id);
            });
            btn.addEventListener('contextmenu', async (e) => {
                e.preventDefault();
                const id = parseInt(btn.dataset.id) || btn.dataset.id;
                if (confirm('Delete this saved filter?')) {
                    await deleteSavedFilter(id);
                }
            });
        });
    }

    function applySavedFilter(id) {
        const filter = savedFilters.find(f => f.id === id || f.id === parseInt(id));
        if (!filter) return;

        const config = typeof filter.filter_config === 'string' ? JSON.parse(filter.filter_config) : filter.filter_config;

        if (window.filterState) {
            Object.assign(window.filterState, config);
        }

        // Update UI elements
        const mappings = {
            search: 'filterSearch',
            status: 'filterStatus',
            building: 'filterBuilding',
            priority: 'filterPriority',
            supplier: 'filterSupplier',
            delivery: 'filterDelivery'
        };

        Object.entries(mappings).forEach(([key, elId]) => {
            const el = document.getElementById(elId);
            if (el) el.value = config[key] || '';
        });

        activeFilterPresetId = id;
        renderSavedFilterButtons();
        if (typeof applyFilters === 'function') applyFilters();
    }

    async function deleteSavedFilter(id) {
        try {
            await fetch(`/api/saved-filters/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${window.authToken}` }
            });
        } catch (err) {}

        savedFilters = savedFilters.filter(f => f.id !== id && f.id !== parseInt(id));
        localStorage.setItem('pp_saved_filters', JSON.stringify(savedFilters));
        renderSavedFilterButtons();
        if (window.Toast) window.Toast.show('Filter deleted', 'info');
    }

    // ===================== URL-BASED FILTER STATE =====================

    function updateURLFromFilters() {
        // Called after filter changes to update URL for sharing
        const fs = window.filterState;
        if (!fs) return;

        const params = new URLSearchParams();
        if (fs.search) params.set('search', fs.search);
        if (fs.status) params.set('status', fs.status);
        if (fs.building) params.set('building', fs.building);
        if (fs.priority) params.set('priority', fs.priority);
        if (fs.supplier) params.set('supplier', fs.supplier);
        if (fs.delivery) params.set('delivery', fs.delivery);

        const newUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
        window.history.replaceState({}, '', newUrl);
    }

    function loadFiltersFromURL() {
        const params = new URLSearchParams(window.location.search);
        if (params.size === 0) return;

        if (window.filterState) {
            if (params.get('search')) window.filterState.search = params.get('search');
            if (params.get('status')) window.filterState.status = params.get('status');
            if (params.get('building')) window.filterState.building = params.get('building');
            if (params.get('priority')) window.filterState.priority = params.get('priority');
            if (params.get('supplier')) window.filterState.supplier = params.get('supplier');
            if (params.get('delivery')) window.filterState.delivery = params.get('delivery');
        }

        // Update UI
        const mappings = {
            search: 'filterSearch',
            status: 'filterStatus',
            building: 'filterBuilding',
            priority: 'filterPriority',
            supplier: 'filterSupplier',
            delivery: 'filterDelivery'
        };
        Object.entries(mappings).forEach(([key, elId]) => {
            const val = params.get(key);
            if (val) {
                const el = document.getElementById(elId);
                if (el) el.value = val;
            }
        });
    }

    // Expose globally
    window.AdvancedFilters = {
        init,
        handleColumnSort,
        getSortState: getSortColumnState,
        renderActiveChips: renderActiveFilterChips,
        loadSavedFilters,
        updateURL: updateURLFromFilters
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
