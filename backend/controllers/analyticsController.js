// backend/controllers/analyticsController.js - Analytics & Financial Data
const db = require('../config/database');

// Helper: build date filter clause
function buildDateFilter(query, dateColumn = 'submission_date') {
    const { months, dateFrom, dateTo } = query;
    const clauses = [];
    const params = [];

    if (dateFrom) {
        clauses.push(` AND ${dateColumn} >= ?`);
        params.push(dateFrom);
    }
    if (dateTo) {
        clauses.push(` AND ${dateColumn} <= ?`);
        params.push(dateTo + ' 23:59:59');
    }
    if (!dateFrom && !dateTo && months) {
        clauses.push(` AND ${dateColumn} >= DATE_SUB(NOW(), INTERVAL ? MONTH)`);
        params.push(parseInt(months));
    }

    return { clause: clauses.join(''), params };
}

function buildAnalyticsScope(req, alias = '') {
    if (!req.user || req.user.role !== 'manager') return { clause: '', params: [] };
    if (!Array.isArray(req.authzBuildingCodes) || !req.authzBuildingCodes.length) {
        return { clause: ' AND 1 = 0', params: [] };
    }
    const column = alias ? `${alias}.building` : 'building';
    return { clause: ` AND ${column} IN (?)`, params: [req.authzBuildingCodes] };
}

function scopedFilter(req, dateFilter, alias = '') {
    const scope = buildAnalyticsScope(req, alias);
    return {
        clause: `${dateFilter.clause}${scope.clause}`,
        params: [...dateFilter.params, ...scope.params]
    };
}

