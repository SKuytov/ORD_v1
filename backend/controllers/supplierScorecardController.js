// backend/controllers/supplierScorecardController.js
const db = require('../config/database');

exports.listScorecards = async (req, res) => {
    try {
        const [scorecards] = await db.query(`
            SELECT
                s.id,
                s.name as supplier_name,
                COUNT(o.id) as total_orders,
                COALESCE(SUM(o.total_price), 0) as total_spend,
                ROUND(AVG(
                    CASE
                        WHEN o.status = 'Delivered' THEN DATEDIFF(o.updated_at, o.submission_date)
                        ELSE NULL
                    END
                ), 1) as avg_delivery_days,
                ROUND(
                    CASE
                        WHEN COUNT(CASE WHEN o.status = 'Delivered' AND o.expected_delivery_date IS NOT NULL THEN 1 END) = 0
                        THEN NULL
                        ELSE (
                            COUNT(CASE WHEN o.status = 'Delivered' AND o.expected_delivery_date IS NOT NULL AND o.updated_at <= o.expected_delivery_date THEN 1 END) * 100.0
                            / COUNT(CASE WHEN o.status = 'Delivered' AND o.expected_delivery_date IS NOT NULL THEN 1 END)
                        )
                    END
                , 1) as on_time_pct,
                MAX(o.submission_date) as last_order_date
            FROM suppliers s
            LEFT JOIN orders o ON s.id = o.supplier_id
            GROUP BY s.id, s.name
            ORDER BY total_orders DESC
        `);

        res.json({
            success: true,
            scorecards
        });
    } catch (error) {
        console.error('List scorecards error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve supplier scorecards' });
    }
};

exports.getScorecardById = async (req, res) => {
    try {
        const { id } = req.params;

        // Get supplier info
        const [suppliers] = await db.query('SELECT * FROM suppliers WHERE id = ?', [id]);

        if (suppliers.length === 0) {
            return res.status(404).json({ success: false, message: 'Supplier not found' });
        }

        const supplier = suppliers[0];

        // Get aggregate metrics
        const [metrics] = await db.query(`
            SELECT
                COUNT(o.id) as total_orders,
                COALESCE(SUM(o.total_price), 0) as total_spend,
                ROUND(AVG(
                    CASE
                        WHEN o.status = 'Delivered' THEN DATEDIFF(o.updated_at, o.submission_date)
                        ELSE NULL
                    END
                ), 1) as avg_delivery_days,
                ROUND(
                    CASE
                        WHEN COUNT(CASE WHEN o.status = 'Delivered' AND o.expected_delivery_date IS NOT NULL THEN 1 END) = 0
                        THEN NULL
                        ELSE (
                            COUNT(CASE WHEN o.status = 'Delivered' AND o.expected_delivery_date IS NOT NULL AND o.updated_at <= o.expected_delivery_date THEN 1 END) * 100.0
                            / COUNT(CASE WHEN o.status = 'Delivered' AND o.expected_delivery_date IS NOT NULL THEN 1 END)
                        )
                    END
                , 1) as on_time_pct,
                MAX(o.submission_date) as last_order_date
            FROM orders o
            WHERE o.supplier_id = ?
        `, [id]);

        // Get order count by status
        const [statusCounts] = await db.query(`
            SELECT o.status, COUNT(*) as count
            FROM orders o
            WHERE o.supplier_id = ?
            GROUP BY o.status
        `, [id]);

        const order_count_by_status = {};
        statusCounts.forEach(row => {
            order_count_by_status[row.status] = row.count;
        });

        // Get recent orders for this supplier
        const [recentOrders] = await db.query(`
            SELECT id, item_description, part_number, status, total_price, submission_date, updated_at
            FROM orders
            WHERE supplier_id = ?
            ORDER BY submission_date DESC
            LIMIT 10
        `, [id]);

        res.json({
            success: true,
            scorecard: {
                supplier,
                metrics: metrics[0],
                order_count_by_status,
                recent_orders: recentOrders
            }
        });
    } catch (error) {
        console.error('Get scorecard by ID error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve supplier scorecard' });
    }
};
