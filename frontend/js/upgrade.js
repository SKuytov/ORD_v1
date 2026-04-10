/**
 * PartPulse Orders v3.0 - World-Class Upgrade
 * Main upgrade JavaScript file
 *
 * This file enhances the existing PartPulse Orders application with 22 new features.
 * It wraps everything in an IIFE and exposes the PartPulseUpgrade namespace.
 *
 * Dependencies (globals from app.js):
 *   currentUser, authToken, ordersState, filteredOrders, suppliersState,
 *   quotesState, currentTab, apiGet, apiPost, apiPut, apiDelete,
 *   loadOrders, loadSuppliers, loadQuotes, escapeHtml, fmtPrice,
 *   ORDER_STATUSES, switchTab, filterState, applyFilters, renderOrdersTable,
 *   openOrderDetail, openProcCreateOrderModal
 */

(function () {
    'use strict';

    // =========================================================================
    // NAMESPACE
    // =========================================================================

    var PU = {};
    window.PartPulseUpgrade = PU;

    // =========================================================================
    // UTILITY HELPERS
    // =========================================================================

    function isRequester() {
        return currentUser && currentUser.role === 'requester';
    }

    function isAdmin() {
        return currentUser && currentUser.role === 'admin';
    }

    function isProcurement() {
        return currentUser && currentUser.role === 'procurement';
    }

    function isManager() {
        return currentUser && currentUser.role === 'manager';
    }

    function canSeePrices() {
        return currentUser && currentUser.role !== 'requester';
    }

    function canSeeSuppliers() {
        return currentUser && currentUser.role !== 'requester';
    }

    function debounce(fn, delay) {
        var timer;
        return function () {
            var ctx = this, args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
        };
    }

    function safeEscape(str) {
        if (typeof escapeHtml === 'function') return escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c;
        });
    }

    function safeFmtPrice(val) {
        if (typeof fmtPrice === 'function') return fmtPrice(val);
        var n = parseFloat(val);
        if (isNaN(n) || n === 0) return '-';
        return n.toFixed(2);
    }

    function formatDateShort(dateStr) {
        if (!dateStr) return '-';
        var d = new Date(dateStr);
        if (isNaN(d)) return dateStr;
        return d.toLocaleDateString();
    }

    function injectCSS(id, css) {
        if (document.getElementById(id)) return;
        var style = document.createElement('style');
        style.id = id;
        style.textContent = css;
        document.head.appendChild(style);
    }

    function createEl(tag, attrs, html) {
        var el = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (k) {
                if (k === 'className') el.className = attrs[k];
                else if (k === 'style' && typeof attrs[k] === 'object') {
                    Object.keys(attrs[k]).forEach(function (s) { el.style[s] = attrs[k][s]; });
                } else el.setAttribute(k, attrs[k]);
            });
        }
        if (html) el.innerHTML = html;
        return el;
    }

    // =========================================================================
    // FEATURE 1: GLOBAL SEARCH (Ctrl+K / Cmd+K)
    // =========================================================================

    PU.GlobalSearch = (function () {
        var overlay = null;
        var input = null;
        var resultsContainer = null;
        var RECENT_KEY = 'pp_recent_searches';
        var MAX_RECENT = 5;

        function getRecentSearches() {
            try {
                return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
            } catch (e) { return []; }
        }

        function saveRecentSearch(term) {
            if (!term || !term.trim()) return;
            var recent = getRecentSearches();
            recent = recent.filter(function (r) { return r !== term; });
            recent.unshift(term);
            if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
            localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
        }

        function highlightMatch(text, term) {
            if (!text || !term) return safeEscape(text);
            var escaped = safeEscape(text);
            var termEscaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            var regex = new RegExp('(' + termEscaped + ')', 'gi');
            return escaped.replace(regex, '<mark>$1</mark>');
        }

        function search(term) {
            if (!term || !term.trim()) {
                showRecent();
                return;
            }
            var lower = term.toLowerCase();
            var results = (ordersState || []).filter(function (o) {
                var fields = [
                    String(o.id || ''),
                    o.item_description || '',
                    o.part_number || '',
                    o.supplier_name || '',
                    o.notes || '',
                    o.category || '',
                    o.building || '',
                    o.status || '',
                    o.requester_name || ''
                ].join(' ').toLowerCase();
                return fields.indexOf(lower) !== -1;
            }).slice(0, 20);

            if (!results.length) {
                resultsContainer.innerHTML = '<div class="pp-gs-empty">No results found</div>';
                return;
            }

            var html = results.map(function (o) {
                var desc = highlightMatch(o.item_description || '', term);
                var id = highlightMatch(String(o.id), term);
                var pn = o.part_number ? ' | ' + highlightMatch(o.part_number, term) : '';
                var supplier = (canSeeSuppliers() && o.supplier_name) ? ' | ' + highlightMatch(o.supplier_name, term) : '';
                return '<div class="pp-gs-result" data-order-id="' + o.id + '">' +
                    '<div class="pp-gs-result-main">' +
                    '<span class="pp-gs-result-id">#' + id + '</span> ' +
                    '<span class="pp-gs-result-desc">' + desc + '</span>' +
                    '</div>' +
                    '<div class="pp-gs-result-meta">' +
                    '<span class="status-badge status-' + (o.status || '').toLowerCase().replace(/ /g, '-') + '">' + safeEscape(o.status) + '</span>' +
                    pn + supplier +
                    '</div>' +
                    '</div>';
            }).join('');

            resultsContainer.innerHTML = html;
            attachResultListeners();
        }

        function showRecent() {
            var recent = getRecentSearches();
            if (!recent.length) {
                resultsContainer.innerHTML = '<div class="pp-gs-empty">Type to search orders by ID, description, part number, supplier, or category</div>';
                return;
            }
            var html = '<div class="pp-gs-recent-header">Recent Searches</div>';
            html += recent.map(function (r) {
                return '<div class="pp-gs-recent-item" data-term="' + safeEscape(r) + '">' +
                    '<span class="pp-gs-recent-icon">&#128339;</span> ' + safeEscape(r) +
                    '</div>';
            }).join('');
            resultsContainer.innerHTML = html;

            resultsContainer.querySelectorAll('.pp-gs-recent-item').forEach(function (el) {
                el.addEventListener('click', function () {
                    input.value = el.dataset.term;
                    search(el.dataset.term);
                });
            });
        }

        function attachResultListeners() {
            resultsContainer.querySelectorAll('.pp-gs-result').forEach(function (el) {
                el.addEventListener('click', function () {
                    var orderId = parseInt(el.dataset.orderId, 10);
                    saveRecentSearch(input.value.trim());
                    close();
                    if (typeof openOrderDetail === 'function') {
                        openOrderDetail(orderId);
                    } else {
                        var row = document.querySelector('tr[data-id="' + orderId + '"] .btn-view-order');
                        if (row) row.click();
                    }
                });
            });
        }

        function open() {
            if (!overlay) return;
            overlay.classList.remove('hidden');
            input.value = '';
            input.focus();
            showRecent();
        }

        function close() {
            if (!overlay) return;
            overlay.classList.add('hidden');
        }

        function init() {
            // Inject CSS
            injectCSS('pp-gs-styles', [
                '.pp-gs-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:10000; display:flex; align-items:flex-start; justify-content:center; padding-top:15vh; }',
                '.pp-gs-overlay.hidden { display:none; }',
                '.pp-gs-container { background:var(--bg-card,#fff); border-radius:12px; width:600px; max-width:90vw; box-shadow:0 20px 60px rgba(0,0,0,0.3); overflow:hidden; }',
                '.pp-gs-input-wrap { padding:16px; border-bottom:1px solid var(--border-color,#e5e7eb); display:flex; align-items:center; gap:8px; }',
                '.pp-gs-input-wrap .pp-gs-icon { font-size:1.2rem; opacity:0.5; }',
                '.pp-gs-input { flex:1; border:none; outline:none; font-size:1rem; background:transparent; color:var(--text-primary,#111); }',
                '.pp-gs-input::placeholder { color:var(--text-muted,#9ca3af); }',
                '.pp-gs-results { max-height:400px; overflow-y:auto; padding:8px 0; }',
                '.pp-gs-result { padding:10px 16px; cursor:pointer; transition:background 0.15s; }',
                '.pp-gs-result:hover { background:var(--bg-hover,#f3f4f6); }',
                '.pp-gs-result-main { display:flex; align-items:center; gap:8px; }',
                '.pp-gs-result-id { font-weight:600; color:var(--primary,#2563eb); font-size:0.85rem; }',
                '.pp-gs-result-desc { font-size:0.9rem; }',
                '.pp-gs-result-meta { font-size:0.78rem; color:var(--text-muted,#6b7280); margin-top:2px; display:flex; align-items:center; gap:6px; }',
                '.pp-gs-empty { padding:24px 16px; text-align:center; color:var(--text-muted,#9ca3af); font-size:0.9rem; }',
                '.pp-gs-recent-header { padding:8px 16px; font-size:0.75rem; text-transform:uppercase; color:var(--text-muted,#9ca3af); font-weight:600; letter-spacing:0.5px; }',
                '.pp-gs-recent-item { padding:8px 16px; cursor:pointer; transition:background 0.15s; font-size:0.9rem; }',
                '.pp-gs-recent-item:hover { background:var(--bg-hover,#f3f4f6); }',
                '.pp-gs-recent-icon { opacity:0.4; }',
                '.pp-gs-result mark { background:#fef08a; color:inherit; border-radius:2px; padding:0 1px; }'
            ].join('\n'));

            // Create overlay
            overlay = createEl('div', { className: 'pp-gs-overlay hidden', id: 'ppGlobalSearchOverlay' });
            var container = createEl('div', { className: 'pp-gs-container' });
            var inputWrap = createEl('div', { className: 'pp-gs-input-wrap' },
                '<span class="pp-gs-icon">&#128269;</span>');
            input = createEl('input', { className: 'pp-gs-input', type: 'text', placeholder: 'Search orders...' });
            inputWrap.appendChild(input);
            container.appendChild(inputWrap);
            resultsContainer = createEl('div', { className: 'pp-gs-results' });
            container.appendChild(resultsContainer);
            overlay.appendChild(container);
            document.body.appendChild(overlay);

            // Input handler
            input.addEventListener('input', debounce(function () {
                search(input.value.trim());
            }, 200));

            // Close on overlay click
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) close();
            });

            // Escape to close
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') {
                    close();
                    e.stopPropagation();
                }
                if (e.key === 'Enter') {
                    var first = resultsContainer.querySelector('.pp-gs-result');
                    if (first) first.click();
                }
                if (e.key === 'ArrowDown') {
                    var firstResult = resultsContainer.querySelector('.pp-gs-result');
                    if (firstResult) firstResult.focus();
                    e.preventDefault();
                }
            });

            // Hook into existing global search trigger
            var trigger = document.getElementById('globalSearchTrigger');
            if (trigger) {
                trigger.addEventListener('click', function (e) {
                    e.preventDefault();
                    open();
                });
            }

            // Keyboard shortcut Ctrl+K / Cmd+K
            document.addEventListener('keydown', function (e) {
                if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                    e.preventDefault();
                    open();
                }
            });
        }

        return { init: init, open: open, close: close };
    })();


    // =========================================================================
    // FEATURE 2: MULTI-COLUMN SORT
    // =========================================================================

    PU.TableSort = (function () {
        var sortState = { primary: null, secondary: null };
        var observer = null;

        function getSortValue(order, field) {
            switch (field) {
                case 'id': return order.id || 0;
                case 'item': return (order.item_description || '').toLowerCase();
                case 'quantity': return order.quantity || 0;
                case 'status': return order.status || '';
                case 'priority':
                    var PRIO = { 'Urgent': 1, 'High': 2, 'Normal': 3, 'Low': 4 };
                    return PRIO[order.priority] || 3;
                case 'requester': return (order.requester_name || '').toLowerCase();
                case 'supplier': return (order.supplier_name || '').toLowerCase();
                case 'date_needed': return order.date_needed ? new Date(order.date_needed).getTime() : 0;
                case 'total_price': return parseFloat(order.total_price) || 0;
                default: return '';
            }
        }

        function comparator(a, b, field, direction) {
            var va = getSortValue(a, field);
            var vb = getSortValue(b, field);
            var mult = direction === 'desc' ? -1 : 1;
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mult;
            if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * mult;
            return 0;
        }

        function applySort() {
            if (!sortState.primary) return;
            filteredOrders.sort(function (a, b) {
                var result = comparator(a, b, sortState.primary.field, sortState.primary.direction);
                if (result === 0 && sortState.secondary) {
                    result = comparator(a, b, sortState.secondary.field, sortState.secondary.direction);
                }
                return result;
            });
        }

        function updateHeaderClasses() {
            var table = document.querySelector('#ordersTable table');
            if (!table) return;
            table.querySelectorAll('th.sortable, th.sort-header').forEach(function (th) {
                th.classList.remove('sort-asc', 'sort-desc', 'sort-header', 'sort-secondary');
                th.classList.add('sort-header');
                var col = th.dataset.sortCol;
                if (sortState.primary && sortState.primary.field === col) {
                    th.classList.add(sortState.primary.direction === 'asc' ? 'sort-asc' : 'sort-desc');
                } else if (sortState.secondary && sortState.secondary.field === col) {
                    th.classList.add(sortState.secondary.direction === 'asc' ? 'sort-asc' : 'sort-desc');
                    th.classList.add('sort-secondary');
                }
            });
        }

        function attachHeaders() {
            var table = document.querySelector('#ordersTable table');
            if (!table) return;
            table.querySelectorAll('th.sortable, th[data-sort-col]').forEach(function (th) {
                if (th._ppSortBound) return;
                th._ppSortBound = true;
                th.classList.add('sort-header');
                th.style.cursor = 'pointer';
                th.addEventListener('click', function (e) {
                    var col = th.dataset.sortCol;
                    if (!col) return;

                    if (e.shiftKey && sortState.primary && sortState.primary.field !== col) {
                        // Secondary sort
                        if (sortState.secondary && sortState.secondary.field === col) {
                            sortState.secondary.direction = sortState.secondary.direction === 'asc' ? 'desc' : 'asc';
                        } else {
                            sortState.secondary = { field: col, direction: 'asc' };
                        }
                    } else {
                        // Primary sort
                        if (sortState.primary && sortState.primary.field === col) {
                            sortState.primary.direction = sortState.primary.direction === 'asc' ? 'desc' : 'asc';
                        } else {
                            sortState.primary = { field: col, direction: 'asc' };
                            sortState.secondary = null;
                        }
                    }

                    applySort();
                    if (typeof renderOrdersTable === 'function') renderOrdersTable();
                });
            });
            updateHeaderClasses();
        }

        function init() {
            injectCSS('pp-sort-styles', [
                'th.sort-header { cursor:pointer; user-select:none; position:relative; }',
                'th.sort-header:hover { background:var(--bg-hover,#f3f4f6); }',
                'th.sort-asc .sort-indicator { opacity:1; }',
                'th.sort-desc .sort-indicator { opacity:1; transform:rotate(180deg); }',
                'th.sort-secondary { border-bottom:2px dashed var(--primary,#2563eb); }'
            ].join('\n'));

            // Use MutationObserver to re-attach headers after table re-renders
            var target = document.getElementById('ordersTable');
            if (target) {
                observer = new MutationObserver(function () {
                    setTimeout(attachHeaders, 50);
                });
                observer.observe(target, { childList: true, subtree: true });
            }

            attachHeaders();
        }

        return { init: init, getState: function () { return sortState; } };
    })();


    // =========================================================================
    // FEATURE 3: DARK MODE TOGGLE
    // =========================================================================

    PU.DarkMode = (function () {
        var PREF_KEY = 'pp_theme';
        var btn = null;

        function applyTheme(theme) {
            if (theme === 'light') {
                document.body.classList.add('light-theme');
                document.body.classList.remove('dark-theme');
            } else {
                document.body.classList.remove('light-theme');
                document.body.classList.add('dark-theme');
            }
            if (btn) {
                btn.innerHTML = theme === 'light' ? '&#9790;' : '&#9728;';
                btn.title = theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode';
            }
        }

        function toggle() {
            var current = localStorage.getItem(PREF_KEY) || 'light';
            var next = current === 'light' ? 'dark' : 'light';
            localStorage.setItem(PREF_KEY, next);
            applyTheme(next);
        }

        function init() {
            injectCSS('pp-darkmode-styles', [
                '.pp-darkmode-btn { background:none; border:1px solid var(--border-color,#e5e7eb); border-radius:8px; padding:4px 10px; cursor:pointer; font-size:1.2rem; line-height:1; transition:background 0.2s; }',
                '.pp-darkmode-btn:hover { background:var(--bg-hover,#f3f4f6); }'
            ].join('\n'));

            btn = createEl('button', { className: 'pp-darkmode-btn', id: 'ppDarkModeToggle', title: 'Toggle Dark Mode' });
            btn.addEventListener('click', toggle);

            var headerActions = document.querySelector('.header-actions');
            if (headerActions) {
                headerActions.insertBefore(btn, headerActions.firstChild);
            }

            var saved = localStorage.getItem(PREF_KEY) || 'light';
            applyTheme(saved);
        }

        return { init: init, toggle: toggle };
    })();


    // =========================================================================
    // FEATURE 4: NOTIFICATION BELL
    // =========================================================================

    PU.Notifications = (function () {
        var pollInterval = null;
        var dropdownOpen = false;

        function updateBadge(count) {
            var badge = document.getElementById('bellBadge');
            if (!badge) return;
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : String(count);
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        async function fetchUnreadCount() {
            try {
                var res = await apiGet('/notifications/unread-count');
                if (res && typeof res.count === 'number') {
                    updateBadge(res.count);
                } else if (res && typeof res.unread_count === 'number') {
                    updateBadge(res.unread_count);
                }
            } catch (e) {
                // Silently fail - notifications are non-critical
            }
        }

        async function loadNotifications() {
            var body = document.getElementById('notificationDropdownBody');
            if (!body) return;
            body.innerHTML = '<div class="notification-empty">Loading...</div>';
            try {
                var res = await apiGet('/notifications', { limit: 10 });
                var notifications = res.notifications || res.data || [];
                if (!notifications.length) {
                    body.innerHTML = '<div class="notification-empty">No notifications</div>';
                    return;
                }
                var html = notifications.map(function (n) {
                    var readClass = n.read || n.is_read ? 'notification-read' : 'notification-unread';
                    var timeStr = n.created_at ? formatDateShort(n.created_at) : '';
                    return '<div class="notification-item ' + readClass + '" data-id="' + n.id + '" data-order-id="' + (n.order_id || '') + '">' +
                        '<div class="notification-item-text">' + safeEscape(n.message || n.title || '') + '</div>' +
                        '<div class="notification-item-time">' + timeStr + '</div>' +
                        '</div>';
                }).join('');
                body.innerHTML = html;

                body.querySelectorAll('.notification-item').forEach(function (el) {
                    el.addEventListener('click', function () {
                        var nid = el.dataset.id;
                        var orderId = el.dataset.orderId;
                        markAsRead(nid);
                        el.classList.remove('notification-unread');
                        el.classList.add('notification-read');
                        closeDropdown();
                        if (orderId && typeof openOrderDetail === 'function') {
                            openOrderDetail(parseInt(orderId, 10));
                        }
                    });
                });
            } catch (e) {
                body.innerHTML = '<div class="notification-empty">Failed to load</div>';
            }
        }

        async function markAsRead(notificationId) {
            try {
                await apiPut('/notifications/' + notificationId + '/read', {});
                fetchUnreadCount();
            } catch (e) { /* ignore */ }
        }

        async function markAllRead() {
            try {
                await apiPut('/notifications/read-all', {});
                updateBadge(0);
                var items = document.querySelectorAll('.notification-item.notification-unread');
                items.forEach(function (el) {
                    el.classList.remove('notification-unread');
                    el.classList.add('notification-read');
                });
            } catch (e) { /* ignore */ }
        }

        function openDropdown() {
            var dropdown = document.getElementById('notificationDropdown');
            if (dropdown) dropdown.classList.remove('hidden');
            dropdownOpen = true;
            loadNotifications();
        }

        function closeDropdown() {
            var dropdown = document.getElementById('notificationDropdown');
            if (dropdown) dropdown.classList.add('hidden');
            dropdownOpen = false;
        }

        function init() {
            injectCSS('pp-notif-styles', [
                '.notification-unread { background:var(--bg-highlight,#eff6ff); font-weight:500; }',
                '.notification-read { opacity:0.7; }',
                '.notification-item { padding:10px 14px; cursor:pointer; border-bottom:1px solid var(--border-color,#e5e7eb); transition:background 0.15s; }',
                '.notification-item:hover { background:var(--bg-hover,#f3f4f6); }',
                '.notification-item-text { font-size:0.85rem; }',
                '.notification-item-time { font-size:0.72rem; color:var(--text-muted,#9ca3af); margin-top:2px; }'
            ].join('\n'));

            var bell = document.getElementById('notificationBell');
            if (bell) {
                bell.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (dropdownOpen) closeDropdown();
                    else openDropdown();
                });
            }

            var markAllBtn = document.getElementById('markAllRead');
            if (markAllBtn) {
                markAllBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    markAllRead();
                });
            }

            // Close on outside click
            document.addEventListener('click', function (e) {
                if (dropdownOpen) {
                    var dropdown = document.getElementById('notificationDropdown');
                    var bellEl = document.getElementById('notificationBell');
                    if (dropdown && !dropdown.contains(e.target) && bellEl && !bellEl.contains(e.target)) {
                        closeDropdown();
                    }
                }
            });

            // Initial fetch
            fetchUnreadCount();

            // Poll every 60 seconds
            pollInterval = setInterval(fetchUnreadCount, 60000);
        }

        function destroy() {
            if (pollInterval) clearInterval(pollInterval);
        }

        return { init: init, destroy: destroy, fetchUnreadCount: fetchUnreadCount };
    })();


    // =========================================================================
    // FEATURE 5: KEYBOARD SHORTCUTS
    // =========================================================================

    PU.KeyboardShortcuts = (function () {
        var helpModal = null;

        var SHORTCUTS = [
            { key: '?', desc: 'Show keyboard shortcuts' },
            { key: 'N', desc: 'Create new order' },
            { key: '/ or Ctrl+K', desc: 'Open global search' },
            { key: 'Escape', desc: 'Close modal / panel' },
            { key: '1-9', desc: 'Switch tab by number' }
        ];

        var TAB_MAP = {
            '1': 'ordersTab',
            '2': 'quotesTab',
            '3': 'approvalsTab',
            '4': 'suppliersTab',
            '5': 'analyticsTab',
            '6': 'buildingsTab',
            '7': 'costCentersTab',
            '8': 'usersTab'
        };

        function isTyping() {
            var el = document.activeElement;
            if (!el) return false;
            var tag = el.tagName.toLowerCase();
            return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
        }

        function showHelp() {
            if (!helpModal) createHelpModal();
            helpModal.classList.remove('hidden');
        }

        function hideHelp() {
            if (helpModal) helpModal.classList.add('hidden');
        }

        function createHelpModal() {
            injectCSS('pp-shortcuts-styles', [
                '.pp-shortcuts-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:10001; display:flex; align-items:center; justify-content:center; }',
                '.pp-shortcuts-overlay.hidden { display:none; }',
                '.pp-shortcuts-modal { background:var(--bg-card,#fff); border-radius:12px; padding:24px; width:420px; max-width:90vw; box-shadow:0 20px 60px rgba(0,0,0,0.3); }',
                '.pp-shortcuts-modal h3 { margin:0 0 16px; font-size:1.1rem; }',
                '.pp-shortcuts-row { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border-color,#f3f4f6); }',
                '.pp-shortcuts-key { background:var(--bg-hover,#f3f4f6); border:1px solid var(--border-color,#e5e7eb); border-radius:4px; padding:2px 8px; font-family:monospace; font-size:0.82rem; }',
                '.pp-shortcuts-desc { font-size:0.88rem; color:var(--text-secondary,#4b5563); }',
                '.pp-shortcuts-close { margin-top:16px; text-align:right; }',
                '.pp-shortcuts-close button { background:var(--primary,#2563eb); color:#fff; border:none; border-radius:6px; padding:6px 16px; cursor:pointer; font-size:0.85rem; }',
                '.pp-shortcuts-close button:hover { opacity:0.9; }'
            ].join('\n'));

            helpModal = createEl('div', { className: 'pp-shortcuts-overlay hidden', id: 'ppShortcutsModal' });
            var modal = createEl('div', { className: 'pp-shortcuts-modal' });
            modal.innerHTML = '<h3>Keyboard Shortcuts</h3>' +
                SHORTCUTS.map(function (s) {
                    return '<div class="pp-shortcuts-row">' +
                        '<span class="pp-shortcuts-key">' + s.key + '</span>' +
                        '<span class="pp-shortcuts-desc">' + s.desc + '</span>' +
                        '</div>';
                }).join('') +
                '<div class="pp-shortcuts-close"><button id="ppShortcutsCloseBtn">Close</button></div>';
            helpModal.appendChild(modal);
            document.body.appendChild(helpModal);

            helpModal.addEventListener('click', function (e) {
                if (e.target === helpModal) hideHelp();
            });
            modal.querySelector('#ppShortcutsCloseBtn').addEventListener('click', hideHelp);
        }

        function handleKeydown(e) {
            if (isTyping()) return;

            // ? - Show help
            if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                showHelp();
                return;
            }

            // N - New order
            if (e.key === 'N' || e.key === 'n') {
                if (e.ctrlKey || e.metaKey) return;
                e.preventDefault();
                if (typeof openProcCreateOrderModal === 'function' && (isAdmin() || isProcurement() || isManager())) {
                    openProcCreateOrderModal();
                }
                return;
            }

            // / - Focus search
            if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                PU.GlobalSearch.open();
                return;
            }

            // Escape - Close modals
            if (e.key === 'Escape') {
                // Close shortcuts help
                if (helpModal && !helpModal.classList.contains('hidden')) {
                    hideHelp();
                    return;
                }
                // Close global search
                var gsOverlay = document.getElementById('ppGlobalSearchOverlay');
                if (gsOverlay && !gsOverlay.classList.contains('hidden')) {
                    PU.GlobalSearch.close();
                    return;
                }
                // Close order detail panel
                var detailPanel = document.getElementById('orderDetailPanel');
                if (detailPanel && !detailPanel.classList.contains('hidden')) {
                    detailPanel.classList.add('hidden');
                    return;
                }
                // Close quote detail panel
                var quotePanel = document.getElementById('quoteDetailPanel');
                if (quotePanel && !quotePanel.classList.contains('hidden')) {
                    quotePanel.classList.add('hidden');
                    return;
                }
                return;
            }

            // 1-9 - Switch tabs
            if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey) {
                var tabName = TAB_MAP[e.key];
                if (tabName && typeof switchTab === 'function') {
                    e.preventDefault();
                    switchTab(tabName);
                }
                return;
            }
        }

        function init() {
            document.addEventListener('keydown', handleKeydown);
        }

        return { init: init, showHelp: showHelp };
    })();


    // =========================================================================
    // FEATURE 6: ROLE-BASED DASHBOARD
    // =========================================================================

    PU.Dashboard = (function () {
        var container = null;
        var collapsed = false;
        var COLLAPSE_KEY = 'pp_dashboard_collapsed';

        function countByStatus(status) {
            return (ordersState || []).filter(function (o) { return o.status === status; }).length;
        }

        function countByPriority(priority) {
            return (ordersState || []).filter(function (o) {
                return o.priority === priority && o.status !== 'Delivered' && o.status !== 'Cancelled';
            }).length;
        }

        function getMyRecentOrders() {
            if (!currentUser) return [];
            return (ordersState || []).filter(function (o) {
                return o.requester_id === currentUser.id;
            }).sort(function (a, b) { return b.id - a.id; }).slice(0, 5);
        }

        function getOverdueCount() {
            var today = new Date();
            today.setHours(0, 0, 0, 0);
            return (ordersState || []).filter(function (o) {
                if (o.status === 'Delivered' || o.status === 'Cancelled') return false;
                if (!o.expected_delivery_date) return false;
                var expected = new Date(o.expected_delivery_date);
                return expected < today;
            }).length;
        }

        function getSpendThisMonth() {
            var now = new Date();
            var month = now.getMonth();
            var year = now.getFullYear();
            var total = 0;
            (ordersState || []).forEach(function (o) {
                if (o.created_at) {
                    var d = new Date(o.created_at);
                    if (d.getMonth() === month && d.getFullYear() === year) {
                        total += parseFloat(o.total_price) || 0;
                    }
                }
            });
            return total;
        }

        function getPendingApprovals() {
            return (ordersState || []).filter(function (o) {
                return o.status === 'Quote Under Approval' || o.status === 'Pending';
            }).length;
        }

        function getTopSuppliers() {
            var counts = {};
            (ordersState || []).forEach(function (o) {
                if (o.supplier_name) {
                    counts[o.supplier_name] = (counts[o.supplier_name] || 0) + 1;
                }
            });
            return Object.keys(counts).map(function (name) {
                return { name: name, count: counts[name] };
            }).sort(function (a, b) { return b.count - a.count; }).slice(0, 5);
        }

        function getStatusCounts() {
            var result = {};
            ['New', 'Pending', 'Ordered', 'In Transit', 'Delivered'].forEach(function (s) {
                result[s] = countByStatus(s);
            });
            return result;
        }

        function renderStatusCards() {
            var counts = getStatusCounts();
            var colors = {
                'New': '#3b82f6', 'Pending': '#f59e0b', 'Ordered': '#8b5cf6',
                'In Transit': '#06b6d4', 'Delivered': '#10b981'
            };
            return Object.keys(counts).map(function (s) {
                return '<div class="pp-dash-card" style="border-left:4px solid ' + colors[s] + ';">' +
                    '<div class="pp-dash-card-count">' + counts[s] + '</div>' +
                    '<div class="pp-dash-card-label">' + s + '</div>' +
                    '</div>';
            }).join('');
        }

        function renderMyRecentOrders() {
            var orders = getMyRecentOrders();
            if (!orders.length) return '<div class="pp-dash-empty">No recent orders</div>';
            return '<div class="pp-dash-recent">' +
                orders.map(function (o) {
                    var statusClass = 'status-' + o.status.toLowerCase().replace(/ /g, '-');
                    return '<div class="pp-dash-recent-item" data-id="' + o.id + '">' +
                        '<span class="pp-dash-recent-id">#' + o.id + '</span>' +
                        '<span class="pp-dash-recent-desc">' + safeEscape((o.item_description || '').substring(0, 35)) + '</span>' +
                        '<span class="status-badge ' + statusClass + '">' + o.status + '</span>' +
                        '</div>';
                }).join('') +
                '</div>';
        }

        function renderManagerAdmin() {
            var html = '<div class="pp-dash-section">';
            html += '<div class="pp-dash-row">';
            html += '<div class="pp-dash-card pp-dash-card-alert" style="border-left:4px solid #ef4444;">' +
                '<div class="pp-dash-card-count">' + getPendingApprovals() + '</div>' +
                '<div class="pp-dash-card-label">Pending Approvals</div></div>';
            html += '<div class="pp-dash-card" style="border-left:4px solid #ef4444;">' +
                '<div class="pp-dash-card-count">' + getOverdueCount() + '</div>' +
                '<div class="pp-dash-card-label">Overdue Orders</div></div>';
            html += '<div class="pp-dash-card" style="border-left:4px solid #10b981;">' +
                '<div class="pp-dash-card-count">' + safeFmtPrice(getSpendThisMonth()) + '</div>' +
                '<div class="pp-dash-card-label">Spend This Month</div></div>';
            html += '</div></div>';
            return html;
        }

        function renderProcurementAdmin() {
            var topSuppliers = getTopSuppliers();
            var html = '<div class="pp-dash-section">';
            html += '<div class="pp-dash-subtitle">Top Suppliers</div>';
            html += '<div class="pp-dash-suppliers">';
            if (topSuppliers.length) {
                html += topSuppliers.map(function (s) {
                    return '<div class="pp-dash-supplier-item">' +
                        '<span>' + safeEscape(s.name) + '</span>' +
                        '<span class="pp-dash-supplier-count">' + s.count + ' orders</span>' +
                        '</div>';
                }).join('');
            } else {
                html += '<div class="pp-dash-empty">No supplier data</div>';
            }
            html += '</div>';

            // Spend chart placeholder
            html += '<div class="pp-dash-subtitle" style="margin-top:12px;">Monthly Spend</div>';
            html += '<canvas id="ppDashSpendChart" width="400" height="150"></canvas>';

            html += '</div>';
            return html;
        }

        function renderRequesterWidgets() {
            var html = '<div class="pp-dash-section">';
            html += '<div class="pp-dash-subtitle">Open Requests by Urgency</div>';
            html += '<div class="pp-dash-row">';
            ['Urgent', 'High', 'Normal', 'Low'].forEach(function (p) {
                var colors = { 'Urgent': '#ef4444', 'High': '#f59e0b', 'Normal': '#3b82f6', 'Low': '#6b7280' };
                html += '<div class="pp-dash-card" style="border-left:4px solid ' + colors[p] + ';">' +
                    '<div class="pp-dash-card-count">' + countByPriority(p) + '</div>' +
                    '<div class="pp-dash-card-label">' + p + '</div></div>';
            });
            html += '</div></div>';
            return html;
        }

        function renderSpendChart() {
            var canvas = document.getElementById('ppDashSpendChart');
            if (!canvas || typeof Chart === 'undefined') return;

            var months = [];
            var data = [];
            var now = new Date();
            for (var i = 5; i >= 0; i--) {
                var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                months.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
                var total = 0;
                (ordersState || []).forEach(function (o) {
                    if (o.created_at) {
                        var od = new Date(o.created_at);
                        if (od.getMonth() === d.getMonth() && od.getFullYear() === d.getFullYear()) {
                            total += parseFloat(o.total_price) || 0;
                        }
                    }
                });
                data.push(total);
            }

            try {
                new Chart(canvas.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: months,
                        datasets: [{
                            label: 'Spend',
                            data: data,
                            backgroundColor: 'rgba(37,99,235,0.5)',
                            borderColor: '#2563eb',
                            borderWidth: 1,
                            borderRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { beginAtZero: true, ticks: { callback: function (v) { return '$' + v.toFixed(0); } } }
                        }
                    }
                });
            } catch (e) {
                // Chart.js not available - silently fail
            }
        }

        function render() {
            if (!container) return;
            var role = currentUser ? currentUser.role : 'requester';

            var html = '<div class="pp-dash-header">' +
                '<h3 class="pp-dash-title">Dashboard</h3>' +
                '<button class="pp-dash-toggle" id="ppDashToggle">' + (collapsed ? '&#9660;' : '&#9650;') + '</button>' +
                '</div>';

            html += '<div class="pp-dash-body' + (collapsed ? ' hidden' : '') + '" id="ppDashBody">';

            // Status cards (all roles)
            html += '<div class="pp-dash-subtitle">Orders by Status</div>';
            html += '<div class="pp-dash-row">' + renderStatusCards() + '</div>';

            // Role-specific widgets
            if (role === 'admin' || role === 'manager') {
                html += renderManagerAdmin();
            }

            if ((role === 'admin' || role === 'procurement') && canSeePrices()) {
                html += renderProcurementAdmin();
            }

            if (role === 'requester') {
                html += renderRequesterWidgets();
            }

            // My Recent Orders (all roles)
            html += '<div class="pp-dash-subtitle" style="margin-top:12px;">My Recent Orders</div>';
            html += renderMyRecentOrders();

            html += '</div>';

            container.innerHTML = html;

            // Toggle handler
            var toggleBtn = document.getElementById('ppDashToggle');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', function () {
                    collapsed = !collapsed;
                    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
                    render();
                });
            }

            // Clickable recent orders
            container.querySelectorAll('.pp-dash-recent-item').forEach(function (el) {
                el.addEventListener('click', function () {
                    var id = parseInt(el.dataset.id, 10);
                    if (typeof openOrderDetail === 'function') openOrderDetail(id);
                });
            });

            // Render chart after DOM update
            if ((role === 'admin' || role === 'procurement') && canSeePrices()) {
                setTimeout(renderSpendChart, 100);
            }
        }

        function init() {
            injectCSS('pp-dash-styles', [
                '.pp-dashboard-container { margin-bottom:1.5rem; background:var(--bg-card,#fff); border-radius:12px; padding:16px 20px; box-shadow:0 1px 3px rgba(0,0,0,0.08); }',
                '.pp-dash-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }',
                '.pp-dash-title { margin:0; font-size:1.05rem; font-weight:600; }',
                '.pp-dash-toggle { background:none; border:none; cursor:pointer; font-size:0.9rem; padding:4px 8px; color:var(--text-muted,#6b7280); }',
                '.pp-dash-body.hidden { display:none; }',
                '.pp-dash-subtitle { font-size:0.8rem; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted,#9ca3af); font-weight:600; margin-bottom:8px; margin-top:4px; }',
                '.pp-dash-row { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px; }',
                '.pp-dash-card { flex:1; min-width:100px; background:var(--bg-hover,#f9fafb); border-radius:8px; padding:12px; }',
                '.pp-dash-card-count { font-size:1.4rem; font-weight:700; }',
                '.pp-dash-card-label { font-size:0.78rem; color:var(--text-muted,#6b7280); margin-top:2px; }',
                '.pp-dash-section { margin-top:12px; }',
                '.pp-dash-empty { font-size:0.85rem; color:var(--text-muted,#9ca3af); padding:8px 0; }',
                '.pp-dash-suppliers { display:flex; flex-direction:column; gap:4px; }',
                '.pp-dash-supplier-item { display:flex; justify-content:space-between; padding:4px 8px; font-size:0.85rem; background:var(--bg-hover,#f9fafb); border-radius:4px; }',
                '.pp-dash-supplier-count { color:var(--text-muted,#6b7280); font-size:0.8rem; }',
                '.pp-dash-recent { display:flex; flex-direction:column; gap:4px; }',
                '.pp-dash-recent-item { display:flex; align-items:center; gap:8px; padding:6px 8px; background:var(--bg-hover,#f9fafb); border-radius:6px; cursor:pointer; transition:background 0.15s; }',
                '.pp-dash-recent-item:hover { background:var(--bg-active,#eff6ff); }',
                '.pp-dash-recent-id { font-weight:600; font-size:0.82rem; color:var(--primary,#2563eb); min-width:40px; }',
                '.pp-dash-recent-desc { flex:1; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
                '#ppDashSpendChart { max-height:150px; }'
            ].join('\n'));

            collapsed = localStorage.getItem(COLLAPSE_KEY) === '1';

            container = createEl('div', { className: 'pp-dashboard-container', id: 'ppDashboard' });
            var ordersTableEl = document.getElementById('ordersTable');
            if (ordersTableEl && ordersTableEl.parentNode) {
                ordersTableEl.parentNode.insertBefore(container, ordersTableEl);
            }

            render();
        }

        return { init: init, render: render };
    })();


    // =========================================================================
    // FEATURE 7: ORDER TEMPLATES
    // =========================================================================

    PU.Templates = (function () {
        var templates = [];
        var tabCreated = false;

        async function loadTemplates() {
            try {
                var res = await apiGet('/templates');
                templates = res.templates || res.data || [];
                renderTemplatesTab();
            } catch (e) {
                templates = [];
                renderTemplatesTab();
            }
        }

        function renderTemplatesTab() {
            var tabContent = document.getElementById('templatesTab');
            if (!tabContent) return;

            if (!templates.length) {
                tabContent.innerHTML = '<div class="card"><p class="text-muted" style="padding:20px;">No templates available. Save an order as a template from the order detail panel.</p></div>';
                return;
            }

            var html = '<div class="card"><h2 style="margin-bottom:16px;">Order Templates</h2>';
            html += '<div class="pp-templates-grid">';
            html += templates.map(function (t) {
                var desc = safeEscape((t.item_description || t.description || '').substring(0, 80));
                var showSupplier = canSeeSuppliers() && t.supplier_name;
                return '<div class="pp-template-card">' +
                    '<div class="pp-template-card-header">' +
                    '<h4>' + safeEscape(t.name || 'Template #' + t.id) + '</h4>' +
                    '</div>' +
                    '<div class="pp-template-card-body">' +
                    '<div class="pp-template-detail">' + desc + '</div>' +
                    (t.part_number ? '<div class="pp-template-meta">Part: ' + safeEscape(t.part_number) + '</div>' : '') +
                    (t.category ? '<div class="pp-template-meta">Category: ' + safeEscape(t.category) + '</div>' : '') +
                    (showSupplier ? '<div class="pp-template-meta">Supplier: ' + safeEscape(t.supplier_name) + '</div>' : '') +
                    '</div>' +
                    '<div class="pp-template-card-footer">' +
                    '<button class="btn btn-primary btn-sm pp-use-template" data-id="' + t.id + '">Use Template</button>' +
                    '</div>' +
                    '</div>';
            }).join('');
            html += '</div></div>';
            tabContent.innerHTML = html;

            tabContent.querySelectorAll('.pp-use-template').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    useTemplate(parseInt(btn.dataset.id, 10));
                });
            });
        }

        async function useTemplate(templateId) {
            try {
                var res = await apiPost('/templates/' + templateId + '/use', {});
                if (res.success || res.order) {
                    if (typeof loadOrders === 'function') loadOrders();
                    if (typeof switchTab === 'function') switchTab('ordersTab');
                    alert('Order created from template!');
                } else {
                    alert('Failed to create order from template: ' + (res.message || 'Unknown error'));
                }
            } catch (e) {
                alert('Failed to create order from template');
            }
        }

        function addSaveAsTemplateButton(orderDetailBodyEl, order) {
            if (!orderDetailBodyEl || !order) return;
            var existing = orderDetailBodyEl.querySelector('.pp-save-template-btn');
            if (existing) existing.remove();

            var btn = createEl('button', {
                className: 'btn btn-secondary btn-sm pp-save-template-btn',
                style: 'margin-top:12px;'
            }, 'Save as Template');

            btn.addEventListener('click', async function () {
                var name = prompt('Template name:');
                if (!name) return;
                try {
                    var body = {
                        name: name,
                        item_description: order.item_description,
                        part_number: order.part_number || '',
                        category: order.category || '',
                        quantity: order.quantity,
                        priority: order.priority,
                        building: order.building,
                        notes: order.notes || ''
                    };
                    if (canSeeSuppliers() && order.supplier_id) {
                        body.supplier_id = order.supplier_id;
                    }
                    var res = await apiPost('/templates', body);
                    if (res.success || res.template) {
                        alert('Template saved!');
                        loadTemplates();
                    } else {
                        alert('Failed to save template: ' + (res.message || ''));
                    }
                } catch (e) {
                    alert('Failed to save template');
                }
            });

            orderDetailBodyEl.appendChild(btn);
        }

        function createTab() {
            if (tabCreated) return;
            tabCreated = true;

            // Add sidebar nav item
            var sidebar = document.getElementById('sidebarNav');
            if (sidebar) {
                var navItem = createEl('button', { className: 'nav-item', 'data-tab': 'templatesTab' },
                    '<span class="nav-icon">&#128203;</span><span>Templates</span>');
                var dividers = sidebar.querySelectorAll('.nav-divider');
                var insertBefore = dividers.length > 0 ? dividers[0] : null;
                if (insertBefore) {
                    sidebar.insertBefore(navItem, insertBefore);
                } else {
                    sidebar.appendChild(navItem);
                }
                navItem.addEventListener('click', function () {
                    if (typeof switchTab === 'function') switchTab('templatesTab');
                });
            }

            // Create tab content
            var mainContent = document.querySelector('.main-content');
            if (mainContent) {
                var tabDiv = createEl('div', { className: 'tab-content hidden', id: 'templatesTab' });
                mainContent.appendChild(tabDiv);
            }
        }

        function init() {
            injectCSS('pp-templates-styles', [
                '.pp-templates-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; }',
                '.pp-template-card { background:var(--bg-hover,#f9fafb); border:1px solid var(--border-color,#e5e7eb); border-radius:10px; overflow:hidden; display:flex; flex-direction:column; }',
                '.pp-template-card-header { padding:12px 16px; border-bottom:1px solid var(--border-color,#e5e7eb); }',
                '.pp-template-card-header h4 { margin:0; font-size:0.95rem; }',
                '.pp-template-card-body { padding:12px 16px; flex:1; }',
                '.pp-template-detail { font-size:0.85rem; color:var(--text-secondary,#4b5563); margin-bottom:6px; }',
                '.pp-template-meta { font-size:0.78rem; color:var(--text-muted,#9ca3af); }',
                '.pp-template-card-footer { padding:10px 16px; border-top:1px solid var(--border-color,#e5e7eb); }',
                '.pp-save-template-btn { display:inline-block; }'
            ].join('\n'));

            createTab();
            loadTemplates();

            // Observe order detail panel to inject save-as-template button
            var detailBody = document.getElementById('orderDetailBody');
            if (detailBody) {
                var obs = new MutationObserver(function () {
                    var idEl = detailBody.querySelector('.btn-copy-id');
                    if (idEl) {
                        var onclickAttr = idEl.getAttribute('onclick') || '';
                        var match = onclickAttr.match(/copyOrderId\((\d+)\)/);
                        if (match) {
                            var orderId = parseInt(match[1], 10);
                            var order = (ordersState || []).find(function (o) { return o.id === orderId; });
                            if (order) addSaveAsTemplateButton(detailBody, order);
                        }
                    }
                });
                obs.observe(detailBody, { childList: true, subtree: true });
            }
        }

        return { init: init, loadTemplates: loadTemplates };
    })();


    // =========================================================================
    // FEATURE 8: CSV EXPORT
    // =========================================================================

    PU.CSVExport = (function () {
        function escapeCSV(val) {
            var s = String(val == null ? '' : val);
            if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
                return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
        }

        function exportCSV() {
            var orders = filteredOrders || [];
            if (!orders.length) {
                alert('No orders to export');
                return;
            }

            var headers, rows;

            if (isRequester()) {
                headers = ['ID', 'Status', 'Building', 'Item Description', 'Part Number', 'Category', 'Quantity', 'Priority', 'Date Needed', 'Submission Date'];
                rows = orders.map(function (o) {
                    return [o.id, o.status, o.building, o.item_description, o.part_number || '', o.category || '',
                        o.quantity, o.priority, o.date_needed || '', o.created_at || ''].map(escapeCSV).join(',');
                });
            } else {
                headers = ['ID', 'Status', 'Building', 'Item Description', 'Part Number', 'Category', 'Quantity', 'Priority', 'Date Needed', 'Submission Date', 'Price', 'Supplier', 'Total'];
                rows = orders.map(function (o) {
                    return [o.id, o.status, o.building, o.item_description, o.part_number || '', o.category || '',
                        o.quantity, o.priority, o.date_needed || '', o.created_at || '',
                        o.unit_price || '', o.supplier_name || '', o.total_price || ''].map(escapeCSV).join(',');
                });
            }

            var csv = headers.map(escapeCSV).join(',') + '\n' + rows.join('\n');
            var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = url;
            link.download = 'partpulse_orders_' + new Date().toISOString().slice(0, 10) + '.csv';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }

        function init() {
            // The button is added below the orders table toolbar
            var ordersTableEl = document.getElementById('ordersTable');
            if (!ordersTableEl) return;

            var toolbar = ordersTableEl.previousElementSibling;
            if (!toolbar || !toolbar.classList.contains('table-toolbar')) {
                // Find or create a toolbar area above ordersTable
                toolbar = document.querySelector('.table-toolbar, .filter-toolbar, .orders-toolbar');
            }

            // Create export button
            var btn = createEl('button', {
                className: 'btn btn-secondary btn-sm',
                id: 'ppExportCSV',
                style: 'margin-left:8px;'
            }, '&#128190; Export CSV');
            btn.addEventListener('click', exportCSV);

            // Try to place it near existing export or view toggle buttons
            var existingExport = document.getElementById('btnExport');
            var viewToggle = document.getElementById('btnViewFlat');
            if (existingExport && existingExport.parentNode) {
                existingExport.parentNode.insertBefore(btn, existingExport.nextSibling);
            } else if (viewToggle && viewToggle.parentNode) {
                viewToggle.parentNode.appendChild(btn);
            } else if (ordersTableEl.parentNode) {
                ordersTableEl.parentNode.insertBefore(btn, ordersTableEl);
            }
        }

        return { init: init, exportCSV: exportCSV };
    })();


    // =========================================================================
    // FEATURE 9: CSV IMPORT
    // =========================================================================

    PU.CSVImport = (function () {
        var modal = null;
        var parsedData = null;
        var columnMap = {};
        var REQUIRED_FIELDS = ['building', 'item_description', 'quantity'];
        var OPTIONAL_FIELDS = ['part_number', 'priority', 'date_needed', 'notes', 'category'];

        function parseCSV(text) {
            var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l; });
            if (lines.length < 2) return null;

            var headers = parseCSVLine(lines[0]);
            var rows = [];
            for (var i = 1; i < lines.length; i++) {
                var vals = parseCSVLine(lines[i]);
                var row = {};
                headers.forEach(function (h, idx) {
                    row[h] = vals[idx] || '';
                });
                rows.push(row);
            }
            return { headers: headers, rows: rows };
        }

        function parseCSVLine(line) {
            var result = [];
            var current = '';
            var inQuotes = false;
            for (var i = 0; i < line.length; i++) {
                var c = line[i];
                if (c === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (c === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += c;
                }
            }
            result.push(current.trim());
            return result;
        }

        function showModal() {
            if (!modal) createModal();
            parsedData = null;
            columnMap = {};
            modal.classList.remove('hidden');
            modal.querySelector('#ppImportFileInput').value = '';
            modal.querySelector('#ppImportPreview').innerHTML = '';
            modal.querySelector('#ppImportMapping').innerHTML = '';
            modal.querySelector('#ppImportConfirm').disabled = true;
            modal.querySelector('#ppImportStatus').textContent = '';
        }

        function closeModal() {
            if (modal) modal.classList.add('hidden');
        }

        function createModal() {
            injectCSS('pp-import-styles', [
                '.pp-import-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:10000; display:flex; align-items:center; justify-content:center; }',
                '.pp-import-overlay.hidden { display:none; }',
                '.pp-import-modal { background:var(--bg-card,#fff); border-radius:12px; padding:24px; width:700px; max-width:90vw; max-height:80vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.3); }',
                '.pp-import-modal h3 { margin:0 0 16px; }',
                '.pp-import-preview { margin:16px 0; overflow-x:auto; }',
                '.pp-import-preview table { font-size:0.8rem; width:100%; }',
                '.pp-import-preview th { background:var(--bg-hover,#f3f4f6); font-weight:600; padding:6px 8px; text-align:left; }',
                '.pp-import-preview td { padding:4px 8px; border-bottom:1px solid var(--border-color,#e5e7eb); }',
                '.pp-import-mapping { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:16px 0; }',
                '.pp-import-mapping label { font-size:0.85rem; font-weight:500; }',
                '.pp-import-mapping select { font-size:0.82rem; }',
                '.pp-import-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:16px; }',
                '.pp-import-status { font-size:0.85rem; color:var(--text-muted,#6b7280); margin-top:8px; }'
            ].join('\n'));

            modal = createEl('div', { className: 'pp-import-overlay hidden', id: 'ppImportOverlay' });
            var inner = createEl('div', { className: 'pp-import-modal' });
            inner.innerHTML = '<h3>Import Orders from CSV</h3>' +
                '<div class="form-group"><label>Select CSV File</label>' +
                '<input type="file" id="ppImportFileInput" accept=".csv" class="form-control"></div>' +
                '<div id="ppImportPreview" class="pp-import-preview"></div>' +
                '<div id="ppImportMapping" class="pp-import-mapping"></div>' +
                '<div id="ppImportStatus" class="pp-import-status"></div>' +
                '<div class="pp-import-actions">' +
                '<button class="btn btn-secondary btn-sm" id="ppImportCancel">Cancel</button>' +
                '<button class="btn btn-primary btn-sm" id="ppImportConfirm" disabled>Import Orders</button>' +
                '</div>';
            modal.appendChild(inner);
            document.body.appendChild(modal);

            modal.addEventListener('click', function (e) {
                if (e.target === modal) closeModal();
            });
            modal.querySelector('#ppImportCancel').addEventListener('click', closeModal);
            modal.querySelector('#ppImportFileInput').addEventListener('change', handleFileSelect);
            modal.querySelector('#ppImportConfirm').addEventListener('click', handleImport);
        }

        function handleFileSelect(e) {
            var file = e.target.files[0];
            if (!file) return;

            var reader = new FileReader();
            reader.onload = function (ev) {
                parsedData = parseCSV(ev.target.result);
                if (!parsedData || !parsedData.rows.length) {
                    modal.querySelector('#ppImportPreview').innerHTML = '<p class="text-muted">No data found in file</p>';
                    return;
                }
                renderPreview();
                renderMapping();
                modal.querySelector('#ppImportConfirm').disabled = false;
            };
            reader.readAsText(file);
        }

        function renderPreview() {
            var preview = modal.querySelector('#ppImportPreview');
            var rows = parsedData.rows.slice(0, 5);
            var html = '<table><thead><tr>';
            html += parsedData.headers.map(function (h) { return '<th>' + safeEscape(h) + '</th>'; }).join('');
            html += '</tr></thead><tbody>';
            rows.forEach(function (row) {
                html += '<tr>';
                parsedData.headers.forEach(function (h) {
                    html += '<td>' + safeEscape(row[h] || '') + '</td>';
                });
                html += '</tr>';
            });
            html += '</tbody></table>';
            if (parsedData.rows.length > 5) {
                html += '<p class="text-muted" style="font-size:0.8rem;">Showing first 5 of ' + parsedData.rows.length + ' rows</p>';
            }
            preview.innerHTML = html;
        }

        function renderMapping() {
            var mapping = modal.querySelector('#ppImportMapping');
            var allFields = REQUIRED_FIELDS.concat(OPTIONAL_FIELDS);
            var html = '<div style="grid-column:1/-1;font-weight:600;font-size:0.9rem;margin-bottom:4px;">Map CSV Columns to Order Fields</div>';
            allFields.forEach(function (field) {
                var isReq = REQUIRED_FIELDS.indexOf(field) !== -1;
                var label = field.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
                html += '<div>' +
                    '<label>' + label + (isReq ? ' *' : '') + '</label>' +
                    '<select class="form-control pp-import-map-select" data-field="' + field + '">' +
                    '<option value="">-- Skip --</option>' +
                    parsedData.headers.map(function (h) {
                        var selected = h.toLowerCase().replace(/\s+/g, '_').indexOf(field) !== -1 ? ' selected' : '';
                        return '<option value="' + safeEscape(h) + '"' + selected + '>' + safeEscape(h) + '</option>';
                    }).join('') +
                    '</select>' +
                    '</div>';
            });
            mapping.innerHTML = html;

            mapping.querySelectorAll('.pp-import-map-select').forEach(function (sel) {
                sel.addEventListener('change', function () {
                    columnMap[sel.dataset.field] = sel.value;
                });
                // Auto-fill initial mapping
                if (sel.value) columnMap[sel.dataset.field] = sel.value;
            });
        }

        async function handleImport() {
            if (!parsedData || !parsedData.rows.length) return;

            // Validate required mappings
            for (var i = 0; i < REQUIRED_FIELDS.length; i++) {
                if (!columnMap[REQUIRED_FIELDS[i]]) {
                    alert('Please map the required field: ' + REQUIRED_FIELDS[i].replace(/_/g, ' '));
                    return;
                }
            }

            var statusEl = modal.querySelector('#ppImportStatus');
            var confirmBtn = modal.querySelector('#ppImportConfirm');
            confirmBtn.disabled = true;
            var success = 0;
            var errors = 0;

            for (var r = 0; r < parsedData.rows.length; r++) {
                var row = parsedData.rows[r];
                statusEl.textContent = 'Importing order ' + (r + 1) + ' of ' + parsedData.rows.length + '...';

                var orderData = {};
                Object.keys(columnMap).forEach(function (field) {
                    var csvCol = columnMap[field];
                    if (csvCol && row[csvCol] !== undefined) {
                        orderData[field] = row[csvCol];
                    }
                });

                // Ensure quantity is a number
                if (orderData.quantity) orderData.quantity = parseInt(orderData.quantity, 10) || 1;

                try {
                    var res = await apiPost('/orders', orderData);
                    if (res.success || res.order) {
                        success++;
                    } else {
                        errors++;
                    }
                } catch (e) {
                    errors++;
                }
            }

            statusEl.textContent = 'Import complete: ' + success + ' succeeded, ' + errors + ' failed.';
            confirmBtn.disabled = false;

            if (success > 0 && typeof loadOrders === 'function') {
                loadOrders();
            }
        }

        function init() {
            // Only for procurement/admin
            if (!isAdmin() && !isProcurement()) return;

            var ordersTableEl = document.getElementById('ordersTable');
            if (!ordersTableEl) return;

            var btn = createEl('button', {
                className: 'btn btn-secondary btn-sm',
                id: 'ppImportCSV',
                style: 'margin-left:8px;'
            }, '&#128228; Import CSV');
            btn.addEventListener('click', showModal);

            var exportBtn = document.getElementById('ppExportCSV');
            if (exportBtn && exportBtn.parentNode) {
                exportBtn.parentNode.insertBefore(btn, exportBtn.nextSibling);
            } else {
                var viewToggle = document.getElementById('btnViewFlat');
                if (viewToggle && viewToggle.parentNode) {
                    viewToggle.parentNode.appendChild(btn);
                } else {
                    ordersTableEl.parentNode.insertBefore(btn, ordersTableEl);
                }
            }
        }

        return { init: init };
    })();


    // =========================================================================
    // FEATURE 10: CONFIGURABLE COLUMNS
    // =========================================================================

    PU.ColumnConfig = (function () {
        var STORAGE_KEY = 'pp_visible_columns';
        var dropdown = null;
        var ALL_COLUMNS = [
            { key: 'id', label: 'ID' },
            { key: 'item', label: 'Item Description' },
            { key: 'costcenter', label: 'Cost Center' },
            { key: 'quantity', label: 'Quantity' },
            { key: 'status', label: 'Status' },
            { key: 'priority', label: 'Priority' },
            { key: 'files', label: 'Files' },
            { key: 'requester', label: 'Requester' },
            { key: 'delivery', label: 'Delivery' },
            { key: 'date_needed', label: 'Date Needed' },
            { key: 'supplier', label: 'Supplier' },
            { key: 'building', label: 'Building' },
            { key: 'unit_price', label: 'Unit Price' },
            { key: 'total_price', label: 'Total Price' }
        ];
        var visibleCols = null;
        var observer = null;

        function getVisibleColumns() {
            if (visibleCols) return visibleCols;
            try {
                var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
                if (saved && Array.isArray(saved)) {
                    visibleCols = saved;
                    return visibleCols;
                }
            } catch (e) { /* ignore */ }
            visibleCols = ALL_COLUMNS.map(function (c) { return c.key; });
            return visibleCols;
        }

        function saveVisibleColumns() {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleCols));
        }

        function applyColumnVisibility() {
            var visible = getVisibleColumns();
            var tables = document.querySelectorAll('#ordersTable table');
            tables.forEach(function (table) {
                var headers = table.querySelectorAll('thead th');
                var colIndices = {};

                headers.forEach(function (th, idx) {
                    var text = th.textContent.trim().toLowerCase();
                    var sortCol = th.dataset.sortCol || '';

                    // Map header text/sortCol to our column keys
                    var key = null;
                    if (sortCol === 'id' || text === 'id') key = 'id';
                    else if (sortCol === 'item' || text.indexOf('item') !== -1) key = 'item';
                    else if (text.indexOf('cost center') !== -1 || text.indexOf('cost') !== -1) key = 'costcenter';
                    else if (sortCol === 'quantity' || text === 'qty') key = 'quantity';
                    else if (sortCol === 'status' || text === 'status') key = 'status';
                    else if (sortCol === 'priority' || text === 'priority') key = 'priority';
                    else if (text === 'files') key = 'files';
                    else if (sortCol === 'requester' || text === 'requester') key = 'requester';
                    else if (text.indexOf('delivery') !== -1 || text.indexOf('delivered') !== -1) key = 'delivery';
                    else if (sortCol === 'date_needed' || text === 'needed') key = 'date_needed';
                    else if (sortCol === 'supplier' || text === 'supplier') key = 'supplier';
                    else if (text === 'building') key = 'building';
                    else if (text === 'unit') key = 'unit_price';
                    else if (sortCol === 'total_price' || text === 'total') key = 'total_price';

                    if (key) colIndices[idx] = key;
                });

                // Apply visibility
                Object.keys(colIndices).forEach(function (idxStr) {
                    var idx = parseInt(idxStr, 10);
                    var key = colIndices[idx];
                    var hidden = visible.indexOf(key) === -1;

                    // Hide/show header
                    if (headers[idx]) {
                        headers[idx].classList.toggle('configurable-col-hidden', hidden);
                    }

                    // Hide/show all cells in this column
                    table.querySelectorAll('tbody tr').forEach(function (tr) {
                        var cells = tr.querySelectorAll('td');
                        if (cells[idx]) {
                            cells[idx].classList.toggle('configurable-col-hidden', hidden);
                        }
                    });
                });
            });
        }

        function renderDropdown() {
            if (!dropdown) return;
            var visible = getVisibleColumns();
            var filteredCols = ALL_COLUMNS;
            if (isRequester()) {
                filteredCols = ALL_COLUMNS.filter(function (c) {
                    return c.key !== 'supplier' && c.key !== 'unit_price' && c.key !== 'total_price' && c.key !== 'requester';
                });
            }

            dropdown.innerHTML = '<div class="pp-colcfg-title">Visible Columns</div>' +
                filteredCols.map(function (c) {
                    var checked = visible.indexOf(c.key) !== -1 ? ' checked' : '';
                    return '<label class="pp-colcfg-item">' +
                        '<input type="checkbox" data-col="' + c.key + '"' + checked + '> ' +
                        c.label +
                        '</label>';
                }).join('');

            dropdown.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
                cb.addEventListener('change', function () {
                    var col = cb.dataset.col;
                    if (cb.checked) {
                        if (visibleCols.indexOf(col) === -1) visibleCols.push(col);
                    } else {
                        visibleCols = visibleCols.filter(function (c) { return c !== col; });
                    }
                    saveVisibleColumns();
                    applyColumnVisibility();
                });
            });
        }

        function init() {
            injectCSS('pp-colcfg-styles', [
                '.configurable-col-hidden { display:none !important; }',
                '.pp-colcfg-wrap { position:relative; display:inline-block; }',
                '.pp-colcfg-btn { background:none; border:1px solid var(--border-color,#e5e7eb); border-radius:6px; padding:4px 8px; cursor:pointer; font-size:0.9rem; }',
                '.pp-colcfg-btn:hover { background:var(--bg-hover,#f3f4f6); }',
                '.pp-colcfg-dropdown { position:absolute; top:100%; right:0; background:var(--bg-card,#fff); border:1px solid var(--border-color,#e5e7eb); border-radius:8px; padding:8px; box-shadow:0 8px 24px rgba(0,0,0,0.12); z-index:100; min-width:200px; }',
                '.pp-colcfg-dropdown.hidden { display:none; }',
                '.pp-colcfg-title { font-size:0.78rem; text-transform:uppercase; color:var(--text-muted,#9ca3af); font-weight:600; letter-spacing:0.5px; margin-bottom:6px; }',
                '.pp-colcfg-item { display:flex; align-items:center; gap:6px; padding:3px 4px; font-size:0.85rem; cursor:pointer; }',
                '.pp-colcfg-item:hover { background:var(--bg-hover,#f3f4f6); border-radius:4px; }'
            ].join('\n'));

            getVisibleColumns();

            var wrap = createEl('div', { className: 'pp-colcfg-wrap', style: 'margin-left:8px; display:inline-block;' });
            var btn = createEl('button', { className: 'pp-colcfg-btn', title: 'Configure Columns' }, '&#9881; Columns');
            dropdown = createEl('div', { className: 'pp-colcfg-dropdown hidden' });

            wrap.appendChild(btn);
            wrap.appendChild(dropdown);

            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                dropdown.classList.toggle('hidden');
                if (!dropdown.classList.contains('hidden')) renderDropdown();
            });

            document.addEventListener('click', function (e) {
                if (!wrap.contains(e.target)) dropdown.classList.add('hidden');
            });

            // Place near export/import buttons
            var exportBtn = document.getElementById('ppExportCSV');
            var importBtn = document.getElementById('ppImportCSV');
            var anchor = importBtn || exportBtn;
            if (anchor && anchor.parentNode) {
                anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
            } else {
                var ordersTableEl = document.getElementById('ordersTable');
                if (ordersTableEl && ordersTableEl.parentNode) {
                    ordersTableEl.parentNode.insertBefore(wrap, ordersTableEl);
                }
            }

            // MutationObserver to re-apply after re-render
            var target = document.getElementById('ordersTable');
            if (target) {
                observer = new MutationObserver(function () {
                    setTimeout(applyColumnVisibility, 60);
                });
                observer.observe(target, { childList: true, subtree: true });
            }

            applyColumnVisibility();
        }

        return { init: init, applyColumnVisibility: applyColumnVisibility };
    })();


    // =========================================================================
    // FEATURE 11: ROW DENSITY
    // =========================================================================

    PU.RowDensity = (function () {
        var STORAGE_KEY = 'pp_row_density';
        var currentDensity = 'comfortable';

        function applyDensity(density) {
            currentDensity = density;
            localStorage.setItem(STORAGE_KEY, density);

            var tables = document.querySelectorAll('#ordersTable table');
            tables.forEach(function (table) {
                table.classList.remove('density-compact', 'density-comfortable', 'density-spacious');
                table.classList.add('density-' + density);
            });

            // Update button states
            document.querySelectorAll('.pp-density-btn').forEach(function (btn) {
                btn.classList.toggle('active', btn.dataset.density === density);
            });
        }

        function init() {
            injectCSS('pp-density-styles', [
                'table.density-compact td, table.density-compact th { padding:2px 6px !important; font-size:0.78rem !important; }',
                'table.density-comfortable td, table.density-comfortable th { padding:6px 10px !important; font-size:0.85rem !important; }',
                'table.density-spacious td, table.density-spacious th { padding:12px 14px !important; font-size:0.9rem !important; }',
                '.pp-density-group { display:inline-flex; gap:2px; margin-left:8px; border:1px solid var(--border-color,#e5e7eb); border-radius:6px; overflow:hidden; }',
                '.pp-density-btn { background:var(--bg-card,#fff); border:none; padding:4px 10px; cursor:pointer; font-size:0.78rem; transition:background 0.15s; }',
                '.pp-density-btn:hover { background:var(--bg-hover,#f3f4f6); }',
                '.pp-density-btn.active { background:var(--primary,#2563eb); color:#fff; }'
            ].join('\n'));

            currentDensity = localStorage.getItem(STORAGE_KEY) || 'comfortable';

            var group = createEl('div', { className: 'pp-density-group' });
            ['compact', 'comfortable', 'spacious'].forEach(function (d) {
                var labels = { compact: 'Compact', comfortable: 'Normal', spacious: 'Spacious' };
                var btn = createEl('button', {
                    className: 'pp-density-btn' + (d === currentDensity ? ' active' : ''),
                    'data-density': d,
                    title: labels[d]
                }, labels[d]);
                btn.addEventListener('click', function () { applyDensity(d); });
                group.appendChild(btn);
            });

            var colCfg = document.querySelector('.pp-colcfg-wrap');
            if (colCfg && colCfg.parentNode) {
                colCfg.parentNode.insertBefore(group, colCfg.nextSibling);
            } else {
                var ordersTableEl = document.getElementById('ordersTable');
                if (ordersTableEl && ordersTableEl.parentNode) {
                    ordersTableEl.parentNode.insertBefore(group, ordersTableEl);
                }
            }

            // MutationObserver to re-apply density after re-render
            var target = document.getElementById('ordersTable');
            if (target) {
                new MutationObserver(function () {
                    setTimeout(function () { applyDensity(currentDensity); }, 70);
                }).observe(target, { childList: true, subtree: true });
            }

            applyDensity(currentDensity);
        }

        return { init: init, applyDensity: applyDensity };
    })();


    // =========================================================================
    // FEATURE 12: DUPLICATE DETECTION
    // =========================================================================

    PU.DuplicateDetection = (function () {
        var warningEl = null;
        var procWarningEl = null;

        function createWarningBanner(parentSelector) {
            var el = createEl('div', {
                className: 'pp-dup-warning hidden',
                style: 'margin-top:8px;'
            });
            var parent = document.querySelector(parentSelector);
            if (parent) {
                parent.appendChild(el);
            }
            return el;
        }

        function showWarning(banner, duplicates) {
            if (!banner) return;
            if (!duplicates || !duplicates.length) {
                banner.classList.add('hidden');
                banner.innerHTML = '';
                return;
            }
            banner.classList.remove('hidden');
            var html = '<div class="pp-dup-warning-inner">';
            html += '<strong>Possible duplicates found:</strong>';
            html += '<ul>';
            duplicates.forEach(function (d) {
                var desc = safeEscape((d.item_description || '').substring(0, 50));
                html += '<li><a href="#" class="pp-dup-link" data-id="' + d.id + '">#' + d.id + '</a> - ' + desc +
                    ' <span class="status-badge status-' + (d.status || '').toLowerCase().replace(/ /g, '-') + '">' + safeEscape(d.status) + '</span></li>';
            });
            html += '</ul></div>';
            banner.innerHTML = html;

            banner.querySelectorAll('.pp-dup-link').forEach(function (link) {
                link.addEventListener('click', function (e) {
                    e.preventDefault();
                    var id = parseInt(link.dataset.id, 10);
                    if (typeof openOrderDetail === 'function') openOrderDetail(id);
                });
            });
        }

        var checkForDuplicates = debounce(async function (description, partNumber, banner) {
            if ((!description || description.length < 3) && (!partNumber || partNumber.length < 2)) {
                if (banner) {
                    banner.classList.add('hidden');
                    banner.innerHTML = '';
                }
                return;
            }
            try {
                var res = await apiPost('/duplicate-check/check', {
                    item_description: description || '',
                    part_number: partNumber || ''
                });
                var duplicates = res.duplicates || res.matches || [];
                showWarning(banner, duplicates);
            } catch (e) {
                // Silently fail - duplicate check is non-critical
            }
        }, 500);

        function hookForm(formId, descFieldId, pnFieldId, banner) {
            var descField = document.getElementById(descFieldId);
            var pnField = document.getElementById(pnFieldId);

            if (descField) {
                descField.addEventListener('input', function () {
                    checkForDuplicates(descField.value, pnField ? pnField.value : '', banner);
                });
            }
            if (pnField) {
                pnField.addEventListener('input', function () {
                    checkForDuplicates(descField ? descField.value : '', pnField.value, banner);
                });
            }
        }

        function init() {
            injectCSS('pp-dup-styles', [
                '.pp-dup-warning { background:#fef3c7; border:1px solid #f59e0b; border-radius:8px; padding:10px 14px; font-size:0.85rem; }',
                '.pp-dup-warning.hidden { display:none; }',
                '.pp-dup-warning-inner ul { margin:4px 0 0; padding-left:18px; }',
                '.pp-dup-warning-inner li { margin:2px 0; }',
                '.pp-dup-link { color:var(--primary,#2563eb); text-decoration:none; font-weight:500; }',
                '.pp-dup-link:hover { text-decoration:underline; }'
            ].join('\n'));

            // Hook requester form
            var requesterForm = document.getElementById('createOrderForm');
            if (requesterForm) {
                warningEl = createWarningBanner('#createOrderForm');
                hookForm('createOrderForm', 'itemDescription', 'partNumber', warningEl);
            }

            // Hook procurement modal form
            var procForm = document.getElementById('procCreateOrderForm');
            if (procForm) {
                procWarningEl = createWarningBanner('#procCreateOrderForm');
                hookForm('procCreateOrderForm', 'procItemDescription', 'procPartNumber', procWarningEl);
            }
        }

        return { init: init };
    })();


    // =========================================================================
    // FEATURE 13: QR CODE GENERATION
    // =========================================================================

    PU.QRCode = (function () {
        var scriptLoaded = false;

        function loadQRLibrary() {
            if (scriptLoaded) return Promise.resolve();
            return new Promise(function (resolve) {
                if (window.QRCode) {
                    scriptLoaded = true;
                    resolve();
                    return;
                }
                var script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
                script.onload = function () {
                    scriptLoaded = true;
                    resolve();
                };
                script.onerror = function () {
                    // Fallback: try alternate CDN
                    var s2 = document.createElement('script');
                    s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
                    s2.onload = function () { scriptLoaded = true; resolve(); };
                    s2.onerror = function () { resolve(); }; // Silently fail
                    document.head.appendChild(s2);
                };
                document.head.appendChild(script);
            });
        }

        function generateQR(container, text) {
            if (!window.QRCode) return;
            container.innerHTML = '';
            try {
                new window.QRCode(container, {
                    text: text,
                    width: 128,
                    height: 128,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: window.QRCode.CorrectLevel.M
                });
            } catch (e) {
                container.innerHTML = '<p class="text-muted" style="font-size:0.8rem;">QR generation unavailable</p>';
            }
        }

        function addQRToDetail(order) {
            if (!order) return;
            var detailBody = document.getElementById('orderDetailBody');
            if (!detailBody) return;

            var existing = detailBody.querySelector('.pp-qr-section');
            if (existing) existing.remove();

            var section = createEl('div', { className: 'pp-qr-section', style: 'margin-top:16px;' });
            section.innerHTML = '<div class="detail-section-title">QR Code</div>' +
                '<div id="ppQRContainer" style="margin:8px 0;"></div>';

            if (order.status === 'Delivered') {
                section.innerHTML += '<button class="btn btn-secondary btn-sm pp-print-label-btn" style="margin-top:8px;">Print Label</button>';
            }

            detailBody.appendChild(section);

            loadQRLibrary().then(function () {
                var qrText = 'Order:#' + order.id + '|' + (order.item_description || '').substring(0, 50) + '|' + (order.building || '');
                var qrContainer = document.getElementById('ppQRContainer');
                if (qrContainer) generateQR(qrContainer, qrText);
            });

            var printBtn = section.querySelector('.pp-print-label-btn');
            if (printBtn) {
                printBtn.addEventListener('click', function () {
                    printLabel(order);
                });
            }
        }

        function printLabel(order) {
            var win = window.open('', '_blank', 'width=400,height=500');
            if (!win) return;
            win.document.write('<!DOCTYPE html><html><head><title>Label - Order #' + order.id + '</title>' +
                '<style>body{font-family:Arial,sans-serif;padding:20px;text-align:center;} ' +
                '.label{border:2px solid #000;padding:20px;max-width:300px;margin:0 auto;} ' +
                '.label h2{margin:0 0 10px;font-size:1.2rem;} ' +
                '.label p{margin:4px 0;font-size:0.85rem;} ' +
                '@media print{body{padding:0;}}</style></head><body>' +
                '<div class="label">' +
                '<h2>Order #' + order.id + '</h2>' +
                '<p><strong>' + safeEscape(order.item_description) + '</strong></p>' +
                '<p>Building: ' + safeEscape(order.building) + '</p>' +
                '<p>Qty: ' + order.quantity + '</p>' +
                '<p>Status: ' + safeEscape(order.status) + '</p>' +
                '<div id="qrLabel" style="margin:12px auto;width:128px;height:128px;"></div>' +
                '</div>' +
                '<script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"><\/script>' +
                '<script>setTimeout(function(){try{new QRCode(document.getElementById("qrLabel"),{text:"Order:#' + order.id + '|' + safeEscape(order.item_description).substring(0, 30).replace(/'/g, '') + '|' + safeEscape(order.building) + '",width:128,height:128});}catch(e){}setTimeout(function(){window.print();},500);},300);<\/script>' +
                '</body></html>');
            win.document.close();
        }

        function init() {
            injectCSS('pp-qr-styles', [
                '.pp-qr-section { border-top:1px solid var(--border-color,#e5e7eb); padding-top:12px; }',
                '#ppQRContainer { display:inline-block; }',
                '#ppQRContainer img { border-radius:4px; }',
                '.pp-print-label-btn { margin-top:8px; }'
            ].join('\n'));

            // Observe order detail panel for changes
            var detailBody = document.getElementById('orderDetailBody');
            if (detailBody) {
                new MutationObserver(function () {
                    var idEl = detailBody.querySelector('.btn-copy-id');
                    if (idEl) {
                        var onclickAttr = idEl.getAttribute('onclick') || '';
                        var match = onclickAttr.match(/copyOrderId\((\d+)\)/);
                        if (match) {
                            var orderId = parseInt(match[1], 10);
                            var order = (ordersState || []).find(function (o) { return o.id === orderId; });
                            if (order) addQRToDetail(order);
                        }
                    }
                }).observe(detailBody, { childList: true, subtree: true });
            }

            loadQRLibrary();
        }

        return { init: init };
    })();


    // =========================================================================
    // FEATURE 14: COPY ORDER NUMBER
    // =========================================================================

    PU.CopyButton = (function () {
        function copyToClipboard(text) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(text);
            }
            // Fallback
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            return Promise.resolve();
        }

        function showTooltip(el) {
            var tip = createEl('span', {
                className: 'pp-copy-tooltip',
                style: 'position:absolute;top:-28px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.72rem;white-space:nowrap;pointer-events:none;z-index:9999;'
            }, 'Copied!');
            el.style.position = 'relative';
            el.appendChild(tip);
            setTimeout(function () {
                if (tip.parentNode) tip.parentNode.removeChild(tip);
            }, 1500);
        }

        function init() {
            injectCSS('pp-copy-styles', [
                '.pp-copy-btn { background:none; border:none; cursor:pointer; padding:2px 4px; font-size:0.9rem; opacity:0.6; transition:opacity 0.15s; position:relative; vertical-align:middle; }',
                '.pp-copy-btn:hover { opacity:1; }'
            ].join('\n'));

            // The existing app already has copy buttons via copyOrderId, but we enhance with tooltips
            // Override the global copyOrderId if it exists
            window.copyOrderId = function (orderId) {
                copyToClipboard(String(orderId)).then(function () {
                    var btn = document.querySelector('.btn-copy-id[onclick*="' + orderId + '"]');
                    if (btn) showTooltip(btn);
                });
            };
        }

        return { init: init };
    })();


    // =========================================================================
    // FEATURE 15: SAVED FILTER PRESETS
    // =========================================================================

    PU.FilterPresets = (function () {
        var STORAGE_KEY = 'pp_filter_presets';
        var presetsContainer = null;

        var DEFAULT_PRESETS = [
            {
                name: 'My Open Orders',
                filters: { quickFilter: 'myorders', status: '', building: '', priority: '', supplier: '', delivery: '', search: '', dateFrom: '', dateTo: '', costMin: '', costMax: '' }
            },
            {
                name: 'This Week',
                filters: {
                    quickFilter: '', status: '', building: '', priority: '', supplier: '', delivery: '', search: '',
                    dateFrom: getWeekStart(), dateTo: getWeekEnd(), costMin: '', costMax: ''
                }
            },
            {
                name: 'Overdue',
                filters: { quickFilter: '', status: '', building: '', priority: '', supplier: '', delivery: 'late', search: '', dateFrom: '', dateTo: '', costMin: '', costMax: '' }
            }
        ];

        function getWeekStart() {
            var d = new Date();
            var day = d.getDay();
            var diff = d.getDate() - day + (day === 0 ? -6 : 1);
            var start = new Date(d.setDate(diff));
            return start.toISOString().slice(0, 10);
        }

        function getWeekEnd() {
            var d = new Date();
            var day = d.getDay();
            var diff = d.getDate() + (7 - day);
            var end = new Date(d.setDate(diff));
            return end.toISOString().slice(0, 10);
        }

        function getPresets() {
            try {
                var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
                if (saved && Array.isArray(saved) && saved.length > 0) return saved;
            } catch (e) { /* ignore */ }
            return DEFAULT_PRESETS.slice();
        }

        function savePresets(presets) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
        }

        function applyPreset(preset) {
            if (!preset || !preset.filters) return;
            var f = preset.filters;

            // Reset current filter state
            if (typeof filterState !== 'undefined') {
                Object.keys(f).forEach(function (k) {
                    filterState[k] = f[k] || '';
                });
            }

            // Update UI elements
            var filterSearch = document.getElementById('filterSearch');
            var filterStatus = document.getElementById('filterStatus');
            var filterBuilding = document.getElementById('filterBuilding');
            var filterPriority = document.getElementById('filterPriority');
            var filterSupplier = document.getElementById('filterSupplier');
            var filterDelivery = document.getElementById('filterDelivery');
            var filterDateFrom = document.getElementById('filterDateFrom');
            var filterDateTo = document.getElementById('filterDateTo');

            if (filterSearch) filterSearch.value = f.search || '';
            if (filterStatus) filterStatus.value = f.status || '';
            if (filterBuilding) filterBuilding.value = f.building || '';
            if (filterPriority) filterPriority.value = f.priority || '';
            if (filterSupplier) filterSupplier.value = f.supplier || '';
            if (filterDelivery) filterDelivery.value = f.delivery || '';
            if (filterDateFrom) filterDateFrom.value = f.dateFrom || '';
            if (filterDateTo) filterDateTo.value = f.dateTo || '';

            // Handle quick filter chips
            document.querySelectorAll('.quick-filter-chip').forEach(function (chip) {
                chip.classList.toggle('active', chip.dataset.filter === f.quickFilter);
            });

            if (typeof applyFilters === 'function') applyFilters();
        }

        function render() {
            if (!presetsContainer) return;
            var presets = getPresets();

            var html = '<div class="pp-presets-bar">';
            html += '<div class="pp-presets-list">';
            presets.forEach(function (p, idx) {
                html += '<div class="pp-preset-chip">' +
                    '<button class="pp-preset-apply" data-idx="' + idx + '">' + safeEscape(p.name) + '</button>' +
                    '<button class="pp-preset-delete" data-idx="' + idx + '" title="Delete preset">&times;</button>' +
                    '</div>';
            });
            html += '</div>';
            html += '<button class="btn btn-secondary btn-sm pp-save-preset-btn" id="ppSavePresetBtn">Save Filter</button>';
            html += '</div>';

            presetsContainer.innerHTML = html;

            presetsContainer.querySelectorAll('.pp-preset-apply').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var idx = parseInt(btn.dataset.idx, 10);
                    var presets = getPresets();
                    if (presets[idx]) applyPreset(presets[idx]);
                });
            });

            presetsContainer.querySelectorAll('.pp-preset-delete').forEach(function (btn) {
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var idx = parseInt(btn.dataset.idx, 10);
                    var presets = getPresets();
                    presets.splice(idx, 1);
                    savePresets(presets);
                    render();
                });
            });

            var saveBtn = document.getElementById('ppSavePresetBtn');
            if (saveBtn) {
                saveBtn.addEventListener('click', function () {
                    var name = prompt('Preset name:');
                    if (!name) return;
                    var presets = getPresets();
                    var currentFilters = {};
                    if (typeof filterState !== 'undefined') {
                        Object.keys(filterState).forEach(function (k) {
                            currentFilters[k] = filterState[k];
                        });
                    }
                    presets.push({ name: name, filters: currentFilters });
                    savePresets(presets);
                    render();
                });
            }
        }

        function init() {
            injectCSS('pp-presets-styles', [
                '.pp-presets-container { margin-bottom:10px; }',
                '.pp-presets-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }',
                '.pp-presets-list { display:flex; gap:6px; flex-wrap:wrap; }',
                '.pp-preset-chip { display:inline-flex; align-items:center; background:var(--bg-hover,#f3f4f6); border:1px solid var(--border-color,#e5e7eb); border-radius:16px; overflow:hidden; }',
                '.pp-preset-apply { background:none; border:none; padding:4px 8px 4px 12px; cursor:pointer; font-size:0.82rem; color:var(--text-primary,#111); }',
                '.pp-preset-apply:hover { background:var(--bg-active,#eff6ff); }',
                '.pp-preset-delete { background:none; border:none; border-left:1px solid var(--border-color,#e5e7eb); padding:4px 8px; cursor:pointer; font-size:0.9rem; color:var(--text-muted,#9ca3af); line-height:1; }',
                '.pp-preset-delete:hover { color:#ef4444; background:rgba(239,68,68,0.08); }',
                '.pp-save-preset-btn { white-space:nowrap; }'
            ].join('\n'));

            presetsContainer = createEl('div', { className: 'pp-presets-container', id: 'ppFilterPresets' });

            // Insert after filter area
            var filterArea = document.querySelector('.filters-card, .filter-card, .filters-section, #filterSection');
            if (!filterArea) {
                filterArea = document.getElementById('btnClearFilters');
                if (filterArea) filterArea = filterArea.closest('.card') || filterArea.parentNode;
            }

            if (filterArea && filterArea.parentNode) {
                filterArea.parentNode.insertBefore(presetsContainer, filterArea.nextSibling);
            } else {
                var ordersTab = document.getElementById('ordersTab');
                if (ordersTab) {
                    ordersTab.insertBefore(presetsContainer, ordersTab.firstChild);
                }
            }

            render();
        }

        return { init: init, render: render };
    })();


    // =========================================================================
    // FEATURE 16: URL-BASED FILTER STATE
    // =========================================================================

    PU.URLState = (function () {
        var initialized = false;

        function encodeFilters() {
            if (typeof filterState === 'undefined') return '';
            var parts = [];
            Object.keys(filterState).forEach(function (k) {
                if (filterState[k]) {
                    parts.push(encodeURIComponent(k) + ':' + encodeURIComponent(filterState[k]));
                }
            });
            return parts.length ? '#filters=' + parts.join(',') : '';
        }

        function decodeFilters() {
            var hash = window.location.hash;
            if (!hash || hash.indexOf('#filters=') !== 0) return null;
            var filterStr = hash.substring(9);
            var result = {};
            filterStr.split(',').forEach(function (pair) {
                var colonIdx = pair.indexOf(':');
                if (colonIdx === -1) return;
                var key = decodeURIComponent(pair.substring(0, colonIdx));
                var val = decodeURIComponent(pair.substring(colonIdx + 1));
                result[key] = val;
            });
            return result;
        }

        function updateURL() {
            var hash = encodeFilters();
            if (hash) {
                history.replaceState(null, '', hash);
            } else {
                history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        }

        function applyFromURL() {
            var filters = decodeFilters();
            if (!filters) return;

            if (typeof filterState !== 'undefined') {
                Object.keys(filters).forEach(function (k) {
                    filterState[k] = filters[k];
                });
            }

            // Update UI
            var map = {
                search: 'filterSearch',
                status: 'filterStatus',
                building: 'filterBuilding',
                priority: 'filterPriority',
                supplier: 'filterSupplier',
                delivery: 'filterDelivery',
                dateFrom: 'filterDateFrom',
                dateTo: 'filterDateTo'
            };

            Object.keys(map).forEach(function (filterKey) {
                var el = document.getElementById(map[filterKey]);
                if (el && filters[filterKey]) {
                    el.value = filters[filterKey];
                }
            });

            if (typeof applyFilters === 'function') {
                setTimeout(applyFilters, 200);
            }
        }

        function init() {
            if (initialized) return;
            initialized = true;

            // Apply filters from URL on load
            applyFromURL();

            // Listen for hashchange
            window.addEventListener('hashchange', function () {
                applyFromURL();
            });

            // Patch applyFilters to update URL
            var origApplyFilters = window.applyFilters;
            if (typeof origApplyFilters === 'function') {
                window.applyFilters = function () {
                    origApplyFilters.apply(this, arguments);
                    updateURL();
                };
            }
        }

        return { init: init, updateURL: updateURL };
    })();


    // =========================================================================
    // FEATURE 17: PARTS CATALOG
    // =========================================================================

    PU.PartsCatalog = (function () {
        var parts = [];
        var tabCreated = false;

        async function loadParts() {
            try {
                var res = await apiGet('/parts-catalog');
                parts = res.parts || res.data || [];
                renderPartsTab();
            } catch (e) {
                parts = [];
                renderPartsTab();
            }
        }

        function renderPartsTab() {
            var tabContent = document.getElementById('partsCatalogTab');
            if (!tabContent) return;

            if (!parts.length) {
                tabContent.innerHTML = '<div class="card"><p class="text-muted" style="padding:20px;">No parts in catalog. Parts are automatically added when orders are placed.</p></div>';
                return;
            }

            var showPriceSupplier = canSeePrices() && canSeeSuppliers();

            var html = '<div class="card"><h2 style="margin-bottom:16px;">Parts Catalog</h2>';
            html += '<div class="table-wrapper"><table><thead><tr>';
            html += '<th>Item Description</th><th>Part Number</th><th>Category</th><th>Times Ordered</th><th>Last Ordered</th>';
            if (showPriceSupplier) {
                html += '<th>Last Price</th><th>Last Supplier</th>';
            }
            html += '<th>Action</th>';
            html += '</tr></thead><tbody>';

            parts.forEach(function (p) {
                html += '<tr>';
                html += '<td>' + safeEscape(p.item_description || p.description || '') + '</td>';
                html += '<td>' + safeEscape(p.part_number || '') + '</td>';
                html += '<td>' + safeEscape(p.category || '') + '</td>';
                html += '<td>' + (p.times_ordered || p.order_count || 0) + '</td>';
                html += '<td>' + formatDateShort(p.last_ordered || p.last_ordered_date || '') + '</td>';
                if (showPriceSupplier) {
                    html += '<td>' + safeFmtPrice(p.last_price || p.unit_price || 0) + '</td>';
                    html += '<td>' + safeEscape(p.last_supplier || p.supplier_name || '') + '</td>';
                }
                html += '<td><button class="btn btn-primary btn-sm pp-reorder-btn" ' +
                    'data-desc="' + safeEscape(p.item_description || p.description || '') + '" ' +
                    'data-pn="' + safeEscape(p.part_number || '') + '" ' +
                    'data-cat="' + safeEscape(p.category || '') + '" ' +
                    'data-qty="' + (p.quantity || 1) + '" ' +
                    '>Reorder</button></td>';
                html += '</tr>';
            });

            html += '</tbody></table></div></div>';
            tabContent.innerHTML = html;

            tabContent.querySelectorAll('.pp-reorder-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    reorder(btn.dataset);
                });
            });
        }

        function reorder(data) {
            // Try to open procurement create order modal
            if (typeof openProcCreateOrderModal === 'function' && !isRequester()) {
                openProcCreateOrderModal();
                setTimeout(function () {
                    var descField = document.getElementById('procItemDescription');
                    var pnField = document.getElementById('procPartNumber');
                    var catField = document.getElementById('procCategory');
                    var qtyField = document.getElementById('procQuantity');
                    if (descField) descField.value = data.desc || '';
                    if (pnField) pnField.value = data.pn || '';
                    if (catField) catField.value = data.cat || '';
                    if (qtyField) qtyField.value = data.qty || '1';
                }, 200);
            } else {
                // Try requester form
                if (typeof switchTab === 'function') switchTab('ordersTab');
                setTimeout(function () {
                    var descField = document.getElementById('itemDescription');
                    var pnField = document.getElementById('partNumber');
                    var catField = document.getElementById('category');
                    var qtyField = document.getElementById('quantity');
                    if (descField) descField.value = data.desc || '';
                    if (pnField) pnField.value = data.pn || '';
                    if (catField) catField.value = data.cat || '';
                    if (qtyField) qtyField.value = data.qty || '1';
                    if (descField) descField.scrollIntoView({ behavior: 'smooth' });
                }, 200);
            }
        }

        function createTab() {
            if (tabCreated) return;
            tabCreated = true;

            var sidebar = document.getElementById('sidebarNav');
            if (sidebar) {
                var navItem = createEl('button', { className: 'nav-item', 'data-tab': 'partsCatalogTab' },
                    '<span class="nav-icon">&#128218;</span><span>Parts Catalog</span>');
                var dividers = sidebar.querySelectorAll('.nav-divider');
                var insertBefore = dividers.length > 0 ? dividers[0] : null;
                if (insertBefore) {
                    sidebar.insertBefore(navItem, insertBefore);
                } else {
                    sidebar.appendChild(navItem);
                }
                navItem.addEventListener('click', function () {
                    if (typeof switchTab === 'function') switchTab('partsCatalogTab');
                });
            }

            var mainContent = document.querySelector('.main-content');
            if (mainContent) {
                var tabDiv = createEl('div', { className: 'tab-content hidden', id: 'partsCatalogTab' });
                mainContent.appendChild(tabDiv);
            }
        }

        function init() {
            createTab();
            loadParts();
        }

        return { init: init, loadParts: loadParts };
    })();


    // =========================================================================
    // FEATURE 18: SUPPLIER SCORECARD
    // =========================================================================

    PU.SupplierScorecard = (function () {
        var scorecardData = [];
        var container = null;

        async function loadScorecard() {
            try {
                var res = await apiGet('/supplier-scorecard');
                scorecardData = res.scorecards || res.data || [];
                render();
            } catch (e) {
                scorecardData = [];
                render();
            }
        }

        function render() {
            if (!container) return;

            if (!scorecardData.length) {
                container.innerHTML = '<div class="card"><h3>Supplier Scorecard</h3><p class="text-muted">No scorecard data available.</p></div>';
                return;
            }

            var html = '<div class="card"><h3 style="margin-bottom:16px;">Supplier Scorecard</h3>';
            html += '<div class="pp-scorecard-grid">';

            scorecardData.forEach(function (s) {
                var onTimePct = s.on_time_percentage || s.on_time_pct || 0;
                var barColor = onTimePct >= 80 ? '#10b981' : onTimePct >= 60 ? '#f59e0b' : '#ef4444';

                html += '<div class="pp-scorecard-card">';
                html += '<div class="pp-scorecard-name">' + safeEscape(s.name || s.supplier_name || '') + '</div>';
                html += '<div class="pp-scorecard-stats">';
                html += '<div><span class="pp-scorecard-stat-value">' + (s.total_orders || 0) + '</span><span class="pp-scorecard-stat-label">Total Orders</span></div>';
                html += '<div><span class="pp-scorecard-stat-value">' + safeFmtPrice(s.total_spend || 0) + '</span><span class="pp-scorecard-stat-label">Total Spend</span></div>';
                html += '<div><span class="pp-scorecard-stat-value">' + (s.avg_delivery_days || '-') + '</span><span class="pp-scorecard-stat-label">Avg Days</span></div>';
                html += '<div><span class="pp-scorecard-stat-value">' + onTimePct.toFixed(0) + '%</span><span class="pp-scorecard-stat-label">On-Time</span></div>';
                html += '</div>';
                html += '<div class="pp-scorecard-bar-bg"><div class="pp-scorecard-bar" style="width:' + Math.min(100, onTimePct) + '%;background:' + barColor + ';"></div></div>';
                html += '</div>';
            });

            html += '</div></div>';
            container.innerHTML = html;
        }

        function init() {
            // Only for procurement/manager/admin
            if (isRequester()) return;

            injectCSS('pp-scorecard-styles', [
                '.pp-scorecard-section { margin-top:16px; }',
                '.pp-scorecard-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:16px; }',
                '.pp-scorecard-card { background:var(--bg-hover,#f9fafb); border:1px solid var(--border-color,#e5e7eb); border-radius:10px; padding:16px; }',
                '.pp-scorecard-name { font-weight:600; font-size:0.95rem; margin-bottom:10px; }',
                '.pp-scorecard-stats { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }',
                '.pp-scorecard-stat-value { display:block; font-weight:700; font-size:1.05rem; }',
                '.pp-scorecard-stat-label { display:block; font-size:0.72rem; color:var(--text-muted,#9ca3af); text-transform:uppercase; letter-spacing:0.3px; }',
                '.pp-scorecard-bar-bg { height:6px; background:var(--border-color,#e5e7eb); border-radius:3px; overflow:hidden; }',
                '.pp-scorecard-bar { height:100%; border-radius:3px; transition:width 0.5s ease; }'
            ].join('\n'));

            container = createEl('div', { className: 'pp-scorecard-section', id: 'ppSupplierScorecard' });

            // Insert into suppliers tab
            var suppliersTab = document.getElementById('suppliersTab');
            if (suppliersTab) {
                suppliersTab.appendChild(container);
            }

            loadScorecard();
        }

        return { init: init, loadScorecard: loadScorecard };
    })();


    // =========================================================================
    // FEATURE 19: SPEND FORECAST WIDGET
    // =========================================================================

    PU.SpendForecast = (function () {
        function getRecurringTotal() {
            return (ordersState || []).filter(function (o) {
                return o.is_recurring && o.status !== 'Cancelled';
            }).reduce(function (sum, o) {
                return sum + (parseFloat(o.total_price) || 0);
            }, 0);
        }

        function getThreeMonthAvg() {
            var now = new Date();
            var totals = [];
            for (var i = 1; i <= 3; i++) {
                var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                var monthTotal = (ordersState || []).reduce(function (sum, o) {
                    if (o.created_at) {
                        var od = new Date(o.created_at);
                        if (od.getMonth() === d.getMonth() && od.getFullYear() === d.getFullYear()) {
                            return sum + (parseFloat(o.total_price) || 0);
                        }
                    }
                    return sum;
                }, 0);
                totals.push(monthTotal);
            }
            if (!totals.length) return 0;
            return totals.reduce(function (a, b) { return a + b; }, 0) / totals.length;
        }

        function render() {
            var el = document.getElementById('ppSpendForecast');
            if (!el) return;

            var recurringTotal = getRecurringTotal();
            var avgSpend = getThreeMonthAvg();
            var forecast = recurringTotal + avgSpend;

            el.innerHTML = '<div class="pp-dash-subtitle" style="margin-top:12px;">Spend Forecast (Next Month)</div>' +
                '<div class="pp-dash-row">' +
                '<div class="pp-dash-card" style="border-left:4px solid #8b5cf6;">' +
                '<div class="pp-dash-card-count">' + safeFmtPrice(recurringTotal) + '</div>' +
                '<div class="pp-dash-card-label">Recurring Orders</div></div>' +
                '<div class="pp-dash-card" style="border-left:4px solid #06b6d4;">' +
                '<div class="pp-dash-card-count">' + safeFmtPrice(avgSpend) + '</div>' +
                '<div class="pp-dash-card-label">3-Month Avg</div></div>' +
                '<div class="pp-dash-card" style="border-left:4px solid #10b981;">' +
                '<div class="pp-dash-card-count">' + safeFmtPrice(forecast) + '</div>' +
                '<div class="pp-dash-card-label">Projected Total</div></div>' +
                '</div>';
        }

        function init() {
            // Only for procurement/admin - NOT requester
            if (isRequester() || isManager()) return;

            var dashBody = document.getElementById('ppDashBody');
            if (dashBody) {
                var el = createEl('div', { id: 'ppSpendForecast' });
                dashBody.appendChild(el);
                render();
            }
        }

        return { init: init, render: render };
    })();


    // =========================================================================
    // FEATURE 20: RECURRING ORDERS
    // =========================================================================

    PU.RecurringOrders = (function () {
        var FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly'];

        function addRecurringUI(order, detailBody) {
            if (!detailBody || !order) return;
            if (isRequester() || isManager()) return; // Only procurement/admin

            var existing = detailBody.querySelector('.pp-recurring-section');
            if (existing) existing.remove();

            var section = createEl('div', { className: 'pp-recurring-section', style: 'margin-top:16px; border-top:1px solid var(--border-color,#e5e7eb); padding-top:12px;' });

            if (order.is_recurring) {
                section.innerHTML = '<div class="detail-section-title">Recurring Order</div>' +
                    '<div style="margin-top:6px;">' +
                    '<span class="pp-recurring-badge">Recurring: ' + safeEscape(order.recurring_frequency || 'monthly') + '</span>' +
                    ' <button class="btn btn-secondary btn-sm pp-cancel-recurring">Cancel Recurring</button>' +
                    '</div>';

                section.querySelector('.pp-cancel-recurring').addEventListener('click', async function () {
                    try {
                        await apiPut('/orders/' + order.id, { is_recurring: 0, recurring_frequency: null });
                        alert('Recurring cancelled');
                        if (typeof openOrderDetail === 'function') openOrderDetail(order.id);
                    } catch (e) { alert('Failed to cancel recurring'); }
                });
            } else {
                section.innerHTML = '<div class="detail-section-title">Make Recurring</div>' +
                    '<div style="margin-top:6px; display:flex; align-items:center; gap:8px;">' +
                    '<select class="form-control pp-recurring-freq" style="width:auto;">' +
                    FREQUENCIES.map(function (f) { return '<option value="' + f + '">' + f.charAt(0).toUpperCase() + f.slice(1) + '</option>'; }).join('') +
                    '</select>' +
                    '<button class="btn btn-primary btn-sm pp-mark-recurring">Mark as Recurring</button>' +
                    '</div>';

                section.querySelector('.pp-mark-recurring').addEventListener('click', async function () {
                    var freq = section.querySelector('.pp-recurring-freq').value;
                    try {
                        await apiPut('/orders/' + order.id, { is_recurring: 1, recurring_frequency: freq });
                        alert('Order marked as recurring (' + freq + ')');
                        if (typeof openOrderDetail === 'function') openOrderDetail(order.id);
                        if (typeof loadOrders === 'function') loadOrders();
                    } catch (e) { alert('Failed to mark as recurring'); }
                });
            }

            detailBody.appendChild(section);
        }

        function addRecurringBadges() {
            var rows = document.querySelectorAll('#ordersTable tr[data-id]');
            rows.forEach(function (row) {
                var id = parseInt(row.dataset.id, 10);
                var order = (ordersState || []).find(function (o) { return o.id === id; });
                if (order && order.is_recurring) {
                    var firstCell = row.querySelector('td:nth-child(2)'); // ID cell (or 3rd if checkbox)
                    if (!firstCell) firstCell = row.querySelector('td');
                    if (firstCell && !firstCell.querySelector('.pp-recurring-badge-inline')) {
                        var badge = createEl('span', { className: 'pp-recurring-badge-inline', title: 'Recurring: ' + (order.recurring_frequency || 'monthly') }, ' &#128257;');
                        firstCell.appendChild(badge);
                    }
                }
            });
        }

        function init() {
            injectCSS('pp-recurring-styles', [
                '.pp-recurring-badge { background:#ede9fe; color:#7c3aed; padding:3px 10px; border-radius:12px; font-size:0.82rem; font-weight:500; }',
                '.pp-recurring-badge-inline { font-size:0.8rem; cursor:help; }'
            ].join('\n'));

            // Observe order detail body
            var detailBody = document.getElementById('orderDetailBody');
            if (detailBody) {
                new MutationObserver(function () {
                    var idEl = detailBody.querySelector('.btn-copy-id');
                    if (idEl) {
                        var match = (idEl.getAttribute('onclick') || '').match(/copyOrderId\((\d+)\)/);
                        if (match) {
                            var orderId = parseInt(match[1], 10);
                            var order = (ordersState || []).find(function (o) { return o.id === orderId; });
                            if (order) addRecurringUI(order, detailBody);
                        }
                    }
                }).observe(detailBody, { childList: true, subtree: true });
            }

            // Observe table for recurring badges
            var target = document.getElementById('ordersTable');
            if (target) {
                new MutationObserver(function () {
                    setTimeout(addRecurringBadges, 80);
                }).observe(target, { childList: true, subtree: true });
            }
        }

        return { init: init };
    })();


    // =========================================================================
    // FEATURE 21: PRINT ORDER DETAIL
    // =========================================================================

    PU.PrintOrder = (function () {
        function addPrintButton(order, detailBody) {
            if (!detailBody || !order) return;
            var existing = detailBody.querySelector('.pp-print-order-btn');
            if (existing) existing.remove();

            var btn = createEl('button', {
                className: 'btn btn-secondary btn-sm pp-print-order-btn',
                style: 'margin-top:12px; margin-right:8px;'
            }, '&#128424; Print');

            btn.addEventListener('click', function () {
                printOrder(order);
            });

            // Insert at top
            detailBody.insertBefore(btn, detailBody.firstChild);
        }

        function printOrder(order) {
            var win = window.open('', '_blank', 'width=800,height=900');
            if (!win) return;

            var showPrices = canSeePrices();
            var priceSection = '';
            if (showPrices) {
                priceSection = '<tr><td class="label">Supplier</td><td>' + safeEscape(order.supplier_name || '-') + '</td></tr>' +
                    '<tr><td class="label">Unit Price</td><td>' + safeFmtPrice(order.unit_price) + '</td></tr>' +
                    '<tr><td class="label">Total Price</td><td>' + safeFmtPrice(order.total_price) + '</td></tr>';
            }

            win.document.write('<!DOCTYPE html><html><head><title>Order #' + order.id + '</title>' +
                '<style>' +
                'body { font-family:Arial,sans-serif; padding:30px; max-width:700px; margin:0 auto; color:#111; }' +
                'h1 { font-size:1.3rem; border-bottom:2px solid #111; padding-bottom:8px; }' +
                'table { width:100%; border-collapse:collapse; margin:16px 0; }' +
                'td { padding:6px 10px; border-bottom:1px solid #e5e7eb; font-size:0.9rem; vertical-align:top; }' +
                'td.label { font-weight:600; width:150px; color:#4b5563; }' +
                '.desc { margin:16px 0; padding:12px; background:#f9fafb; border-radius:6px; font-size:0.9rem; white-space:pre-wrap; }' +
                '.footer { margin-top:30px; font-size:0.75rem; color:#9ca3af; text-align:center; }' +
                '@media print { body { padding:10px; } }' +
                '</style></head><body>' +
                '<h1>PartPulse Order #' + order.id + '</h1>' +
                '<table>' +
                '<tr><td class="label">Status</td><td>' + safeEscape(order.status) + '</td></tr>' +
                '<tr><td class="label">Building</td><td>' + safeEscape(order.building) + '</td></tr>' +
                '<tr><td class="label">Priority</td><td>' + safeEscape(order.priority || 'Normal') + '</td></tr>' +
                '<tr><td class="label">Quantity</td><td>' + (order.quantity || '-') + '</td></tr>' +
                '<tr><td class="label">Part Number</td><td>' + safeEscape(order.part_number || '-') + '</td></tr>' +
                '<tr><td class="label">Category</td><td>' + safeEscape(order.category || '-') + '</td></tr>' +
                '<tr><td class="label">Date Needed</td><td>' + formatDateShort(order.date_needed) + '</td></tr>' +
                '<tr><td class="label">Requester</td><td>' + safeEscape(order.requester_name || '-') + '</td></tr>' +
                priceSection +
                '</table>' +
                '<div class="desc"><strong>Item Description:</strong><br>' + safeEscape(order.item_description) + '</div>' +
                (order.notes ? '<div class="desc"><strong>Notes:</strong><br>' + safeEscape(order.notes) + '</div>' : '') +
                '<div class="footer">Printed from PartPulse Orders on ' + new Date().toLocaleString() + '</div>' +
                '<script>setTimeout(function(){window.print();},300);<\/script>' +
                '</body></html>');
            win.document.close();
        }

        function init() {
            var detailBody = document.getElementById('orderDetailBody');
            if (detailBody) {
                new MutationObserver(function () {
                    var idEl = detailBody.querySelector('.btn-copy-id');
                    if (idEl) {
                        var match = (idEl.getAttribute('onclick') || '').match(/copyOrderId\((\d+)\)/);
                        if (match) {
                            var orderId = parseInt(match[1], 10);
                            var order = (ordersState || []).find(function (o) { return o.id === orderId; });
                            if (order) addPrintButton(order, detailBody);
                        }
                    }
                }).observe(detailBody, { childList: true, subtree: true });
            }
        }

        return { init: init };
    })();


    // =========================================================================
    // FEATURE 22: ACTIVE FILTER CHIPS
    // =========================================================================

    PU.ActiveFilterChips = (function () {
        var container = null;
        var observer = null;

        var FILTER_LABELS = {
            search: 'Search',
            status: 'Status',
            building: 'Building',
            priority: 'Priority',
            supplier: 'Supplier',
            delivery: 'Delivery',
            quickFilter: 'Quick Filter',
            dateFrom: 'From',
            dateTo: 'To',
            costMin: 'Min Cost',
            costMax: 'Max Cost'
        };

        function getActiveFilters() {
            if (typeof filterState === 'undefined') return [];
            var result = [];
            Object.keys(filterState).forEach(function (k) {
                if (filterState[k]) {
                    var label = FILTER_LABELS[k] || k;
                    var val = filterState[k];
                    // Try to get display value for supplier
                    if (k === 'supplier' && suppliersState) {
                        var s = suppliersState.find(function (sup) { return String(sup.id) === String(val); });
                        if (s) val = s.name;
                    }
                    result.push({ key: k, label: label, value: val });
                }
            });
            return result;
        }

        function removeFilter(key) {
            if (typeof filterState === 'undefined') return;
            filterState[key] = '';

            // Update UI elements
            var map = {
                search: 'filterSearch',
                status: 'filterStatus',
                building: 'filterBuilding',
                priority: 'filterPriority',
                supplier: 'filterSupplier',
                delivery: 'filterDelivery',
                dateFrom: 'filterDateFrom',
                dateTo: 'filterDateTo'
            };

            if (map[key]) {
                var el = document.getElementById(map[key]);
                if (el) el.value = '';
            }

            if (key === 'quickFilter') {
                document.querySelectorAll('.quick-filter-chip').forEach(function (c) { c.classList.remove('active'); });
            }

            if (typeof applyFilters === 'function') applyFilters();
        }

        function render() {
            if (!container) return;
            var active = getActiveFilters();
            if (!active.length) {
                container.innerHTML = '';
                container.classList.add('hidden');
                return;
            }

            container.classList.remove('hidden');
            container.innerHTML = active.map(function (f) {
                return '<div class="pp-filter-chip">' +
                    '<span class="pp-filter-chip-label">' + safeEscape(f.label) + ':</span> ' +
                    '<span class="pp-filter-chip-value">' + safeEscape(f.value) + '</span>' +
                    '<button class="pp-filter-chip-remove" data-key="' + f.key + '" title="Remove filter">&times;</button>' +
                    '</div>';
            }).join('');

            container.querySelectorAll('.pp-filter-chip-remove').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    removeFilter(btn.dataset.key);
                });
            });
        }

        function init() {
            injectCSS('pp-chips-styles', [
                '.pp-filter-chips { display:flex; gap:6px; flex-wrap:wrap; margin:8px 0; }',
                '.pp-filter-chips.hidden { display:none; }',
                '.pp-filter-chip { display:inline-flex; align-items:center; background:var(--bg-active,#eff6ff); border:1px solid var(--primary-light,#bfdbfe); border-radius:16px; padding:2px 6px 2px 10px; font-size:0.8rem; gap:4px; }',
                '.pp-filter-chip-label { font-weight:600; color:var(--primary,#2563eb); }',
                '.pp-filter-chip-value { color:var(--text-secondary,#4b5563); }',
                '.pp-filter-chip-remove { background:none; border:none; cursor:pointer; font-size:1rem; line-height:1; color:var(--text-muted,#9ca3af); padding:0 4px; }',
                '.pp-filter-chip-remove:hover { color:#ef4444; }'
            ].join('\n'));

            container = createEl('div', { className: 'pp-filter-chips hidden', id: 'ppActiveFilterChips' });

            // Insert after filter presets or filter area
            var presets = document.getElementById('ppFilterPresets');
            if (presets && presets.parentNode) {
                presets.parentNode.insertBefore(container, presets.nextSibling);
            } else {
                var ordersTab = document.getElementById('ordersTab');
                if (ordersTab) {
                    var ordersTableEl = document.getElementById('ordersTable');
                    if (ordersTableEl) {
                        ordersTab.insertBefore(container, ordersTableEl);
                    } else {
                        ordersTab.appendChild(container);
                    }
                }
            }

            // Patch applyFilters to update chips
            var origApplyFilters = window.applyFilters;
            if (typeof origApplyFilters === 'function') {
                window.applyFilters = function () {
                    origApplyFilters.apply(this, arguments);
                    render();
                };
            }

            render();
        }

        return { init: init, render: render };
    })();


    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    function waitForUser(callback) {
        function check() {
            if (typeof currentUser !== 'undefined' && currentUser && currentUser.role) {
                callback();
            } else {
                requestAnimationFrame(check);
            }
        }
        check();
    }

    function initAll() {
        waitForUser(function () {
            try {
                // Core features (all roles)
                PU.GlobalSearch.init();
                PU.TableSort.init();
                PU.DarkMode.init();
                PU.Notifications.init();
                PU.KeyboardShortcuts.init();
                PU.Dashboard.init();
                PU.Templates.init();
                PU.CSVExport.init();
                PU.ColumnConfig.init();
                PU.RowDensity.init();
                PU.DuplicateDetection.init();
                PU.QRCode.init();
                PU.CopyButton.init();
                PU.FilterPresets.init();
                PU.URLState.init();
                PU.PartsCatalog.init();
                PU.ActiveFilterChips.init();
                PU.PrintOrder.init();
                PU.RecurringOrders.init();

                // Role-gated features
                if (!isRequester()) {
                    PU.SupplierScorecard.init();
                }

                if (isAdmin() || isProcurement()) {
                    PU.CSVImport.init();
                    PU.SpendForecast.init();
                }

                console.log('[PartPulseUpgrade] All features initialized for role:', currentUser.role);
            } catch (e) {
                console.error('[PartPulseUpgrade] Initialization error:', e);
            }
        });
    }

    // Start initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAll);
    } else {
        initAll();
    }

})();
