'use strict';

const db = require('../config/database');

const GLOBAL_ORDER_ROLES = new Set(['admin', 'procurement']);
const ORDER_VIEWER_ROLES = new Set(['admin', 'procurement', 'requester', 'manager']);
const FINANCIAL_ROLES = new Set(['admin', 'procurement', 'accounting']);

function invalidId(value) {
    const id = Number(value);
    return !Number.isInteger(id) || id < 1;
}

async function getManagedBuildingCodes(userId) {
    const [rows] = await db.query(
        `SELECT b.code
         FROM building_managers bm
         INNER JOIN buildings b ON b.id = bm.building_id
         WHERE bm.user_id = ? AND b.active = 1`,
        [userId]
    );
    return rows.map(row => row.code);
}

async function getOrderScope(user, alias = 'o') {
    if (!user || !ORDER_VIEWER_ROLES.has(user.role)) {
        return { allowed: false, clause: '1 = 0', params: [] };
    }

    if (GLOBAL_ORDER_ROLES.has(user.role)) {
        return { allowed: true, clause: '1 = 1', params: [] };
    }

    const managedBuildings = await getManagedBuildingCodes(user.id);
    const conditions = [];
    const params = [];

    if (user.role === 'requester') {
        conditions.push(`${alias}.requester_id = ?`);
        params.push(user.id);
    }

    if (user.role === 'manager') {
        conditions.push(`${alias}.assigned_to_user_id = ?`);
        params.push(user.id);
    }

    if (managedBuildings.length > 0) {
        conditions.push(`${alias}.building IN (?)`);
        params.push(managedBuildings);
    }

    if (!conditions.length) {
        return { allowed: true, clause: '1 = 0', params: [] };
    }

    return {
        allowed: true,
        clause: `(${conditions.join(' OR ')})`,
        params
    };
}

async function canAccessOrder(orderId, user) {
    if (invalidId(orderId)) {
        return { allowed: false, order: null, reason: 'not_found' };
    }

    const [[order]] = await db.query('SELECT * FROM orders WHERE id = ?', [Number(orderId)]);
    if (!order) {
        return { allowed: false, order: null, reason: 'not_found' };
    }

    const scope = await getOrderScope(user, 'o');
    if (!scope.allowed) {
        return { allowed: false, order, reason: 'forbidden' };
    }

    if (GLOBAL_ORDER_ROLES.has(user.role)) {
        return { allowed: true, order, reason: null };
    }

    const [rows] = await db.query(
        `SELECT o.id FROM orders o
         WHERE o.id = ? AND ${scope.clause}`,
        [Number(orderId), ...scope.params]
    );

    return rows.length
        ? { allowed: true, order, reason: null }
        : { allowed: false, order, reason: 'forbidden' };
}

function requireOrderAccess(paramName = 'id') {
    return async (req, res, next) => {
        try {
            const result = await canAccessOrder(req.params[paramName], req.user);
            if (!result.allowed) {
                return res.status(result.reason === 'not_found' ? 404 : 403).json({
                    success: false,
                    message: result.reason === 'not_found' ? 'Order not found' : 'Access denied'
                });
            }
            req.order = result.order;
            next();
        } catch (error) {
            next(error);
        }
    };
}