// GET /api/analytics/summary
exports.getSummary = async (req, res) => {
    try {
        const df = buildDateFilter(req.query);
        const scopedDf = scopedFilter(req, df);
        const scopedODf = scopedFilter(req, df, 'o');

        // Compute previous period params for comparison
        let prevDf = { clause: '', params: [] };
        const { months, dateFrom, dateTo } = req.query;
        if (months) {
            const m = parseInt(months);
            prevDf.clause = ` AND submission_date >= DATE_SUB(NOW(), INTERVAL ? MONTH) AND submission_date < DATE_SUB(NOW(), INTERVAL ? MONTH)`;
            prevDf.params = [m * 2, m];
        } else if (dateFrom && dateTo) {
            const from = new Date(dateFrom);
            const to = new Date(dateTo);
            const diff = to - from;
            const prevTo = new Date(from.getTime() - 1);
            const prevFrom = new Date(prevTo.getTime() - diff);
            const fmt = d => d.toISOString().slice(0, 10);
            prevDf.clause = ` AND submission_date >= ? AND submission_date <= ?`;
            prevDf.params = [fmt(prevFrom), fmt(prevTo) + ' 23:59:59'];
        }

        let prevTotalRow = null;
        if (prevDf.clause) {
            [[prevTotalRow]] = await db.query(
                `SELECT COUNT(*) AS totalOrders,
                 COALESCE(SUM(CASE WHEN total_price > 0 THEN total_price ELSE 0 END),0) AS totalSpend,
                 COALESCE(AVG(CASE WHEN total_price > 0 THEN total_price ELSE NULL END),0) AS avgOrderValue
                 FROM orders WHERE 1=1${prevDf.clause}${buildAnalyticsScope(req).clause}`,
                [...prevDf.params, ...buildAnalyticsScope(req).params]
            );
        }

        const [[totalRow]] = await db.query(
            `SELECT
                COUNT(*) AS totalOrders,
                COALESCE(SUM(CASE WHEN total_price > 0 THEN total_price ELSE 0 END), 0) AS totalSpend,
                COALESCE(AVG(CASE WHEN total_price > 0 THEN total_price ELSE NULL END), 0) AS avgOrderValue,
                COUNT(CASE WHEN DATE_FORMAT(submission_date, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m') THEN 1 END) AS ordersThisMonth,
                COALESCE(SUM(CASE WHEN DATE_FORMAT(submission_date, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m') AND total_price > 0 THEN total_price ELSE 0 END), 0) AS spendThisMonth,
                COUNT(CASE WHEN status NOT IN ('Delivered','Cancelled') THEN 1 END) AS ordersInProgress
            FROM orders WHERE 1=1${scopedDf.clause}`,
            scopedDf.params
        );

        // BUG FIX: use order_history transitions for accurate lead time
        // instead of delivery_confirmed_at which is often NULL
        const [[deliveryRow]] = await db.query(
            `SELECT
                COALESCE(
                    AVG(
                        CASE WHEN h_delivered.new_value = 'Delivered'
                        THEN DATEDIFF(h_delivered.changed_at, o.submission_date) END
                    ), 0
                ) AS avgLeadTimeDays,
                COALESCE(COUNT(CASE WHEN o.status = 'Delivered' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 0) AS deliveryRate,
                COALESCE(COUNT(CASE WHEN o.status = 'Cancelled' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 0) AS cancelledRate
            FROM orders o
            LEFT JOIN order_history h_delivered
                ON h_delivered.order_id = o.id
                AND h_delivered.new_value = 'Delivered'
                AND h_delivered.id = (
                    SELECT MIN(hh.id) FROM order_history hh
                    WHERE hh.order_id = o.id AND hh.new_value = 'Delivered'
                )
            WHERE 1=1${scopedODf.clause}`,
            scopedODf.params
        );

        const [[pendingRow]] = await db.query(
            `SELECT COUNT(*) AS pendingApprovals
             FROM approvals a
             INNER JOIN orders o ON o.id = a.order_id
             WHERE a.status = 'pending'${buildAnalyticsScope(req, 'o').clause}`,
            buildAnalyticsScope(req, 'o').params
        );

        const [topSupplierRows] = await db.query(
            `SELECT s.name AS topSupplierName, COALESCE(SUM(o.total_price), 0) AS topSupplierSpend
            FROM orders o
            JOIN suppliers s ON o.supplier_id = s.id
            WHERE o.total_price > 0${scopedODf.clause}
            GROUP BY o.supplier_id, s.name
            ORDER BY topSupplierSpend DESC
            LIMIT 1`,
            scopedODf.params
        );

        // NEW: Active suppliers count
        const [[suppliersRow]] = await db.query(
            `SELECT COUNT(DISTINCT o.supplier_id) AS activeSuppliers
             FROM orders o
             WHERE o.supplier_id IS NOT NULL${scopedODf.clause}`,
            scopedODf.params
        );

        // On-time rate: delivered within 14 days of submission (no expected_delivery_date column)
        const [[onTimeRow]] = await db.query(
            `SELECT
                COALESCE(
                    COUNT(CASE WHEN o.status = 'Delivered'
                        AND h_del.changed_at IS NOT NULL
                        AND DATEDIFF(h_del.changed_at, o.submission_date) <= 14 THEN 1 END
                    ) * 100.0 / NULLIF(
                        COUNT(CASE WHEN o.status = 'Delivered' AND h_del.changed_at IS NOT NULL THEN 1 END), 0
                    ), 0
                ) AS onTimeRate
            FROM orders o
            LEFT JOIN order_history h_del
                ON h_del.order_id = o.id
                AND h_del.new_value = 'Delivered'
                AND h_del.id = (
                    SELECT MIN(hh.id) FROM order_history hh
                    WHERE hh.order_id = o.id AND hh.new_value = 'Delivered'
                )
            WHERE 1=1${scopedODf.clause}`,
            scopedODf.params
        );

        res.json({
            totalOrders: totalRow.totalOrders,
            totalSpend: parseFloat(totalRow.totalSpend),
            avgOrderValue: parseFloat(totalRow.avgOrderValue),
            ordersThisMonth: totalRow.ordersThisMonth,
            spendThisMonth: parseFloat(totalRow.spendThisMonth),
            pendingApprovals: pendingRow.pendingApprovals,
            avgLeadTimeDays: parseFloat(deliveryRow.avgLeadTimeDays),
            topSupplierName: topSupplierRows.length > 0 ? topSupplierRows[0].topSupplierName : null,
            topSupplierSpend: topSupplierRows.length > 0 ? parseFloat(topSupplierRows[0].topSupplierSpend) : 0,
            deliveryRate: parseFloat(deliveryRow.deliveryRate),
            cancelledRate: parseFloat(deliveryRow.cancelledRate),
            ordersInProgress: totalRow.ordersInProgress,
            activeSuppliers: suppliersRow.activeSuppliers,
            onTimeRate: parseFloat(onTimeRow.onTimeRate),
            previousPeriod: {
                totalOrders: prevTotalRow ? prevTotalRow.totalOrders : null,
                totalSpend: prevTotalRow ? parseFloat(prevTotalRow.totalSpend) : null,
                avgOrderValue: prevTotalRow ? parseFloat(prevTotalRow.avgOrderValue) : null,
            }
        });
    } catch (error) {
        console.error('Analytics summary error:', error);
        res.status(500).json({ success: false, message: 'Failed to load analytics summary' });
    }
};

// GET /api/analytics/spend-over-time?months=12
exports.getSpendOverTime = async (req, res) => {
    try {
        const df = buildDateFilter(req.query);
        const scope = buildAnalyticsScope(req);
        const hasDateFilter = df.clause.length > 0;
        let whereClause = 'WHERE submission_date IS NOT NULL';
        let queryParams;
        if (hasDateFilter) {
            whereClause += df.clause;
            queryParams = [...df.params, ...scope.params];
        } else {
            whereClause += ' AND submission_date >= DATE_SUB(NOW(), INTERVAL ? MONTH)';
            queryParams = [12, ...scope.params];
        }
        whereClause += scope.clause;
        const [rows] = await db.query(
            `SELECT DATE_FORMAT(submission_date, '%Y-%m') AS period,
                COALESCE(SUM(CASE WHEN total_price > 0 THEN total_price ELSE 0 END), 0) AS total,
                COUNT(*) AS count
            FROM orders
            ${whereClause}
            GROUP BY period
            ORDER BY period`,
            queryParams
        );
        res.json(rows.map(r => ({ period: r.period, total: parseFloat(r.total), count: r.count })));
    } catch (error) {
        console.error('Spend over time error:', error);
        res.status(500).json({ success: false, message: 'Failed to load spend over time' });
    }
};

