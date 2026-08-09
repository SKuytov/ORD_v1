// backend/utils/emailService.js
// PartPulse Orders v4.0 — Email Service (nodemailer / SMTP)
//
// Required .env keys:
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE (true/false)
//   SMTP_USER, SMTP_PASSWORD
//   EMAIL_FROM=PartPulse Orders <info-partpulse@skuytov.eu>
//   APP_URL=https://partpulse-orders.tail675c8b.ts.net
//   ADMIN_EMAIL=fallback@yourdomain.com   (used if DB query fails)

'use strict';

const nodemailer = require('nodemailer');
const path = require('path');
const fs   = require('fs');
const db   = require('../config/database');

// ─── Nodemailer transporter (lazy-initialised, pooled) ────────────────────────
let _transporter = null;
function getTransporter() {
    if (!_transporter) {
        _transporter = nodemailer.createTransport({
            host:    process.env.SMTP_HOST,
            port:    parseInt(process.env.SMTP_PORT || '465'),
            secure:  process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS,
            },
            pool: true,
            maxConnections: 5,
            maxMessages:    100,
            rateDelta:      1000,
            rateLimit:      5,
        });
        _transporter.verify()
            .then(() => console.log('[Email] SMTP transporter ready'))
            .catch(err => console.error('[Email] SMTP transporter error:', err.message));
    }
    return _transporter;
}

// ─── Brand ────────────────────────────────────────────────────────────────────
const B = {
    navy:    '#1e3a5f',
    navyMid: '#2d3e6b',
    orange:  '#e8682a',
    orangeHover: '#f97316',
    bg:      '#eef2f7',
    card:    '#ffffff',
    muted:   '#64748b',
    border:  '#dde3ed',
    text:    '#0f172a',
    textSub: '#475569',
    FROM:    process.env.EMAIL_FROM  || 'PartPulse Orders <noreply@skuytov.eu>',
    URL:     process.env.APP_URL     || 'https://partpulse-orders.tail675c8b.ts.net',
};

// ─── Status catalogue ─────────────────────────────────────────────────────────
const STATUS = {
    'New':                  { color: '#64748b', bg: '#f1f5f9', label: 'Нова',                icon: '🆕',  step: 1 },
    'Pending':              { color: '#94a3b8', bg: '#f8fafc', label: 'В очакване',           icon: '⏳',  step: 1 },
    'Quote Requested':      { color: '#d97706', bg: '#fef3c7', label: 'Изискана оферта',      icon: '📝',  step: 2 },
    'Quote Received':       { color: '#7c3aed', bg: '#ede9fe', label: 'Получена оферта',      icon: '📬',  step: 3 },
    'Quote Under Approval': { color: '#9333ea', bg: '#f5f3ff', label: 'Оферта в одобрение',   icon: '🔍',  step: 3 },
    'Approved':             { color: '#059669', bg: '#d1fae5', label: 'Одобрена',             icon: '✅',  step: 4 },
    'Ordered':              { color: '#2563eb', bg: '#dbeafe', label: 'Поръчана',             icon: '📦',  step: 4 },
    'In Transit':           { color: '#0891b2', bg: '#cffafe', label: 'В транзит',            icon: '🚚',  step: 5 },
    'Partially Delivered':  { color: '#65a30d', bg: '#ecfccb', label: 'Частично доставена',   icon: '📫',  step: 5 },
    'Delivered':            { color: '#16a34a', bg: '#dcfce7', label: 'Доставена',            icon: '✅',  step: 6 },
    'Cancelled':            { color: '#dc2626', bg: '#fee2e2', label: 'Анулирана',            icon: '❌',  step: 0 },
    'On Hold':              { color: '#ea580c', bg: '#ffedd5', label: 'На чакане',            icon: '⏸️', step: 0 },
};

const STATUS_MSG = {
    'Approved':             'Вашата заявка е одобрена и ще бъде обработена скоро.',
    'Ordered':              'Заявката е поръчана от доставчика.',
    'In Transit':           'Поръчката е изпратена и е в процес на доставка.',
    'Delivered':            'Поръчката е доставена успешно!',
    'Cancelled':            'Заявката е анулирана.',
    'Quote Received':       'Получена е оферта за вашата заявка.',
    'On Hold':              'Заявката е временно поставена на изчакване.',
    'Partially Delivered':  'Частично количество беше доставено. Останалото е в процес.',
};

// Priority colours
const PRIORITY = {
    'Low':    { bg: '#64748b', label: 'Нисък' },
    'Normal': { bg: '#3b82f6', label: 'Нормален' },
    'High':   { bg: '#f59e0b', label: 'Висок' },
    'Urgent': { bg: '#ef4444', label: 'СПЕШЕН' },
};

// ─── Utilities ────────────────────────────────────────────────────────────────
const fmt = (d, locale = 'bg-BG') => {
    if (!d) return '—';
    const date = new Date(d);
    return isNaN(date) ? String(d) : date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const trunc = (s, n = 60) => s ? (s.length > n ? s.slice(0, n) + '…' : s) : '—';
const ikey  = (type, id, extra = '') =>
    `pp-${type}-${id}-${extra}-${new Date().toISOString().slice(0,13)}`
        .replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 256);

// ─── DB helpers ───────────────────────────────────────────────────────────────
async function getStaffEmails(roles = ['admin','procurement','manager','super_admin']) {
    try {
        const placeholders = roles.map(() => '?').join(',');
        const [rows] = await db.query(
            `SELECT email, name FROM users
             WHERE role IN (${placeholders}) AND active = 1
             AND email IS NOT NULL AND email != ''`,
            roles
        );
        return rows;
    } catch {
        const fb = process.env.ADMIN_EMAIL;
        return fb ? [{ email: fb, name: 'Admin' }] : [];
    }
}

// Non-blocking email log to DB (silent fail if table missing)
async function logEmail({ type, orderId, recipient, messageId, subject, tags = {} }) {
    try {
        await db.query(
            `INSERT INTO notification_log
             (order_id, channel, notification_type, recipient_email, subject, message_id,
              old_status, new_status, status, sent_at)
             VALUES (?,?,?,?,?,?,?,?,?,NOW())`,
            [
                orderId || null,
                'email',
                type,
                recipient || null,
                subject || '',
                messageId || null,
                tags.oldStatus || null,
                tags.newStatus || null,
                'sent'
            ]
        );
    } catch { /* non-critical */ }
}

