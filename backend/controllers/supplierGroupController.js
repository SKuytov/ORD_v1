// backend/controllers/supplierGroupController.js
//
// GET /api/orders/by-supplier
// Returns all active (non-terminal) orders grouped by their assigned supplier.
// Orders with no supplier are grouped under a special "__unassigned__" key.
// For each unassigned order, includes the top AI suggestion (from supplier_item_history
// and the supplier-ai scoring) so procurement can confirm with one click.
//
// Response shape:
// {
//   success: true,
//   groups: [
//     {
//       supplier_id: 12,
//       supplier_name: "PROXTEAM",
//       supplier_email: "...",
//       supplier_contact: "...",
//       order_count: 5,
//       buildings: ["CT", "CBP"],
//       total_quantity: 18,
//       orders: [ { ...order, ai_suggestion: null } ]
//     },
//     {
//       supplier_id: null,          // unassigned group
//       supplier_name: null,
//       order_count: 3,
//       orders: [ { ...order, ai_suggestion: { supplier_id, supplier_name, confidence } } ]
//     }
//   ],
//   summary: { total_orders, assigned_count, unassigned_count, supplier_count }
// }

'use strict';

const db = require('../config/database');

// Active statuses — orders that still need processing
const ACTIVE_STATUSES = ['New', 'Pending', 'Quote Requested', 'Quote Received', 'Approved', 'Ordered'];