// GET /api/analytics/spend-by-building
exports.getSpendByBuilding = async (req, res) => {
    try {
        const df = buildDateFilter(req.query);
        const scopedDf = scopedFilter(req, df, 'o');
        const [rows] = await db.query(
            `SELECT
                COALESCE(o.building, 'Unknown') AS building,
                COALESCE(b.name, o.building, 'Unknown') AS buildingName,
                COALESCE(SUM(CASE WHEN o.total_price > 0 THEN o.total_price ELSE 0 END), 0) AS total,
                COUNT(*) AS count
            FROM orders o
            LEFT JOIN buildings b ON o.building = b.code
            WHERE 1=1${scopedDf.clause}
            GROUP BY o.building, b.name
            ORDER BY total DESC`,
            scopedDf.params
        );
        const grandTotal = rows.reduce((sum, r) => sum + parseFloat(r.total), 0);
        res.json(rows.map(r => ({
            building: r.building,
            buildingName: r.buildingName,
            total: parseFloat(r.total),
            count: r.count,
            percent: grandTotal > 0 ? parseFloat(((parseFloat(r.total) / grandTotal) * 100).toFixed(1)) : 0
        })));
    } catch (error) {
        console.error('Spend by building error:', error);
        res.status(500).json({ success: false, message: 'Failed to load spend by building' });
    }
};

// GET /api/analytics/spend-by-supplier?limit=10
exports.getSpendBySupplier = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const df = buildDateFilter(req.query);
        const scopedDf = scopedFilter(req, df, 'o');
        const [rows] = await db.query(
            `SELECT
                o.supplier_id AS supplierId,
                COALESCE(s.name, 'Unassigned') AS supplierName,
                COALESCE(SUM(CASE WHEN o.total_price > 0 THEN o.total_price ELSE 0 END), 0) AS total,
                COUNT(*) AS orderCount,
                COALESCE(AVG(CASE WHEN o.total_price > 0 THEN o.total_price ELSE NULL END), 0) AS avgValue
            FROM orders o
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            WHERE o.supplier_id IS NOT NULL${scopedDf.clause}
            GROUP BY o.supplier_id, s.name
            ORDER BY total DESC
            LIMIT ?`,
            [...scopedDf.params, limit]
        );
        res.json(rows.map(r => ({
            supplierId: r.supplierId,
            supplierName: r.supplierName,
            total: parseFloat(r.total),
            orderCount: r.orderCount,
            avgValue: parseFloat(r.avgValue)
        })));
    } catch (error) {
        console.error('Spend by supplier error:', error);
        res.status(500).json({ success: false, message: 'Failed to load spend by supplier' });
    }
};

// GET /api/analytics/spend-by-category
exports.getSpendByCategory = async (req, res) => {
    try {
        const df = buildDateFilter(req.query);
        const scopedDf = scopedFilter(req, df);
        const [rows] = await db.query(
            `SELECT
                COALESCE(NULLIF(TRIM(category), ''), 'Uncategorized') AS category,
                COALESCE(SUM(CASE WHEN total_price > 0 THEN total_price ELSE 0 END), 0) AS total,
                COUNT(*) AS count
            FROM orders
            WHERE 1=1${scopedDf.clause}
            GROUP BY category
            ORDER BY total DESC`,
            scopedDf.params
        );
        const grandTotal = rows.reduce((sum, r) => sum + parseFloat(r.total), 0);
        res.json(rows.map(r => ({
            category: r.category,
            total: parseFloat(r.total),
            count: r.count,
            percent: grandTotal > 0 ? parseFloat(((parseFloat(r.total) / grandTotal) * 100).toFixed(1)) : 0
        })));
    } catch (error) {
        console.error('Spend by category error:', error);
        res.status(500).json({ success: false, message: 'Failed to load spend by category' });
    }
};