// ─── Core send (single) with exponential retry ───────────────────────────────
// Signature is identical to the Resend version so all callers remain unchanged.
// `tags` and `idempKey` are accepted but silently ignored (SMTP has no concept of them).
async function sendOne({ to, subject, html, text, replyTo, attachments } = {}) {
    const transporter = getTransporter();
    const toList      = Array.isArray(to) ? to : [to];

    const mailOptions = {
        from:    B.FROM,
        to:      toList.join(', '),
        subject,
        html,
        ...(text        && { text }),
        ...(replyTo     && { replyTo }),
        ...(attachments && { attachments }),
    };

    const retryableCodes = ['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ESOCKET','ENOTFOUND','ECONNECTION'];
    const maxAttempts    = 3;
    let lastErr;

    for (let i = 1; i <= maxAttempts; i++) {
        try {
            const info = await transporter.sendMail(mailOptions);
            console.log(`[Email ✓] attempt=${i} id=${info.messageId} to=${toList.join(',')} subj="${subject}"`);
            return { success: true, messageId: info.messageId };
        } catch (err) {
            lastErr = err;
            console.error(`[Email ✗] attempt ${i}:`, err.message);
            const retryable = retryableCodes.includes(err.code);
            if (!retryable || i === maxAttempts) break;
            // Reinitialise transporter on connection errors
            _transporter = null;
            await new Promise(r => setTimeout(r, 1200 * i));
        }
    }
    throw new Error(`Email failed after ${maxAttempts} attempts: ${lastErr?.message}`);
}

// Batch send — SMTP has no native batch API, so we send sequentially.
// Returns an array of { id } objects to keep the same shape as Resend batch results.
async function sendBatch(emails) {
    const results = [];
    for (const e of emails) {
        const r = await sendOne(e);
        results.push({ id: r.messageId });
    }
    return results;
}

// ─── Build file attachment object from a DB file record ──────────────────────
// fileRecord = { original_name, stored_name, mime_type, size_bytes, file_path? }
// uploadsRoot = absolute path to your uploads directory on disk
function buildAttachment(fileRecord, uploadsRoot) {
    try {
        const absPath = fileRecord.file_path ||
            path.join(uploadsRoot || path.join(__dirname, '../../uploads'), fileRecord.stored_name);
        if (!fs.existsSync(absPath)) return null;
        const content = fs.readFileSync(absPath);               // Buffer
        return { content, filename: fileRecord.original_name || fileRecord.stored_name };
    } catch (err) {
        console.warn('[Email] Could not attach file:', fileRecord.stored_name, err.message);
        return null;
    }
}

// ─── Shared HTML layout ───────────────────────────────────────────────────────
function layout({ preheader = '', badge = null, body }) {
return `<!DOCTYPE html>
<html lang="bg" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>PartPulse Orders</title>
<!--[if mso]><style>td,th,div,p,a,h1,h2,h3,h4,h5,h6{font-family:Arial,sans-serif!important}</style><![endif]-->
<style>
body,html{margin:0;padding:0;background:${B.bg}}
a{color:${B.orange};text-decoration:none}
@media(max-width:600px){
  .wrap{width:100%!important;border-radius:0!important}
  .pad{padding:24px 18px!important}
  .btn-td{width:100%!important;display:block!important}
  .btn-a{width:100%!important;box-sizing:border-box!important;display:block!important;text-align:center!important}
  .kpi-td{width:50%!important;display:inline-block!important;box-sizing:border-box!important}
  .hide-sm{display:none!important}
  .step-label{font-size:8px!important}
  .chart-col{width:100%!important;display:block!important;margin-bottom:8px!important}
}
</style>
</head>
<body style="margin:0;padding:0;background:${B.bg};font-family:'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">

<!-- preheader -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${B.bg}">
${preheader}&nbsp;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;&zwnj;&#8203;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:${B.bg};padding:32px 16px">
<tr><td align="center">

<!-- outer card -->
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0"
       style="max-width:600px;width:100%;background:${B.card};border-radius:16px;
              overflow:hidden;box-shadow:0 8px 40px rgba(30,58,95,.14)">

  <!-- ══ HEADER ══ -->
  <tr>
    <td style="background:linear-gradient(135deg,${B.navy} 0%,${B.navyMid} 55%,#3a5090 100%);
               padding:32px 36px 28px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align:middle">
            <!-- PartPulse Logo — hosted image, works in all email clients -->
            <img src="https://partpulse.eu/images/Partpulse-logo-vertical.jpg"
                 alt="PartPulse Orders"
                 width="220" height="63"
                 style="display:block;border:0;outline:none;text-decoration:none;
                        border-radius:8px;background:#ffffff"
                 border="0">
          </td>
          ${badge ? `<td align="right" style="vertical-align:middle">
            <span style="display:inline-block;background:${badge.bg};color:${badge.text || '#fff'};
                         padding:6px 16px;border-radius:20px;font-size:12px;font-weight:700;
                         letter-spacing:0.5px;text-transform:uppercase">
              ${badge.label}
            </span>
          </td>` : ''}
        </tr>
      </table>
    </td>
  </tr>

  <!-- ══ BODY ══ -->
  <tr>
    <td class="pad" style="padding:36px">
      ${body}
    </td>
  </tr>

  <!-- ══ FOOTER ══ -->
  <tr>
    <td style="background:#0f172a;padding:24px 36px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td>
            <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;line-height:1.6">
              Автоматично съобщение от <strong style="color:#cbd5e1">PartPulse Orders</strong>
              &mdash; не отговаряйте директно.
            </p>
            <p style="margin:0;font-size:11px;color:#475569">
              &copy; 2026 PartPulse.eu &nbsp;&middot;&nbsp;
              <a href="${B.URL}" style="color:${B.orange}">Отвори системата</a>
            </p>
          </td>
          <td align="right" class="hide-sm" style="vertical-align:bottom">
            <p style="margin:0;font-size:3px;color:#334155;letter-spacing:0.5px">
              Developed and Hosted fully by Salim Kuytov. all right reserved.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Building Manager helper ──────────────────────────────────────────────────
async function getBuildingManagerEmails(buildingCode) {
    if (!buildingCode) return [];
    try {
        const [rows] = await db.query(`
            SELECT u.email FROM users u
            JOIN building_managers bm ON bm.user_id = u.id
            JOIN buildings b ON b.id = bm.building_id
            WHERE b.code = ?
              AND u.active = 1
              AND u.email_notifications_enabled = 1
        `, [buildingCode]);
        return rows.map(r => r.email);
    } catch (e) {
        console.error('[getBuildingManagerEmails]', e.message);
        return [];
    }
}

// ─── Re-usable building blocks ────────────────────────────────────────────────

// Section header bar
const sectionHead = (title, color = B.navyMid) =>
    `<div style="background:${color};color:#fff;padding:11px 18px;border-radius:8px 8px 0 0;
                font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase">
       ${title}
     </div>`;

// Key-value table — rows are [label, value] or null (skipped)
const kvTable = (rows) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="border:1px solid ${B.border};border-top:none;border-radius:0 0 8px 8px;
              overflow:hidden;margin-bottom:24px">
  ${rows.filter(Boolean).map(([k, v], i) => `
  <tr style="background:${i%2===0?'#fff':'#f8fafc'}">
    <td style="padding:12px 18px;color:${B.muted};font-size:13px;font-weight:500;
               width:42%;border-bottom:1px solid ${B.border};vertical-align:top">${k}</td>
    <td style="padding:12px 18px;color:${B.text};font-size:13px;font-weight:600;
               border-bottom:1px solid ${B.border};vertical-align:top">${v}</td>
  </tr>`).join('')}
</table>`;

// CTA button
const btn = (label, url, color = B.navyMid) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
            style="margin:0 auto 8px">
       <tr><td class="btn-td" style="background:${color};border-radius:10px">
         <a href="${url}" class="btn-a"
            style="display:inline-block;padding:14px 38px;color:#fff;font-size:15px;
                   font-weight:700;text-decoration:none;letter-spacing:0.1px">
           ${label}
         </a>
       </td></tr>
     </table>`;

// Status pill
const pill = (statusKey) => {
    const s = STATUS[statusKey] || { color: B.muted, bg: '#f1f5f9', label: statusKey, icon: '•' };
    return `<span style="display:inline-block;background:${s.bg};color:${s.color};
                         border:1px solid ${s.color}40;padding:4px 14px;border-radius:20px;
                         font-size:12px;font-weight:700">${s.icon} ${s.label}</span>`;
};

