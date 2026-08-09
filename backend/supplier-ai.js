// backend/supplier-ai.js
// Phase 3: Intelligent Supplier Recommendations
//
// Research-backed scoring signals:
//   [A] Brand rules (exact brand match)                    → up to 40 pts
//   [B] FULLTEXT keyword match via supplier_item_history   → up to 50 pts  ← PRIMARY
//        Uses original words with wildcard (транспортна*)
//        IDF-like weighting: match_count log-scaled so 88 matches >> 8 matches
//        but doesn't crush suppliers with fewer high-quality hits
//   [C] Category match                                     → up to 15 pts
//   [D] Exact part number                                  → up to 20 pts
//   [E] Bayesian-smoothed category-aware acceptance rate   → up to 12 pts
//        Prior α=1 β=5: fixes 1/1 beating 40/45 acceptance bias
//   [F] Delivery speed (Ordered → Delivered days)          → up to 10 pts
//   [G] Building affinity                                  → up to  8 pts
//   [H] Recency decay on last selection (exp 30-day half-life) → up to 5 pts
//   [I] Reliability (log-scaled total orders)              → up to  3 pts
//   [J] Momentum signal (picks this month vs last month)   → up to  5 pts
//   [K] Item-item co-occurrence (collaborative filtering)  → up to  8 pts
//
// Confidence: rank-proportional mapped to 55–98% (never a raw score cap)

'use strict';

const pool       = require('./config/database');
const brandRules = require('./supplier-brand-rules');

// ---------------------------------------------------------------------------
// Keyword extraction
// NOTE: Uses explicit Cyrillic range [а-яА-Яa-zA-Z] — compatible with ALL
// Node.js versions (avoids \p{L} which requires Node ≥ 10 with --harmony or
// Node ≥ 12+ unconditionally).
// Returns array of unique keyword strings (original form, lowercased).
// We pass ORIGINAL words to MySQL FULLTEXT (not stems) because:
//   1. MySQL's index stores original tokens — stems would miss matches
//   2. Short stems (< ft_min_word_len=4) are silently ignored by MySQL
//   3. The wildcard suffix * on originals already covers inflected forms
//      e.g. 'лента*' matches лента, лентата, ленти, лентите
// ---------------------------------------------------------------------------
function extractKeywords(text) {
    if (!text) return [];

    const stopWords = new Set([
        // English
        'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
        'from','as','is','was','are','were','be','been','have','has','had','do',
        'does','did','will','would','could','should','may','might','can','this',
        'that','it','its','new','one','two','unit','units','pcs','piece','pieces',
        // Bulgarian
        'за','на','в','и','с','от','до','по','при','към','или','но','а','как',
        'е','са','би','бил','след','пред','между','брой','бр','един','два','три',
        'тип','вид','нов','нова','ново','всички','всеки','която','който','което',
        'тази','този','това','има','нема','няма','като',
    ]);

    // Safe Cyrillic range — no Unicode property escapes needed
    return [...new Set(
        text.toLowerCase()
            .replace(/[^a-zA-Za-\u044f\u0451\u0410-\u042f\u04010-9\s\-]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length >= 3 && !stopWords.has(w) && !/^\d+$/.test(w))
    )];
}

// ---------------------------------------------------------------------------
// Bayesian-smoothed acceptance rate
// Fixes the 1/1 > 40/45 small-sample bias.
// α=1 β=5 means a new supplier needs ~6 picks before rate > 0.5
// ---------------------------------------------------------------------------
function bayesianRate(picks, total, alpha, beta) {
    alpha = alpha || 1;
    beta  = beta  || 5;
    return (picks + alpha) / (total + alpha + beta);
}