// GET /api/analytics/spend-by-cost-center
exports.getSpendByCostCenter = async (req, res) => {
    try {
        const df = buildDateFilter(req.query);
        const scopedDf = scopedFilter(req, df, 'o');
        const [rows] = await db.query(
            `SELECT
                COALESCE(cc.code, 'Unknown') AS costCenterCode,
                COALESCE(cc.name, 'Unknown') AS costCenterName,
                COALESCE(b.code, o.building, '') AS buildingCode,
                COALESCE(SUM(CASE WHEN o.total_price > 0 THEN o.total_price ELSE 0 END), 0) AS total,
                COUNT(*) AS count
            FROM orders o
            LEFT JOIN cost_centers cc ON o.cost_center_id = cc.id
            LEFT JOIN buildings b ON cc.building_code = b.code
            WHERE 1=1${scopedDf.clause}
            GROUP BY cc.code, cc.name, b.code, o.building
            ORDER BY total DESC`,
            scopedDf.params
        );
        res.json(rows.map(r => ({
            costCenterCode: r.costCenterCode,
            costCenterName: r.costCenterName,
            buildingCode: r.buildingCode,
            total: parseFloat(r.total),
            count: r.count
        })));
    } catch (error) {
        console.error('Spend by cost center error:', error);
        res.status(500).json({ success: false, message: 'Failed to load spend by cost center' });
    }
};

// GET /api/analytics/order-status-distribution
exports.getOrderStatusDistribution = async (req, res) => {
    try {
        const df = buildDateFilter(req.query);
        const scopedDf = scopedFilter(req, df);
        const [rows] = await db.query(
            `SELECT
                COALESCE(status, 'Unknown') AS status,
                COUNT(*) AS count
            FROM orders
            WHERE 1=1${scopedDf.clause}
            GROUP BY status
            ORDER BY count DESC`,
            scopedDf.params
        );
        const total = rows.reduce((sum, r) => sum + r.count, 0);
        res.json(rows.map(r => ({
            status: r.status,
            count: r.count,
            percent: total > 0 ? parseFloat(((r.count / total) * 100).toFixed(1)) : 0
        })));
    } catch (error) {
        console.error('Order status distribution error:', error);
        res.status(500).json({ success: false, message: 'Failed to load order status distribution' });
    }
};

// GET /api/analytics/supplier-performance?limit=10
// BUG FIX: use order_history transitions for lead time, not delivery_confirmed_at
exports.getSupplierPerformance = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const df = buildDateFilter(req.query);
        const scopedDf = scopedFilter(req, df, 'o');
        const [rows] = await db.query(
            `SELECT
                o.supplier_id AS supplierId,
                s.name AS supplierName,
                COUNT(*) AS totalOrders,
                COUNT(CASE WHEN o.status = 'Delivered' THEN 1 END) AS delivered,
                COUNT(CASE WHEN o.status = 'Delivered'
                    AND h_del.changed_at IS NOT NULL
                    AND DATEDIFF(h_del.changed_at, o.submission_date) <= 14 THEN 1 END) AS deliveredOnTime,
                COALESCE(AVG(
                    CASE WHEN o.status = 'Delivered' AND h_del.changed_at IS NOT NULL
                    THEN DATEDIFF(h_del.changed_at, o.submission_date) END
                ), 0) AS avgLeadDays,
                COALESCE(SUM(CASE WHEN o.total_price > 0 THEN o.total_price ELSE 0 END), 0) AS totalSpend
            FROM orders o
            JOIN suppliers s ON o.supplier_id = s.id
            LEFT JOIN order_history h_del
                ON h_del.order_id = o.id
                AND h_del.new_value = 'Delivered'
                AND h_del.id = (
                    SELECT MIN(hh.id) FROM order_history hh
                    WHERE hh.order_id = o.id AND hh.new_value = 'Delivered'
                )
            WHERE o.supplier_id IS NOT NULL${scopedDf.clause}
            GROUP BY o.supplier_id, s.name
            ORDER BY totalOrders DESC
            LIMIT ?`,
            [...scopedDf.params, limit]
        );
        res.json(rows.map(r => ({
            supplierId: r.supplierId,
            supplierName: r.supplierName,
            totalOrders: r.totalOrders,
            delivered: r.delivered,
            deliveredOnTime: r.deliveredOnTime,
            avgLeadDays: parseFloat(r.avgLeadDays),
            totalSpend: parseFloat(r.totalSpend),
            onTimeRate: r.delivered > 0 ? parseFloat(((r.deliveredOnTime / r.delivered) * 100).toFixed(1)) : 0
        })));
    } catch (error) {
        console.error('Supplier performance error:', error);
        res.status(500).json({ success: false, message: 'Failed to load supplier performance' });
    }
};

// GET /api/analytics/monthly-orders-count?months=12
exports.getMonthlyOrdersCount = async (req, res) => {
    try {
        const df = buildDateFilter(req.query);
        const scope = buildAnalyticsScope(req);
        const hasDateFilter = df.clause.length > 0;
        let whereClause = 'WHERE submission_date IS NOT NULL';
        let queryParams;
        if (hasDateFilter) {
            whereClause += df.clause;
            queryParams = [...df.params, ...scope.params];
        } else {
            whereClause += ' AND submission_date >= DATE_SUB(NOW(), INTERVAL ? MONTH)';
            queryParams = [12, ...scope.params];
        }
        whereClause += scope.clause;
        const [rows] = await db.query(
            `SELECT
                DATE_FORMAT(submission_date, '%Y-%m') AS period,
                COUNT(*) AS count,
                COUNT(CASE WHEN priority = 'Urgent' THEN 1 END) AS urgent,
                COUNT(CASE WHEN priority = 'High' THEN 1 END) AS high,
                COUNT(CASE WHEN priority = 'Normal' THEN 1 END) AS normal,
                COUNT(CASE WHEN priority = 'Low' THEN 1 END) AS low
            FROM orders
            ${whereClause}
            GROUP BY period
            ORDER BY period`,
            queryParams
        );
        res.json(rows.map(r => ({
            period: r.period,
            count: r.count,
            urgent: r.urgent,
            high: r.high,
            normal: r.normal,
            low: r.low
        })));
    } catch (error) {
        console.error('Monthly orders count error:', error);
        res.status(500).json({ success: false, message: 'Failed to load monthly orders count' });
    }
};

