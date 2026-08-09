'use strict';

const db = require('../config/database');
let Vonage;
let Channels;
try {
    ({ Vonage } = require('@vonage/server-sdk'));
    ({ Channels } = require('@vonage/messages'));
} catch (_) {
    // SMS is optional and its SDK is not a production dependency in this app.
}

const SMS_TIMEOUT_MS = 10_000;
const SMS_MAX_ATTEMPTS = 2;
let _vonage = null;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function getVonage() {
    if (!Vonage || !Channels || !process.env.VONAGE_KEY || !process.env.VONAGE_SECRET) return null;
    if (!_vonage) _vonage = new Vonage({ apiKey: process.env.VONAGE_KEY, apiSecret: process.env.VONAGE_SECRET });
    return _vonage;
}
function withTimeout(promise, timeoutMs) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const error = new Error('SMS timeout');
            error.code = 'SMS_TIMEOUT';
            reject(error);
        }, timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
async function logNotification({ orderId = null, recipientPhone, message, messageId, status, error = null, type = 'sms' }) {
    try {
        await db.query(`INSERT INTO notification_log (order_id,channel,notification_type,recipient_phone,message_preview,message_id,status,error_message,sent_at)
            VALUES (?, 'sms', ?, ?, ?, ?, ?, ?, NOW())`, [orderId, type.slice(0,50), recipientPhone || null,
            String(message || '').slice(0, 2000), messageId || null, status, error ? String(error).slice(0,2000) : null]);
    } catch (logError) { console.error('[SMS] notification log failed:', logError.message); }
}

async function sendSMS(to, text, { orderId = null, type = 'sms' } = {}) {
    const client = getVonage();
    const clean = String(to || '').replace(/\D/g, '');
    if (!client || clean.length < 8) return { success:false, skipped:true };
    const message = String(text || '').slice(0,160);
    let lastError;
    for (let attempt=1; attempt<=SMS_MAX_ATTEMPTS; attempt++) {
        try {
            const result = await withTimeout(client.messages.send({ messageType:'text', channel:Channels.SMS, text:message, to:clean,
                from:process.env.VONAGE_FROM || 'PartPulse' }), SMS_TIMEOUT_MS);
            await logNotification({orderId,recipientPhone:clean,message,messageId:result.messageUUID,status:'sent',type});
            return {success:true,messageId:result.messageUUID};
        } catch (error) {
            lastError=error;
            // A timed-out provider call may still complete remotely. Do not
            // retry it and risk duplicate/costly messages.
            if (attempt < SMS_MAX_ATTEMPTS && error.code !== 'SMS_TIMEOUT') await sleep(400 * attempt);
            else break;
        }
    }
    console.error('[SMS] delivery failed:', lastError?.message);
    await logNotification({orderId,recipientPhone:clean,message,status:'failed',error:'SMS delivery failed',type});
    return {success:false,error:'SMS delivery failed'};
}

async function sendToRows(rows, text, context) {
    const results=[];
    // Sequential, bounded delivery avoids an unbounded provider burst.
    for (const row of rows.slice(0, 100)) results.push(await sendSMS(row.phone, text, context));
    return results;
}
async function smsStaff(text, roles, context = {}) {
    if (!Array.isArray(roles) || !roles.length) return [];
    try {
        const [rows] = await db.query(`SELECT phone FROM users WHERE role IN (${roles.map(()=>'?').join(',')}) AND active=1
            AND phone IS NOT NULL AND phone!='' AND sms_notifications_enabled=1`, roles);
        return sendToRows(rows,text,context);
    } catch (error) { console.error('[SMS] staff lookup failed:',error.message); return []; }
}
async function smsRequester(requesterId,text,context={}) {
    try { const [rows]=await db.query("SELECT phone FROM users WHERE id=? AND active=1 AND phone IS NOT NULL AND phone!='' AND sms_notifications_enabled=1",[requesterId]); return sendToRows(rows,text,context); }
    catch(error){ console.error('[SMS] requester lookup failed:',error.message); return []; }
}
async function smsBuildingRequesters(building,text,excludeId,context={}) {
    try { const [rows]=await db.query(`SELECT phone FROM users WHERE building=? AND role='requester' AND active=1 AND phone IS NOT NULL AND phone!='' AND sms_notifications_enabled=1 ${excludeId?'AND id!=?':''}`,excludeId?[building,excludeId]:[building]); return sendToRows(rows,text,context); }
    catch(error){ console.error('[SMS] building lookup failed:',error.message); return []; }
}
const short = (value,length) => String(value || '').slice(0,length);
async function smsNewOrder({orderId,itemDescription,building,priority}) { return smsStaff(`${priority==='Urgent'?'СПЕШНА':'Нова'} заявка №${orderId} | ${short(itemDescription,50)} | Сграда: ${short(building,20)} | PartPulse`,['admin','procurement','manager'],{orderId,type:'new-order'}); }
async function smsUrgentAlert({orderId,itemDescription,building,requesterName}) { return smsStaff(`СПЕШНА ЗАЯВКА №${orderId} | ${short(itemDescription,40)} | Сграда: ${short(building,20)} | От: ${short(requesterName,30)} | PartPulse`,['admin','procurement','manager'],{orderId,type:'urgent'}); }
async function smsInTransit({orderId,itemDescription,requesterId,building,supplier,expectedDelivery}) { const text=`В транзит: Заявка №${orderId} | ${short(itemDescription,45)}${supplier?' | Доставчик: '+short(supplier,30):''}${expectedDelivery?' | Очаквана доставка: '+short(expectedDelivery,20):''} | PartPulse`; await smsRequester(requesterId,text,{orderId,type:'in-transit'}); return smsBuildingRequesters(building,text,requesterId,{orderId,type:'in-transit'}); }
async function smsDelivered({orderId,itemDescription,requesterId,building,quantity,unit}) { const text=`Доставена: Заявка №${orderId} | ${short(itemDescription,45)}${quantity?' | Количество: '+short(quantity,12)+(unit?' '+short(unit,12):''):''} | PartPulse`; await smsRequester(requesterId,text,{orderId,type:'delivered'}); return smsBuildingRequesters(building,text,requesterId,{orderId,type:'delivered'}); }
async function smsApprovalNeeded({orderId,itemDescription,quoteAmount,currency}) { return smsStaff(`Нужно одобрение: Заявка №${orderId} | ${short(itemDescription,40)} | Сума: ${Number(quoteAmount || 0).toFixed(2)} ${short(currency || 'EUR',10)} | PartPulse`,['manager','admin'],{orderId,type:'approval'}); }
async function smsApprovalDecision({orderId,requesterId,decision,quoteAmount,currency}) { return smsRequester(requesterId,decision==='approved'?`Одобрено: Заявка №${orderId} | Сума ${Number(quoteAmount || 0).toFixed(2)} ${short(currency || 'EUR',10)} | PartPulse`:`Отхвърлено: Заявка №${orderId} | PartPulse`,{orderId,type:'approval-decision'}); }
module.exports={sendSMS,smsStaff,smsRequester,smsBuildingRequesters,smsNewOrder,smsInTransit,smsDelivered,smsUrgentAlert,smsApprovalNeeded,smsApprovalDecision};