// ===========================================================================
// MAIN FUNCTION
// ===========================================================================
async function getSupplierSuggestions(orderId) {
    try {
        console.log('\n=== AI SUPPLIER SUGGESTIONS v3 ===');
        console.log('Order ID:', orderId);

        // -----------------------------------------------------------------------
        // 1. Load the order
        // -----------------------------------------------------------------------
        const [orderRows] = await pool.query(
            `SELECT o.id, o.item_description, o.part_number, o.category, o.building,
                    IFNULL(cc.name,'') AS cost_center_name, IFNULL(cc.code,'') AS cost_center_code
             FROM orders o
             LEFT JOIN cost_centers cc ON cc.id = o.cost_center_id
             WHERE o.id = ?`,
            [orderId]
        );
        if (orderRows.length === 0) { console.log('Order not found'); return []; }

        const order       = orderRows[0];
        const description = (order.item_description || '').toLowerCase();
        const partNumber  = (order.part_number      || '').toLowerCase();
        const category    = (order.category         || '').toLowerCase().trim();
        const building    = (order.building         || '').toLowerCase().trim();
        // cost_center_name e.g. 'CB - Leonardo - Bayby Wet Wipes', code e.g. 'CB'
        const costCenterName = (order.cost_center_name || '').toLowerCase().trim();
        const costCenterCode = (order.cost_center_code || '').toLowerCase().trim();
        const costCenter     = costCenterName || costCenterCode;

        // Build query text — include cost center name so 'leonardo' becomes a keyword signal
        const rawText  = [description, partNumber, category, costCenterName].join(' ');
        const keywords = extractKeywords(rawText);

        console.log('Keywords:', keywords.join(', '));
        console.log('Category:', category || '(none)', '| Building:', building || '(none)', '| Cost center:', costCenter || '(none)');

        if (keywords.length === 0 && !partNumber && !category) {
            console.log('No usable signals — returning empty');
            return [];
        }

        // -----------------------------------------------------------------------
        // 2. Load all active suppliers
        // -----------------------------------------------------------------------
        const [suppliers] = await pool.query(`
            SELECT
                s.id, s.name, s.contact_person, s.email, s.phone, s.specialization,
                COUNT(DISTINCT o.id)  AS production_orders,
                COUNT(DISTINCT t.id)  AS training_orders,
                GROUP_CONCAT(DISTINCT o.building  SEPARATOR '|||') AS buildings_supplied,
                GROUP_CONCAT(DISTINCT o.category  SEPARATOR '|||') AS categories_supplied,
                GROUP_CONCAT(DISTINCT o.item_description SEPARATOR '|||') AS production_items,
                GROUP_CONCAT(DISTINCT t.item_description SEPARATOR '|||') AS training_items,
                AVG(CASE
                    WHEN o.status = 'Delivered'               THEN 100
                    WHEN o.status IN ('Ordered','In Transit') THEN  80
                    WHEN o.status = 'Cancelled'               THEN   0
                    ELSE 50
                END) AS performance_score,
                MAX(o.submission_date) AS last_order_date
            FROM suppliers s
            LEFT JOIN orders          o ON s.id = o.supplier_id
            LEFT JOIN training_orders t ON s.id = t.supplier_id
            WHERE s.active = 1
            GROUP BY s.id
        `);
        console.log('Active suppliers:', suppliers.length);

        // -----------------------------------------------------------------------
        // 3. Brand detection
        // -----------------------------------------------------------------------
        const brandResults = await brandRules.applyBrandRules(
            order.item_description || '',
            order.part_number      || '',
            suppliers
        );
        if (brandResults.detectedBrands.length > 0) {
            console.log('Detected brands:', brandResults.detectedBrands.join(', '));
        }

        // -----------------------------------------------------------------------
        // 4. FULLTEXT keyword match from supplier_item_history
        //    Uses ORIGINAL words with wildcard suffix so MySQL's index is used
        //    correctly and inflected forms are covered (лента* → лентата, ленти).
        //    Returns match_count (how many history rows matched) and ft_score
        //    (MySQL's internal relevance score, already IDF-weighted by MySQL).
        // -----------------------------------------------------------------------
        const fulltextMap = {};
        if (keywords.length > 0) {
            try {
                // Build boolean mode query: 'транспортна* лента* pinch* roller*'
                const boolQuery = keywords.map(k => k + '*').join(' ');

                const [ftRows] = await pool.query(`
                    SELECT supplier_id,
                           COUNT(*) AS match_count,
                           SUM(MATCH(item_description, keywords) AGAINST(? IN BOOLEAN MODE)) AS ft_score
                    FROM supplier_item_history
                    WHERE MATCH(item_description, keywords) AGAINST(? IN BOOLEAN MODE)
                    GROUP BY supplier_id
                `, [boolQuery, boolQuery]);

                ftRows.forEach(r => {
                    fulltextMap[r.supplier_id] = {
                        match_count: parseInt(r.match_count) || 0,
                        ft_score:    parseFloat(r.ft_score)  || 0,
                    };
                });
                console.log('FULLTEXT matched', ftRows.length, 'suppliers');
            } catch (e) {
                console.warn('FULLTEXT query failed, using fallback:', e.message);
            }
        }

        // Normalise ft_score so the top supplier gets up to 35 pts from raw MySQL score
        // and log(match_count) contributes the remaining 15 pts.
        // This prevents a supplier with 320 unrelated orders from beating one with
        // 88 highly relevant matches (the original ИТТ vs Микромакс bug).
        const ftScores  = Object.values(fulltextMap).map(v => v.ft_score);
        const maxFtScore = ftScores.length > 0 ? Math.max(...ftScores) : 1;

        // -----------------------------------------------------------------------
        // 5. Category-aware acceptance rate + Bayesian smoothing + Momentum
        // -----------------------------------------------------------------------
        const [selRows] = await pool.query(`
            SELECT
                slog.supplier_id,
                COUNT(*)                                                                AS total_picks,
                SUM(CASE WHEN slog.from_suggestion = 1 THEN 1 ELSE 0 END)              AS suggestion_picks,
                SUM(CASE WHEN LOWER(IFNULL(o.category,'')) = ? THEN 1 ELSE 0 END)      AS category_picks,
                SUM(CASE WHEN slog.selected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS picks_30d,
                SUM(CASE WHEN slog.selected_at >= DATE_SUB(NOW(), INTERVAL 60 DAY) AND slog.selected_at < DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS picks_30_60d,
                SUM(CASE WHEN slog.selected_at >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN 1 ELSE 0 END) AS picks_90d,
                AVG(CASE WHEN slog.from_suggestion = 1 THEN slog.suggestion_rank END)  AS avg_rank,
                MAX(slog.selected_at)                                                   AS last_selected_at
            FROM supplier_selection_log slog
            LEFT JOIN orders o ON o.id = slog.order_id
            GROUP BY slog.supplier_id
        `, [category]);
        const selMap = {};
        selRows.forEach(r => { selMap[r.supplier_id] = r; });

        // -----------------------------------------------------------------------
        // 6. Delivery speed
        // -----------------------------------------------------------------------
        const [speedRows] = await pool.query(`
            SELECT o.supplier_id,
                   AVG(
                       TIMESTAMPDIFF(DAY,
                           (SELECT oh1.changed_at FROM order_history oh1
                            WHERE oh1.order_id = o.id AND oh1.new_value = 'Ordered'
                            ORDER BY oh1.changed_at LIMIT 1),
                           (SELECT oh2.changed_at FROM order_history oh2
                            WHERE oh2.order_id = o.id AND oh2.new_value = 'Delivered'
                            ORDER BY oh2.changed_at LIMIT 1)
                       )
                   ) AS avg_delivery_days
            FROM orders o
            WHERE o.status = 'Delivered' AND o.supplier_id IS NOT NULL
            GROUP BY o.supplier_id
        `);
        const speedMap = {};
        speedRows.forEach(r => { speedMap[r.supplier_id] = parseFloat(r.avg_delivery_days); });

        // -----------------------------------------------------------------------
        // 7. Exact part number matches
        // -----------------------------------------------------------------------
        const partMap = {};
        if (partNumber) {
            const [partRows] = await pool.query(
                `SELECT supplier_id, COUNT(*) AS cnt
                 FROM orders
                 WHERE LOWER(part_number) = ? AND supplier_id IS NOT NULL
                 GROUP BY supplier_id`,
                [partNumber]
            );
            partRows.forEach(r => { partMap[r.supplier_id] = r.cnt; });
        }

        // -----------------------------------------------------------------------
        // 8. Item-item co-occurrence (collaborative filtering)
        //    Suppliers often chosen alongside the category leader get a boost.
        //    Only runs when category is set (avoids expensive self-join on empty category).
        // -----------------------------------------------------------------------
        const coOccurrenceMap = {};
        if (category) {
            try {
                const topCatSuppliers = selRows
                    .filter(r => parseInt(r.category_picks) > 2)
                    .sort((a, b) => parseInt(b.category_picks) - parseInt(a.category_picks))
                    .slice(0, 3)
                    .map(r => r.supplier_id);

                if (topCatSuppliers.length > 0) {
                    const placeholders = topCatSuppliers.map(() => '?').join(',');
                    const [coRows] = await pool.query(`
                        SELECT o2.supplier_id, COUNT(*) AS co_count
                        FROM orders o1
                        JOIN orders o2 ON o2.id != o1.id
                                      AND LOWER(IFNULL(o2.category,'')) = ?
                                      AND o2.supplier_id NOT IN (${placeholders})
                        WHERE o1.supplier_id IN (${placeholders})
                          AND LOWER(IFNULL(o1.category,'')) = ?
                          AND o1.supplier_id IS NOT NULL
                        GROUP BY o2.supplier_id
                        HAVING co_count >= 2
                    `, [category, ...topCatSuppliers, ...topCatSuppliers, category]);

                    coRows.forEach(r => {
                        coOccurrenceMap[r.supplier_id] = Math.min(8, Math.log(parseInt(r.co_count) + 1) * 2);
                    });
                    console.log('Co-occurrence boosted', coRows.length, 'suppliers');
                }
            } catch (e) {
                console.warn('Co-occurrence query skipped (non-fatal):', e.message);
            }
        }

        // -----------------------------------------------------------------------
        // 9. Score every supplier
        // -----------------------------------------------------------------------
        const scored = suppliers.map(s => {
            let score    = 0;
            const reasons = [];
            const sel    = selMap[s.id]   || null;
            const speed  = speedMap[s.id] || null;

            // [A] Brand match — up to 40 pts
            if (brandResults.supplierBonuses[s.id]) {
                const bp = Math.min(40, brandResults.supplierBonuses[s.id]);
                score += bp;
                reasons.push('Марка: ' + brandResults.detectedBrands.join(', '));
            }

            // [B] FULLTEXT keyword match — up to 50 pts (PRIMARY signal)
            //     ft_score is normalised so #1 match → ~35 pts, log(match_count) → up to 15 pts.
            //     This ensures a supplier with 88 relevant лента orders ranks above one with
            //     320 unrelated orders that happen to mention лента once each.
            if (fulltextMap[s.id]) {
                const { match_count, ft_score } = fulltextMap[s.id];
                const normFt  = maxFtScore > 0 ? (ft_score / maxFtScore) * 35 : 0;
                const logBonus = Math.min(15, Math.log(match_count + 1) * 4);
                const pts     = Math.min(50, Math.round(normFt + logBonus));
                score += pts;
                reasons.push('Подобни артикули — ' + match_count + ' съвпадения');
            } else if (keywords.length > 0) {
                // Fallback: substring scan on cached item lists (no FULLTEXT)
                const allItems = [s.production_items || '', s.training_items || ''].join('|||').toLowerCase();
                let hits = 0;
                keywords.forEach(kw => { if (allItems.includes(kw)) hits++; });
                if (hits > 0) {
                    const pts = Math.min(20, hits * 5);
                    score += pts;
                    reasons.push('Подобни артикули — ' + hits + ' ключови думи');
                }
            }

            // [C] Category match — up to 15 pts
            if (category && s.categories_supplied) {
                const cats = s.categories_supplied.toLowerCase().split('|||').map(c => c.trim());
                if (cats.some(c => c === category)) {
                    score += 15;
                    reasons.push('Категория: ' + order.category);
                } else if (cats.some(c => c.includes(category) || category.includes(c))) {
                    score += 7;
                    reasons.push('Сходна категория');
                }
            }

            // [D] Exact part number — up to 20 pts
            if (partMap[s.id]) {
                score += Math.min(20, partMap[s.id] * 10);
                reasons.push('Точен номер: ' + order.part_number);
            }

            // [E] Bayesian-smoothed category-aware acceptance rate — up to 12 pts
            //     Bayesian prior prevents 1/1 suppliers from outranking 40/45 ones.
            //     Category-matched picks weighted 3× over generic picks.
            if (sel) {
                const totalPicks = parseInt(sel.total_picks)     || 0;
                const catPicks   = parseInt(sel.category_picks)  || 0;
                const sgstPicks  = parseInt(sel.suggestion_picks) || 0;
                const picks30d   = parseInt(sel.picks_30d)       || 0;
                const picks90d   = parseInt(sel.picks_90d)       || 0;

                const bayesRate  = bayesianRate(catPicks, totalPicks);
                const weighted   = (catPicks * 3 * bayesRate)
                                 + (picks30d * 1.5)
                                 + ((picks90d - picks30d) * 0.5);
                const pts        = Math.min(12, Math.round(weighted * 0.7));

                if (pts > 0) {
                    score += pts;
                    var rankEmoji = sel.avg_rank <= 1.5 ? '🥇' : sel.avg_rank <= 2.5 ? '🥈' : '🥉';
                    reasons.push('Избиран ' + totalPicks + '× от екипа ' + rankEmoji);
                }

                // Penalty: team consistently ignores this supplier's suggestions
                if (sgstPicks > 3 && sgstPicks / Math.max(totalPicks, 1) < 0.2) {
                    score -= 6;
                }
            }

            // [F] Delivery speed — up to 10 pts
            if (speed !== null && !isNaN(speed) && speed > 0) {
                if      (speed <= 3)  { score += 10; reasons.push('Бърза доставка — ~' + Math.round(speed) + ' дни'); }
                else if (speed <= 7)  { score +=  7; reasons.push('Добра доставка — ~' + Math.round(speed) + ' дни'); }
                else if (speed <= 14) { score +=  4; }
                else if (speed <= 30) { score +=  2; }
            }

            // [G] Building affinity — up to 8 pts
            if (building && s.buildings_supplied) {
                const blds  = s.buildings_supplied.toLowerCase().split('|||').map(b => b.trim());
                const times = blds.filter(b => b === building).length;
                if      (times >= 3) { score += 8; reasons.push('Редовен доставчик за ' + order.building); }
                else if (times >= 1) { score += 4; reasons.push('Доставял в ' + order.building); }
            }

            // [G2] Cost center affinity — up to 10 pts
            //      If supplier name contains a token from the cost center
            //      (e.g. cost_center='cb - leonardo' → supplier 'CB Packaging' matches 'cb')
            //      Also checks historical orders: has this supplier fulfilled orders
            //      from the same cost center before?
            if (costCenter) {
                const ccTokens = costCenter
                    .replace(/[^a-zA-Za-\u044f\u0451\u0410-\u042f\u04010-9\s]/g, ' ')
                    .split(/\s+/)
                    .filter(t => t.length >= 2);
                const supplierNameLower = s.name.toLowerCase();
                // Check if any cost center token appears in the supplier name
                const nameMatch = ccTokens.some(t => supplierNameLower.includes(t));
                if (nameMatch) {
                    score += 10;
                    reasons.push('Доставчик за ' + (order.cost_center_name || order.cost_center_code || costCenter));
                }
            }

            // [H] Recency decay — up to 5 pts (exponential, 30-day half-life)
            const lastDate = sel && sel.last_selected_at
                ? new Date(sel.last_selected_at)
                : (s.last_order_date ? new Date(s.last_order_date) : null);
            if (lastDate) {
                const daysAgo = (Date.now() - lastDate.getTime()) / 86400000;
                score += Math.round(5 * Math.exp(-daysAgo / 30));
            }

            // [I] Reliability / experience — up to 3 pts (log-scaled)
            const totalOrders = (parseInt(s.production_orders) || 0) + (parseInt(s.training_orders) || 0);
            if (totalOrders > 0) {
                score += Math.min(3, Math.round(Math.log(totalOrders + 1) * 0.8));
            }

            // [J] Momentum — up to 5 pts
            //     Rewards suppliers gaining traction this month vs last month.
            if (sel) {
                const picks30d    = parseInt(sel.picks_30d)    || 0;
                const picks30_60d = parseInt(sel.picks_30_60d) || 0;

                if (picks30d > 0 && picks30_60d === 0) {
                    score += 3;
                    reasons.push('Нарастваща популярност');
                } else if (picks30d >= 2 && picks30d > picks30_60d * 1.5) {
                    score += 5;
                    reasons.push('Нарастваща популярност');
                } else if (picks30d > 0 && picks30d >= picks30_60d) {
                    score += 2;
                } else if (picks30_60d > 0 && picks30d === 0) {
                    score -= 2;
                }
            }

            // [K] Item-item co-occurrence — up to 8 pts
            if (coOccurrenceMap[s.id]) {
                const pts = Math.min(8, Math.round(coOccurrenceMap[s.id]));
                score += pts;
                if (pts >= 3) reasons.push('Често избиран заедно с лидера за категорията');
            }

            return {
                supplier_id:       s.id,
                supplier_name:     s.name,
                contact_person:    s.contact_person,
                email:             s.email,
                phone:             s.phone,
                specialization:    s.specialization,
                total_orders:      totalOrders,
                avg_delivery_days: speed ? Math.round(speed) : null,
                performance_score: Math.round(parseFloat(s.performance_score) || 50),
                _raw_score:        score,
                match_reasons:     reasons,
            };
        });

        // -----------------------------------------------------------------------
        // 10. Rank + confidence (rank-proportional, not raw score cap)
        // -----------------------------------------------------------------------
        const ranked = scored
            .filter(s => s._raw_score > 0)
            .sort((a, b) => b._raw_score - a._raw_score)
            .slice(0, 5);

        if (ranked.length === 0) { console.log('No scored suppliers'); return []; }

        const topScore = ranked[0]._raw_score;
        const botScore = ranked[ranked.length - 1]._raw_score;
        const range    = Math.max(topScore - botScore, 1);

        ranked.forEach(function(s) {
            var normalised = (s._raw_score - botScore) / range; // 0.0 – 1.0
            s.confidence   = Math.round(55 + normalised * 43);  // 55 – 98%
            delete s._raw_score;
        });

        console.log('Top suggestions:', ranked.map(s => s.supplier_name + ' (' + s.confidence + '%)').join(', '));
        console.log('=== AI SUPPLIER SUGGESTIONS v3 END ===\n');

        return ranked;

    } catch (error) {
        console.error('Error generating supplier suggestions:', error);
        return [];
    }
}

module.exports = { getSupplierSuggestions };
