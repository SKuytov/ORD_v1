// backend/controllers/supplierSuggestionsController.js
// Phase 2: Intelligent Supplier Suggestions
//
// Scoring model (max 100 points):
//   [A] FULLTEXT item match via supplier_item_history ......... up to 30 pts
//   [B] Category match ........................................ up to 15 pts
//   [C] Specialization match .................................. up to 15 pts
//   [D] Acceptance rate (from supplier_selection_log) ......... up to 15 pts
//   [E] Delivery speed (days Ordered→Delivered) ............... up to 10 pts
//   [F] Building affinity ..................................... up to  8 pts
//   [G] Recency of last selection (decayed) ................... up to  5 pts
//   [H] Performance score (delivery success rate) ............. up to  2 pts
//
// Every signal is capped so no single factor dominates.

const db = require('../config/database');

// ---------------------------------------------------------------------------
// Main: GET /api/suppliers/suggestions/:orderId
// ---------------------------------------------------------------------------
exports.getSuggestedSuppliers = async (req, res) => {
    try {
        const { orderId } = req.params;

        // 1. Load the order — fetch all rich fields
        const [orders] = await db.query(
            `SELECT id, item_description, category, part_number, building,
                    supplier_notes, alternative_product_name, alternative_product_description
             FROM orders WHERE id = ?`,
            [orderId]
        );
        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        const order = orders[0];

        // 1b. Load product_aliases for this description + part_number
        //     These give us all the internal/industrial names the team has recorded
        const [aliasRows] = await db.query(
            `SELECT canonical_name, raw_name FROM product_aliases
             WHERE raw_name LIKE ? OR canonical_name LIKE ?
             LIMIT 20`,
            [`%${(order.item_description || '').substring(0, 80)}%`,
             `%${(order.item_description || '').substring(0, 80)}%`]
        ).catch(() => [[]]);

        // Build a rich text blob from ALL available fields + aliases
        const richTextParts = [
            order.item_description,
            order.alternative_product_name,
            order.alternative_product_description,
            order.supplier_notes,
            ...aliasRows.map(a => a.canonical_name),
            ...aliasRows.map(a => a.raw_name)
        ].filter(Boolean);
        const richText = richTextParts.join(' ');

        const keywords  = extractKeywords(richText);       // now includes aliases + alt names
        const category  = (order.category || '').toLowerCase().trim();
        const building  = (order.building  || '').toLowerCase().trim();

        console.log('[AI] Order:', orderId, '| Aliases:', aliasRows.length, '| Keywords:', keywords.slice(0,8), '| Category:', category, '| Building:', building);

        // 2. Load all active suppliers with aggregated stats in ONE query
        //    We pull delivery-speed and building-affinity here to minimise round-trips.
        const [suppliers] = await db.query(`
            SELECT
                s.id,
                s.name,
                s.contact_person,
                s.email,
                s.phone,
                s.specialization,

                /* ── Performance (delivery success rate) ── */
                AVG(CASE
                    WHEN o.status = 'Delivered'              THEN 100
                    WHEN o.status IN ('Ordered','In Transit') THEN  80
                    WHEN o.status = 'Cancelled'              THEN    0
                    ELSE 50
                END) AS performance_score,

                /* ── Delivery speed: avg days Ordered → Delivered ── */
                AVG(
                    CASE WHEN o.status = 'Delivered' THEN
                        TIMESTAMPDIFF(DAY,
                            (SELECT oh2.changed_at FROM order_history oh2
                             WHERE oh2.order_id = o.id AND oh2.new_value = 'Ordered'
                             ORDER BY oh2.changed_at LIMIT 1),
                            (SELECT oh3.changed_at FROM order_history oh3
                             WHERE oh3.order_id = o.id AND oh3.new_value = 'Delivered'
                             ORDER BY oh3.changed_at LIMIT 1)
                        )
                    END
                ) AS avg_delivery_days,

                /* ── Volume ── */
                COUNT(DISTINCT o.id)  AS production_orders,
                COUNT(DISTINCT t.id)  AS training_orders,

                /* ── Recency of last order ── */
                MAX(o.submission_date) AS last_order_date,

                /* ── Category history ── */
                GROUP_CONCAT(DISTINCT o.category   SEPARATOR '|||') AS categories_supplied,

                /* ── Building history ── */
                GROUP_CONCAT(DISTINCT o.building   SEPARATOR '|||') AS buildings_supplied,

                /* ── Item text (production + training) ── */
                GROUP_CONCAT(DISTINCT o.item_description SEPARATOR '|||') AS production_items,
                GROUP_CONCAT(DISTINCT t.item_description SEPARATOR '|||') AS training_items

            FROM suppliers s
            LEFT JOIN orders          o ON s.id = o.supplier_id
            LEFT JOIN training_orders t ON s.id = t.supplier_id
            WHERE s.active = 1
            GROUP BY s.id
        `);

        console.log(`[AI] Scoring ${suppliers.length} active suppliers`);

        // 3. Load acceptance-rate data from supplier_selection_log
        //    acceptance_rate = times chosen / (times suggested as rank 1-3)
        //    We weight recent selections more (last 90 days) but also keep
        //    lifetime counts as a tiebreaker.
        const [selectionStats] = await db.query(`
            SELECT
                supplier_id,
                COUNT(*)                                          AS total_selections,
                SUM(CASE WHEN from_suggestion = 1 THEN 1 ELSE 0 END) AS suggestion_picks,
                /* Recency: selections in last 30 / 90 days */
                SUM(CASE WHEN selected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS picks_30d,
                SUM(CASE WHEN selected_at >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN 1 ELSE 0 END) AS picks_90d,
                /* Average rank when picked from suggestion (lower = better) */
                AVG(CASE WHEN from_suggestion = 1 THEN suggestion_rank END) AS avg_rank_when_suggested,
                MAX(selected_at) AS last_selected_at
            FROM supplier_selection_log
            GROUP BY supplier_id
        `);
        const selectionMap = {};
        selectionStats.forEach(r => { selectionMap[r.supplier_id] = r; });

        // 4. Load FULLTEXT matches from supplier_item_history
        //    MySQL FULLTEXT with IN BOOLEAN MODE handles Cyrillic/Bulgarian.
        //    We do this once for the keywords we have, map by supplier_id.
        let fulltextSupplierIds = new Set();
        let fulltextScores      = {};   // supplier_id → match_count
        if (keywords.length > 0) {
            const booleanQuery = keywords.map(k => `+${k}*`).join(' ');
            // Fallback: OR mode if strict AND returns nothing
            const orQuery      = keywords.map(k => `${k}*`).join(' ');
            try {
                const [ftRows] = await db.query(`
                    SELECT supplier_id,
                           COUNT(*) AS match_count,
                           SUM(MATCH(item_description, keywords) AGAINST(? IN BOOLEAN MODE)) AS ft_score
                    FROM supplier_item_history
                    WHERE MATCH(item_description, keywords) AGAINST(? IN BOOLEAN MODE)
                    GROUP BY supplier_id
                `, [orQuery, orQuery]);
                ftRows.forEach(r => {
                    fulltextSupplierIds.add(r.supplier_id);
                    fulltextScores[r.supplier_id] = { match_count: r.match_count, ft_score: parseFloat(r.ft_score) || 0 };
                });
                console.log(`[AI] FULLTEXT matched ${ftRows.length} suppliers`);
            } catch (ftErr) {
                // FULLTEXT index may not exist on older installs — fall back gracefully
                console.warn('[AI] FULLTEXT query failed, falling back to keyword scan:', ftErr.message);
            }
        }

        // 5. Score every supplier
        const scoredSuppliers = suppliers.map(supplier => {
            let score = 0;
            const reasons = [];
            const sel     = selectionMap[supplier.id] || null;

            // ── [A] FULLTEXT item match (0–30) ──────────────────────────────
            if (fulltextScores[supplier.id]) {
                const { match_count, ft_score } = fulltextScores[supplier.id];
                // Normalise: cap at 30, with a boost for higher MySQL FT relevance
                const ftPts = Math.min(30, Math.round(match_count * 8 + ft_score * 2));
                score += ftPts;
                reasons.push(`Доставял подобни артикули (${match_count} съвпадения)`);
            } else {
                // Fallback: plain keyword substring scan against production+training items
                const allItems = [supplier.production_items || '', supplier.training_items || ''].join('|||').toLowerCase();
                let hits = 0;
                keywords.forEach(kw => { if (allItems.includes(kw)) hits++; });
                if (hits > 0) {
                    const pts = Math.min(20, hits * 7);
                    score += pts;
                    reasons.push(`Подобни артикули — ${hits} ключови думи`);
                }
            }

            // ── [B] Category match (0–15) ───────────────────────────────────
            if (category && supplier.categories_supplied) {
                const cats = supplier.categories_supplied.toLowerCase().split('|||');
                const exactMatch = cats.some(c => c.trim() === category);
                const partialMatch = !exactMatch && cats.some(c => c.includes(category) || category.includes(c));
                if (exactMatch) {
                    score += 15;
                    reasons.push(`Категория: точно съвпадение (${order.category})`);
                } else if (partialMatch) {
                    score += 8;
                    reasons.push(`Категория: частично съвпадение`);
                }
            }

            // ── [C] Specialization match (0–15) ────────────────────────────
            if (supplier.specialization) {
                const spec    = supplier.specialization.toLowerCase();
                const richLow = richText.toLowerCase(); // rich = description + alt names + notes + aliases
                const specKws = extractKeywords(supplier.specialization);
                const kwOverlap = keywords.filter(k => spec.includes(k) || specKws.includes(k)).length;
                if (richLow.includes(spec) || kwOverlap >= 2) {
                    score += 15;
                    reasons.push(`Специализация: ${supplier.specialization}`);
                } else if (kwOverlap === 1) {
                    score += 7;
                    reasons.push(`Частична специализация: ${supplier.specialization}`);
                }
            }

            // ── [D] Acceptance rate from selection log (0–15) ──────────────
            if (sel) {
                // How often does your team actually pick this supplier?
                // Weighted: recent picks count double
                const weightedPicks = (sel.picks_30d * 2) + ((sel.picks_90d - sel.picks_30d) * 1.5) +
                                      ((sel.total_selections - sel.picks_90d) * 1);
                const acceptPts = Math.min(15, Math.round(weightedPicks * 1.5));
                if (acceptPts > 0) {
                    score += acceptPts;
                    // If team frequently accepts AI suggestions for this supplier, say so
                    if (sel.suggestion_picks > 0 && sel.avg_rank_when_suggested) {
                        const rankLabel = sel.avg_rank_when_suggested <= 1.5 ? '🥇' : sel.avg_rank_when_suggested <= 2.5 ? '🥈' : '🥉';
                        reasons.push(`Избиран ${sel.total_selections}× от екипа ${rankLabel}`);
                    } else {
                        reasons.push(`Избиран ${sel.total_selections}× от екипа`);
                    }
                }

                // Rank penalty: if always suggested high but team always picks someone else manually,
                // this supplier is over-trusted by AI — we reduce their score slightly
                if (sel.suggestion_picks > 3 && sel.avg_rank_when_suggested) {
                    // avg_rank > 2.5 means they're usually shown 3rd and still picked → good
                    // If they're always rank 1 but suggestion_picks is low vs total_selections → bad signal
                    const suggestionAcceptRatio = sel.suggestion_picks / Math.max(sel.total_selections, 1);
                    if (suggestionAcceptRatio < 0.2) {
                        // Team overrides this supplier's suggestions >80% of the time
                        score -= 8;
                        console.log(`[AI] Penalised ${supplier.name}: low suggestion acceptance (${Math.round(suggestionAcceptRatio * 100)}%)`);
                    }
                }
            }

            // ── [E] Delivery speed (0–10) ───────────────────────────────────
            const avgDays = parseFloat(supplier.avg_delivery_days);
            if (!isNaN(avgDays) && avgDays > 0) {
                let speedPts = 0;
                if      (avgDays <= 3)  { speedPts = 10; reasons.push(`Бърза доставка — средно ${Math.round(avgDays)} дни`); }
                else if (avgDays <= 7)  { speedPts =  7; reasons.push(`Добра доставка — средно ${Math.round(avgDays)} дни`); }
                else if (avgDays <= 14) { speedPts =  4; }
                else if (avgDays <= 30) { speedPts =  2; }
                score += speedPts;
            }

            // ── [F] Building affinity (0–8) ─────────────────────────────────
            if (building && supplier.buildings_supplied) {
                const blds = supplier.buildings_supplied.toLowerCase().split('|||');
                const timesForBuilding = blds.filter(b => b.trim() === building).length;
                if (timesForBuilding >= 3) {
                    score += 8;
                    reasons.push(`Редовен доставчик за ${order.building}`);
                } else if (timesForBuilding >= 1) {
                    score += 4;
                    reasons.push(`Доставял в ${order.building}`);
                }
            }

            // ── [G] Recency decay on last selection (0–5) ──────────────────
            // Prefer suppliers the team selected recently over dormant ones
            const lastSelectedAt = sel?.last_selected_at ? new Date(sel.last_selected_at) : null;
            const lastOrderDate  = supplier.last_order_date ? new Date(supplier.last_order_date) : null;
            const referenceDate  = lastSelectedAt || lastOrderDate;
            if (referenceDate) {
                const daysAgo = (Date.now() - referenceDate.getTime()) / (1000 * 60 * 60 * 24);
                // Exponential decay: full 5pts if <7 days, ~2pts at 30 days, ~0 at 90+
                const decayPts = Math.round(5 * Math.exp(-daysAgo / 30));
                score += decayPts;
            }

            // ── [H] Performance score (0–2) ─────────────────────────────────
            const perfScore = parseFloat(supplier.performance_score) || 50;
            score += Math.round((perfScore / 100) * 2);

            // Normalise to 0–100
            const MAX_POSSIBLE = 30 + 15 + 15 + 15 + 10 + 8 + 5 + 2; // = 100
            const confidence = Math.min(100, Math.round((score / MAX_POSSIBLE) * 100));

            return {
                supplier_id:      supplier.id,
                supplier_name:    supplier.name,
                contact_person:   supplier.contact_person,
                email:            supplier.email,
                phone:            supplier.phone,
                specialization:   supplier.specialization,
                total_orders:     (supplier.production_orders || 0) + (supplier.training_orders || 0),
                performance_score: Math.round(perfScore),
                avg_delivery_days: isNaN(avgDays) ? null : Math.round(avgDays),
                confidence,            // 0–100, used by frontend as "% match"
                raw_score: score,
                match_reasons: reasons
            };
        });

        // 6. Sort, deduplicate (shouldn't happen, but guard), return top 3
        const topSuggestions = scoredSuppliers
            .sort((a, b) => b.raw_score - a.raw_score)
            .filter(s => s.confidence > 0)
            .slice(0, 3);

        console.log('[AI] Top suggestions:', topSuggestions.map(s =>
            `${s.supplier_name} (${s.confidence}%)`
        ).join(', '));

        res.json({
            success:        true,
            suggestions:    topSuggestions,
            order_keywords: keywords,
            order_category: category
        });

    } catch (error) {
        console.error('Get supplier suggestions error:', error);
        res.status(500).json({ success: false, message: 'Failed to get suggestions' });
    }
};