exports.getOrdersBySupplier = async (req, res) => {
    try {
        const { building, status, priority } = req.query;

        // ── 1. Fetch all active orders with supplier info ──────────────────────
        const conditions = [`o.status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`];
        const params = [...ACTIVE_STATUSES];

        if (building)  { conditions.push('o.building = ?');  params.push(building); }
        if (status)    { conditions.push('o.status = ?');    params.push(status); }
        if (priority)  { conditions.push('o.priority = ?');  params.push(priority); }

        // Templates excluded
        conditions.push('(o.is_template IS NULL OR o.is_template = 0)');

        const [orders] = await db.query(`
            SELECT
                o.id,
                o.building,
                o.item_description,
                o.part_number,
                o.category,
                o.quantity,
                o.priority,
                o.status,
                o.submission_date,
                o.date_needed,
                o.notes,
                o.requester_name,
                o.requester_email,
                o.supplier_id,
                o.unit_price,
                o.total_price,
                o.expected_delivery_date,
                o.last_activity_at,
                s.name   AS supplier_name,
                s.email  AS supplier_email,
                s.contact_person AS supplier_contact,
                cc.code  AS cost_center_code,
                cc.name  AS cost_center_name,
                u.name   AS assigned_to_name
            FROM orders o
            LEFT JOIN suppliers s    ON o.supplier_id = s.id
            LEFT JOIN cost_centers cc ON o.cost_center_id = cc.id
            LEFT JOIN users u         ON o.assigned_to_user_id = u.id
            WHERE ${conditions.join(' AND ')}
            ORDER BY
                o.supplier_id IS NULL ASC,   -- assigned first
                s.name ASC,
                o.priority = 'Urgent' DESC,
                o.date_needed ASC,
                o.submission_date ASC
        `, params);

        // ── 2. For unassigned orders: fetch top AI suggestion ──────────────────
        const unassignedIds = orders.filter(o => !o.supplier_id).map(o => o.id);

        let aiSuggestions = {}; // orderId → { supplier_id, supplier_name, confidence }

        if (unassignedIds.length > 0) {
            // supplier_item_history stores past supplier→item assignments with match_quality
            // We pick the highest-confidence historical match for each item_description
            // using keyword overlap against the current order's description
            const [historyRows] = await db.query(`
                SELECT
                    sih.order_id AS ref_order_id,
                    sih.supplier_id,
                    s.name AS supplier_name,
                    s.email AS supplier_email,
                    sih.match_quality,
                    sih.item_description AS matched_description,
                    sih.keywords
                FROM supplier_item_history sih
                JOIN suppliers s ON sih.supplier_id = s.id
                WHERE sih.match_quality IN ('manual', 'confirmed')
                ORDER BY sih.id DESC
                LIMIT 500
            `);

            // Also grab the AI suggestions from supplier_selection_log if present
            const [selectionLogs] = await db.query(`
                SELECT ssl.order_id, ssl.supplier_id, s.name AS supplier_name, ssl.score_used
                FROM supplier_selection_log ssl
                JOIN suppliers s ON ssl.supplier_id = s.id
                WHERE ssl.order_id IN (${unassignedIds.map(() => '?').join(',')})
                AND ssl.was_selected = 1
                ORDER BY ssl.created_at DESC
            `, unassignedIds).catch(() => [[]]);

            // Build a map of previously selected suppliers per order
            const prevSelected = {};
            for (const row of selectionLogs) {
                if (!prevSelected[row.order_id]) {
                    prevSelected[row.order_id] = row;
                }
            }

            // For each unassigned order, try to find a suggestion
            for (const order of orders.filter(o => !o.supplier_id)) {
                // First: check if there's a previously selected supplier for this exact order
                if (prevSelected[order.id]) {
                    const ps = prevSelected[order.id];
                    aiSuggestions[order.id] = {
                        supplier_id:   ps.supplier_id,
                        supplier_name: ps.supplier_name,
                        confidence:    Math.round((ps.score_used || 0.7) * 100),
                        source:        'previous_selection'
                    };
                    continue;
                }

                // Second: keyword match against supplier_item_history
                const orderKeywords = extractKeywords(order.item_description || '');
                if (orderKeywords.length === 0) continue;

                let bestMatch = null;
                let bestScore = 0;

                for (const hist of historyRows) {
                    const histKeywords = (hist.keywords || '')
                        .split(/[\s,]+/)
                        .filter(w => w.length > 2);

                    if (histKeywords.length === 0) continue;

                    const overlap = orderKeywords.filter(k =>
                        histKeywords.some(h => h.includes(k) || k.includes(h))
                    ).length;

                    const score = overlap / Math.max(orderKeywords.length, histKeywords.length);

                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = hist;
                    }
                }

                if (bestMatch && bestScore >= 0.25) {
                    aiSuggestions[order.id] = {
                        supplier_id:   bestMatch.supplier_id,
                        supplier_name: bestMatch.supplier_name,
                        supplier_email: bestMatch.supplier_email,
                        confidence:    Math.min(99, Math.round(bestScore * 100 + 40)), // scale to 40-99%
                        source:        'history_match'
                    };
                }
            }
        }

        // ── 3. Group orders by supplier ────────────────────────────────────────
        const groupMap = new Map(); // key: supplier_id or '__unassigned__'

        for (const order of orders) {
            const key = order.supplier_id ? String(order.supplier_id) : '__unassigned__';

            if (!groupMap.has(key)) {
                groupMap.set(key, {
                    supplier_id:      order.supplier_id || null,
                    supplier_name:    order.supplier_name || null,
                    supplier_email:   order.supplier_email || null,
                    supplier_contact: order.supplier_contact || null,
                    order_count:      0,
                    buildings:        new Set(),
                    priorities:       { Urgent: 0, High: 0, Normal: 0, Low: 0 },
                    statuses:         {},
                    total_quantity:   0,
                    orders:           []
                });
            }

            const group = groupMap.get(key);
            group.order_count++;
            group.total_quantity += (parseInt(order.quantity) || 0);
            group.buildings.add(order.building);
            group.priorities[order.priority] = (group.priorities[order.priority] || 0) + 1;
            group.statuses[order.status] = (group.statuses[order.status] || 0) + 1;

            group.orders.push({
                ...order,
                ai_suggestion: aiSuggestions[order.id] || null
            });
        }

        // ── 4. Serialize and sort groups ───────────────────────────────────────
        const groups = Array.from(groupMap.values()).map(g => ({
            ...g,
            buildings: Array.from(g.buildings).sort()
        }));

        // Sort: unassigned first (needs action), then by order count desc
        groups.sort((a, b) => {
            if (a.supplier_id === null && b.supplier_id !== null) return -1;
            if (a.supplier_id !== null && b.supplier_id === null) return 1;
            // Urgent orders bubble supplier group up
            const aUrgent = a.priorities.Urgent || 0;
            const bUrgent = b.priorities.Urgent || 0;
            if (bUrgent !== aUrgent) return bUrgent - aUrgent;
            return b.order_count - a.order_count;
        });

        // ── 5. Summary ─────────────────────────────────────────────────────────
        const assignedGroups  = groups.filter(g => g.supplier_id !== null);
        const unassignedGroup = groups.find(g => g.supplier_id === null);

        const summary = {
            total_orders:     orders.length,
            assigned_count:   orders.filter(o => o.supplier_id).length,
            unassigned_count: orders.filter(o => !o.supplier_id).length,
            supplier_count:   assignedGroups.length,
            with_suggestion:  Object.keys(aiSuggestions).length,
            urgent_count:     orders.filter(o => o.priority === 'Urgent').length,
        };

        res.json({ success: true, groups, summary });
    } catch (error) {
        console.error('getOrdersBySupplier error:', error);
        res.status(500).json({ success: false, message: 'Failed to group orders by supplier' });
    }
};

// ── Helper: extract meaningful keywords from item description ──────────────
function extractKeywords(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z\u0400-\u04ff0-9\s\-\.]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

const STOPWORDS = new Set([
    'for', 'the', 'and', 'with', 'from', 'that', 'this', 'are',
    'not', 'but', 'per', 'pcs', 'бр', 'за', 'на', 'от', 'до',
    'или', 'без', 'при', 'под', 'над', 'към', 'the', 'and'
]);
