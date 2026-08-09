'use strict';

const { Vonage } = require('@vonage/server-sdk');
const { Channels } = require('@vonage/messages');
const db = require('../config/database');

let _vonage = null;
function getVonage() {
    if (!_vonage) {
        _vonage = new Vonage({
            apiKey: process.env.VONAGE_KEY,
            apiSecret: process.env.VONAGE_SECRET,
        });
    }
    return _vonage;
}

async function sendSMS(to, text) {
    if (!to || !process.env.VONAGE_KEY) return;
    try {
        const clean = String(to).replace(/\D/g, '');
        if (clean.length < 8) return;
        const result = await getVonage().messages.send({
            messageType: 'text',
            channel: Channels.SMS,
            text: text.slice(0, 160),
            to: clean,
            from: process.env.VONAGE_FROM || 'PartPulse',
        });
        console.log(`[SMS OK] to=${clean} uuid=${result.messageUUID}`);
    } catch (err) {
        console.error(`[SMS ERR] to=${to}:`, err.message);
    }
}

async function logNotification({ orderId, channel, type, recipientPhone, recipientId, message, messageId, status = 'sent', error = null, oldStatus = null, newStatus = null }) {
    try {
        const db = require('../config/database');
        await db.query(
            `INSERT INTO notification_log
             (order_id, channel, notification_type, recipient_id, recipient_phone,
              message_preview, message_id, status, error_message, old_status, new_status, sent_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())`,
            [orderId || null, channel, type, recipientId || null, recipientPhone || null,
             (message || '').slice(0, 255), messageId || null, status, error || null, oldStatus || null, newStatus || null]
        );
    } catch { /* non-critical */ }
}

async function smsStaff(text, roles) {
    try {
        const placeholders = roles.map(() => '?').join(',');
        const [rows] = await db.query(
            `SELECT phone FROM users WHERE role IN (${placeholders}) AND active=1 AND phone IS NOT NULL AND phone!='' AND sms_notifications_enabled=1`,
            roles
        );
        await Promise.allSettled(rows.map(u => sendSMS(u.phone, text)));
    } catch (err) {
        console.error('[SMS] smsStaff error:', err.message);
    }
}

async function smsRequester(requesterId, text) {
    if (!requesterId) return;
    try {
        const [rows] = await db.query(
            `SELECT phone FROM users WHERE id=? AND active=1 AND phone IS NOT NULL AND phone!='' AND sms_notifications_enabled=1`,
            [requesterId]
        );
        if (rows.length) await sendSMS(rows[0].phone, text);
    } catch (err) {
        console.error('[SMS] smsRequester error:', err.message);
    }
}

async function smsBuildingRequesters(building, text, excludeId) {
    if (!building) return;
    try {
        const [rows] = await db.query(
            `SELECT phone FROM users WHERE building=? AND role='requester' AND active=1 AND phone IS NOT NULL AND phone!='' AND sms_notifications_enabled=1 ${excludeId ? 'AND id!=?' : ''}`,
            excludeId ? [building, excludeId] : [building]
        );
        await Promise.allSettled(rows.map(u => sendSMS(u.phone, text)));
    } catch (err) {
        console.error('[SMS] smsBuildingRequesters error:', err.message);
    }
}

async function smsNewOrder({ orderId, itemDescription, building, priority }) {
    const isUrgent = priority === 'Urgent';
    const icon = isUrgent ? 'СПЕШНА' : 'Нова';
    const item = (itemDescription || '').slice(0, 50);
    const text = icon + ' заявка №' + orderId + ' | ' + item + ' | Сграда: ' + (building || '-') + ' | PartPulse';
    await smsStaff(text, ['admin', 'procurement', 'manager']);
}

async function smsUrgentAlert({ orderId, itemDescription, building, requesterName }) {
    const item = (itemDescription || '').slice(0, 40);
    const text = 'СПЕШНА ЗАЯВКА №' + orderId + ' | ' + item + ' | Сграда: ' + (building || '-') + ' | От: ' + (requesterName || '-') + ' | Необходима незабавна обработка! | PartPulse';
    await smsStaff(text, ['admin', 'procurement', 'manager']);
}

async function smsInTransit({ orderId, itemDescription, requesterId, building, supplier, expectedDelivery }) {
    const item = (itemDescription || '').slice(0, 45);
    const sup = supplier ? ' | Доставчик: ' + supplier : '';
    const eta = expectedDelivery ? ' | Очаквана доставка: ' + expectedDelivery : '';
    const text = 'В транзит: Заявка №' + orderId + ' | ' + item + sup + eta + ' | PartPulse';
    await smsRequester(requesterId, text);
    await smsBuildingRequesters(building, text, requesterId);
}

async function smsDelivered({ orderId, itemDescription, requesterId, building, quantity, unit }) {
    const item = (itemDescription || '').slice(0, 45);
    const qty = quantity ? ' | Количество: ' + quantity + (unit ? ' ' + unit : '') : '';
    const text = 'Доставена: Заявка №' + orderId + ' | ' + item + qty + ' | Моля потвърдете получаването | PartPulse';
    await smsRequester(requesterId, text);
    await smsBuildingRequesters(building, text, requesterId);
}

async function smsApprovalNeeded({ orderId, itemDescription, quoteAmount, currency }) {
    const item = (itemDescription || '').slice(0, 40);
    const amt = parseFloat(quoteAmount || 0).toFixed(2);
    const text = 'Нужно одобрение: Заявка №' + orderId + ' | ' + item + ' | Сума: ' + amt + ' ' + (currency || 'EUR') + ' | PartPulse';
    await smsStaff(text, ['manager', 'admin']);
}

async function smsApprovalDecision({ orderId, requesterId, decision, quoteAmount, currency }) {
    const approved = decision === 'approved';
    const amt = parseFloat(quoteAmount || 0).toFixed(2);
    const text = approved
        ? 'Одобрено: Заявка №' + orderId + ' | Сума ' + amt + ' ' + (currency || 'EUR') + ' е одобрена | PartPulse'
        : 'Отхвърлено: Заявка №' + orderId + ' | Офертата не е одобрена. Потърсете алтернатива | PartPulse';
    await smsRequester(requesterId, text);
}

module.exports = { sendSMS, smsStaff, smsRequester, smsBuildingRequesters, smsNewOrder, smsInTransit, smsDelivered, smsUrgentAlert, smsApprovalNeeded, smsApprovalDecision };