// Priority pill
const prioLabel = (p) => {
    const pr = PRIORITY[p] || PRIORITY['Normal'];
    return `<span style="display:inline-block;background:${pr.bg};color:#fff;
                         padding:4px 13px;border-radius:20px;font-size:12px;font-weight:700">
              ${pr.label}
            </span>`;
};

// Alert banner
const alert = (html, type = 'info') => {
    const map = {
        info:    ['#dbeafe','#3b82f6','#1e3a8a'],
        success: ['#d1fae5','#10b981','#064e3b'],
        warn:    ['#fef3c7','#f59e0b','#78350f'],
        danger:  ['#fee2e2','#ef4444','#7f1d1d'],
    };
    const [bg, border, text] = map[type] || map.info;
    return `<div style="background:${bg};border-left:4px solid ${border};
                        border-radius:6px;padding:14px 18px;margin:20px 0">
              <p style="margin:0;color:${text};font-size:13px;line-height:1.7">${html}</p>
            </div>`;
};

// Lifecycle step tracker
const tracker = (current) => {
    const steps = [
        { n:1, label:'Нова' },
        { n:2, label:'Оферта' },
        { n:3, label:'Одобрение' },
        { n:4, label:'Поръчано' },
        { n:5, label:'Транзит' },
        { n:6, label:'Доставена' },
    ];
    if (current === 0) return ''; // cancelled / on-hold — hide tracker

    const cells = steps.map(({ n, label }, i) => {
        const done   = current > n;
        const active = current === n;
        const circleBg    = done ? B.orange : active ? B.navyMid : '#e2e8f0';
        const circleColor = (done || active) ? '#fff' : '#94a3b8';
        const textColor   = active ? B.navyMid : done ? B.orange : '#94a3b8';
        const connector   = i < steps.length - 1
            ? `<td style="padding:0 1px;vertical-align:middle">
                 <div style="height:2px;width:14px;background:${done?B.orange:'#e2e8f0'}"></div>
               </td>`
            : '';
        return `<td align="center" style="vertical-align:top;padding:0 2px">
          <div style="width:30px;height:30px;border-radius:50%;background:${circleBg};
                      color:${circleColor};font-size:12px;font-weight:700;text-align:center;
                      line-height:30px;margin:0 auto 5px">
            ${done ? '✓' : n}
          </div>
          <div class="step-label"
               style="font-size:9px;color:${textColor};font-weight:${active?'800':'400'};
                      white-space:nowrap;letter-spacing:0.3px">${label}</div>
        </td>${connector}`;
    }).join('');

    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"
                    align="center" style="margin:0 auto 28px">
              <tr>${cells}</tr>
            </table>`;
};

// Divider
const divider = () => `<div style="border-top:1px solid ${B.border};margin:24px 0"></div>`;

// ─── Attachment link cards ────────────────────────────────────────────────────
// files = [{ original_name, size_bytes, mime_type, download_url }]
// download_url = full URL to download the file from your app
function attachmentCards(files) {
    if (!files || !files.length) return '';

    const iconFor = (mime = '', name = '') => {
        const t = (mime + name).toLowerCase();
        if (t.includes('pdf'))                            return { icon: '📄', color: '#dc2626' };
        if (t.match(/png|jpg|jpeg|gif|webp|svg/))         return { icon: '🖼️', color: '#7c3aed' };
        if (t.match(/xlsx|xls|spreadsheet/))              return { icon: '📊', color: '#16a34a' };
        if (t.match(/docx|doc|word/))                     return { icon: '📝', color: '#2563eb' };
        if (t.match(/dwg|dxf|stp|step|igs|stl|cad/))     return { icon: '⚙️', color: '#0891b2' };
        if (t.match(/zip|rar|7z|tar/))                    return { icon: '🗜️', color: '#d97706' };
        return { icon: '📎', color: B.muted };
    };

    const fmtSize = (bytes) => {
        if (!bytes) return '';
        if (bytes < 1024)       return bytes + ' B';
        if (bytes < 1048576)    return (bytes/1024).toFixed(0) + ' KB';
        return (bytes/1048576).toFixed(1) + ' MB';
    };

    const cards = files.map(f => {
        const { icon, color } = iconFor(f.mime_type, f.original_name);
        const size = fmtSize(f.size_bytes);
        const url  = f.download_url || `${B.URL}/api/orders/files/${f.id}/download`;
        const name = trunc(f.original_name || 'Файл', 42);
        return `
<tr>
  <td style="padding:0 0 10px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc;border:1px solid ${B.border};border-radius:8px;
                  overflow:hidden;transition:all .2s">
      <tr>
        <td style="width:48px;padding:14px 0 14px 16px;vertical-align:middle">
          <span style="font-size:26px;line-height:1">${icon}</span>
        </td>
        <td style="padding:14px 12px;vertical-align:middle">
          <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:${B.text}">${name}</p>
          <p style="margin:0;font-size:11px;color:${B.muted}">${size ? size + ' &nbsp;·&nbsp; ' : ''}${f.mime_type || ''}</p>
        </td>
        <td style="padding:14px 16px;vertical-align:middle;text-align:right">
          <a href="${url}"
             style="display:inline-block;background:${color};color:#fff;
                    padding:7px 16px;border-radius:6px;font-size:12px;
                    font-weight:700;text-decoration:none;white-space:nowrap">
            ⬇ Изтегли
          </a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
    }).join('');

    return `
${sectionHead('📎 Прикачени файлове')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="border:1px solid ${B.border};border-top:none;border-radius:0 0 8px 8px;
              padding:14px 14px 4px;margin-bottom:24px;background:#fff">
  <tbody>${cards}</tbody>
</table>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
//   EMAIL FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 1. New Order Notification → admin / procurement
 *
 * @param {object} orderData
 *   orderId, building, buildingName, costCenterCode, itemDescription,
 *   partNumber, category, quantity, unit, requester, dateNeeded, priority,
 *   notes, files? [{original_name, size_bytes, mime_type, download_url}]
 */
async function sendNewOrderNotification(orderData) {
    const {
        orderId, building, buildingName, costCenterCode,
        itemDescription, partNumber, category,
        quantity, unit, requester, dateNeeded, priority, notes,
        files = [],
    } = orderData;

    const recipients = await getStaffEmails(['admin','procurement','manager','super_admin']);
    if (!recipients.length) return { success: false, error: 'No recipients' };

    const displayBuilding = buildingName || building || '—';
    const prio = priority || 'Normal';
    const isUrgent = prio === 'Urgent';

    const makeBody = (recipientName) => `
      <!-- Greeting -->
      <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:${B.text}">
        Здравейте${recipientName ? `, ${recipientName}` : ''} 👋
      </p>
      <p style="margin:0 0 28px;font-size:14px;color:${B.textSub};line-height:1.7">
        Постъпила е нова заявка за поръчка и изисква обработка.
      </p>

      ${tracker(1)}

      ${isUrgent ? alert('<strong>🔴 СПЕШНА ЗАЯВКА</strong> — изисква незабавна обработка!', 'danger') : ''}

      ${sectionHead('Детайли на заявката')}
      ${kvTable([
          ['Номер на заявка',  `<span style="font-size:17px;font-weight:800;color:${B.navyMid}">#${orderId}</span>`],
          ['Приоритет',        prioLabel(prio)],
          ['Сграда',           displayBuilding],
          costCenterCode ? ['Разходен център', costCenterCode] : null,
          ['Артикул',          `<strong>${itemDescription}</strong>`],
          partNumber ? ['Парт №', `<code style="background:#f1f5f9;padding:2px 8px;border-radius:4px;font-size:12px;font-family:monospace">${partNumber}</code>`] : null,
          category   ? ['Категория', category] : null,
          ['Количество',       `<strong>${quantity}${unit ? ' ' + unit : ''}</strong>`],
          ['Заявена от',       requester || '—'],
          notes ? ['Бележки', `<em style="color:${B.textSub}">${trunc(notes, 200)}</em>`] : null,
      ])}

      ${attachmentCards(files)}

      ${alert('Моля, прегледайте заявката и предприемете необходимите действия за обработката.', 'info')}

      ${btn('📋 Отвори заявката', `${B.URL}/app.html#orders/${orderId}`, isUrgent ? '#dc2626' : B.navyMid)}
    `;

    const subject = `🆕 Нова заявка #${orderId} · ${displayBuilding}${isUrgent ? ' 🔴 СПЕШНА' : ''}`;

    const batchPayload = recipients.map(r => ({
        to: [r.email],
        subject,
        html: layout({
            preheader: `Нова заявка #${orderId} — ${trunc(itemDescription,40)} (${displayBuilding})`,
            badge: isUrgent ? { label: '🔴 Спешна', bg: '#dc2626' } : { label: 'Нова заявка', bg: B.navyMid },
            body: makeBody(r.name),
        }),
        tags: [
            { name: 'type',     value: 'new-order' },
            { name: 'order_id', value: String(orderId) },
            { name: 'priority', value: prio.toLowerCase() },
        ],
    }));

    const results = await sendBatch(batchPayload);
    for (const r of recipients) {
        await logEmail({ type: 'new-order', orderId, recipient: r.email, subject, tags: { priority: prio } });
    }
    return { success: true, messageIds: results.map(r => r.id) };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * 2. Status Update → requester
 *
 * @param {object} d
 *   orderId, requesterEmail, requesterName, oldStatus, newStatus,
 *   building, itemDescription, notes?, supplierName?, expectedDelivery?,
 *   files? [{original_name, size_bytes, mime_type, download_url}]
 */