// GET /api/analytics/approval-stats
exports.getApprovalStats = async (req, res) => {
    try {
        const df = buildDateFilter(req.query, 'created_at');
        const scope = buildAnalyticsScope(req, 'o');
        const [[row]] = await db.query(
            `SELECT
                COUNT(*) AS totalApprovals,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approved,
                COUNT(CASE WHEN status = 'rejected' THEN 1 END) AS rejected,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending,
                COALESCE(AVG(CASE WHEN approved_at IS NOT NULL
                    THEN TIMESTAMPDIFF(HOUR, created_at, approved_at) END), 0) AS avgApprovalHours
            FROM approvals a
            INNER JOIN orders o ON o.id = a.order_id
            WHERE 1=1${df.clause}${scope.clause}`,
            [...df.params, ...scope.params]
        );
        res.json({
            totalApprovals: row.totalApprovals,
            approved: row.approved,
            rejected: row.rejected,
            pending: row.pending,
            avgApprovalHours: parseFloat(row.avgApprovalHours)
        });
    } catch (error) {
        console.error('Approval stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to load approval stats' });
    }
};

// GET /api/analytics/top-parts?limit=20
exports.getTopParts = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const df = buildDateFilter(req.query);
        const scopedDf = scopedFilter(req, df);
        const [rows] = await db.query(
            `SELECT
                COALESCE(item_description, 'Unknown') AS itemDescription,
                COUNT(*) AS orderCount,
                COALESCE(SUM(quantity), 0) AS totalQty,
                COALESCE(SUM(CASE WHEN total_price > 0 THEN total_price ELSE 0 END), 0) AS totalSpend,
                COALESCE(AVG(CASE WHEN unit_price > 0 THEN unit_price ELSE NULL END), 0) AS avgUnitPrice
            FROM orders
            WHERE 1=1${scopedDf.clause}
            GROUP BY item_description
            ORDER BY orderCount DESC
            LIMIT ?`,
            [...scopedDf.params, limit]
        );
        res.json(rows.map(r => ({
            itemDescription: r.itemDescription,
            orderCount: r.orderCount,
            totalQty: r.totalQty,
            totalSpend: parseFloat(r.totalSpend),
            avgUnitPrice: parseFloat(r.avgUnitPrice)
        })));
    } catch (error) {
        console.error('Top parts error:', error);
        res.status(500).json({ success: false, message: 'Failed to load top parts' });
    }
};

// ──────────────────────────────────────────────────────────────────────────────
// NEW ENDPOINTS
// ──────────────────────────────────────────────────────────────────────────────

// GET /api/analytics/delivery-time-distribution
// Uses order_history transitions (Ordered→Delivered) for accurate lead time
exports.getDeliveryTimeDistribution = async (req, res) => {
    try {
        const df = buildDateFilter(req.query);
        const scopedDf = scopedFilter(req, df, 'o');
        const [rows] = await db.query(
            `SELECT
                o.supplier_id AS supplierId,
                COALESCE(s.name, 'Unknown') AS supplierName,
                DATEDIFF(h_del.changed_at, o.submission_date) AS leadDays,
                o.priority,
                o.category
            FROM orders o
            JOIN suppliers s ON o.supplier_id = s.id
            JOIN order_history h_del
                ON h_del.order_id = o.id
                AND h_del.new_value = 'Delivered'
                AND h_del.id = (
                    SELECT MIN(hh.id) FROM order_history hh
                    WHERE hh.order_id = o.id AND hh.new_value = 'Delivered'
                )
            WHERE o.status = 'Delivered'
            ${scopedDf.clause}
            ORDER BY leadDays`,
            scopedDf.params
        );

        // Buckets: 0-3d, 4-7d, 8-14d, 15-30d, 30+d
        const buckets = [
            { label: '0–3 дни', min: 0, max: 3, count: 0 },
            { label: '4–7 дни', min: 4, max: 7, count: 0 },
            { label: '8–14 дни', min: 8, max: 14, count: 0 },
            { label: '15–30 дни', min: 15, max: 30, count: 0 },
            { label: '30+ дни', min: 31, max: 9999, count: 0 }
        ];

        const allLeadDays = rows.map(r => r.leadDays).filter(d => d >= 0);
        allLeadDays.forEach(d => {
            const b = buckets.find(b => d >= b.min && d <= b.max);
            if (b) b.count++;
        });

        const avgLeadDays = allLeadDays.length > 0
            ? (allLeadDays.reduce((s, v) => s + v, 0) / allLeadDays.length).toFixed(1)
            : 0;
        const medianLeadDays = allLeadDays.length > 0
            ? allLeadDays.sort((a, b) => a - b)[Math.floor(allLeadDays.length / 2)]
            : 0;

        res.json({
            buckets,
            avgLeadDays: parseFloat(avgLeadDays),
            medianLeadDays,
            totalDelivered: rows.length
        });
    } catch (error) {
        console.error('Delivery time distribution error:', error);
        res.status(500).json({ success: false, message: 'Failed to load delivery time distribution' });
    }
};

