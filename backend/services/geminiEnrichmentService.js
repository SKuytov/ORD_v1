// backend/services/geminiEnrichmentService.js
//
// Calls Gemini 2.0 Flash (FREE tier: 1,500 req/day, 15 req/min)
// Handles 429 rate limiting with automatic retry + backoff.
// ─────────────────────────────────────────────────────────────────────────────

const https  = require('https');
const db     = require('../config/database');

const GEMINI_MODEL   = 'gemini-2.0-flash';
const GEMINI_TIMEOUT = 15_000;

// ─────────────────────────────────────────────────────────────────────────────
// Main: enrich a description and persist aliases
// ─────────────────────────────────────────────────────────────────────────────
async function enrichDescription({ orderId, rawDescription, canonicalDescription, partNumber, category, supplierId, createdBy }) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn('[Gemini] GEMINI_API_KEY not set — skipping enrichment');
        return;
    }

    // Check if already successfully enriched (has result_json with real content)
    const [existing] = await db.query(
        `SELECT id FROM gemini_enrichment_queue 
         WHERE order_id = ? AND status = 'done' AND result_json IS NOT NULL AND result_json != ''
         LIMIT 1`,
        [orderId]
    ).catch(() => [[]]);
    if (existing.length > 0) return;

    const prompt = `You are an industrial maintenance expert for cotton swab, wet wipes, ear stick, and nonwoven fabric production equipment.

A maintenance requester submitted an order with this description (may be in Bulgarian, English, or an internal company nickname):
"${canonicalDescription || rawDescription}"
${partNumber ? `Part number: ${partNumber}` : ''}
${category ? `Category: ${category}` : ''}

Your task:
1. Identify the standard industrial/technical name for this item in English.
2. Provide the Bulgarian translation of the standard name.
3. Provide up to 4 alternative names (Bulgarian and/or English), including any common informal/slang names used in factories.
4. Identify the most likely product category from: Electrical, Mechanical, Hydraulic, Pneumatic, Consumables, Safety, Spare Parts, Other.

Respond ONLY with valid JSON, no markdown, no explanation:
{"standard_name":"...","standard_name_bg":"...","aliases":["alias1","alias2","alias3","alias4"],"category":"..."}`;

    try {
        const result = await callGemini(apiKey, prompt);
        if (!result) {
            await db.query(
                `INSERT INTO gemini_enrichment_queue (order_id, raw_description, status, attempts)
                 VALUES (?, ?, 'failed', 1)
                 ON DUPLICATE KEY UPDATE status='failed', attempts=attempts+1`,
                [orderId, rawDescription]
            ).catch(() => {});
            return;
        }

        // Parse JSON
        let parsed;
        try {
            const clean = result.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
            parsed = JSON.parse(clean);
        } catch (parseErr) {
            console.warn('[Gemini] Could not parse response for order', orderId, ':', result.substring(0, 100));
            await db.query(
                `INSERT INTO gemini_enrichment_queue (order_id, raw_description, status, result_json, attempts)
                 VALUES (?, ?, 'failed', ?, 1)
                 ON DUPLICATE KEY UPDATE status='failed', result_json=VALUES(result_json), attempts=attempts+1`,
                [orderId, rawDescription, result.substring(0, 500)]
            ).catch(() => {});
            return;
        }

        // Build alias list
        const allAliases = [
            parsed.standard_name,
            parsed.standard_name_bg,
            ...(Array.isArray(parsed.aliases) ? parsed.aliases : [])
        ].filter(a => a && typeof a === 'string' && a.trim().length > 2);

        // Insert aliases
        let insertedCount = 0;
        for (const alias of allAliases) {
            try {
                await db.query(
                    `INSERT INTO product_aliases
                     (raw_name, canonical_name, part_number, category, supplier_id, source, created_by)
                     VALUES (?, ?, ?, ?, ?, 'gemini', ?)`,
                    [
                        alias.trim().substring(0, 499),
                        (canonicalDescription || rawDescription).substring(0, 499),
                        partNumber || null,
                        parsed.category || category || null,
                        supplierId || null,
                        createdBy || null
                    ]
                );
                insertedCount++;
            } catch (insertErr) {
                // Duplicate or FK error — skip silently
            }
        }

        // Also store raw→canonical mapping if description was corrected
        if (rawDescription && canonicalDescription && rawDescription.trim() !== canonicalDescription.trim()) {
            try {
                await db.query(
                    `INSERT INTO product_aliases
                     (raw_name, canonical_name, part_number, category, supplier_id, source, created_by)
                     VALUES (?, ?, ?, ?, ?, 'manual', ?)`,
                    [
                        rawDescription.substring(0, 499),
                        canonicalDescription.substring(0, 499),
                        partNumber || null,
                        category || null,
                        supplierId || null,
                        createdBy || null
                    ]
                );
                insertedCount++;
            } catch (_) {}
        }

        // Mark done in queue
        await db.query(
            `INSERT INTO gemini_enrichment_queue
             (order_id, raw_description, status, result_json, processed_at, attempts)
             VALUES (?, ?, 'done', ?, NOW(), 1)
             ON DUPLICATE KEY UPDATE
               status='done', result_json=VALUES(result_json),
               processed_at=NOW(), attempts=attempts+1`,
            [orderId, rawDescription, JSON.stringify(parsed).substring(0, 4000)]
        ).catch(() => {});

        console.log(`[Gemini] Order #${orderId}: ${insertedCount} aliases inserted (${allAliases.length} candidates)`);

    } catch (err) {
        console.error('[Gemini] Enrichment error for order', orderId, ':', err.message);
        await db.query(
            `INSERT INTO gemini_enrichment_queue (order_id, raw_description, status, attempts)
             VALUES (?, ?, 'failed', 1)
             ON DUPLICATE KEY UPDATE status='failed', attempts=attempts+1`,
            [orderId, rawDescription]
        ).catch(() => {});
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// callGemini with 429 retry + exponential backoff
// Free tier limit: 15 req/min. On 429 we must wait long enough for the
// rate-limit window to fully reset — short waits just burn more quota.
// Delays: 30s → 60s → 120s (exponential, capped at 120s)
// ─────────────────────────────────────────────────────────────────────────────
async function callGemini(apiKey, prompt, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        const result = await _callGeminiOnce(apiKey, prompt);
        if (result !== 'RATE_LIMITED') return result;
        // Exponential backoff: 30s, 60s, 120s
        const wait = Math.min(30_000 * Math.pow(2, attempt - 1), 120_000);
        console.warn(`[Gemini] 429 rate limit — waiting ${wait / 1000}s (attempt ${attempt}/${retries})`);
        await new Promise(r => setTimeout(r, wait));
    }
    console.warn('[Gemini] All retries exhausted — item will be left as pending for next run');
    return null;
}

function _callGeminiOnce(apiKey, prompt) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 512 }
        });

        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: GEMINI_TIMEOUT
        }, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 429) return resolve('RATE_LIMITED');
                if (res.statusCode !== 200) {
                    console.warn(`[Gemini] HTTP ${res.statusCode}:`, data.substring(0, 150));
                    return resolve(null);
                }
                try {
                    const parsed = JSON.parse(data);
                    const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
                    resolve(text || null);
                } catch {
                    resolve(null);
                }
            });
        });

        req.on('timeout', () => { req.destroy(); reject(new Error('Gemini timeout')); });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

module.exports = { enrichDescription };