async function canAccessDocument(documentId, user) {
    if (invalidId(documentId)) {
        return { allowed: false, document: null, reason: 'not_found' };
    }

    const [[document]] = await db.query('SELECT * FROM documents WHERE id = ?', [Number(documentId)]);
    if (!document) {
        return { allowed: false, document: null, reason: 'not_found' };
    }

    const [rows] = await db.query(
        `SELECT DISTINCT order_id
         FROM (
             SELECT odl.order_id
             FROM order_documents_link odl
             WHERE odl.document_id = ?
             UNION
             SELECT d.order_id
             FROM documents d
             WHERE d.id = ? AND d.order_id IS NOT NULL
         ) linked_orders`,
        [Number(documentId), Number(documentId)]
    );
    const orderIds = rows.map(row => row.order_id);

    // Financial roles may read financial documents regardless of their order
    // assignment, but still resolve all linked orders for callers such as the
    // handover ZIP guard.
    if (FINANCIAL_ROLES.has(user.role)) {
        return { allowed: true, document, orderIds, reason: null };
    }

    // Unlinked documents are not visible to non-privileged users.
    if (!orderIds.length) {
        return { allowed: false, document, orderIds, reason: 'forbidden' };
    }

    for (const orderId of orderIds) {
        const access = await canAccessOrder(orderId, user);
        if (!access.allowed) {
            return { allowed: false, document, orderIds, reason: 'forbidden' };
        }
    }

    return { allowed: true, document, orderIds, reason: null };
}

function requireDocumentAccess(paramName = 'documentId') {
    return async (req, res, next) => {
        try {
            const result = await canAccessDocument(req.params[paramName], req.user);
            if (!result.allowed) {
                return res.status(result.reason === 'not_found' ? 404 : 403).json({
                    success: false,
                    message: result.reason === 'not_found' ? 'Document not found' : 'Access denied'
                });
            }
            req.document = result.document;
            req.documentOrderIds = result.orderIds;
            next();
        } catch (error) {
            next(error);
        }
    };
}

async function canAccessQuote(quoteId, user) {
    if (invalidId(quoteId)) {
        return { allowed: false, quote: null, reason: 'not_found' };
    }

    const [[quote]] = await db.query('SELECT * FROM quotes WHERE id = ?', [Number(quoteId)]);
    if (!quote) {
        return { allowed: false, quote: null, reason: 'not_found' };
    }

    const [items] = await db.query(
        'SELECT DISTINCT order_id FROM quote_items WHERE quote_id = ?',
        [Number(quoteId)]
    );
    if (!items.length) {
        return { allowed: false, quote, reason: 'forbidden' };
    }

    for (const item of items) {
        const access = await canAccessOrder(item.order_id, user);
        if (!access.allowed) return { allowed: false, quote, reason: 'forbidden' };
    }

    return { allowed: true, quote, orderIds: items.map(item => item.order_id), reason: null };
}

function requireQuoteAccess(paramName = 'quoteId') {
    return async (req, res, next) => {
        try {
            const result = await canAccessQuote(req.params[paramName], req.user);
            if (!result.allowed) {
                return res.status(result.reason === 'not_found' ? 404 : 403).json({
                    success: false,
                    message: result.reason === 'not_found' ? 'Quote not found' : 'Access denied'
                });
            }
            req.quote = result.quote;
            req.quoteOrderIds = result.orderIds;
            next();
        } catch (error) {
            next(error);
        }
    };
}

async function canAccessPurchaseOrder(poId, user) {
    if (invalidId(poId)) return { allowed: false, po: null, reason: 'not_found' };

    const [[po]] = await db.query('SELECT * FROM purchase_orders WHERE id = ?', [Number(poId)]);
    if (!po) return { allowed: false, po: null, reason: 'not_found' };

    const [items] = await db.query(
        'SELECT DISTINCT order_id FROM po_items WHERE po_id = ? AND order_id IS NOT NULL',
        [Number(poId)]
    );
    if (!items.length) return { allowed: false, po, reason: 'forbidden' };

    for (const item of items) {
        const access = await canAccessOrder(item.order_id, user);
        if (!access.allowed) return { allowed: false, po, reason: 'forbidden' };
    }
    return { allowed: true, po, orderIds: items.map(item => item.order_id), reason: null };
}

async function canAccessQuoteResponse(responseId, user) {
    if (invalidId(responseId)) return { allowed: false, response: null, reason: 'not_found' };
    const [[response]] = await db.query(
        'SELECT * FROM quote_responses WHERE id = ?',
        [Number(responseId)]
    );
    if (!response) return { allowed: false, response: null, reason: 'not_found' };
    const access = await canAccessQuote(response.quote_id, user);
    return access.allowed
        ? { allowed: true, response, orderIds: access.orderIds, reason: null }
        : { allowed: false, response, reason: access.reason };
}