// ---------------------------------------------------------------------------
// Log supplier selection → feeds back into scoring
// ---------------------------------------------------------------------------
exports.logSupplierSelection = async (req, res) => {
    try {
        const { orderId, supplierId, wasFromSuggestion, suggestionRank } = req.body;

        if (!orderId || !supplierId) {
            return res.status(400).json({ success: false, message: 'orderId and supplierId are required' });
        }

        await db.query(
            `INSERT INTO supplier_selection_log
             (order_id, supplier_id, selected_by_user_id, from_suggestion, suggestion_rank)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             supplier_id     = VALUES(supplier_id),
             selected_at     = NOW(),
             from_suggestion = VALUES(from_suggestion),
             suggestion_rank = VALUES(suggestion_rank)`,
            [orderId, supplierId, req.user.id, wasFromSuggestion ? 1 : 0, suggestionRank || null]
        );

        res.json({ success: true, message: 'Selection logged' });
    } catch (error) {
        console.error('Log supplier selection error:', error);
        res.status(500).json({ success: false, message: 'Failed to log selection' });
    }
};

// ---------------------------------------------------------------------------
// Suggestion statistics (admin dashboard)
// ---------------------------------------------------------------------------
exports.getSuggestionStats = async (req, res) => {
    try {
        const [stats] = await db.query(`
            SELECT
                COUNT(*)                                               AS total_selections,
                SUM(CASE WHEN from_suggestion = 1 THEN 1 ELSE 0 END) AS from_suggestions,
                ROUND(
                    100.0 * SUM(CASE WHEN from_suggestion = 1 THEN 1 ELSE 0 END)
                    / NULLIF(COUNT(*), 0), 1
                )                                                      AS suggestion_acceptance_pct,
                AVG(CASE WHEN from_suggestion = 1 THEN suggestion_rank END) AS avg_suggestion_rank
            FROM supplier_selection_log
            WHERE selected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        `);

        const [topSuppliers] = await db.query(`
            SELECT
                s.name,
                COUNT(ssl.id)                                                AS selection_count,
                SUM(CASE WHEN ssl.from_suggestion = 1 THEN 1 ELSE 0 END)    AS suggestion_picks,
                ROUND(AVG(CASE WHEN ssl.from_suggestion=1 THEN ssl.suggestion_rank END),1) AS avg_rank,
                ROUND(AVG(
                    CASE WHEN o.status = 'Delivered' THEN
                        TIMESTAMPDIFF(DAY,
                            (SELECT oh.changed_at FROM order_history oh
                             WHERE oh.order_id = o.id AND oh.new_value = 'Ordered'
                             ORDER BY oh.changed_at LIMIT 1),
                            (SELECT oh2.changed_at FROM order_history oh2
                             WHERE oh2.order_id = o.id AND oh2.new_value = 'Delivered'
                             ORDER BY oh2.changed_at LIMIT 1)
                        )
                    END
                ), 1)                                                        AS avg_delivery_days
            FROM supplier_selection_log ssl
            JOIN suppliers s ON ssl.supplier_id = s.id
            LEFT JOIN orders o ON o.supplier_id = s.id
            WHERE ssl.selected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY s.id
            ORDER BY selection_count DESC
            LIMIT 5
        `);

        const [trainingStats] = await db.query(`
            SELECT
                COUNT(*)              AS total_training_orders,
                COUNT(DISTINCT supplier_id) AS suppliers_in_training,
                MAX(import_date)      AS last_import_date
            FROM training_orders
        `);

        const [itemHistoryStats] = await db.query(`
            SELECT COUNT(*) AS total_item_history FROM supplier_item_history
        `);

        res.json({
            success: true,
            stats: stats[0],
            topSuppliers,
            trainingData: trainingStats[0],
            itemHistory: itemHistoryStats[0]
        });
    } catch (error) {
        console.error('Get suggestion stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to get stats' });
    }
};

// ---------------------------------------------------------------------------
// Helper: extract meaningful keywords — supports Latin + Cyrillic (Bulgarian)
// ---------------------------------------------------------------------------
function extractKeywords(text) {
    if (!text) return [];

    const stopWords = new Set([
        // English
        'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
        'from','as','is','was','are','were','be','been','being','have','has','had',
        'do','does','did','will','would','should','could','may','might','can',
        'need','needs','new','one','two','unit','units','pcs','piece','pieces',
        // Bulgarian
        'и','на','за','с','в','от','към','до','по','през','над','под','със',
        'е','са','бъде','би','бил','била','було','след','пред','между','при',
        'или','но','а','как','който','която','което','които','този','тази',
        'това','тези','той','тя','то','те','ние','вие','аз','ти','брой','бр',
        'един','едно','една','два','две','три','нов','нова','ново','нови'
    ]);

    return [...new Set(
        text.toLowerCase()
            .replace(/[^a-zа-яА-ЯA-Z0-9\s-]/g, ' ')
            .split(/\s+/)
            .filter(w =>
                w.length > 2 &&
                !stopWords.has(w) &&
                !/^\d+$/.test(w)
            )
    )];
}

module.exports = exports;