async function sendStatusUpdateNotification(d) {
    const {
        orderId, requesterEmail, requesterName, requesterId,
        oldStatus, newStatus,
        building, itemDescription, notes, supplierName, expectedDelivery,
        priority, quantity, unit,
        files = [],
    } = d;

    if (!requesterEmail) return { success: false, error: 'No requester email' };

    const oldS  = STATUS[oldStatus] || { color: B.muted, label: oldStatus,  icon: '•', step: 0 };
    const newS  = STATUS[newStatus] || { color: B.navyMid, label: newStatus, icon: '•', step: 0 };
    const msg   = STATUS_MSG[newStatus];

    const body = `
      <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:${B.text}">
        Здравейте${requesterName ? `, <strong>${requesterName}</strong>` : ''} 👋
      </p>
      <p style="margin:0 0 28px;font-size:14px;color:${B.textSub};line-height:1.7">
        Статусът на вашата заявка беше актуализиран.
      </p>

      ${tracker(newS.step)}

      <!-- Status change visual — horizontal, Outlook-safe -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:#f8fafc;border:1px solid ${B.border};border-radius:12px;
                    margin-bottom:24px">
        <tr><td style="padding:22px 24px 20px">

          <p style="margin:0 0 12px;font-size:10px;font-weight:700;letter-spacing:1.5px;
                    text-transform:uppercase;color:${B.muted};font-family:Arial,sans-serif">
            ПРОМЯНА НА СТАТУС
          </p>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <!-- Old status pill -->
              <td style="vertical-align:middle">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                       style="background:${oldS.bg};border:1px solid ${oldS.color}33;border-radius:8px">
                  <tr>
                    <td style="padding:8px 18px;color:${oldS.color};font-size:13px;
                               font-weight:600;font-family:Arial,sans-serif;white-space:nowrap">
                      ${oldS.label}
                    </td>
                  </tr>
                </table>
              </td>
              <!-- Arrow -->
              <td style="vertical-align:middle;padding:0 14px">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="width:22px;height:2px;background:#e8682a;font-size:1px;line-height:1px">&nbsp;</td>
                    <td style="font-size:0;line-height:0;padding:0">
                      <div style="width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;border-left:9px solid #e8682a;font-size:1px;line-height:1px">&nbsp;</div>
                    </td>
                  </tr>
                </table>
              </td>
              <!-- New status pill — highlighted -->
              <td style="vertical-align:middle">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                       style="background:${newS.color};border-radius:8px">
                  <tr>
                    <td style="padding:10px 22px;color:#ffffff;font-size:14px;
                               font-weight:800;font-family:Arial,sans-serif;white-space:nowrap">
                      ${newS.label}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          ${msg ? `
          <div style="margin-top:14px;padding:11px 16px;background:${newS.color}18;
                      border-left:3px solid ${newS.color};border-radius:0 6px 6px 0">
            <p style="margin:0;color:${newS.color};font-size:13px;font-weight:600;
                      font-family:Arial,sans-serif">${msg}</p>
          </div>` : ''}

        </td></tr>
      </table>

      ${sectionHead('Детайли на заявката')}
      ${kvTable([
          ['Заявка №',           `<strong>#${orderId}</strong>`],
          ['Сграда',             building || '—'],
          ['Артикул',            trunc(itemDescription, 55)],
          supplierName     ? ['Доставчик',        `<strong>${supplierName}</strong>`] : null,
          expectedDelivery ? ['Очаквана доставка', `<strong>${fmt(expectedDelivery)}</strong>`] : null,
          notes ? ['Бележка', `<em style="color:${B.textSub}">${trunc(notes, 120)}</em>`] : null,
      ])}

      ${attachmentCards(files)}

      ${btn('📋 Преглед на заявката', `${B.URL}/app.html#orders/${orderId}`, newS.color)}
    `;

    const subject = `${newS.icon} Заявка #${orderId} · ${newS.label}`;
    const html = layout({
        preheader: `Статус на заявка #${orderId}: ${oldS.label} → ${newS.label}`,
        badge: { label: newS.label, bg: newS.color },
        body,
    });

    const result = await sendOne({
        to: requesterEmail, subject, html,
        idempKey: ikey('status', orderId, newStatus.replace(/\s+/g,'-')),
        tags: [
            { name: 'type',       value: 'status-update' },
            { name: 'order_id',   value: String(orderId) },
            { name: 'new_status', value: newStatus.replace(/\s+/g,'-').toLowerCase() },
        ],
    });
    if (newStatus === 'In Transit') {
    } else if (newStatus === 'Delivered') {
    }
       await logEmail({ type: 'status-update', orderId, recipient: requesterEmail, messageId: result.messageId, subject, tags: { oldStatus, newStatus } });
    // notify building managers
    const _bmEmails = await getBuildingManagerEmails(building);
    for (const mgr of _bmEmails.filter(e => e !== requesterEmail)) {
        await sendOne({ to: mgr, subject, html });
        await logEmail({ type: 'status-update', orderId, recipient: mgr, subject, tags: { oldStatus, newStatus } });
    }
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * 3. Approval Request → manager(s)
 *
 * @param {object} d
 *   orderId, itemDescription, quoteAmount, currency,
 *   supplierName?, requestedByName, notes?,
 *   approverEmails: string[],
 *   files? [{original_name, size_bytes, mime_type, download_url}]
 */
