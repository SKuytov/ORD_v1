// backend/controllers/duplicateDetectionController.js
const db = require('../config/database');

exports.checkDuplicates = async (req, res) => {
    try {
        const { item_description, part_number, supplier_id } = req.body;

        if (!item_description && !part_number) {
            return res.status(400).json({
                success: false,
                message: 'At least one of item_description or part_number is required'
            });
        }

        const duplicates = [];
        const seenIds = new Set();

        // 1. Exact match: same part_number AND same supplier_id (last 30 days)
        if (part_number && supplier_id) {
            const [exactMatches] = await db.query(
                `SELECT o.id, o.item_description, o.part_number, s.name as supplier_name,
                        o.status, o.submission_date
                 FROM orders o
                 LEFT JOIN suppliers s ON o.supplier_id = s.id
                 WHERE o.part_number = ? AND o.supplier_id = ?
                   AND o.submission_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                 ORDER BY o.submission_date DESC`,
                [part_number, supplier_id]
            );

            exactMatches.forEach(match => {
                if (!seenIds.has(match.id)) {
                    seenIds.add(match.id);
                    duplicates.push({ ...match, match_type: 'exact' });
                }
            });
        }

        // Also check part_number only matches (different supplier, last 30 days)
        if (part_number) {
            const params = [part_number];
            let excludeClause = '';
            if (supplier_id) {
                excludeClause = ' AND (o.supplier_id != ? OR o.supplier_id IS NULL)';
                params.push(supplier_id);
            }

            const [partMatches] = await db.query(
                `SELECT o.id, o.item_description, o.part_number, s.name as supplier_name,
                        o.status, o.submission_date
                 FROM orders o
                 LEFT JOIN suppliers s ON o.supplier_id = s.id
                 WHERE o.part_number = ?${excludeClause}
                   AND o.submission_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                 ORDER BY o.submission_date DESC`,
                params
            );

            partMatches.forEach(match => {
                if (!seenIds.has(match.id)) {
                    seenIds.add(match.id);
                    duplicates.push({ ...match, match_type: 'part_number' });
                }
            });
        }

        // 2. Fuzzy match: item_description LIKE '%keyword%' for each word (last 30 days)
        if (item_description) {
            const words = item_description
                .trim()
                .split(/\s+/)
                .filter(w => w.length >= 3); // Only match on words with 3+ characters

            if (words.length > 0) {
                const likeClauses = words.map(() => 'o.item_description LIKE ?');
                const likeParams = words.map(w => `%${w}%`);

                // Require all words to match for fuzzy
                const [fuzzyMatches] = await db.query(
                    `SELECT o.id, o.item_description, o.part_number, s.name as supplier_name,
                            o.status, o.submission_date
                     FROM orders o
                     LEFT JOIN suppliers s ON o.supplier_id = s.id
                     WHERE (${likeClauses.join(' AND ')})
                       AND o.submission_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                     ORDER BY o.submission_date DESC
                     LIMIT 20`,
                    likeParams
                );

                fuzzyMatches.forEach(match => {
                    if (!seenIds.has(match.id)) {
                        seenIds.add(match.id);
                        duplicates.push({ ...match, match_type: 'fuzzy' });
                    }
                });
            }
        }

        res.json({
            success: true,
            duplicates,
            total: duplicates.length
        });
    } catch (error) {
        console.error('Check duplicates error:', error);
        res.status(500).json({ success: false, message: 'Failed to check for duplicates' });
    }
};
