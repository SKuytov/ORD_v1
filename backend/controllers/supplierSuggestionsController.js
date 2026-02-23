// backend/controllers/supplierSuggestionsController.js
// Phase 1: Smart Supplier Suggestions with Cyrillic support

const db = require('../config/database');

/**
 * Get smart supplier suggestions for a specific order
 * Algorithm considers:
 * - Item description keywords (supports Cyrillic/Bulgarian)
 * - Category matching
 * - Historical patterns (what this supplier has supplied before)
 * - Supplier specializations
 * - Recent usage (prefer suppliers used recently)
 */
exports.getSuggestedSuppliers = async (req, res) => {
    try {
        const { orderId } = req.params;

        // Get order details
        const [orders] = await db.query(
            `SELECT id, item_description, category, part_number, building
             FROM orders WHERE id = ?`,
            [orderId]
        );

        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const order = orders[0];
        
        // Extract keywords from item description (split and clean)
        const keywords = extractKeywords(order.item_description);
        const category = order.category || '';

        console.log('[AI] Order:', orderId, 'Keywords:', keywords, 'Category:', category);

        // Get all active suppliers with their history
        const [suppliers] = await db.query(`
            SELECT 
                s.id,
                s.name,
                s.contact_person,
                s.email,
                s.phone,
                s.specialization,
                COUNT(DISTINCT o.id) as total_orders,
                AVG(CASE 
                    WHEN o.status = 'Delivered' THEN 100
                    WHEN o.status IN ('Ordered', 'In Transit') THEN 80
                    WHEN o.status = 'Cancelled' THEN 0
                    ELSE 50
                END) as performance_score,
                MAX(o.submission_date) as last_order_date,
                GROUP_CONCAT(DISTINCT o.category SEPARATOR '|||') as categories_supplied,
                GROUP_CONCAT(DISTINCT o.item_description SEPARATOR '|||') as items_supplied
            FROM suppliers s
            LEFT JOIN orders o ON s.id = o.supplier_id
            WHERE s.active = 1
            GROUP BY s.id
        `);

        console.log(`[AI] Found ${suppliers.length} active suppliers`);

        // Score each supplier
        const scoredSuppliers = suppliers.map(supplier => {
            let score = 0;
            const reasons = [];

            // 1. Keyword matching in items previously supplied
            if (supplier.items_supplied) {
                const suppliedItems = supplier.items_supplied.toLowerCase();
                let keywordMatches = 0;
                keywords.forEach(keyword => {
                    if (suppliedItems.includes(keyword)) {
                        keywordMatches++;
                    }
                });
                
                if (keywordMatches > 0) {
                    score += keywordMatches * 15;
                    reasons.push(`Supplied similar items (${keywordMatches} keyword matches)`);
                }
            }

            // 2. Category matching
            if (category && supplier.categories_supplied) {
                const suppliedCategories = supplier.categories_supplied.toLowerCase().split('|||');
                if (suppliedCategories.some(cat => cat.includes(category.toLowerCase()))) {
                    score += 20;
                    reasons.push(`Previously supplied ${category}`);
                }
            }

            // 3. Specialization matching
            if (supplier.specialization) {
                const specialization = supplier.specialization.toLowerCase();
                const descLower = order.item_description.toLowerCase();
                
                if (descLower.includes(specialization) || 
                    keywords.some(kw => specialization.includes(kw))) {
                    score += 25;
                    reasons.push(`Specializes in ${supplier.specialization}`);
                }
            }

            // 4. Recent usage bonus (used in last 30 days)
            if (supplier.last_order_date) {
                const daysSinceLastOrder = Math.floor(
                    (Date.now() - new Date(supplier.last_order_date).getTime()) / (1000 * 60 * 60 * 24)
                );
                
                if (daysSinceLastOrder <= 30) {
                    score += 10;
                    reasons.push(`Recently used (${daysSinceLastOrder} days ago)`);
                } else if (daysSinceLastOrder <= 90) {
                    score += 5;
                }
            }

            // 5. Performance score bonus
            const perfScore = supplier.performance_score || 50;
            score += perfScore / 10; // Add up to 10 points based on performance

            // 6. Experience bonus (total orders)
            if (supplier.total_orders > 0) {
                score += Math.min(supplier.total_orders * 2, 20); // Cap at 20 points
                reasons.push(`${supplier.total_orders} previous orders`);
            }

            return {
                ...supplier,
                suggestion_score: Math.round(score),
                suggestion_reasons: reasons,
                performance_score: Math.round(perfScore)
            };
        });

        // Sort by score and take top 3
        const topSuggestions = scoredSuppliers
            .sort((a, b) => b.suggestion_score - a.suggestion_score)
            .slice(0, 3)
            .filter(s => s.suggestion_score > 0); // Only show if some relevance

        console.log(`[AI] Top suggestions:`, topSuggestions.map(s => ({ name: s.name, score: s.suggestion_score })));

        res.json({
            success: true,
            suggestions: topSuggestions,
            order_keywords: keywords,
            order_category: category
        });

    } catch (error) {
        console.error('Get supplier suggestions error:', error);
        res.status(500).json({ success: false, message: 'Failed to get suggestions' });
    }
};