async function sendApprovalRequest(d) {
    const {
        orderId, itemDescription, quoteAmount, currency = 'EUR',
        supplierName, requestedByName, notes,
        approverEmails,
        files = [],
    } = d;

    if (!approverEmails?.length) return { success: false, error: 'No approver emails' };

    const amt = parseFloat(quoteAmount || 0).toFixed(2);

    const body = `
      <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:${B.text}">Необходимо е вашето одобрение</p>
      <p style="margin:0 0 28px;font-size:14px;color:${B.textSub};line-height:1.7">
        Получена е оферта за поръчка и чака вашето решение.
      </p>

      <!-- Amount hero -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:linear-gradient(135deg,${B.navy},${B.navyMid});
                    border-radius:12px;margin-bottom:24px">
        <tr><td align="center" style="padding:28px 24px">
          <p style="margin:0 0 6px;font-size:11px;color:rgba(255,255,255,.6);
                    letter-spacing:1.5px;text-transform:uppercase">Сума на офертата</p>
          <p style="margin:0;font-size:42px;font-weight:900;color:#fff;letter-spacing:-1px">
            ${amt} <span style="font-size:22px;font-weight:600;color:rgba(255,255,255,.7)">${currency}</span>
          </p>
        </td></tr>
      </table>

      ${sectionHead('Детайли за одобрение')}
      ${kvTable([
          ['Заявка №',    `<strong>#${orderId}</strong>`],
          ['Артикул',     `<strong>${trunc(itemDescription, 55)}</strong>`],
          supplierName     ? ['Доставчик',   supplierName]     : null,
          requestedByName  ? ['Заявена от',  requestedByName]  : null,
          notes ? ['Бележки', `<em style="color:${B.textSub}">${notes}</em>`] : null,
      ])}

      ${attachmentCards(files)}

      <!-- Approve / Reject dual buttons -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"
             align="center" style="margin:28px auto">
        <tr>
          <td style="padding-right:10px">
            <a href="${B.URL}/app.html#approvals/${orderId}?action=approve"
               style="display:inline-block;background:#16a34a;color:#fff;padding:13px 28px;
                      border-radius:9px;font-size:14px;font-weight:700;text-decoration:none">
              ✅ Одобри
            </a>
          </td>
          <td>
            <a href="${B.URL}/app.html#approvals/${orderId}?action=reject"
               style="display:inline-block;background:#dc2626;color:#fff;padding:13px 28px;
                      border-radius:9px;font-size:14px;font-weight:700;text-decoration:none">
              ❌ Откажи
            </a>
          </td>
        </tr>
      </table>
      <p style="text-align:center;font-size:12px;color:${B.muted};margin:0">
        Или прегледайте пълните детайли в системата преди решение.
      </p>
    `;

    const subject = `🔍 Одобрение нужно — заявка #${orderId} · ${amt} ${currency}`;
    const html = layout({
        preheader: `Оферта от ${supplierName || 'доставчик'}: ${amt} ${currency} — изисква одобрение`,
        badge: { label: '⏳ Чака одобрение', bg: '#f59e0b', text: '#fff' },
        body,
    });

    const results = await sendBatch(approverEmails.map(email => ({
        to: [email], subject, html,
        tags: [
            { name: 'type',     value: 'approval-request' },
            { name: 'order_id', value: String(orderId) },
        ],
    })));

    for (const email of approverEmails) {
        await logEmail({ type: 'approval-request', orderId, recipient: email, subject });
    }
    return { success: true, messageIds: results.map(r => r.id) };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * 4. Approval Decision → procurement requester
 *
 * @param {object} d
 *   orderId, requesterEmail, requesterName,
 *   decision: 'approved'|'rejected',
 *   approverName, quoteAmount, currency, notes?, rejectionReason?
 */