function requireQuoteResponseAccess(paramName = 'responseId') {
    return async (req, res, next) => {
        try {
            const result = await canAccessQuoteResponse(req.params[paramName], req.user);
            if (!result.allowed) {
                return res.status(result.reason === 'not_found' ? 404 : 403).json({
                    success: false,
                    message: result.reason === 'not_found' ? 'Quote response not found' : 'Access denied'
                });
            }
            req.quoteResponse = result.response;
            req.quoteResponseOrderIds = result.orderIds;
            next();
        } catch (error) {
            next(error);
        }
    };
}

function requirePurchaseOrderAccess(paramName = 'id') {
    return async (req, res, next) => {
        try {
            const result = await canAccessPurchaseOrder(req.params[paramName], req.user);
            if (!result.allowed) {
                return res.status(result.reason === 'not_found' ? 404 : 403).json({
                    success: false,
                    message: result.reason === 'not_found' ? 'PO not found' : 'Access denied'
                });
            }
            req.purchaseOrder = result.po;
            req.purchaseOrderIds = result.orderIds;
            next();
        } catch (error) {
            next(error);
        }
    };
}

async function canAccessInvoiceMeta(invoiceMetaId, user) {
    if (invalidId(invoiceMetaId)) return { allowed: false, invoiceMeta: null, reason: 'not_found' };
    const [[invoiceMeta]] = await db.query(
        'SELECT * FROM invoice_metadata WHERE id = ?',
        [Number(invoiceMetaId)]
    );
    if (!invoiceMeta) return { allowed: false, invoiceMeta: null, reason: 'not_found' };

    const access = await canAccessDocument(invoiceMeta.document_id, user);
    return access.allowed
        ? { allowed: true, invoiceMeta, document: access.document, reason: null }
        : { allowed: false, invoiceMeta, reason: access.reason };
}

async function canAccessInvoice(invoiceId, user) {
    if (invalidId(invoiceId)) return { allowed: false, invoice: null, reason: 'not_found' };
    const [[invoice]] = await db.query('SELECT * FROM invoices WHERE id = ?', [Number(invoiceId)]);
    if (!invoice) return { allowed: false, invoice: null, reason: 'not_found' };

    if (!invoice.po_id && !invoice.quote_id) {
        return { allowed: false, invoice, reason: 'forbidden' };
    }
    const orderIds = new Set();
    if (invoice.po_id) {
        const poAccess = await canAccessPurchaseOrder(invoice.po_id, user);
        if (!poAccess.allowed) return { allowed: false, invoice, reason: poAccess.reason };
        poAccess.orderIds.forEach(orderId => orderIds.add(orderId));
    }
    if (invoice.quote_id) {
        const quoteAccess = await canAccessQuote(invoice.quote_id, user);
        if (!quoteAccess.allowed) return { allowed: false, invoice, reason: quoteAccess.reason };
        quoteAccess.orderIds.forEach(orderId => orderIds.add(orderId));
    }
    return { allowed: true, invoice, orderIds: [...orderIds], reason: null };
}

function requireInvoiceAccess(paramName = 'id') {
    return async (req, res, next) => {
        try {
            const result = await canAccessInvoice(req.params[paramName], req.user);
            if (!result.allowed) {
                return res.status(result.reason === 'not_found' ? 404 : 403).json({
                    success: false,
                    message: result.reason === 'not_found' ? 'Invoice not found' : 'Access denied'
                });
            }
            req.invoice = result.invoice;
            req.invoiceOrderIds = result.orderIds;
            next();
        } catch (error) {
            next(error);
        }
    };
}