// GET /api/analytics/sla-breach
// Orders stuck in a status longer than threshold days
exports.getSLABreach = async (req, res) => {
    try {
        const df = buildDateFilter(req.query);
        const scopedDf = scopedFilter(req, df, 'o');
        const thresholds = {
            'New': 2,
            'Pending': 3,
            'Quote Requested': 5,
            'Quote Received': 3,
            'Quote Under Approval': 2,
            'Approved': 3,
            'Ordered': 14,
            'In Transit': 7
        };

        const statusList = Object.keys(thresholds).map(s => `'${s}'`).join(',');

        const [rows] = await db.query(
            `SELECT
                o.id,
                o.item_description AS itemDescription,
                o.status,
                o.priority,
                o.building,
                COALESCE(u.name, o.requester_name) AS requesterName,
                COALESCE(s.name, '') AS supplierName,
                o.submission_date AS submissionDate,
                DATEDIFF(NOW(), o.submission_date) AS daysTotal,
                COALESCE(
                    (SELECT DATEDIFF(NOW(), h_last.changed_at)
                     FROM order_history h_last
                     WHERE h_last.order_id = o.id
                     ORDER BY h_last.changed_at DESC
                     LIMIT 1),
                    DATEDIFF(NOW(), o.submission_date)
                ) AS daysInCurrentStatus
            FROM orders o
            LEFT JOIN users u ON o.requester_id = u.id
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            WHERE o.status IN (${statusList})
            ${scopedDf.clause}
            ORDER BY daysInCurrentStatus DESC`,
            scopedDf.params
        );

        // Add threshold and breach flag
        const enriched = rows.map(r => {
            const threshold = thresholds[r.status] || 5;
            const isBreached = r.daysInCurrentStatus > threshold;
            return { ...r, threshold, isBreached };
        }).filter(r => r.isBreached);

        const summary = {
            totalBreached: enriched.length,
            byStatus: {}
        };
        enriched.forEach(r => {
            summary.byStatus[r.status] = (summary.byStatus[r.status] || 0) + 1;
        });

        res.json({ orders: enriched, summary });
    } catch (error) {
        console.error('SLA breach error:', error);
        res.status(500).json({ success: false, message: 'Failed to load SLA breach data' });
    }
};

// GET /api/analytics/supplier-concentration
// Top N suppliers' share of total spend — concentration risk
exports.getSupplierConcentration = async (req, res) => {
    try {
        const df = buildDateFilter(req.query);
        const scopedDf = scopedFilter(req, df, 'o');
        const [rows] = await db.query(
            `SELECT
                COALESCE(s.name, 'Unassigned') AS supplierName,
                COALESCE(SUM(CASE WHEN o.total_price > 0 THEN o.total_price ELSE 0 END), 0) AS total
            FROM orders o
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            WHERE o.supplier_id IS NOT NULL${scopedDf.clause}
            GROUP BY o.supplier_id, s.name
            ORDER BY total DESC`,
            scopedDf.params
        );

        const grandTotal = rows.reduce((s, r) => s + parseFloat(r.total), 0);
        const withShare = rows.map((r, i) => ({
            rank: i + 1,
            supplierName: r.supplierName,
            total: parseFloat(r.total),
            share: grandTotal > 0 ? parseFloat(((parseFloat(r.total) / grandTotal) * 100).toFixed(1)) : 0
        }));

        // Concentration metrics
        const top1 = withShare.slice(0, 1).reduce((s, r) => s + r.share, 0);
        const top3 = withShare.slice(0, 3).reduce((s, r) => s + r.share, 0);
        const top5 = withShare.slice(0, 5).reduce((s, r) => s + r.share, 0);

        // HHI (Herfindahl-Hirschman Index) — market concentration measure
        const hhi = withShare.reduce((s, r) => s + Math.pow(r.share / 100, 2), 0);
        const hhiScore = Math.round(hhi * 10000); // 0–10000, >2500 = highly concentrated

        res.json({
            suppliers: withShare,
            totalSuppliers: rows.length,
            grandTotal,
            concentration: { top1, top3, top5, hhiScore },
            riskLevel: hhiScore > 2500 ? 'high' : hhiScore > 1500 ? 'medium' : 'low'
        });
    } catch (error) {
        console.error('Supplier concentration error:', error);
        res.status(500).json({ success: false, message: 'Failed to load supplier concentration' });
    }
};

