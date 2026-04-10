// backend/controllers/partsCatalogController.js
const db = require('../config/database');

exports.listParts = async (req, res) => {
    try {
        const userRole = req.user.role;

        // Get distinct parts with aggregated info
        // Uses a subquery to get the most recent order per part for last_price and last_supplier
        const [parts] = await db.query(`
            SELECT
                p.item_description,
                p.part_number,
                p.category,
                p.times_ordered,
                p.last_ordered,
                latest.unit_price as last_price,
                s.name as last_supplier
            FROM (
                SELECT
                    item_description,
                    part_number,
                    category,
                    COUNT(*) as times_ordered,
                    MAX(submission_date) as last_ordered,
                    MAX(id) as latest_order_id
                FROM orders
                WHERE item_description IS NOT NULL AND item_description != ''
                GROUP BY item_description, part_number, category
            ) p
            LEFT JOIN orders latest ON latest.id = p.latest_order_id
            LEFT JOIN suppliers s ON latest.supplier_id = s.id
            ORDER BY p.times_ordered DESC, p.last_ordered DESC
        `);

        // For requesters, hide price and supplier info
        if (userRole === 'requester') {
            parts.forEach(part => {
                part.last_price = null;
                part.last_supplier = null;
            });
        }

        res.json({
            success: true,
            parts
        });
    } catch (error) {
        console.error('List parts error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve parts catalog' });
    }
};

exports.getStats = async (req, res) => {
    try {
        const [stats] = await db.query(`
            SELECT
                COUNT(DISTINCT CONCAT(IFNULL(item_description, ''), '||', IFNULL(part_number, ''))) as total_unique_parts,
                COUNT(DISTINCT part_number) as total_unique_part_numbers,
                COUNT(DISTINCT category) as total_categories,
                COUNT(DISTINCT supplier_id) as total_suppliers_used,
                COUNT(*) as total_orders
            FROM orders
            WHERE item_description IS NOT NULL AND item_description != ''
        `);

        const [topCategories] = await db.query(`
            SELECT category, COUNT(*) as order_count
            FROM orders
            WHERE category IS NOT NULL AND category != ''
            GROUP BY category
            ORDER BY order_count DESC
            LIMIT 10
        `);

        res.json({
            success: true,
            stats: stats[0],
            top_categories: topCategories
        });
    } catch (error) {
        console.error('Get catalog stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve catalog statistics' });
    }
};