function requireInvoiceMetaAccess(paramName = 'invoiceMetaId') {
    return async (req, res, next) => {
        try {
            const result = await canAccessInvoiceMeta(req.params[paramName], req.user);
            if (!result.allowed) {
                return res.status(result.reason === 'not_found' ? 404 : 403).json({
                    success: false,
                    message: result.reason === 'not_found' ? 'Invoice not found' : 'Access denied'
                });
            }
            req.invoiceMeta = result.invoiceMeta;
            next();
        } catch (error) {
            next(error);
        }
    };
}

async function canAccessHandover(handoverId, user) {
    if (invalidId(handoverId)) return { allowed: false, handover: null, reason: 'not_found' };
    const [[handover]] = await db.query(
        'SELECT * FROM accounting_handovers WHERE id = ?',
        [Number(handoverId)]
    );
    if (!handover) return { allowed: false, handover: null, reason: 'not_found' };

    if (!FINANCIAL_ROLES.has(user.role)) {
        return { allowed: false, handover, reason: 'forbidden' };
    }

    const [documents] = await db.query(
        `SELECT document_id FROM accounting_handover_documents WHERE handover_id = ?`,
        [Number(handoverId)]
    );
    for (const row of documents) {
        const access = await canAccessDocument(row.document_id, user);
        if (!access.allowed) return { allowed: false, handover, reason: 'forbidden' };
    }
    return { allowed: true, handover, reason: null };
}

function requireHandoverAccess(paramName = 'id') {
    return async (req, res, next) => {
        try {
            const result = await canAccessHandover(req.params[paramName], req.user);
            if (!result.allowed) {
                return res.status(result.reason === 'not_found' ? 404 : 403).json({
                    success: false,
                    message: result.reason === 'not_found' ? 'Handover not found' : 'Access denied'
                });
            }
            req.handover = result.handover;
            next();
        } catch (error) {
            next(error);
        }
    };
}

function requireBodyOrderAccess(fieldName) {
    return async (req, res, next) => {
        try {
            const value = req.body && req.body[fieldName];
            const rawIds = Array.isArray(value) ? value : [value];
            const orderIds = rawIds.map(Number).filter(id => Number.isInteger(id) && id > 0);
            if (!orderIds.length || orderIds.length !== rawIds.length) {
                return res.status(400).json({ success: false, message: 'Valid order IDs are required' });
            }
            const uniqueIds = [...new Set(orderIds)];
            const orders = [];
            for (const orderId of uniqueIds) {
                const result = await canAccessOrder(orderId, req.user);
                if (!result.allowed) {
                    return res.status(result.reason === 'not_found' ? 404 : 403).json({
                        success: false,
                        message: result.reason === 'not_found' ? 'Order not found' : 'Access denied'
                    });
                }
                orders.push(result.order);
            }
            req.authorizedOrders = orders;
            next();
        } catch (error) {
            next(error);
        }
    };
}

function requireBodyDocumentAccess(fieldName) {
    return async (req, res, next) => {
        try {
            const value = req.body && req.body[fieldName];
            const rawIds = Array.isArray(value) ? value : [value];
            const documentIds = rawIds.map(Number).filter(id => Number.isInteger(id) && id > 0);
            if (!documentIds.length || documentIds.length !== rawIds.length) {
                return res.status(400).json({ success: false, message: 'Valid document IDs are required' });
            }
            const documents = [];
            for (const documentId of [...new Set(documentIds)]) {
                const result = await canAccessDocument(documentId, req.user);
                if (!result.allowed) {
                    return res.status(result.reason === 'not_found' ? 404 : 403).json({
                        success: false,
                        message: result.reason === 'not_found' ? 'Document not found' : 'Access denied'
                    });
                }
                documents.push(result.document);
            }
            req.authorizedDocuments = documents;
            next();
        } catch (error) {
            next(error);
        }
    };
}

