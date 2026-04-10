// frontend/notifications.js - In-App Notification System
// PartPulse Orders v3.0 - World-Class Upgrade

(function() {
    'use strict';

    let notifications = [];
    let unreadCount = 0;
    let dropdownOpen = false;
    let pollInterval = null;

    function init() {
        createNotificationUI();
        startPolling();
    }

    function createNotificationUI() {
        // The bell button and dropdown are in the header (added by index.html upgrade)
        const bell = document.getElementById('notificationBell');
        const dropdown = document.getElementById('notificationDropdown');
        if (!bell || !dropdown) return;

        bell.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown();
        });

        document.addEventListener('click', (e) => {
            if (dropdown && !dropdown.contains(e.target) && e.target !== bell) {
                closeDropdown();
            }
        });

        const markAllBtn = document.getElementById('markAllRead');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', markAllAsRead);
        }
    }

    function toggleDropdown() {
        const dropdown = document.getElementById('notificationDropdown');
        if (!dropdown) return;
        dropdownOpen = !dropdownOpen;
        dropdown.classList.toggle('hidden', !dropdownOpen);
        if (dropdownOpen) renderNotifications();
    }

    function closeDropdown() {
        const dropdown = document.getElementById('notificationDropdown');
        if (!dropdown) return;
        dropdownOpen = false;
        dropdown.classList.add('hidden');
    }

    async function fetchNotifications() {
        if (!window.authToken) return;
        try {
            const res = await fetch('/api/notifications', {
                headers: { 'Authorization': `Bearer ${window.authToken}` }
            });
            const data = await res.json();
            if (data.success) {
                notifications = data.notifications || [];
                unreadCount = notifications.filter(n => !n.is_read).length;
                updateBadge();
            }
        } catch (err) {
            // API might not exist yet - use local notifications
            updateBadge();
        }
    }

    function updateBadge() {
        const badge = document.getElementById('bellBadge');
        if (!badge) return;
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    function renderNotifications() {
        const body = document.getElementById('notificationDropdownBody');
        if (!body) return;

        if (notifications.length === 0) {
            body.innerHTML = '<div class="notification-empty">No notifications</div>';
            return;
        }

        let html = '';
        notifications.slice(0, 20).forEach(n => {
            const icon = getNotifIcon(n.type);
            const timeAgo = formatTimeAgo(n.created_at);
            html += `<div class="notification-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-order="${n.related_order_id || ''}">
                <span class="notif-icon">${icon}</span>
                <div class="notif-content">
                    <div class="notif-title">${escapeHtml(n.title)}</div>
                    <div class="notif-time">${timeAgo}</div>
                </div>
            </div>`;
        });
        body.innerHTML = html;

        body.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = parseInt(item.dataset.id);
                const orderId = parseInt(item.dataset.order);
                markAsRead(id);
                if (orderId && typeof openOrderDetail === 'function') {
                    closeDropdown();
                    openOrderDetail(orderId);
                }
            });
        });
    }

    function getNotifIcon(type) {
        const icons = {
            'status_change': '&#128260;',
            'approval_needed': '&#9989;',
            'approval_result': '&#128203;',
            'overdue': '&#9888;',
            'delivery_today': '&#128666;',
            'comment': '&#128172;',
            'assignment': '&#128100;',
            'system': '&#128276;'
        };
        return icons[type] || '&#128276;';
    }

    function formatTimeAgo(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    }

    async function markAsRead(id) {
        try {
            await fetch(`/api/notifications/${id}/read`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${window.authToken}` }
            });
        } catch (err) {
            // Silently handle - notification read state is not critical
        }
        const n = notifications.find(n => n.id === id);
        if (n) n.is_read = true;
        unreadCount = notifications.filter(n => !n.is_read).length;
        updateBadge();
        renderNotifications();
    }

    async function markAllAsRead() {
        try {
            await fetch('/api/notifications/read-all', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${window.authToken}` }
            });
        } catch (err) {}
        notifications.forEach(n => n.is_read = true);
        unreadCount = 0;
        updateBadge();
        renderNotifications();
    }

    // Add local notification (for real-time events)
    function addLocalNotification(title, type, orderId) {
        const n = {
            id: Date.now(),
            title,
            type,
            related_order_id: orderId,
            is_read: false,
            created_at: new Date().toISOString()
        };
        notifications.unshift(n);
        unreadCount++;
        updateBadge();

        // Show toast
        if (window.Toast) {
            window.Toast.show(title, 'info');
        }
    }

    function startPolling() {
        fetchNotifications();
        pollInterval = setInterval(fetchNotifications, 60000); // Every 60s
    }

    function stopPolling() {
        if (pollInterval) clearInterval(pollInterval);
    }

    window.Notifications = {
        init,
        add: addLocalNotification,
        fetch: fetchNotifications,
        stop: stopPolling
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
