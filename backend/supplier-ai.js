// backend/supplier-ai.js - AI-Powered Supplier Recommendations

const pool = require('./config/database');

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
        
        // 2. Extract keywords from item description (including Cyrillic)
        const keywords = extractKeywords(description + ' ' + partNumber + ' ' + category);
        
        if (keywords.length === 0) {
            console.log(`⚠️ No keywords extracted for order ${orderId}`);
            return [];
        }
        
        console.log(`🔍 Analyzing order ${orderId} with keywords:`, keywords);
        
        // 3. Get all active suppliers
        const [suppliers] = await pool.query(
            'SELECT id, name, contact_person, email FROM suppliers WHERE active = 1'
        );
        
        if (suppliers.length === 0) {
            return [];
        }
        
        // 4. Score each supplier based on historical data from BOTH tables
        const suggestions = [];
        
        for (const supplier of suppliers) {
            let score = 0;
            let matchReasons = [];
            
            // ⭐ A. Check TRAINING_ORDERS table (historical knowledge base)
            let trainingMatches = 0;
            for (const keyword of keywords) {
                const [trainingRows] = await pool.query(`
                    SELECT COUNT(*) as match_count
                    FROM training_orders
                    WHERE supplier_id = ?
                    AND (
                        LOWER(item_description) LIKE ?
                        OR LOWER(part_number) LIKE ?
                        OR LOWER(category) LIKE ?
                    )
                `, [supplier.id, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`]);
                
                trainingMatches += parseInt(trainingRows[0].match_count) || 0;
            }
            
            if (trainingMatches > 0) {
                score += trainingMatches * 30; // 30 points per training match (weighted higher!)
                matchReasons.push(`${trainingMatches} historical match${trainingMatches > 1 ? 'es' : ''} (training data)`);
            }
            
            // ⭐ B. Check ORDERS table (current system data)
            let orderMatches = 0;
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
                
                orderMatches += parseInt(historyRows[0].match_count) || 0;
            }
            
            if (orderMatches > 0) {
                score += orderMatches * 20; // 20 points per order match
                matchReasons.push(`${orderMatches} recent order${orderMatches > 1 ? 's' : ''}`);
            }
            
            // C. Check exact part number matches (BOTH tables)
            if (partNumber) {
                // Training data
                const [trainingPartRows] = await pool.query(
                    'SELECT COUNT(*) as count FROM training_orders WHERE supplier_id = ? AND LOWER(part_number) = ?',
                    [supplier.id, partNumber]
                );
                const trainingPartCount = parseInt(trainingPartRows[0].count) || 0;
                
                // Current orders
                const [partRows] = await pool.query(
                    'SELECT COUNT(*) as count FROM orders WHERE supplier_id = ? AND LOWER(part_number) = ?',
                    [supplier.id, partNumber]
                );
                const partCount = parseInt(partRows[0].count) || 0;
                
                const totalPartMatches = trainingPartCount + partCount;
                if (totalPartMatches > 0) {
                    score += 60; // Very strong match!
                    matchReasons.push(`exact part #${partNumber}`);
                }
            }
            
            // D. Check category matches (BOTH tables)
            if (category) {
                // Training data
                const [trainingCatRows] = await pool.query(
                    'SELECT COUNT(*) as count FROM training_orders WHERE supplier_id = ? AND LOWER(category) = ?',
                    [supplier.id, category]
                );
                const trainingCatCount = parseInt(trainingCatRows[0].count) || 0;
                
                // Current orders
                const [categoryRows] = await pool.query(
                    'SELECT COUNT(*) as count FROM orders WHERE supplier_id = ? AND LOWER(category) = ?',
                    [supplier.id, category]
                );
                const catCount = parseInt(categoryRows[0].count) || 0;
                
                const totalCatMatches = trainingCatCount + catCount;
                if (totalCatMatches > 0) {
                    score += totalCatMatches * 15; // 15 points per category match
                    matchReasons.push(`${totalCatMatches} ${category} order${totalCatMatches > 1 ? 's' : ''}`);
                }
            }
            
            // E. Bonus for suppliers with more total orders (reliability)
            const [totalTrainingRows] = await pool.query(
                'SELECT COUNT(*) as total FROM training_orders WHERE supplier_id = ?',
                [supplier.id]
            );
            const trainingTotal = parseInt(totalTrainingRows[0].total) || 0;
            
            const [totalOrdersRows] = await pool.query(
                'SELECT COUNT(*) as total FROM orders WHERE supplier_id = ?',
                [supplier.id]
            );
            const ordersTotal = parseInt(totalOrdersRows[0].total) || 0;
            
            const totalOrders = trainingTotal + ordersTotal;
            if (totalOrders > 5) {
                score += Math.min(totalOrders * 2, 60); // Max 60 bonus points (2 pts per order)
                matchReasons.push(`${totalOrders} total orders (reliable)`);
            }
            
            // Only include suppliers with meaningful matches
            if (score > 0) {
                console.log(`  ${supplier.name}: score=${score}, confidence=${calculateConfidence(score)}%`);
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
        console.log(`✅ Returning ${suggestions.length} suggestions, top: ${suggestions[0]?.supplier_name}`);
        return suggestions.slice(0, 5);
        
    } catch (error) {
        console.error('Error generating supplier suggestions:', error);
        return [];
    }
}

/**
 * Extract meaningful keywords from text (supports Cyrillic)
 * @param {string} text - Input text
 * @returns {Array<string>} Array of keywords
 */
function extractKeywords(text) {
    if (!text) return [];
    
    // Remove common stop words (English and Bulgarian)
    const stopWords = new Set([
        // English
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
        'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
        'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this',
        'that', 'these', 'those', 'it', 'its',
        // Bulgarian common words
        'за', 'на', 'в', 'и', 'с', 'от', 'до', 'по', 'при', 'към'
    ]);
    
    // Split and clean (support Cyrillic characters)
    // FIX: Single backslash, not double!
    const words = text
        .toLowerCase()
        .replace(/[^a-zа-я0-9\s-]/gi, ' ') // Keep Cyrillic (а-я) and Latin (a-z)
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
    // Score 20-60: 50-75%
    // Score 60-120: 75-90%
    // Score 120+: 90-95%
    
    if (score <= 0) return 0;
    if (score >= 150) return 95;
    
    // Logarithmic formula
    const confidence = Math.min(95, 25 + (Math.log(score + 1) * 18));
    return Math.round(confidence);
}

module.exports = {
    getSupplierSuggestions
};
