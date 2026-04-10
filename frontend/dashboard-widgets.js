// frontend/dashboard-widgets.js - Dashboard Summary Cards & Activity Feed
// PartPulse Orders v3.0

(function() {
    'use strict';

    function renderDashboardSummary(targetId) {
        const container = document.getElementById(targetId);
        if (!container) return;

        const orders = window.ordersState || [];
        const user = window.currentUser;
        if (!user) return;

        const stats = computeStats(orders, user);

        let html = '<div class="dashboard-summary">';

        if (user.role === 'requester') {
            html += summaryCard('My Orders', stats.totalOrders, '', 'accent');
            html += summaryCard('Open', stats.openOrders, 'Not yet delivered', 'warning');
            html += summaryCard('Delivered', stats.deliveredOrders, 'Completed', 'success');
            html += summaryCard('Urgent', stats.urgentOrders, 'High priority', stats.urgentOrders > 0 ? 'error' : 'accent');
        } else if (user.role === 'manager') {
            html += summaryCard('Pending Approvals', stats.pendingApprovals, 'Awaiting your review', stats.pendingApprovals > 0 ? 'warning' : 'success');
            html += summaryCard('Total Orders', stats.totalOrders, 'All orders', 'accent');
            html += summaryCard('Overdue', stats.overdueOrders, 'Past expected delivery', stats.overdueOrders > 0 ? 'error' : 'success');
            html += summaryCard('This Week', stats.thisWeekOrders, 'New orders this week', 'accent');
        } else {
            // Admin / Procurement
            html += summaryCard('Total Orders', stats.totalOrders, `${stats.newOrders} new`, 'accent');
            html += summaryCard('Open Orders', stats.openOrders, 'Awaiting action', stats.openOrders > 20 ? 'warning' : 'accent');
            html += summaryCard('Overdue', stats.overdueOrders, 'Past expected delivery', stats.overdueOrders > 0 ? 'error' : 'success');
            html += summaryCard('Delivered', stats.deliveredOrders, 'This month', 'success');

            if (user.role === 'admin' || user.role === 'procurement') {
                html += summaryCard('Total Spend', formatCurrency(stats.totalSpend), 'Ordered + Delivered', 'accent');
                html += summaryCard('Pending Quotes', stats.pendingQuotes, 'Awaiting response', stats.pendingQuotes > 0 ? 'warning' : 'accent');
                html += summaryCard('In Transit', stats.inTransitOrders, 'On the way', 'accent');
                html += summaryCard('Urgent', stats.urgentOrders, 'Needs attention', stats.urgentOrders > 0 ? 'error' : 'success');
            }
        }

        html += '</div>';
        container.innerHTML = html;
    }

    function computeStats(orders, user) {
        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const deliveredStatuses = ['Delivered'];
        const openStatuses = ['New', 'Pending', 'Quote Requested', 'Quote Received', 'Quote Under Approval', 'Approved', 'Ordered', 'In Transit', 'Partially Delivered'];

        let totalSpend = 0;
        let newOrders = 0;
        let openOrders = 0;
        let deliveredOrders = 0;
        let overdueOrders = 0;
        let urgentOrders = 0;
        let inTransitOrders = 0;
        let pendingQuotes = 0;
        let thisWeekOrders = 0;

        orders.forEach(o => {
            if (o.status === 'New') newOrders++;
            if (openStatuses.includes(o.status)) openOrders++;
            if (deliveredStatuses.includes(o.status)) deliveredOrders++;
            if (o.status === 'In Transit') inTransitOrders++;
            if (o.status === 'Quote Requested') pendingQuotes++;
            if (o.priority === 'Urgent' || o.priority === 'High') urgentOrders++;

            if (o.expected_delivery_date && openStatuses.includes(o.status)) {
                const expected = new Date(o.expected_delivery_date);
                if (expected < now) overdueOrders++;
            }

            if (o.total_price && (o.status === 'Ordered' || o.status === 'In Transit' || o.status === 'Delivered')) {
                totalSpend += parseFloat(o.total_price) || 0;
            }

            if (o.created_at) {
                const created = new Date(o.created_at);
                if (created >= weekAgo) thisWeekOrders++;
            }
        });

        return {
            totalOrders: orders.length,
            newOrders,
            openOrders,
            deliveredOrders,
            overdueOrders,
            urgentOrders,
            inTransitOrders,
            pendingQuotes,
            thisWeekOrders,
            totalSpend,
            pendingApprovals: 0 // Updated by approvals module
        };
    }

    function summaryCard(label, value, detail, colorClass) {
        return `<div class="summary-card">
            <div class="card-label">${label}</div>
            <div class="card-value ${colorClass || ''}">${value}</div>
            ${detail ? `<div class="card-detail">${detail}</div>` : ''}
        </div>`;
    }

    function formatCurrency(amount) {
        if (!amount || isNaN(amount)) return '0.00';
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    window.DashboardWidgets = { render: renderDashboardSummary };
})();
