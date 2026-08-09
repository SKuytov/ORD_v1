/* PartPulse Admin Cockpit — classic-script, dependency-free enhancement. */
(() => {
    'use strict';

    const COPY = {
        bg: {
            today: 'Днес: следващи действия', refresh: 'Обнови', shortcuts: 'Клавишни комбинации', selected: '{n} избрани',
            noActions: 'Няма блокирани активни заявки. Добра работа.', open: 'Отвори', waiting: 'Чака {n}', overdue: 'Просрочено с {n}',
            needsSupplier: 'Нужен доставчик', rfqLate: 'RFQ без отговор', quoteApproval: 'Оферта чака одобрение',
            noPo: 'Одобрено, без PO', deliveryLate: 'Просрочена доставка', documentsMissing: 'Липсват документи', accountingReady: 'Готово за счетоводство',
            assignSupplier: 'Назначи доставчик', sendRfq: 'Изпрати RFQ', recordQuote: 'Въведи оферта', requestApproval: 'Изпрати за одобрение',
            createPo: 'Създай PO', markTransit: 'Отбележи в транзит', confirmDelivery: 'Потвърди доставка', accountingPreflight: 'Проверка за счетоводство',
            resume: 'Възобнови', cancel: 'Откажи', lifecycle: 'Контрол на жизнения цикъл', missing: 'Липсва: {value}',
            actionUnavailable: 'Действието не е достъпно', saving: 'Запазване…', saved: 'Промяната е запазена.', failed: 'Промяната не е запазена: {reason}',
            deliveryTitle: 'Потвърждение на доставка #{id}', actualDate: 'Действителна дата на доставка', partial: 'Частична доставка',
            receivedQuantity: 'Получено количество', proof: 'Доказателство за доставка', chooseFile: 'Избери файл', submitDelivery: 'Потвърди доставка',
            proofRequired: 'Добавете доказателство за доставка, преди да продължите.', quantityInvalid: 'Въведете валидно получено количество за всеки ред.',
            promised: 'Обещана', actual: 'Действителна', late: 'Закъснение {n}', onTime: 'Навреме',
            preflightTitle: 'Проверка преди предаване към счетоводство', present: 'Налице', notPresent: 'Липсва', unknown: 'Не може да се провери',
            handover: 'Предай на счетоводство', cannotHandover: 'Не може да се предаде, докато липсват задължителни данни.',
            bulkSupplier: 'Групово назначаване на доставчик', chooseSupplier: 'Изберете доставчик', confirm: 'Потвърди', close: 'Затвори',
            bulkConfirm: 'Ще назначите {supplier} като доставчик за следните {n} заявки: {orders}. Други полета няма да се променят.',
            selectSupplierFirst: 'Първо изберете доставчик.', serverNeeded: 'Сървърът не поддържа това защитено групово действие. Не са променени заявки.',
            searchFocus: 'Търсене', nextOrder: 'Следваща заявка', nextBlocked: 'Следваща блокирана', save: 'Запази', help: 'Помощ',
            shortcutsTitle: 'Клавишни комбинации', shortcutsNote: 'Не се активират, докато пишете в поле.',
            movePrevious: 'Предишна заявка', ready: 'Готово', requiredDocuments: 'Задължителни документи', invoiceMetadata: 'Данни за фактура',
            poDocument: 'Поръчка за покупка', invoiceDocument: 'Фактура', deliveryDocument: 'Доставна бележка или подписана доставна бележка',
            deliveryProof: 'Доказателство за доставка', invoiceNumber: 'Номер на фактура', invoiceDate: 'Дата на фактура', dueDate: 'Падеж', amountTotal: 'Обща сума', currency: 'Валута',
            ownerAdmin: 'Администратор', ownerSupplier: 'Доставчик', ownerApprover: 'Одобряващ', ownerWarehouse: 'Склад / Приемане', ownerAccounting: 'Счетоводство',
            hold: 'Постави на пауза', noSupplierReason: 'Назначете доставчик, преди да изпратите RFQ.', noQuoteReason: 'Липсва получена оферта.', noApprovalReason: 'Офертата не е одобрена.', noPoReason: 'Липсва свързан PO.', noProofReason: 'Липсва доказателство за доставка.',
            transitionConfirm: 'Ще промените заявка #{id} от „{from}“ на „{to}“.', deliveryPending: 'Доставката не е потвърдена. {reason}', handoverSent: 'Пакетът е предаден към счетоводство.',
            loading: 'Зареждане…', loadFailed: 'Неуспешно зареждане на допълнителните данни.', nothingSelected: 'Няма избрани заявки.', poItemsUnavailable: 'PO редовете не са налични. Сървърът трябва да върне poItems за потвърждение на доставката.', proofDescription: 'Доказателство за потвърждение на доставка', serverRejected: 'Сървърът отхвърли промяната.', proofUploadFailed: 'Качването на доказателството е неуспешно.', networkError: 'Мрежова грешка.', handoverNote: 'Заявка #{id}'
        },
        en: {
            today: 'Today: next actions', refresh: 'Refresh', shortcuts: 'Shortcuts', selected: '{n} selected',
            noActions: 'No blocked live orders. Good work.', open: 'Open', waiting: 'Waiting {n}', overdue: 'Overdue by {n}',
            needsSupplier: 'Supplier needed', rfqLate: 'RFQ awaiting response', quoteApproval: 'Quote awaiting approval',
            noPo: 'Approved, no PO', deliveryLate: 'Delivery overdue', documentsMissing: 'Documents missing', accountingReady: 'Ready for accounting',
            assignSupplier: 'Assign supplier', sendRfq: 'Send RFQ', recordQuote: 'Record quote', requestApproval: 'Send for approval',
            createPo: 'Create PO', markTransit: 'Mark in transit', confirmDelivery: 'Confirm delivery', accountingPreflight: 'Accounting preflight',
            resume: 'Resume', cancel: 'Cancel', lifecycle: 'Lifecycle control', missing: 'Missing: {value}',
            actionUnavailable: 'Action unavailable', saving: 'Saving…', saved: 'Change saved.', failed: 'Change was not saved: {reason}',
            deliveryTitle: 'Confirm delivery #{id}', actualDate: 'Actual delivery date', partial: 'Partial delivery',
            receivedQuantity: 'Received quantity', proof: 'Delivery proof', chooseFile: 'Choose file', submitDelivery: 'Confirm delivery',
            proofRequired: 'Add delivery proof before continuing.', quantityInvalid: 'Enter a valid received quantity for every line.',
            promised: 'Promised', actual: 'Actual', late: 'Late by {n}', onTime: 'On time',
            preflightTitle: 'Accounting handover preflight', present: 'Present', notPresent: 'Missing', unknown: 'Cannot verify',
            handover: 'Hand over to accounting', cannotHandover: 'Cannot hand over until all required data is present.',
            bulkSupplier: 'Bulk supplier assignment', chooseSupplier: 'Choose supplier', confirm: 'Confirm', close: 'Close',
            bulkConfirm: 'You will assign {supplier} as supplier for these {n} orders: {orders}. No other fields will change.',
            selectSupplierFirst: 'Choose a supplier first.', serverNeeded: 'The server does not support this safe bulk action. No orders were changed.',
            searchFocus: 'Search', nextOrder: 'Next order', nextBlocked: 'Next blocked', save: 'Save', help: 'Help',
            shortcutsTitle: 'Keyboard shortcuts', shortcutsNote: 'They do not run while you type in a field.',
            movePrevious: 'Previous order', ready: 'Ready', requiredDocuments: 'Required documents', invoiceMetadata: 'Invoice metadata',
            poDocument: 'Purchase order', invoiceDocument: 'Invoice', deliveryDocument: 'Delivery note or signed delivery note',
            deliveryProof: 'Delivery proof', invoiceNumber: 'Invoice number', invoiceDate: 'Invoice date', dueDate: 'Due date', amountTotal: 'Total amount', currency: 'Currency',
            ownerAdmin: 'Admin', ownerSupplier: 'Supplier', ownerApprover: 'Approver', ownerWarehouse: 'Warehouse / Receiving', ownerAccounting: 'Accounting',
            hold: 'Put on hold', noSupplierReason: 'Assign a supplier before sending an RFQ.', noQuoteReason: 'No received quote is linked.', noApprovalReason: 'The quote is not approved.', noPoReason: 'No linked PO exists.', noProofReason: 'Delivery proof is missing.',
            transitionConfirm: 'You will change order #{id} from “{from}” to “{to}”.', deliveryPending: 'Delivery was not confirmed. {reason}', handoverSent: 'Package sent to accounting.',
            loading: 'Loading…', loadFailed: 'Could not load supporting data.', nothingSelected: 'No orders selected.', poItemsUnavailable: 'PO line items are unavailable. The server must return poItems for delivery confirmation.', proofDescription: 'Delivery confirmation proof', serverRejected: 'Server rejected the change.', proofUploadFailed: 'Proof upload failed.', networkError: 'Network error.', handoverNote: 'Order #{id}'
        }
    };
    const state = { support: new Map(), openOrderIds: [], activeOrderIndex: -1, initialized: false, observer: null, lastDetailId: null };
    const RFQ_LATE_DAYS = 3;
    const LIVE = new Set(['New', 'Pending', 'Quote Requested', 'Quote Received', 'Quote Under Approval', 'Approved', 'Ordered', 'In Transit', 'Partially Delivered', 'On Hold']);

    const text = (key, vars = {}) => {
        const language = window.i18n?.getCurrentLanguage?.() || 'bg';
        let value = COPY[language]?.[key] || COPY.bg[key] || key;
        Object.entries(vars).forEach(([name, replacement]) => { value = value.replaceAll(`{${name}}`, String(replacement)); });
        return value;
    };
    const node = (tag, className, value) => { const el = document.createElement(tag); if (className) el.className = className; if (value !== undefined) el.textContent = value; return el; };
    const button = (label, className = 'btn btn-secondary btn-sm') => { const el = node('button', className, label); el.type = 'button'; return el; };
    const currentOrders = () => { try { return Array.isArray(ordersState) ? ordersState : []; } catch { return []; } };
    const isAdmin = () => { try { return currentUser?.role === 'admin'; } catch { return false; } };
    const dateValue = value => value ? new Date(value) : null;
    const dayDifference = value => { const date = dateValue(value); if (!date || Number.isNaN(date.getTime())) return 0; return Math.floor((Date.now() - date.getTime()) / 86400000); };
    const waitSince = order => order.updated_at || order.submission_date || order.created_at;
    const waitLabel = order => { const days = Math.max(0, dayDifference(waitSince(order))); return days ? text('waiting', { n: `${days}d` }) : text('waiting', { n: '<1d' }); };
    const toast = (message, kind) => { if (typeof window.showToast === 'function') window.showToast(message, kind); else window.alert(message); };

    async function request(method, path, body, formData) {
        const api = window.Api;
        try {
            if (!formData && api && typeof api[method.toLowerCase()] === 'function') return await api[method.toLowerCase()](path, body);
            if (!formData && api && typeof api.request === 'function') return await api.request(path, { method, body });
            const legacy = { GET: typeof apiGet === 'function' ? apiGet : null, POST: typeof apiPost === 'function' ? apiPost : null, PUT: typeof apiPut === 'function' ? apiPut : null }[method];
            if (!formData && legacy) return method === 'GET' ? await legacy(path) : await legacy(path, body);
        } catch (error) { throw error; }
        let base = ''; let token = '';
        try { base = API_BASE || ''; token = authToken || ''; } catch { base = '/api'; }
        const response = await fetch(`${base}${path}`, { method, headers: formData ? { Authorization: `Bearer ${token}` } : { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: formData || (body === undefined ? undefined : JSON.stringify(body)) });
        let payload = {}; try { payload = await response.json(); } catch { payload = { success: false, message: `HTTP ${response.status}` }; }
        if (!response.ok && payload.success !== true) payload.success = false;
        return payload;
    }

    async function supportFor(order, force = false) {
        if (!force && state.support.has(Number(order.id))) return state.support.get(Number(order.id));
        const entry = { docs: [], lifecycle: null, invoiceByDocument: new Map(), error: null };
        state.support.set(Number(order.id), entry);
        try {
            const [documents, lifecycle] = await Promise.all([
                request('GET', `/documents/order/${order.id}`),
                request('GET', `/procurement/lifecycle/${order.id}`)
            ]);
            if (documents?.success) entry.docs = documents.documents || documents.docs || [];
            if (lifecycle?.success) entry.lifecycle = lifecycle.lifecycle || null;
            await Promise.all(entry.docs.filter(doc => ['invoice', 'proforma_invoice'].includes(doc.document_type)).map(async doc => {
                const meta = await request('GET', `/accounting/invoice-meta/${doc.id}`);
                if (meta?.success) entry.invoiceByDocument.set(Number(doc.id), meta.invoice || meta.metadata || meta.invoiceMeta || null);
            }));
        } catch (error) { entry.error = error; }
        return entry;
    }

    const hasDoc = (entry, types) => entry.docs.some(doc => types.includes(doc.document_type));
    function accountingChecks(order, entry) {
        const docs = entry?.docs || [];
        const invoice = docs.find(doc => doc.document_type === 'invoice');
        const meta = invoice ? entry?.invoiceByDocument?.get(Number(invoice.id)) : null;
        const statuses = [
            ['purchase_order', text('poDocument'), hasDoc(entry, ['purchase_order'])],
            ['delivery_document', text('deliveryDocument'), hasDoc(entry, ['delivery_note', 'signed_delivery_note'])],
            ['invoice', text('invoiceDocument'), Boolean(invoice)],
            ['invoice_number', text('invoiceNumber'), Boolean(meta?.invoice_number)],
            ['invoice_date', text('invoiceDate'), Boolean(meta?.invoice_date)],
            ['due_date', text('dueDate'), Boolean(meta?.due_date)],
            ['amount_total', text('amountTotal'), Number(meta?.amount_total) > 0],
            ['currency', text('currency'), Boolean(meta?.currency)]
        ];
        return statuses;
    }

    function bucketFor(order, entry) {
        if (!LIVE.has(order.status) && order.status !== 'Delivered') return null;
        const wait = Math.max(0, dayDifference(waitSince(order)));
        const base = { order, wait, missing: '', owner: text('ownerAdmin'), priority: Number(order.priority === 'Urgent') * 20 + Number(order.priority === 'High') * 10 };
        if (!order.supplier_id && !order.supplier_name && !['On Hold'].includes(order.status)) return { ...base, key: 'needsSupplier', action: 'assignSupplier', missing: text('noSupplierReason'), owner: text('ownerAdmin') };
        if (order.status === 'Quote Requested' && wait >= RFQ_LATE_DAYS) return { ...base, key: 'rfqLate', action: 'recordQuote', missing: text('waiting', { n: `${wait}d` }), owner: text('ownerSupplier'), priority: base.priority + 40 };
        if (['Quote Received', 'Quote Under Approval'].includes(order.status)) return { ...base, key: 'quoteApproval', action: 'requestApproval', missing: text('noApprovalReason'), owner: text('ownerApprover'), priority: base.priority + 30 };
        if (order.status === 'Approved' && !(order.po_id || order.po_number)) return { ...base, key: 'noPo', action: 'createPo', missing: text('noPoReason'), owner: text('ownerAdmin'), priority: base.priority + 35 };
        const expected = order.expected_delivery_date || entry?.lifecycle?.po?.expected_delivery_date;
        if (['Ordered', 'In Transit', 'Partially Delivered'].includes(order.status) && expected && dayDifference(expected) > 0) return { ...base, key: 'deliveryLate', action: 'confirmDelivery', missing: text('overdue', { n: `${dayDifference(expected)}d` }), owner: text('ownerWarehouse'), priority: base.priority + 60, overdue: dayDifference(expected) };
        if (order.status === 'Delivered') {
            const checks = accountingChecks(order, entry);
            const missing = checks.filter(check => !check[2]);
            if (missing.length) return { ...base, key: 'documentsMissing', action: 'accountingPreflight', missing: missing.map(item => item[1]).join(', '), owner: text('ownerAdmin'), priority: base.priority + 30 };
            return { ...base, key: 'accountingReady', action: 'accountingPreflight', missing: '', owner: text('ownerAccounting'), priority: base.priority + 15 };
        }
        if (order.status === 'On Hold') return { ...base, key: 'needsSupplier', action: 'resume', missing: text('hold'), owner: text('ownerAdmin') };
        return null;
    }

    function ensureCockpit() {
        if (!isAdmin()) return null;
        const tab = document.getElementById('ordersTab'); if (!tab) return null;
        let root = document.getElementById('adminCockpitRoot');
        if (root) return root;
        root = node('section', 'admin-cockpit'); root.id = 'adminCockpitRoot'; root.setAttribute('aria-labelledby', 'adminCockpitTitle');
        const card = node('div', 'admin-cockpit__card');
        const header = node('header', 'admin-cockpit__header');
        const titleBox = node('div'); const heading = node('h2', null, text('today')); heading.id = 'adminCockpitTitle'; titleBox.append(heading, node('p', 'admin-cockpit__subtitle', text('selected', { n: 0 })));
        const actions = node('div', 'admin-cockpit__actions');
        const refresh = button(text('refresh')); refresh.addEventListener('click', () => refreshCockpit(true));
        const bulk = button(text('bulkSupplier'), 'btn btn-primary btn-sm'); bulk.addEventListener('click', openBulkSupplier);
        const shortcut = button('?', 'btn btn-secondary btn-sm'); shortcut.setAttribute('aria-label', text('shortcuts')); shortcut.addEventListener('click', openShortcutHelp);
        actions.append(refresh, bulk, shortcut); header.append(titleBox, actions); card.append(header);
        const content = node('div', 'admin-cockpit__content'); content.id = 'adminCockpitContent'; card.append(content); root.append(card);
        tab.querySelector('.card')?.before(root);
        return root;
    }

    async function refreshCockpit(force = false) {
        const root = ensureCockpit(); if (!root) return;
        const content = document.getElementById('adminCockpitContent'); if (!content) return;
        content.replaceChildren(node('p', 'admin-cockpit__loading', text('loading')));
        const orders = currentOrders();
        const supports = new Map();
        await Promise.all(orders.filter(order => LIVE.has(order.status) || order.status === 'Delivered').map(async order => { supports.set(Number(order.id), await supportFor(order, force)); }));
        const grouped = new Map();
        orders.forEach(order => { const entry = bucketFor(order, supports.get(Number(order.id))); if (entry) { if (!grouped.has(entry.key)) grouped.set(entry.key, []); grouped.get(entry.key).push(entry); } });
        content.replaceChildren();
        const selectedCount = (() => { try { return selectedOrderIds?.size || 0; } catch { return 0; } })();
        root.querySelector('.admin-cockpit__subtitle').textContent = text('selected', { n: selectedCount });
        if (!grouped.size) { content.append(node('p', 'admin-cockpit__empty', text('noActions'))); return; }
        const orderKeys = ['deliveryLate', 'rfqLate', 'noPo', 'quoteApproval', 'needsSupplier', 'documentsMissing', 'accountingReady'];
        orderKeys.filter(key => grouped.has(key)).forEach(key => {
            const bucket = node('section', `admin-cockpit__bucket admin-cockpit__bucket--${key}`); bucket.setAttribute('aria-labelledby', `cockpit-${key}`);
            const rows = grouped.get(key).sort((a, b) => (b.overdue || 0) - (a.overdue || 0) || b.wait - a.wait || b.priority - a.priority);
            const h = node('h3', 'admin-cockpit__bucket-title'); h.id = `cockpit-${key}`; h.append(node('span', null, text(key)), node('span', 'admin-cockpit__count', String(rows.length))); bucket.append(h);
            const list = node('div', 'admin-cockpit__rows');
            rows.forEach(item => list.append(renderCockpitRow(item))); bucket.append(list); content.append(bucket);
        });
    }

    function renderCockpitRow(item) {
        const row = node('article', 'admin-cockpit__row'); row.tabIndex = 0;
        const main = node('div', 'admin-cockpit__row-main'); main.append(node('strong', 'admin-cockpit__order-id', `#${item.order.id}`), node('span', 'admin-cockpit__description', item.order.item_description || '—'));
        const meta = node('div', 'admin-cockpit__meta'); meta.append(node('span', null, item.owner), node('span', null, item.overdue ? text('overdue', { n: `${item.overdue}d` }) : waitLabel(item.order))); if (item.missing) meta.append(node('span', 'admin-cockpit__missing', item.missing));
        main.append(meta); const actions = node('div', 'admin-cockpit__row-actions'); const action = button(text(item.action), 'btn btn-primary btn-sm'); action.addEventListener('click', event => { event.stopPropagation(); executeAction(item.order, item.action); }); actions.append(action); row.append(main, actions);
        row.addEventListener('click', () => openOrder(item.order.id)); row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openOrder(item.order.id); } }); return row;
    }

    function getLifecycleActions(order, support) {
        const noSupplier = !(order.supplier_id || order.supplier_name); const noQuote = !order.quote_ref; const noApproval = order.approval_status !== 'approved'; const noPo = !(order.po_id || order.po_number);
        const simple = (id, label, target, reason = '') => ({ id, label, target, disabled: Boolean(reason), reason });
        const list = [];
        if (['New', 'Pending'].includes(order.status)) list.push(simple('assignSupplier', 'assignSupplier', null), simple('sendRfq', 'sendRfq', 'Quote Requested', noSupplier ? text('noSupplierReason') : ''));
        if (order.status === 'Quote Requested') list.push(simple('recordQuote', 'recordQuote', 'Quote Received'));
        if (order.status === 'Quote Received') list.push(simple('requestApproval', 'requestApproval', 'Quote Under Approval', noQuote ? text('noQuoteReason') : ''));
        if (order.status === 'Quote Under Approval') list.push(simple('awaitApproval', 'requestApproval', 'Approved', noApproval ? text('noApprovalReason') : ''));
        if (order.status === 'Approved') list.push(simple('createPo', 'createPo', 'Ordered', (noQuote || noApproval) ? text('noApprovalReason') : ''));
        if (order.status === 'Ordered') list.push(simple('markTransit', 'markTransit', 'In Transit', noPo ? text('noPoReason') : ''));
        if (['In Transit', 'Partially Delivered'].includes(order.status)) list.push(simple('confirmDelivery', 'confirmDelivery', null, noPo ? text('noPoReason') : ''));
        if (order.status === 'Delivered') list.push(simple('accountingPreflight', 'accountingPreflight', null));
        if (order.status === 'On Hold') list.push(simple('resume', 'resume', 'Pending'));
        if (!['Delivered', 'Cancelled'].includes(order.status)) list.push(simple('hold', 'hold', 'On Hold'));
        if (['New', 'Pending', 'Quote Requested', 'On Hold'].includes(order.status)) list.push(simple('cancel', 'cancel', 'Cancelled'));
        return list;
    }

    function renderLifecycle(order) {
        const mount = document.getElementById('adminLifecycleMount'); if (!mount || !isAdmin()) return;
        mount.replaceChildren(); const panel = node('section', 'admin-lifecycle'); panel.setAttribute('aria-labelledby', 'adminLifecycleTitle'); const heading = node('h4', null, text('lifecycle')); heading.id = 'adminLifecycleTitle'; panel.append(heading);
        const support = state.support.get(Number(order.id)); const actions = getLifecycleActions(order, support); const list = node('div', 'admin-lifecycle__actions');
        actions.forEach(spec => { const wrap = node('div', 'admin-lifecycle__action'); const control = button(text(spec.label), spec.id === 'confirmDelivery' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'); control.disabled = spec.disabled; control.addEventListener('click', () => executeAction(order, spec.id, spec.target, control)); wrap.append(control); if (spec.reason) wrap.append(node('small', 'admin-lifecycle__reason', spec.reason)); list.append(wrap); }); panel.append(list); mount.append(panel);
    }

    async function executeAction(order, action, target, control) {
        if (action === 'assignSupplier') { if (typeof window.openSupplierSelector === 'function') window.openSupplierSelector(order.id, order.supplier_id); else toast(text('serverNeeded'), 'error'); return; }
        if (action === 'sendRfq') { selectOnly(order.id); if (typeof window.openRfqWizard === 'function') window.openRfqWizard(); else toast(text('serverNeeded'), 'error'); return; }
        if (action === 'recordQuote') { if (typeof window.openSupplierResponseForOrder === 'function') window.openSupplierResponseForOrder(order.id); else toast(text('serverNeeded'), 'error'); return; }
        if (action === 'createPo') { if (typeof window.generatePoFromOrder === 'function') window.generatePoFromOrder(order.id, order.quote_ref); else toast(text('serverNeeded'), 'error'); return; }
        if (action === 'confirmDelivery') { await openDeliveryFlow(order); return; }
        if (action === 'accountingPreflight') { await openPreflight(order); return; }
        if (action === 'requestApproval') { await transition(order, target || 'Quote Under Approval', control); return; }
        if (action === 'markTransit') { await transition(order, 'In Transit', control); return; }
        if (action === 'resume') { await transition(order, 'Pending', control); return; }
        if (action === 'hold') { await transition(order, 'On Hold', control); return; }
        if (action === 'cancel') { await transition(order, 'Cancelled', control); }
    }

    async function transition(order, target, control) {
        if (!window.confirm(text('transitionConfirm', { id: order.id, from: order.status, to: target }))) return;
        const oldLabel = control?.textContent; if (control) { control.disabled = true; control.textContent = text('saving'); }
        try { const result = await request('PUT', `/orders/${order.id}`, { status: target }); if (!result?.success) throw new Error(result?.message || text('serverRejected')); toast(text('saved'), 'success'); state.support.delete(Number(order.id)); await reloadAndOpen(order.id); }
        catch (error) { toast(text('failed', { reason: error.message || text('networkError') }), 'error'); if (control) control.disabled = false; }
        finally { if (control && document.body.contains(control)) control.textContent = oldLabel; }
    }

    async function openDeliveryFlow(order) {
        const support = await supportFor(order); const lifecycle = support.lifecycle || {}; const poItems = lifecycle.poItems || lifecycle.po?.items || [];
        const modal = makeModal(text('deliveryTitle', { id: order.id })); const form = node('form', 'admin-modal__form');
        const actual = node('input', 'form-control'); actual.type = 'date'; actual.value = new Date().toISOString().slice(0, 10); appendField(form, text('actualDate'), actual);
        const partial = node('input'); partial.type = 'checkbox'; partial.id = 'cockpitPartial'; const partialLabel = node('label', null, text('partial')); partialLabel.htmlFor = partial.id; const partialWrap = node('div', 'admin-inline-check'); partialWrap.append(partial, partialLabel); form.append(partialWrap);
        const promised = order.expected_delivery_date || lifecycle.po?.expected_delivery_date; if (promised) form.append(node('p', 'admin-delivery-dates', `${text('promised')}: ${String(promised).slice(0, 10)}`));
        const lines = node('div', 'admin-delivery-lines'); if (poItems.length) { poItems.forEach(item => { const row = node('div', 'admin-delivery-line'); row.append(node('span', null, item.item_description || item.part_number || `#${item.id}`)); const quantity = node('input', 'form-control'); quantity.type = 'number'; quantity.min = '0'; quantity.step = 'any'; quantity.value = String(item.received_quantity || 0); quantity.dataset.itemId = item.id; quantity.dataset.ordered = item.quantity; appendField(row, text('receivedQuantity'), quantity); lines.append(row); }); } else { lines.append(node('p', 'admin-lifecycle__reason', text('poItemsUnavailable'))); } form.append(lines);
        const file = node('input', 'form-control'); file.type = 'file'; file.required = true; appendField(form, text('proof'), file); const feedback = node('p', 'admin-modal__feedback'); form.append(feedback);
        const submit = button(text('submitDelivery'), 'btn btn-primary'); const close = button(text('close')); close.addEventListener('click', () => modal.remove()); const footer = node('div', 'admin-modal__footer'); footer.append(close, submit); form.append(footer);
        form.addEventListener('submit', async event => { event.preventDefault(); feedback.textContent = ''; if (!file.files?.[0]) { feedback.textContent = text('proofRequired'); return; } const items = Array.from(lines.querySelectorAll('input[data-item-id]')).map(input => ({ id: Number(input.dataset.itemId), received_quantity: Number(input.value), ordered_quantity: Number(input.dataset.ordered) })); if (items.some(item => !Number.isFinite(item.received_quantity) || item.received_quantity < 0)) { feedback.textContent = text('quantityInvalid'); return; }
            submit.disabled = true; submit.textContent = text('saving'); try { const documentId = await uploadProof(order.id, file.files[0]); const result = await request('POST', `/orders/${order.id}/confirm-delivery`, { actual_delivery_date: actual.value, partial: partial.checked, items, proof_document_id: documentId }); if (!result?.success) throw new Error(result?.message || text('serverNeeded')); toast(text('saved'), 'success'); modal.remove(); state.support.delete(Number(order.id)); await reloadAndOpen(order.id); } catch (error) { feedback.textContent = text('deliveryPending', { reason: error.message || text('serverNeeded') }); } finally { submit.disabled = false; submit.textContent = text('submitDelivery'); } });
        modal.querySelector('.admin-modal__body').append(form); document.body.append(modal); actual.focus();
    }

    async function uploadProof(orderId, file) {
        const formData = new FormData(); formData.append('file', file); formData.append('orderIds', String(orderId)); formData.append('documentType', 'delivery_proof'); formData.append('description', text('proofDescription')); const result = await request('POST', '/documents/upload', undefined, formData); if (!result?.success) throw new Error(result?.message || text('proofUploadFailed')); return result.document?.id || result.documentId;
    }

    async function openPreflight(order) {
        const entry = await supportFor(order, true); const modal = makeModal(text('preflightTitle')); const body = modal.querySelector('.admin-modal__body'); const title = node('p', 'admin-preflight__order', `#${order.id} · ${order.item_description || '—'}`); body.append(title); const checklist = node('ul', 'admin-preflight__list'); const checks = accountingChecks(order, entry); checks.forEach(([key, label, valid]) => { const li = node('li', valid ? 'is-ready' : 'is-missing'); li.append(node('strong', null, valid ? text('present') : text('notPresent')), node('span', null, label)); checklist.append(li); }); body.append(checklist); const ready = checks.every(check => check[2]); const feedback = node('p', 'admin-modal__feedback'); if (!ready) feedback.textContent = text('cannotHandover'); body.append(feedback); const footer = node('div', 'admin-modal__footer'); const close = button(text('close')); close.addEventListener('click', () => modal.remove()); footer.append(close); if (ready) { const handover = button(text('handover'), 'btn btn-primary'); handover.addEventListener('click', async () => { handover.disabled = true; handover.textContent = text('saving'); try { const docs = entry.docs.filter(doc => ['purchase_order', 'delivery_note', 'signed_delivery_note', 'invoice'].includes(doc.document_type)).map(doc => doc.id); const result = await request('POST', '/accounting/handover', { documentIds: docs, notes: text('handoverNote', { id: order.id }) }); if (!result?.success) throw new Error(result?.message || text('serverRejected')); toast(text('handoverSent'), 'success'); modal.remove(); } catch (error) { feedback.textContent = text('failed', { reason: error.message || text('networkError') }); handover.disabled = false; handover.textContent = text('handover'); } }); footer.append(handover); } body.append(footer); document.body.append(modal);
    }

    function openBulkSupplier() {
        let ids = []; try { ids = [...selectedOrderIds]; } catch { /* no selection set */ } if (!ids.length) { toast(text('nothingSelected'), 'warning'); return; }
        const modal = makeModal(text('bulkSupplier')); const body = modal.querySelector('.admin-modal__body'); const select = node('select', 'form-control'); select.append(new Option(text('chooseSupplier'), '')); const suppliers = (() => { try { return Array.isArray(suppliersState) ? suppliersState : []; } catch { return []; } })(); suppliers.forEach(supplier => select.append(new Option(supplier.name || `#${supplier.id}`, supplier.id))); appendField(body, text('chooseSupplier'), select); const summary = node('p', 'admin-modal__feedback'); body.append(summary); const footer = node('div', 'admin-modal__footer'); const close = button(text('close')); close.addEventListener('click', () => modal.remove()); const confirm = button(text('confirm'), 'btn btn-primary'); confirm.addEventListener('click', async () => { const supplier = suppliers.find(item => String(item.id) === select.value); if (!supplier) { summary.textContent = text('selectSupplierFirst'); return; } const names = ids.map(id => `#${id}`).join(', '); const message = text('bulkConfirm', { supplier: supplier.name || `#${supplier.id}`, n: ids.length, orders: names }); if (!window.confirm(message)) return; confirm.disabled = true; confirm.textContent = text('saving'); try { const result = await request('POST', '/orders/bulk-assign-supplier', { order_ids: ids, supplier_id: Number(supplier.id) }); if (!result?.success) throw new Error(result?.message || text('serverNeeded')); toast(text('saved'), 'success'); selectedOrderIds.clear(); if (typeof updateSelectionUi === 'function') updateSelectionUi(); modal.remove(); await reloadAndOpen(); } catch (error) { summary.textContent = text('serverNeeded'); confirm.disabled = false; confirm.textContent = text('confirm'); } }); footer.append(close, confirm); body.append(footer); document.body.append(modal); select.focus();
    }

    function makeModal(title) { const overlay = node('div', 'admin-modal'); overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); const card = node('section', 'admin-modal__card'); const head = node('header', 'admin-modal__header'); head.append(node('h3', null, title)); const x = button('×', 'admin-modal__close'); x.setAttribute('aria-label', text('close')); x.addEventListener('click', () => overlay.remove()); head.append(x); const body = node('div', 'admin-modal__body'); card.append(head, body); overlay.append(card); overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); }); return overlay; }
    function appendField(parent, labelText, control) { const group = node('div', 'form-group'); const label = node('label', null, labelText); const id = `cockpit-${Math.random().toString(36).slice(2)}`; control.id = id; label.htmlFor = id; group.append(label, control); parent.append(group); }
    function selectOnly(id) { try { selectedOrderIds.clear(); selectedOrderIds.add(Number(id)); if (typeof updateSelectionUi === 'function') updateSelectionUi(); } catch { /* selection is unavailable before app init */ } }
    async function reloadAndOpen(id) { try { if (typeof loadOrders === 'function') await loadOrders(); } catch { /* keep truthful local result already shown */ } await refreshCockpit(true); if (id) openOrder(id); }
    function openOrder(id) { const list = currentOrders().filter(order => LIVE.has(order.status) || order.status === 'Delivered').map(order => order.id); state.openOrderIds = list; state.activeOrderIndex = list.indexOf(Number(id)); if (typeof window.openOrderDetail === 'function') window.openOrderDetail(Number(id)); else if (typeof openOrderDetail === 'function') openOrderDetail(Number(id)); }

    function bindDetailObserver() { const detail = document.getElementById('orderDetailBody'); if (!detail || state.observer) return; state.observer = new MutationObserver(() => { const id = window._currentDetailOrderId; const mount = document.getElementById('adminLifecycleMount'); if (!id || !mount || mount.dataset.cockpitOrderId === String(id)) return; mount.dataset.cockpitOrderId = String(id); const order = currentOrders().find(item => Number(item.id) === Number(id)); if (order) { supportFor(order).then(() => renderLifecycle(order)); } }); state.observer.observe(detail, { childList: true, subtree: true }); }
    function openShortcutHelp() { const modal = makeModal(text('shortcutsTitle')); const body = modal.querySelector('.admin-modal__body'); body.append(node('p', null, text('shortcutsNote'))); const list = node('dl', 'admin-shortcuts'); [['/', text('searchFocus')], ['j / ↓', text('nextOrder')], ['k / ↑', text('movePrevious')], ['n', text('nextBlocked')], ['Ctrl/⌘ + S', text('save')], ['?', text('help')]].forEach(([key, label]) => { list.append(node('dt', null, key), node('dd', null, label)); }); body.append(list); document.body.append(modal); }
    function keyboard(event) { const tag = document.activeElement?.tagName; const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag); if (typing && !(event.key.toLowerCase() === 's' && (event.ctrlKey || event.metaKey))) return; if (event.key === '/' && !typing) { event.preventDefault(); document.getElementById('filterSearch')?.focus(); return; } if (event.key === '?' && !typing) { event.preventDefault(); openShortcutHelp(); return; } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { const save = document.getElementById('btnSaveOrder'); if (save) { event.preventDefault(); save.click(); } return; } if (!typing && ['j', 'ArrowDown', 'k', 'ArrowUp', 'n'].includes(event.key)) { event.preventDefault(); const blocked = currentOrders().map(order => ({ order, item: bucketFor(order, state.support.get(Number(order.id))) })).filter(item => item.item); const ids = (event.key === 'n' ? blocked : currentOrders().filter(order => LIVE.has(order.status))).map(item => item.order?.id || item.id); if (!ids.length) return; const direction = event.key === 'k' || event.key === 'ArrowUp' ? -1 : 1; let position = ids.indexOf(state.openOrderIds[state.activeOrderIndex]); if (event.key === 'n') position = -1; position = (position + direction + ids.length) % ids.length; openOrder(ids[position]); } }

    function init() { if (state.initialized) return; state.initialized = true; document.addEventListener('keydown', keyboard); bindDetailObserver(); refreshCockpit(); const table = document.getElementById('ordersTable'); if (table) new MutationObserver(() => refreshCockpit()).observe(table, { childList: true }); document.addEventListener('translationChanged', () => refreshCockpit()); }
    window.AdminCockpit = { refresh: refreshCockpit, openOrder, openBulkSupplier, t: text };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
