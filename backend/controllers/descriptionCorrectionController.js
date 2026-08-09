// backend/controllers/descriptionCorrectionController.js
//
// Handles admin/procurement correcting an order's item_description
// (and/or saving supplier_notes, alternative fields).
//
// POST /api/orders/:id/correct-description
//   Body: { item_description, supplier_notes, alternative_product_name,
//           alternative_product_description, part_number, category }
//
// What it does:
//   1. Updates the order fields in DB
//   2. Writes a product_aliases row (raw → canonical) immediately
//   3. Queues a background Gemini enrichment job (fire-and-forget)
//   4. Optionally updates supplier_item_history so the AI sees the correction
// ─────────────────────────────────────────────────────────────────────────────

const db                   = require('../config/database');
const { enrichDescription } = require('../services/geminiEnrichmentService');

exports.correctDescription = async (req, res) => {
    try {
        const orderId = parseInt(req.params.id, 10);
        if (!orderId) return res.status(400).json({ success: false, message: 'Invalid order ID' });

        // Only admin and procurement can correct descriptions
        const { role } = req.user;
        if (role !== 'admin' && role !== 'procurement') {
            return res.status(403).json({ success: false, message: 'Нямате права за тази операция' });
        }

        const {
            item_description,
            supplier_notes,
            alternative_product_name,
            alternative_product_description,
            part_number,
            category
        } = req.body;

        if (!item_description || !item_description.trim()) {
            return res.status(400).json({ success: false, message: 'Описанието не може да е празно' });
        }

        // 1. Load current order to capture raw/original description
        const [rows] = await db.query(
            `SELECT id, item_description, part_number, category, supplier_id
             FROM orders WHERE id = ?`,
            [orderId]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Заявката не е намерена' });
        const order = rows[0];
        const rawDescription = order.item_description || '';
        const canonicalDescription = item_description.trim();

        // 2. Build update SET clause — only update fields that were provided
        const updates  = {};
        const setClauses = [];
        const values   = [];

        updates.item_description = canonicalDescription;
        setClauses.push('item_description = ?'); values.push(canonicalDescription);

        if (supplier_notes !== undefined) {
            setClauses.push('supplier_notes = ?'); values.push(supplier_notes || null);
        }
        if (alternative_product_name !== undefined) {
            setClauses.push('alternative_product_name = ?'); values.push(alternative_product_name || null);
        }
        if (alternative_product_description !== undefined) {
            setClauses.push('alternative_product_description = ?'); values.push(alternative_product_description || null);
        }
        if (part_number !== undefined && part_number !== null) {
            setClauses.push('part_number = ?'); values.push(part_number || null);
        }
        if (category !== undefined && category !== null) {
            setClauses.push('category = ?'); values.push(category || null);
        }

        values.push(orderId);
        await db.query(`UPDATE orders SET ${setClauses.join(', ')} WHERE id = ?`, values);

        // 3. Write alias immediately (raw → canonical) — only if description actually changed
        if (rawDescription.trim().toLowerCase() !== canonicalDescription.toLowerCase()) {
            await db.query(
                `INSERT IGNORE INTO product_aliases
                 (raw_name, canonical_name, part_number, category, supplier_id, source, created_by)
                 VALUES (?, ?, ?, ?, ?, 'manual', ?)`,
                [
                    rawDescription.substring(0, 499),
                    canonicalDescription.substring(0, 499),
                    part_number || order.part_number || null,
                    category || order.category || null,
                    order.supplier_id || null,
                    req.user.id
                ]
            );
            console.log(`[Correction] Order #${orderId}: "${rawDescription.substring(0,50)}" → "${canonicalDescription.substring(0,50)}"`);
        }

        // 4. Also save alternative_product_name as alias if provided
        if (alternative_product_name && alternative_product_name.trim()) {
            await db.query(
                `INSERT IGNORE INTO product_aliases
                 (raw_name, canonical_name, part_number, category, supplier_id, source, created_by)
                 VALUES (?, ?, ?, ?, ?, 'manual', ?)`,
                [
                    alternative_product_name.trim().substring(0, 499),
                    canonicalDescription.substring(0, 499),
                    part_number || order.part_number || null,
                    category || order.category || null,
                    order.supplier_id || null,
                    req.user.id
                ]
            ).catch(() => {});
        }

        // 5. Update supplier_item_history so fulltext index reflects correction
        if (order.supplier_id && rawDescription !== canonicalDescription) {
            await db.query(
                `INSERT INTO supplier_item_history (supplier_id, order_id, item_description, keywords)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                     item_description = VALUES(item_description),
                     keywords         = VALUES(keywords)`,
                [
                    order.supplier_id,
                    orderId,
                    canonicalDescription,
                    canonicalDescription // keywords column — matches what backfill script uses
                ]
            ).catch(() => {});
        }

        // 6. Fire-and-forget Gemini enrichment (no await — never blocks response)
        enrichDescription({
            orderId,
            rawDescription,
            canonicalDescription,
            partNumber: part_number || order.part_number,
            category:   category   || order.category,
            supplierId: order.supplier_id,
            createdBy:  req.user.id
        }).catch(err => console.error('[Gemini] Background enrichment failed:', err.message));

        res.json({
            success: true,
            message: 'Описанието е запазено. AI обогатяване тече на фон.',
            order_id: orderId,
            canonical: canonicalDescription
        });

    } catch (err) {
        console.error('[DescriptionCorrection] Error:', err);
        res.status(500).json({ success: false, message: 'Грешка при запазване' });
    }
};