/**
 * Log supplier selection for learning
 * This helps improve future suggestions
 */
exports.logSupplierSelection = async (req, res) => {
    try {
        const { orderId, supplierId, wasFromSuggestion, suggestionRank } = req.body;

        await db.query(
            `INSERT INTO supplier_selection_log 
             (order_id, supplier_id, selected_by_user_id, from_suggestion, suggestion_rank)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
             supplier_id = VALUES(supplier_id),
             selected_at = NOW(),
             from_suggestion = VALUES(from_suggestion),
             suggestion_rank = VALUES(suggestion_rank)`,
            [orderId, supplierId, req.user.id, wasFromSuggestion || false, suggestionRank || null]
        );

        res.json({ success: true, message: 'Selection logged' });
    } catch (error) {
        console.error('Log supplier selection error:', error);
        res.status(500).json({ success: false, message: 'Failed to log selection' });
    }
};

/**
 * Get suggestion statistics (for admin dashboard)
 */
exports.getSuggestionStats = async (req, res) => {
    try {
        const [stats] = await db.query(`
            SELECT 
                COUNT(*) as total_selections,
                SUM(CASE WHEN from_suggestion = 1 THEN 1 ELSE 0 END) as from_suggestions,
                AVG(CASE WHEN from_suggestion = 1 THEN suggestion_rank ELSE NULL END) as avg_suggestion_rank
            FROM supplier_selection_log
            WHERE selected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        `);

        const [topSuppliers] = await db.query(`
            SELECT 
                s.name,
                COUNT(ssl.id) as selection_count,
                SUM(CASE WHEN ssl.from_suggestion = 1 THEN 1 ELSE 0 END) as from_suggestion_count
            FROM supplier_selection_log ssl
            JOIN suppliers s ON ssl.supplier_id = s.id
            WHERE ssl.selected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY s.id
            ORDER BY selection_count DESC
            LIMIT 5
        `);

        res.json({
            success: true,
            stats: stats[0],
            topSuppliers
        });
    } catch (error) {
        console.error('Get suggestion stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to get stats' });
    }
};

// Helper function to extract meaningful keywords (supports Cyrillic)
function extractKeywords(text) {
    if (!text) return [];
    
    // Common Bulgarian stop words to ignore
    const stopWords = new Set([
        // English
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
        'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
        'would', 'should', 'could', 'may', 'might', 'can', 'need', 'needs',
        // Bulgarian
        'и', 'на', 'за', 'с', 'в', 'от', 'към', 'до', 'по', 'през', 'от', 'над', 'под', 'със',
        'е', 'са', 'бъде', 'би', 'бил', 'била', 'било', 'след', 'пред', 'между'
    ]);

    // Split, clean, and filter - SUPPORT CYRILLIC
    const words = text.toLowerCase()
        // Keep: letters (Latin & Cyrillic), numbers, hyphens
        .replace(/[^a-zа-я0-9\s-]/gi, ' ') // Keep Cyrillic а-я
        .split(/\s+/)
        .filter(word => 
            word.length > 2 && // At least 3 characters
            !stopWords.has(word) &&
            !/^\d+$/.test(word) // Not pure numbers
        );

    // Remove duplicates
    return [...new Set(words)];
}

module.exports = exports;