function requireOptionalBodyDocumentAccess(fieldName) {
    return async (req, res, next) => {
        const value = req.body && req.body[fieldName];
        if (value === undefined || value === null || value === '') {
            return next();
        }

        try {
            const result = await canAccessDocument(value, req.user);
            if (!result.allowed) {
                return res.status(result.reason === 'not_found' ? 404 : 403).json({
                    success: false,
                    message: result.reason === 'not_found' ? 'Document not found' : 'Access denied'
                });
            }
            req.optionalAuthorizedDocument = result.document;
            next();
        } catch (error) {
            next(error);
        }
    };
}

function requireOptionalAccountingRecipient(fieldName = 'recipientId') {
    return async (req, res, next) => {
        const value = req.body && req.body[fieldName];
        if (value === undefined || value === null || value === '') {
            return next();
        }
        if (invalidId(value)) {
            return res.status(400).json({ success: false, message: 'Valid recipient ID is required' });
        }

        try {
            const [[recipient]] = await db.query(
                `SELECT id FROM users
                 WHERE id = ? AND role = 'accounting' AND active = 1`,
                [Number(value)]
            );
            if (!recipient) {
                return res.status(409).json({ success: false, message: 'Recipient is not an active accounting user' });
            }
            req.accountingRecipient = recipient;
            next();
        } catch (error) {
            next(error);
        }
    };
}

function requireManagerBuildingScope(req, res, next) {
    return (async () => {
        if (!req.user || req.user.role !== 'manager') {
            return next();
        }

        const buildingCodes = Array.isArray(req.authzBuildingCodes)
            ? req.authzBuildingCodes
            : await getManagedBuildingCodes(req.user.id);
        const orderIds = [
            ...(req.quoteOrderIds || []),
            ...(req.quoteResponseOrderIds || []),
            ...(req.purchaseOrderIds || []),
            ...(req.invoiceOrderIds || []),
            ...(req.order ? [req.order.id] : [])
        ];

        // An order lifecycle includes the full quote/PO/invoice context. When
        // only the root order is attached, expand its related quote/PO items
        // before deciding whether a building manager may see that context.
        if (req.order && !req.quoteOrderIds && !req.purchaseOrderIds && !req.invoiceOrderIds) {
            const [relatedOrders] = await db.query(
                `SELECT DISTINCT order_id
                 FROM (
                     SELECT order_id FROM quote_items WHERE quote_id = ?
                     UNION
                     SELECT order_id FROM po_items WHERE po_id = ?
                 ) related`,
                [req.order.quote_ref || 0, req.order.po_id || 0]
            );
            relatedOrders.forEach(row => orderIds.push(row.order_id));
        }

        if (!buildingCodes.length || !orderIds.length) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const [outsideScope] = await db.query(
            `SELECT id FROM orders
             WHERE id IN (?) AND building NOT IN (?)`,
            [[...new Set(orderIds)], buildingCodes]
        );
        if (outsideScope.length) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        next();
    })().catch(next);
}

async function scopeManagerToBuildings(req, res, next) {
    try {
        if (req.user && req.user.role === 'manager') {
            req.authzBuildingCodes = await getManagedBuildingCodes(req.user.id);
        } else {
            req.authzBuildingCodes = null;
        }
        next();
    } catch (error) {
        next(error);
    }
}

module.exports = {
    FINANCIAL_ROLES,
    canAccessOrder,
    canAccessDocument,
    canAccessQuote,
    canAccessPurchaseOrder,
    canAccessQuoteResponse,
    canAccessInvoiceMeta,
    canAccessInvoice,
    canAccessHandover,
    getManagedBuildingCodes,
    getOrderScope,
    requireOrderAccess,
    requireDocumentAccess,
    requireQuoteAccess,
    requirePurchaseOrderAccess,
    requireQuoteResponseAccess,
    requireInvoiceMetaAccess,
    requireInvoiceAccess,
    requireHandoverAccess,
    requireBodyOrderAccess,
    requireBodyDocumentAccess,
    requireOptionalBodyDocumentAccess,
    requireOptionalAccountingRecipient,
    requireManagerBuildingScope,
    scopeManagerToBuildings
};
