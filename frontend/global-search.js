// frontend/global-search.js - Global Search (Ctrl+K / Cmd+K)
// PartPulse Orders v3.0 - World-Class Upgrade

(function() {
    'use strict';

    let searchOverlay = null;
    let searchInput = null;
    let searchResults = null;
    let recentSearches = JSON.parse(localStorage.getItem('pp_recent_searches') || '[]');
    let focusedIdx = -1;
    let debounceTimer = null;

    function init() {
        createSearchUI();
        bindKeyboardShortcut();
        bindTriggerButton();
    }

    function createSearchUI() {
        // Search overlay
        searchOverlay = document.createElement('div');
        searchOverlay.className = 'search-overlay hidden';
        searchOverlay.id = 'globalSearchOverlay';
        searchOverlay.innerHTML = `
            <div class="search-modal">
                <div class="search-input-wrapper">
                    <span class="search-icon">&#128269;</span>
                    <input type="text" id="globalSearchInput" placeholder="Search orders, suppliers, parts..." autocomplete="off">
                    <kbd>Esc</kbd>
                </div>
                <div id="globalSearchResults" class="search-results"></div>
                <div class="search-footer">
                    <span><kbd>&#8593;</kbd><kbd>&#8595;</kbd> Navigate</span>
                    <span><kbd>Enter</kbd> Open</span>
                    <span><kbd>Esc</kbd> Close</span>
                </div>
            </div>
        `;
        document.body.appendChild(searchOverlay);

        searchInput = document.getElementById('globalSearchInput');
        searchResults = document.getElementById('globalSearchResults');

        searchInput.addEventListener('input', onSearchInput);
        searchInput.addEventListener('keydown', onSearchKeydown);
        searchOverlay.addEventListener('click', (e) => {
            if (e.target === searchOverlay) closeSearch();
        });
    }

    function bindKeyboardShortcut() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+K or Cmd+K
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                openSearch();
            }
            // / key when not in input
            if (e.key === '/' && !isInputFocused()) {
                e.preventDefault();
                openSearch();
            }
        });
    }

    function bindTriggerButton() {
        const trigger = document.getElementById('globalSearchTrigger');
        if (trigger) {
            trigger.addEventListener('click', openSearch);
        }
    }

    function isInputFocused() {
        const active = document.activeElement;
        return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable);
    }

    function openSearch() {
        searchOverlay.classList.remove('hidden');
        searchInput.value = '';
        searchInput.focus();
        focusedIdx = -1;
        showRecentSearches();
    }

    function closeSearch() {
        searchOverlay.classList.add('hidden');
        searchInput.value = '';
        searchResults.innerHTML = '';
    }

    function showRecentSearches() {
        if (recentSearches.length === 0) {
            searchResults.innerHTML = '<div class="search-empty">Type to search across all orders, suppliers, and parts</div>';
            return;
        }
        let html = '<div class="search-recent-header">Recent Searches</div>';
        recentSearches.slice(0, 5).forEach((term, i) => {
            html += `<div class="search-result-item" data-recent="${i}">
                <span class="result-icon">&#128339;</span>
                <div class="result-content">
                    <div class="result-title">${escapeHtml(term)}</div>
                </div>
            </div>`;
        });
        searchResults.innerHTML = html;
        bindResultClicks();
    }

    function onSearchInput() {
        clearTimeout(debounceTimer);
        const query = searchInput.value.trim();
        if (!query) {
            showRecentSearches();
            return;
        }
        debounceTimer = setTimeout(() => performSearch(query), 150);
    }

    function performSearch(query) {
        if (!window.ordersState) return;
        const term = query.toLowerCase();
        const results = [];

        // Search orders
        (window.ordersState || []).forEach(order => {
            const searchFields = [
                String(order.id),
                order.item_description || '',
                order.part_number || '',
                order.category || '',
                order.notes || '',
                order.requester_name || '',
                order.supplier_name || '',
                order.building || '',
                order.status || '',
                order.cost_center_code || '',
                order.cost_center_name || '',
                order.quote_number || ''
            ].join(' ').toLowerCase();

            if (searchFields.includes(term)) {
                results.push({
                    type: 'order',
                    id: order.id,
                    title: `#${order.id} — ${order.item_description}`,
                    meta: `${order.status} | ${order.building} | ${order.requester_name}`,
                    icon: '&#128230;',
                    order: order
                });
            }
        });

        // Search suppliers
        (window.suppliersState || []).forEach(supplier => {
            const fields = [supplier.name, supplier.contact_person, supplier.email, supplier.phone].join(' ').toLowerCase();
            if (fields.includes(term)) {
                results.push({
                    type: 'supplier',
                    id: supplier.id,
                    title: supplier.name,
                    meta: `${supplier.contact_person || ''} | ${supplier.email || ''}`,
                    icon: '&#127970;'
                });
            }
        });

        renderResults(results, query);

        // Save to recent
        if (query.length >= 2) {
            recentSearches = [query, ...recentSearches.filter(s => s !== query)].slice(0, 10);
            localStorage.setItem('pp_recent_searches', JSON.stringify(recentSearches));
        }
    }

    function renderResults(results, query) {
        focusedIdx = -1;
        if (results.length === 0) {
            searchResults.innerHTML = `<div class="search-empty">No results for "${escapeHtml(query)}"</div>`;
            return;
        }

        let html = '';
        const maxResults = 20;
        results.slice(0, maxResults).forEach((r, i) => {
            const highlighted = highlightMatch(r.title, query);
            html += `<div class="search-result-item" data-type="${r.type}" data-id="${r.id}" data-idx="${i}">
                <span class="result-icon">${r.icon}</span>
                <div class="result-content">
                    <div class="result-title">${highlighted}</div>
                    <div class="result-meta">${escapeHtml(r.meta)}</div>
                </div>
            </div>`;
        });

        if (results.length > maxResults) {
            html += `<div class="search-empty">+${results.length - maxResults} more results</div>`;
        }

        searchResults.innerHTML = html;
        bindResultClicks();
    }

    function highlightMatch(text, query) {
        const escaped = escapeHtml(text);
        const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
        return escaped.replace(regex, '<mark>$1</mark>');
    }

    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function bindResultClicks() {
        searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                if (item.dataset.recent !== undefined) {
                    const term = recentSearches[parseInt(item.dataset.recent)];
                    searchInput.value = term;
                    performSearch(term);
                    return;
                }
                handleResultSelect(item.dataset.type, parseInt(item.dataset.id));
            });
        });
    }

    function handleResultSelect(type, id) {
        closeSearch();
        if (type === 'order') {
            // Switch to orders tab and open detail
            if (typeof switchTab === 'function') switchTab('ordersTab');
            if (typeof openOrderDetail === 'function') openOrderDetail(id);
        } else if (type === 'supplier') {
            if (typeof switchTab === 'function') switchTab('suppliersTab');
        }
    }

    function onSearchKeydown(e) {
        const items = searchResults.querySelectorAll('.search-result-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusedIdx = Math.min(focusedIdx + 1, items.length - 1);
            updateFocus(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusedIdx = Math.max(focusedIdx - 1, 0);
            updateFocus(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (focusedIdx >= 0 && items[focusedIdx]) {
                items[focusedIdx].click();
            }
        } else if (e.key === 'Escape') {
            closeSearch();
        }
    }

    function updateFocus(items) {
        items.forEach((item, i) => {
            item.classList.toggle('focused', i === focusedIdx);
        });
        if (items[focusedIdx]) {
            items[focusedIdx].scrollIntoView({ block: 'nearest' });
        }
    }

    // Make available globally
    window.GlobalSearch = { open: openSearch, close: closeSearch };

    // Init on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