async function sendApprovalDecision(d) {
    const {
        orderId, requesterEmail, requesterName,
        decision, approverName,
        quoteAmount, currency = 'EUR',
        notes, rejectionReason,
    } = d;

    if (!requesterEmail) return { success: false, error: 'No requester email' };

    const approved    = decision === 'approved';
    const accentColor = approved ? '#16a34a' : '#dc2626';
    const bigIcon     = approved ? '✅' : '❌';
    const headline    = approved ? 'Офертата е одобрена!' : 'Офертата е отхвърлена';
    const bgColor     = approved ? '#d1fae5' : '#fee2e2';

    const body = `
      <!-- Hero verdict -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:${bgColor};border-radius:12px;margin-bottom:28px">
        <tr><td align="center" style="padding:32px 24px">
          <div style="font-size:52px;line-height:1;margin-bottom:12px">${bigIcon}</div>
          <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${accentColor}">${headline}</h2>
          <p style="margin:0;font-size:14px;color:${B.textSub}">
            Здравейте${requesterName ? `, ${requesterName}` : ''} — решението е взето.
          </p>
        </td></tr>
      </table>

      ${tracker(approved ? 4 : 3)}

      ${sectionHead('Детайли на решението', accentColor)}
      ${kvTable([
          ['Решение',       `<strong style="color:${accentColor}">${approved ? '✅ ОДОБРЕНО' : '❌ ОТХВЪРЛЕНО'}</strong>`],
          ['Одобрено от',   approverName || '—'],
          quoteAmount ? ['Одобрена сума', `<strong style="font-size:17px">${parseFloat(quoteAmount).toFixed(2)} ${currency}</strong>`] : null,
          notes           ? ['Бележки',            `<em style="color:${B.textSub}">${notes}</em>`]                     : null,
          !approved && rejectionReason ? ['Причина за отказ', `<span style="color:#dc2626;font-weight:600">${rejectionReason}</span>`] : null,
      ])}

      ${approved
          ? alert('Моля, пристъпете към издаване на поръчка (PO) към доставчика.', 'success')
          : alert(`Офертата е отхвърлена.${rejectionReason ? ' <strong>Причина:</strong> ' + rejectionReason : ''} Моля, потърсете алтернативна оферта.`, 'danger')}

      ${btn('📋 Преглед на заявката', `${B.URL}/app.html#approvals/${orderId}`, accentColor)}
    `;

    const subject = `${bigIcon} Одобрение заявка #${orderId} — ${approved ? 'Одобрена' : 'Отхвърлена'}`;
    const html = layout({
        preheader: `Заявка #${orderId} ${headline}${approverName ? ' от ' + approverName : ''}`,
        badge: { label: headline, bg: accentColor },
        body,
    });

    const result = await sendOne({
        to: requesterEmail, subject, html,
        idempKey: ikey('approval', orderId, decision),
        tags: [
            { name: 'type',     value: 'approval-decision' },
            { name: 'order_id', value: String(orderId) },
            { name: 'decision', value: decision },
        ],
    });

    await logEmail({ type: 'approval-decision', orderId, recipient: requesterEmail, messageId: result.messageId, subject, tags: { decision } });
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * 5. RFQ to Supplier
 *
 * @param {object} d
 *   quoteId, supplierEmail, supplierName, contactPerson?,
 *   items: [{itemDescription, partNumber, quantity, unit, notes}],
 *   currency, validUntil?, notes?, companyName?,
 *   attachFiles?: [{content:Buffer, filename:string}]  ← actual file buffers to attach
 */
async function sendRfqToSupplier(d) {
    const {
        quoteId, supplierEmail, supplierName, contactPerson,
        items = [],
        currency = 'EUR', validUntil, notes,
        companyName = 'PartPulse',
        attachFiles = [],
    } = d;

    if (!supplierEmail) return { success: false, error: 'No supplier email' };

    const itemRows = items.map((it, i) => `
      <tr style="background:${i%2===0?'#fff':'#f8fafc'}">
        <td style="padding:11px 14px;font-size:13px;color:${B.muted};
                   border-bottom:1px solid ${B.border};text-align:center">${i+1}</td>
        <td style="padding:11px 14px;font-size:13px;font-weight:600;color:${B.text};
                   border-bottom:1px solid ${B.border}">${it.itemDescription || '—'}</td>
        <td style="padding:11px 14px;font-size:12px;color:${B.muted};
                   border-bottom:1px solid ${B.border};font-family:monospace">${it.partNumber || '—'}</td>
        <td style="padding:11px 14px;font-size:13px;font-weight:700;color:${B.navyMid};
                   border-bottom:1px solid ${B.border};text-align:right">
          ${it.quantity || 1} ${it.unit || ''}
        </td>
        <td style="padding:11px 14px;font-size:12px;color:${B.muted};
                   border-bottom:1px solid ${B.border}">${it.notes || '—'}</td>
      </tr>`).join('');

    const body = `
      <p style="margin:0 0 4px;font-size:14px;color:${B.textSub}">
        До: <strong>${contactPerson || supplierName}</strong>
      </p>
      <h2 style="margin:0 0 24px;font-size:20px;font-weight:700;color:${B.text}">
        Запитване за оферта № ${quoteId}
      </h2>

      <p style="font-size:14px;color:${B.text};line-height:1.8;margin-bottom:24px">
        Уважаеми партньор,<br><br>
        Моля, изпратете ни оферта за посочените артикули.
        Очакваме вашия отговор до <strong>${validUntil ? fmt(validUntil) : '5 работни дни'}</strong>.
        ${notes ? `<br><br><em style="color:${B.textSub}">${notes}</em>` : ''}
      </p>

      <!-- Items table -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="border:1px solid ${B.border};border-radius:10px;overflow:hidden;margin-bottom:24px">
        <thead>
          <tr style="background:${B.navyMid}">
            <th style="padding:11px 14px;font-size:11px;color:#fff;font-weight:700;
                       text-align:center;width:32px">#</th>
            <th style="padding:11px 14px;font-size:11px;color:#fff;font-weight:700;
                       text-align:left">Описание</th>
            <th style="padding:11px 14px;font-size:11px;color:#fff;font-weight:700;
                       text-align:left">Парт №</th>
            <th style="padding:11px 14px;font-size:11px;color:#fff;font-weight:700;
                       text-align:right">Кол.</th>
            <th style="padding:11px 14px;font-size:11px;color:#fff;font-weight:700;
                       text-align:left">Бележки</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr style="background:#f8fafc">
            <td colspan="5" style="padding:10px 14px;font-size:12px;color:${B.muted}">
              Валута: <strong>${currency}</strong> &nbsp;·&nbsp;
              Моля посочете дали цените включват ДДС &nbsp;·&nbsp;
              Посочете срок за доставка
            </td>
          </tr>
        </tfoot>
      </table>

      ${alert('Моля, отговорете на този имейл с вашата оферта или се свържете с нас за уточнения.', 'info')}

      <p style="font-size:13px;color:${B.textSub};margin-top:24px;line-height:1.8">
        С уважение,<br>
        <strong style="color:${B.text}">Отдел Доставки — ${companyName}</strong><br>
        <a href="mailto:${process.env.SMTP_USER||''}" style="color:${B.orange}">${process.env.SMTP_USER||''}</a>
      </p>
    `;

    const subject = `Запитване за оферта #${quoteId} — ${companyName}`;
    const html = layout({
        preheader: `Запитване за ${items.length} артикула — моля, изпратете оферта`,
        badge: { label: `RFQ #${quoteId}`, bg: B.navyMid },
        body,
    });

    const result = await sendOne({
        to: supplierEmail, subject, html,
        replyTo: process.env.SMTP_USER,
        idempKey: ikey('rfq', quoteId, supplierEmail.split('@')[0]),
        attachments: attachFiles.length ? attachFiles : undefined,
        tags: [
            { name: 'type',     value: 'rfq' },
            { name: 'quote_id', value: String(quoteId) },
        ],
    });

    await logEmail({ type: 'rfq', orderId: null, recipient: supplierEmail, messageId: result.messageId, subject });
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * 6. Delivery Confirmation → requester
 */
async function sendDeliveryConfirmation(d) {
    const {
        orderId, requesterEmail, requesterName,
        itemDescription, quantity, unit, building, supplierName, deliveredAt,
        files = [],
    } = d;

    if (!requesterEmail) return { success: false, error: 'No requester email' };

    const body = `
      <!-- Hero delivered -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:linear-gradient(135deg,#064e3b,#065f46);
                    border-radius:12px;margin-bottom:28px">
        <tr><td align="center" style="padding:32px 24px">
          <div style="font-size:54px;line-height:1;margin-bottom:12px">📦</div>
          <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#fff">
            Поръчката е доставена!
          </h2>
          <p style="margin:0;font-size:14px;color:rgba(255,255,255,.7)">
            Здравейте${requesterName ? `, ${requesterName}` : ''} — заявката е изпълнена успешно.
          </p>
        </td></tr>
      </table>

      ${tracker(6)}

      ${sectionHead('Детайли на доставката', '#16a34a')}
      ${kvTable([
          ['Заявка №',        `<strong>#${orderId}</strong>`],
          ['Артикул',         `<strong>${itemDescription}</strong>`],
          ['Количество',      `<strong>${quantity || '—'}${unit ? ' ' + unit : ''}</strong>`],
          ['Сграда',          building || '—'],
          supplierName ? ['Доставчик', `<strong>${supplierName}</strong>`] : null,
          ['Доставено на',    `<strong>${fmt(deliveredAt || new Date())}</strong>`],
      ])}

      ${attachmentCards(files)}

      ${alert('Моля, потвърдете получаването в системата и проверете дали количеството отговаря на поръчаното.', 'success')}

      ${btn('✅ Потвърди получаването', `${B.URL}/app.html#orders/${orderId}`, '#16a34a')}
    `;

    const subject = `📦 Доставена — Заявка #${orderId} · ${trunc(itemDescription, 35)}`;
    const html = layout({
        preheader: `Заявка #${orderId} за "${trunc(itemDescription,40)}" е доставена`,
        badge: { label: '✅ Доставена', bg: '#16a34a' },
        body,
    });

    const result = await sendOne({
        to: requesterEmail, subject, html,
        idempKey: ikey('delivery', orderId),
        tags: [
            { name: 'type',     value: 'delivery-confirmation' },
            { name: 'order_id', value: String(orderId) },
        ],
    });

    await logEmail({ type: 'delivery', orderId, recipient: requesterEmail, messageId: result.messageId, subject });
    // notify building managers
    const _bmEmailsDlv = await getBuildingManagerEmails(building);
    for (const mgr of _bmEmailsDlv.filter(e => e !== requesterEmail)) {
        await sendOne({ to: mgr, subject, html });
        await logEmail({ type: 'delivery', orderId, recipient: mgr, subject });
    }
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * 7. Daily Digest → admin / procurement
 */