// GET /api/analytics/ai-acceptance-rate
// AI suggestion acceptance/rejection over time from supplier_selection_log
exports.getAIAcceptanceRate = async (req, res) => {
    try {
        // Uses actual supplier_selection_log columns:
        // order_id, supplier_id, selected_by_user_id, from_suggestion, suggestion_rank, selected_at
        const df = buildDateFilter(req.query, 'ssl.selected_at');
        const scope = buildAnalyticsScope(req, 'o');

        // Overall stats — from_suggestion=1 means AI suggestion was accepted (user picked it)
        const [[overall]] = await db.query(
            `SELECT
                COUNT(*) AS totalSelections,
                SUM(CASE WHEN from_suggestion = 1 THEN 1 ELSE 0 END) AS fromSuggestion,
                SUM(CASE WHEN from_suggestion = 0 THEN 1 ELSE 0 END) AS manualSelections,
                COALESCE(AVG(CASE WHEN from_suggestion = 1 THEN suggestion_rank END), 0) AS avgAcceptedRank
            FROM supplier_selection_log ssl
            INNER JOIN orders o ON o.id = ssl.order_id
            WHERE 1=1${df.clause}${scope.clause}`,
            [...df.params, ...scope.params]
        );

        // By month
        const [byMonth] = await db.query(
            `SELECT
                DATE_FORMAT(selected_at, '%Y-%m') AS period,
                COUNT(*) AS total,
                SUM(CASE WHEN from_suggestion = 1 THEN 1 ELSE 0 END) AS accepted,
                SUM(CASE WHEN from_suggestion = 0 THEN 1 ELSE 0 END) AS manual
            FROM supplier_selection_log ssl
            INNER JOIN orders o ON o.id = ssl.order_id
            WHERE 1=1${df.clause}${scope.clause}
            GROUP BY period
            ORDER BY period`,
            [...df.params, ...scope.params]
        );

        // Top AI-accepted suppliers
        const [topAccepted] = await db.query(
            `SELECT
                COALESCE(s.name, 'Unknown') AS supplierName,
                COUNT(*) AS acceptedCount
            FROM supplier_selection_log ssl
            LEFT JOIN suppliers s ON ssl.supplier_id = s.id
            INNER JOIN orders o ON o.id = ssl.order_id
            WHERE ssl.from_suggestion = 1${df.clause ? ' AND 1=1' + df.clause : ''}${scope.clause}
            GROUP BY ssl.supplier_id, s.name
            ORDER BY acceptedCount DESC
            LIMIT 5`,
            [...df.params, ...scope.params]
        );

        const acceptanceRate = overall.totalSelections > 0
            ? parseFloat(((overall.fromSuggestion / overall.totalSelections) * 100).toFixed(1))
            : 0;

        res.json({
            overall: {
                totalSelections: overall.totalSelections,
                fromSuggestion: overall.fromSuggestion,
                manualSelections: overall.manualSelections,
                acceptanceRate,
                avgAcceptedRank: parseFloat(overall.avgAcceptedRank)
            },
            byMonth: byMonth.map(r => ({
                period: r.period,
                total: r.total,
                accepted: r.accepted,
                manual: r.manual,
                rate: r.total > 0 ? parseFloat(((r.accepted / r.total) * 100).toFixed(1)) : 0
            })),
            topAccepted
        });
    } catch (error) {
        console.error('AI acceptance rate error:', error);
        res.status(500).json({ success: false, message: 'Failed to load AI acceptance rate' });
    }
};

