'use strict';

const https = require('https');
const db = require('../config/database');

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_TIMEOUT_MS = 12_000;
const MAX_ATTEMPTS = 3;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function acquireOrderLock(orderId) {
    const lockName = `partpulse:gemini:${orderId}`;
    const [[row]] = await db.query('SELECT GET_LOCK(?, 1) AS acquired', [lockName]);
    return row.acquired === 1 ? lockName : null;
}
async function releaseOrderLock(lockName) {
    if (!lockName) return;
    try { await db.query('SELECT RELEASE_LOCK(?)', [lockName]); } catch (error) { console.error('[Gemini] lock release failed:', error.message); }
}

async function recordQueue(orderId, rawDescription, status, resultJson = null) {
    try {
        await db.query(`INSERT INTO gemini_enrichment_queue (order_id,raw_description,status,result_json,processed_at,attempts)
            VALUES (?, ?, ?, ?, ${status === 'done' ? 'NOW()' : 'NULL'}, 1)
            ON DUPLICATE KEY UPDATE raw_description=VALUES(raw_description),status=VALUES(status),result_json=VALUES(result_json),
                processed_at=${status === 'done' ? 'NOW()' : 'processed_at'},attempts=attempts+1`,
        [orderId, String(rawDescription || '').slice(0, 65535), status, resultJson]);
    } catch (error) {
        // Older installations without migration 012 retain service availability.
        console.error('[Gemini] queue state was not recorded:', error.message);
    }
}

async function enrichDescription({ orderId, rawDescription, canonicalDescription, partNumber, category, supplierId, createdBy }) {
    if (!Number.isInteger(Number(orderId)) || !rawDescription) return { success: false, skipped: true };
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn('[Gemini] API key is not configured; enrichment skipped');
        return { success: false, skipped: true };
    }

    let lockName;
    try {
        lockName = await acquireOrderLock(orderId);
        if (!lockName) return { success: false, skipped: true, reason: 'already_processing' };
        const [existing] = await db.query(`SELECT id FROM gemini_enrichment_queue
            WHERE order_id=? AND status='done' AND result_json IS NOT NULL AND result_json != '' LIMIT 1`, [orderId]).catch(() => [[]]);
        if (existing.length) return { success: true, skipped: true };
        await recordQueue(orderId, rawDescription, 'pending');

        const prompt = `You are an industrial maintenance expert. Normalize this maintenance item and respond ONLY as JSON with standard_name, standard_name_bg, aliases (max 4), and category.\nDescription: "${String(canonicalDescription || rawDescription).slice(0, 2000)}"\nPart number: "${String(partNumber || '').slice(0, 250)}"\nCategory: "${String(category || '').slice(0, 100)}"`;
        const result = await callGemini(apiKey, prompt);
        if (!result.success) {
            await recordQueue(orderId, rawDescription, 'failed', JSON.stringify({ error: result.reason }));
            return result;
        }
        let parsed;
        try { parsed = JSON.parse(result.text.replace(/```json\s*/gi, '').replace(/```/g, '').trim()); }
        catch {
            await recordQueue(orderId, rawDescription, 'failed', JSON.stringify({ error: 'invalid_json' }));
            return { success: false, reason: 'invalid_json' };
        }
        const canonical = String(canonicalDescription || rawDescription).slice(0, 499);
        const aliases = [parsed.standard_name, parsed.standard_name_bg, ...(Array.isArray(parsed.aliases) ? parsed.aliases : [])]
            .filter(value => typeof value === 'string' && value.trim().length > 2).slice(0, 6);
        for (const alias of aliases) {
            try {
                await db.query(`INSERT INTO product_aliases (raw_name,canonical_name,part_number,category,supplier_id,source,created_by)
                    VALUES (?, ?, ?, ?, ?, 'gemini', ?)`, [alias.trim().slice(0,499), canonical, partNumber || null,
                    String(parsed.category || category || '').slice(0,100) || null, supplierId || null, createdBy || null]);
            } catch (_) { /* duplicate/FK conflicts do not make enrichment fail */ }
        }
        if (rawDescription && canonicalDescription && rawDescription.trim() !== canonicalDescription.trim()) {
            try { await db.query(`INSERT INTO product_aliases (raw_name,canonical_name,part_number,category,supplier_id,source,created_by)
                VALUES (?, ?, ?, ?, ?, 'manual', ?)`, [String(rawDescription).slice(0,499), canonical, partNumber || null, category || null, supplierId || null, createdBy || null]); } catch (_) {}
        }
        await recordQueue(orderId, rawDescription, 'done', JSON.stringify(parsed).slice(0, 4000));
        return { success: true, aliases: aliases.length };
    } catch (error) {
        console.error('[Gemini] enrichment failed:', error.message);
        await recordQueue(orderId, rawDescription, 'failed', JSON.stringify({ error: 'provider_or_database_failure' }));
        return { success: false, reason: 'provider_or_database_failure' };
    } finally {
        await releaseOrderLock(lockName);
    }
}

async function callGemini(apiKey, prompt) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const result = await callGeminiOnce(apiKey, prompt);
        if (result.success || !result.retryable || attempt === MAX_ATTEMPTS) return result;
        await sleep(Math.min(500 * 2 ** (attempt - 1), 2_000));
    }
    return { success: false, reason: 'retry_exhausted' };
}

function callGeminiOnce(apiKey, prompt) {
    return new Promise(resolve => {
        const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 512 } });
        const request = https.request({ hostname:'generativelanguage.googleapis.com', path:`/v1beta/models/${GEMINI_MODEL}:generateContent`, method:'POST',
            headers:{ 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(body), 'x-goog-api-key':apiKey }, timeout:GEMINI_TIMEOUT_MS }, response => {
            let data = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { data += chunk; if (data.length > 1_000_000) request.destroy(); });
            response.on('end', () => {
                if (response.statusCode !== 200) return resolve({ success:false, retryable:response.statusCode === 429 || response.statusCode >= 500, reason:`http_${response.statusCode}` });
                try { resolve({ success:true, text:JSON.parse(data)?.candidates?.[0]?.content?.parts?.[0]?.text || '' }); }
                catch { resolve({ success:false, retryable:false, reason:'invalid_response' }); }
            });
        });
        request.on('timeout', () => request.destroy(new Error('timeout')));
        request.on('error', error => resolve({ success:false, retryable:['timeout','ECONNRESET','ETIMEDOUT','ENOTFOUND'].includes(error.code) || error.message === 'timeout', reason:'network_error' }));
        request.write(body); request.end();
    });
}

module.exports = { enrichDescription };