async function sendDailyDigest(d) {
    const {
        date,
        newOrders       = [],
        urgentOrders    = [],
        pendingApprovals= [],
        deliveredOrders = [],
        overdueOrders   = [],
    } = d;

    const recipients = await getStaffEmails();
    if (!recipients.length) return { success: false, error: 'No recipients' };

    const total = newOrders.length + urgentOrders.length + pendingApprovals.length + deliveredOrders.length;

    const kpis = [
        ['Нови',         newOrders.length,        B.navyMid],
        ['Спешни',       urgentOrders.length,      '#dc2626'],
        ['За одобрение', pendingApprovals.length,  '#d97706'],
        ['Доставени',    deliveredOrders.length,   '#16a34a'],
    ];

    const kpiStrip = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-spacing:10px;margin-bottom:28px">
      <tr>
        ${kpis.map(([label, count, color]) => `
        <td class="kpi-td" align="center" width="25%"
            style="background:${color}14;border:1px solid ${color}30;border-radius:10px;padding:16px 8px">
          <div style="font-size:30px;font-weight:900;color:${color};line-height:1">${count}</div>
          <div style="font-size:11px;color:${B.muted};margin-top:4px;font-weight:500">${label}</div>
        </td>`).join('')}
      </tr>
    </table>`;

    const orderRow = (o) => `
      <tr>
        <td style="padding:9px 12px;font-size:12px;color:${B.navyMid};font-weight:700;
                   border-bottom:1px solid ${B.border}">#${o.id || o.orderId}</td>
        <td style="padding:9px 12px;font-size:12px;color:${B.text};
                   border-bottom:1px solid ${B.border}">${trunc(o.item_description || o.itemDescription, 32)}</td>
        <td style="padding:9px 12px;font-size:12px;color:${B.muted};
                   border-bottom:1px solid ${B.border}">${o.building || '—'}</td>
        <td style="padding:9px 12px;font-size:12px;border-bottom:1px solid ${B.border}">${pill(o.status || 'New')}</td>
      </tr>`;

    const section = (title, orders, color) => orders.length ? `
      <div style="margin-bottom:24px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="border:1px solid ${B.border};border-radius:10px;overflow:hidden">
          <thead>
            <tr style="background:${color}">
              <th colspan="4" style="padding:10px 14px;font-size:12px;color:#fff;
                                     font-weight:700;text-align:left;letter-spacing:0.5px">
                ${title}
                <span style="background:rgba(255,255,255,.25);padding:2px 10px;border-radius:20px;
                             margin-left:8px;font-size:11px">${orders.length}</span>
              </th>
            </tr>
            <tr style="background:#f8fafc">
              <th style="padding:8px 12px;font-size:11px;color:${B.muted};font-weight:600;text-align:left">#</th>
              <th style="padding:8px 12px;font-size:11px;color:${B.muted};font-weight:600;text-align:left">Артикул</th>
              <th style="padding:8px 12px;font-size:11px;color:${B.muted};font-weight:600;text-align:left">Сграда</th>
              <th style="padding:8px 12px;font-size:11px;color:${B.muted};font-weight:600;text-align:left">Статус</th>
            </tr>
          </thead>
          <tbody>${orders.map(orderRow).join('')}</tbody>
        </table>
      </div>` : '';

    const body = `
      <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:${B.text}">Дневен отчет</p>
      <p style="margin:0 0 28px;font-size:14px;color:${B.textSub}">
        ${fmt(date)} &nbsp;·&nbsp; ${total} дейности днес
      </p>

      ${kpiStrip}

      ${!total ? alert('Няма нова активност за днес.', 'info') : ''}
      ${section('🆕 Нови заявки',       newOrders,        B.navyMid)}
      ${section('🔴 Спешни заявки',     urgentOrders,     '#dc2626')}
      ${section('🔍 Чакат одобрение',   pendingApprovals, '#d97706')}
      ${section('✅ Доставени днес',    deliveredOrders,  '#16a34a')}
      ${section('⚠️ Просрочени',       overdueOrders,    '#dc2626')}

      ${btn('📊 Отвори PartPulse Orders', B.URL)}
    `;

    const subject = `📊 Дневен отчет · ${fmt(date)} · ${total} дейности`;
    const html = layout({
        preheader: `${newOrders.length} нови · ${urgentOrders.length} спешни · ${pendingApprovals.length} за одобрение`,
        badge: { label: `Отчет ${fmt(date)}`, bg: B.navyMid },
        body,
    });

    const results = await sendBatch(recipients.map(r => ({
        to: [r.email], subject, html,
        tags: [{ name: 'type', value: 'daily-digest' }],
    })));

    return { success: true, messageIds: results.map(r => r.id), count: recipients.length };
}

// ─── Connection test ──────────────────────────────────────────────────────────
async function testEmailConnection() {
    try {
        await getTransporter().verify();
        return { success: true, message: 'SMTP connection verified' };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ─── Exports ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Order Cancelled by Requester — notify admin/procurement
// ─────────────────────────────────────────────────────────────────────────────
async function sendOrderCancelledNotification({ orderId, building, itemDescription, quantity, previousStatus, cancelledBy, cancelledAt, reason }) {
    const recipients = await getStaffEmails(['admin', 'procurement', 'manager', 'super_admin']);
    if (!recipients.length) return { success: false, error: 'No recipients' };

    const displayBuilding = building || '—';
    const cancelTime = cancelledAt ? new Date(cancelledAt).toLocaleString('bg-BG') : new Date().toLocaleString('bg-BG');

    const makeBody = (recipientName) => `
      ${sectionHead('❌ Детайли на анулирането', '#dc2626')}
      ${kvTable([
          ['Номер на заявка',  `<strong>#${orderId}</strong>`],
          ['Артикул',          `<strong>${itemDescription}</strong>`],
          ['Количество',       `${quantity}`],
          ['Сграда',           displayBuilding],
          ['Предишен статус',  `${previousStatus || 'New'}`],
          ['Анулирана от',     `<strong>${cancelledBy}</strong>`],
          ['Дата/час',         cancelTime],
          ['Причина',          `<span style="color:#dc2626;font-weight:700">${reason || '—'}</span>`],
      ])}

      ${alert('Заявката е анулирана от заявителя. Не е необходимо допълнително действие, освен ако не желаете да я възстановите.', 'danger')}

      ${btn('📋 Отвори заявката', B.URL + '/app.html#orders/' + orderId, '#dc2626')}
    `;

    const subject = `❌ Анулирана заявка #${orderId} · ${displayBuilding} · от ${cancelledBy}`;

    const emails = recipients.map(r => ({
        to: [r.email],
        subject,
        html: layout({
            preheader: `Заявка #${orderId} е анулирана от ${cancelledBy} — ${reason}`,
            badge: { label: '❌ Анулирана заявка', bg: '#dc2626' },
            body: makeBody(r.name || r.email),
        }),
    }));

    const result = await sendBatch(emails);
    return result;
}

module.exports = {
    sendNewOrderNotification,
    sendOrderCancelledNotification,
    sendStatusUpdateNotification,
    sendApprovalRequest,
    sendApprovalDecision,
    sendRfqToSupplier,
    sendDeliveryConfirmation,
    sendDailyDigest,
    testEmailConnection,
    // Low-level
    sendOne,
    sendBatch,
    buildAttachment,
};