// GET /api/analytics/recurring-items
// Items ordered 3+ times → suggest reorder threshold / blanket orders
exports.getRecurringItems = async (req, res) => {
    try {
        const df = buildDateFilter(req.query);
        const scopedDf = scopedFilter(req, df);
        const [rows] = await db.query(
            `SELECT
                COALESCE(item_description, 'Unknown') AS itemDescription,
                COALESCE(NULLIF(TRIM(MIN(category)), ''), 'Uncategorized') AS category,
                COUNT(*) AS orderCount,
                COALESCE(SUM(quantity), 0) AS totalQty,
                COALESCE(AVG(quantity), 0) AS avgQty,
                COALESCE(AVG(CASE WHEN unit_price > 0 THEN unit_price ELSE NULL END), 0) AS avgUnitPrice,
                COALESCE(SUM(CASE WHEN total_price > 0 THEN total_price ELSE 0 END), 0) AS totalSpend,
                MIN(submission_date) AS firstOrdered,
                MAX(submission_date) AS lastOrdered,
                DATEDIFF(MAX(submission_date), MIN(submission_date)) AS daySpan
            FROM orders
            WHERE 1=1${scopedDf.clause}
            GROUP BY item_description
            HAVING COUNT(*) >= 3
            ORDER BY COUNT(*) DESC
            LIMIT 30`,
            scopedDf.params
        );

        res.json(rows.map(r => {
            const daysBetweenOrders = r.daySpan > 0 && r.orderCount > 1
                ? Math.round(r.daySpan / (r.orderCount - 1))
                : null;
            return {
                itemDescription: r.itemDescription,
                category: r.category,
                orderCount: r.orderCount,
                totalQty: r.totalQty,
                avgQty: parseFloat(r.avgQty).toFixed(1),
                avgUnitPrice: parseFloat(r.avgUnitPrice),
                totalSpend: parseFloat(r.totalSpend),
                firstOrdered: r.firstOrdered ? r.firstOrdered.toISOString().slice(0, 10) : null,
                lastOrdered: r.lastOrdered ? r.lastOrdered.toISOString().slice(0, 10) : null,
                daysBetweenOrders,
                suggestBlanketOrder: r.orderCount >= 5
            };
        }));
    } catch (error) {
        console.error('Recurring items error:', error);
        res.status(500).json({ success: false, message: 'Failed to load recurring items' });
    }
};

// GET /api/analytics/drill-down?type=period&value=2026-01
exports.getDrillDown = async (req, res) => {
    try {
        const { type, value } = req.query;
        if (!type || value == null) {
            return res.status(400).json({ success: false, message: 'type and value are required' });
        }

        const df = buildDateFilter(req.query, 'o.submission_date');
        const scope = buildAnalyticsScope(req, 'o');
        let typeClause = '';
        const typeParams = [];

        switch (type) {
            case 'period':
                typeClause = " AND DATE_FORMAT(o.submission_date, '%Y-%m') = ?";
                typeParams.push(value);
                break;
            case 'building':
                typeClause = ' AND o.building = ?';
                typeParams.push(value);
                break;
            case 'supplier':
                typeClause = ' AND o.supplier_id = ?';
                typeParams.push(parseInt(value));
                break;
            case 'supplierName':
                typeClause = ' AND s.name = ?';
                typeParams.push(value);
                break;
            case 'category':
                typeClause = " AND COALESCE(NULLIF(TRIM(o.category),''),'Uncategorized') = ?";
                typeParams.push(value);
                break;
            case 'status':
                typeClause = ' AND o.status = ?';
                typeParams.push(value);
                break;
            case 'part':
                typeClause = ' AND o.item_description = ?';
                typeParams.push(value);
                break;
            case 'costCenter':
                typeClause = ' AND cc.name = ?';
                typeParams.push(value);
                break;
            default:
                return res.status(400).json({ success: false, message: 'Invalid drill-down type' });
        }

        const allParams = [...df.params, ...scope.params, ...typeParams];

        const [rows] = await db.query(
            `SELECT
                o.id,
                o.item_description AS itemDescription,
                o.part_number AS partNumber,
                o.building,
                COALESCE(cc.name, '') AS costCenterName,
                COALESCE(s.name, '') AS supplierName,
                o.quantity,
                o.unit_price AS unitPrice,
                o.total_price AS totalPrice,
                o.status,
                o.priority,
                DATE_FORMAT(o.submission_date, '%Y-%m-%d') AS submissionDate,
                o.requester_name AS requesterName
            FROM orders o
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            LEFT JOIN cost_centers cc ON o.cost_center_id = cc.id
            WHERE 1=1${df.clause}${scope.clause}${typeClause}
            ORDER BY o.submission_date DESC
            LIMIT 200`,
            allParams
        );

        // Build title
        let title = 'Orders';
        const monthNames = ['January','February','March','April','May','June',
            'July','August','September','October','November','December'];
        switch (type) {
            case 'period': {
                const [y, m] = value.split('-');
                title = 'Orders \u2014 ' + (monthNames[parseInt(m) - 1] || m) + ' ' + y;
                break;
            }
            case 'building':
                title = 'Orders \u2014 Building: ' + value;
                break;
            case 'supplier':
            case 'supplierName':
                title = 'Orders \u2014 Supplier: ' + (rows.length > 0 ? rows[0].supplierName : value);
                break;
            case 'category':
                title = 'Orders \u2014 Category: ' + value;
                break;
            case 'status':
                title = 'Orders \u2014 Status: ' + value;
                break;
            case 'part':
                title = 'Reorders \u2014 ' + value;
                break;
            case 'costCenter':
                title = 'Orders \u2014 Cost Center: ' + value;
                break;
        }

        const totalSpend = rows.reduce((sum, r) => sum + parseFloat(r.totalPrice || 0), 0);

        res.json({
            title,
            orders: rows,
            total: rows.length,
            totalSpend: parseFloat(totalSpend.toFixed(2))
        });
    } catch (error) {
        console.error('Drill-down error:', error);
        res.status(500).json({ success: false, message: 'Failed to load drill-down data' });
    }
};
