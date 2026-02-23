// backend/supplier-ai.js - AI-Powered Supplier Recommendations

const pool = require('./config/database'); // ⭐ FIX: Use correct MySQL pool

/**
 * Generate supplier suggestions for an order using AI-like heuristics
 * @param {number} orderId - Order ID
 * @returns {Promise<Array>} Array of suggested suppliers with confidence scores
 */
async function getSupplierSuggestions(orderId) {
    try {
        // 1. Get order details
        const [orderRows] = await pool.query(
            'SELECT id, item_description, part_number, category FROM orders WHERE id = ?',
            [orderId]
        );
        
        if (orderRows.length === 0) {
            return [];
        }
        
        const order = orderRows[0];
        const description = (order.item_description || '').toLowerCase();
        const partNumber = (order.part_number || '').toLowerCase();
        const category = (order.category || '').toLowerCase();
        
        // 2. Extract keywords from item description
        const keywords = extractKeywords(description + ' ' + partNumber + ' ' + category);
        
        if (keywords.length === 0) {
            return [];
        }
        
        // 3. Get all active suppliers
        const [suppliers] = await pool.query(
            'SELECT id, name, contact_person, email FROM suppliers WHERE active = 1'
        );
        
        if (suppliers.length === 0) {
            return [];
        }
        
        // 4. Score each supplier based on historical data
        const suggestions = [];
        
        for (const supplier of suppliers) {
            let score = 0;
            let matchReasons = [];
            
            // A. Check historical orders with same keywords
            let keywordMatches = 0;
            for (const keyword of keywords) {
                const [historyRows] = await pool.query(`
                    SELECT COUNT(*) as match_count
                    FROM orders
                    WHERE supplier_id = ?
                    AND (
                        LOWER(item_description) LIKE ?
                        OR LOWER(part_number) LIKE ?
                        OR LOWER(category) LIKE ?
                    )
                `, [supplier.id, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`]);
                
                keywordMatches += parseInt(historyRows[0].match_count) || 0;
            }
            
            if (keywordMatches > 0) {
                score += keywordMatches * 20; // 20 points per historical match
                matchReasons.push(`${keywordMatches} similar order${keywordMatches > 1 ? 's' : ''}`);
            }
            
            // B. Check exact part number matches
            if (partNumber) {
                const [partRows] = await pool.query(
                    'SELECT COUNT(*) as count FROM orders WHERE supplier_id = ? AND LOWER(part_number) = ?',
                    [supplier.id, partNumber]
                );
                const partCount = parseInt(partRows[0].count) || 0;
                if (partCount > 0) {
                    score += 50; // Strong match
                    matchReasons.push('exact part number match');
                }
            }
            
            // C. Check category matches
            if (category) {
                const [categoryRows] = await pool.query(
                    'SELECT COUNT(*) as count FROM orders WHERE supplier_id = ? AND LOWER(category) = ?',
                    [supplier.id, category]
                );
                const catCount = parseInt(categoryRows[0].count) || 0;
                if (catCount > 0) {
                    score += catCount * 10;
                    matchReasons.push(`${catCount} ${category} order${catCount > 1 ? 's' : ''}`);
                }
            }
            
            // D. Bonus for suppliers with more total orders (reliability)
            const [totalOrdersRows] = await pool.query(
                'SELECT COUNT(*) as total FROM orders WHERE supplier_id = ?',
                [supplier.id]
            );
            const totalOrders = parseInt(totalOrdersRows[0].total) || 0;
            if (totalOrders > 5) {
                score += Math.min(totalOrders, 50); // Max 50 bonus points
            }
            
            // Only include suppliers with meaningful matches
            if (score > 0) {
                suggestions.push({
                    supplier_id: supplier.id,
                    supplier_name: supplier.name,
                    contact_person: supplier.contact_person,
                    email: supplier.email,
                    confidence: calculateConfidence(score),
                    score: score,
                    match_reasons: matchReasons,
                    total_orders: totalOrders
                });
            }
        }
        
        // 5. Sort by score (highest first) and return top 5
        suggestions.sort((a, b) => b.score - a.score);
        return suggestions.slice(0, 5);
        
    } catch (error) {
        console.error('Error generating supplier suggestions:', error);
        return [];
    }
}

/**
 * Extract meaningful keywords from text
 * @param {string} text - Input text
 * @returns {Array<string>} Array of keywords
 */
function extractKeywords(text) {
    if (!text) return [];
    
    // Remove common stop words
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
        'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
        'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this',
        'that', 'these', 'those', 'it', 'its'
    ]);
    
    // Split and clean
    const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length >= 3 && !stopWords.has(word));
    
    // Remove duplicates
    return [...new Set(words)];
}

/**
 * Calculate confidence percentage from raw score
 * @param {number} score - Raw score
 * @returns {number} Confidence percentage (0-100)
 */
function calculateConfidence(score) {
    // Logarithmic scale: higher scores increase confidence slower
    // Score 0-20: 0-50%
    // Score 20-50: 50-75%
    // Score 50+: 75-95%
    
    if (score <= 0) return 0;
    if (score >= 100) return 95;
    
    // Logarithmic formula
    const confidence = Math.min(95, 30 + (Math.log(score + 1) * 15));
    return Math.round(confidence);
}

module.exports = {
    getSupplierSuggestions
};
