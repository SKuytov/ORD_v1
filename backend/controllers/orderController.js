// backend/controllers/orderController.js
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const emailService = require('../utils/emailService');
const { getOrderScope, getManagedBuildingCodes, canAccessOrder } = require('../middleware/authz');
const { withTransaction } = require('../utils/withTransaction');
const { validateOrderTransition } = require('../utils/orderLifecycle');

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function sendHttpError(res, error, fallback) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(fallback, error);
    return res.status(status).json({
        success: false,
        message: error instanceof HttpError ? error.message : fallback
    });
}

function validPositiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0;
}

async function getLifecycleContext(connection, order, overrides = {}) {
    let quote = null;
    let purchaseOrder = null;
    if (order.quote_ref) {
        [[quote]] = await connection.query('SELECT id, status FROM quotes WHERE id = ?', [order.quote_ref]);
    }
    if (order.po_id) {
        [[purchaseOrder]] = await connection.query(
            'SELECT id, actual_delivery_date FROM purchase_orders WHERE id = ?',
            [order.po_id]
        );
    }
    const [[proof]] = await connection.query(
        `SELECT d.id
         FROM documents d
         LEFT JOIN order_documents_link odl ON odl.document_id = d.id AND odl.order_id = ?
         WHERE (d.order_id = ? OR odl.order_id IS NOT NULL)
           AND d.document_type IN ('delivery_proof', 'signed_delivery_note')
         LIMIT 1`,
        [order.id, order.id]
    );
    return {
        hasSupplier: Boolean(order.supplier_id),
        hasQuote: Boolean(quote),
        quoteApproved: quote?.status === 'Approved',
        approvalApproved: order.approval_status === 'approved',
        hasPurchaseOrder: Boolean(purchaseOrder),
        actualDeliveryDate: purchaseOrder?.actual_delivery_date || null,
        hasDeliveryProof: Boolean(proof),
        ...overrides
    };
}

async function writeOrderAudit(connection, orderId, fieldName, oldValue, newValue, userId, reason) {
    await connection.query(
        `INSERT INTO orders_audit_log (order_id, field_name, old_value, new_value, changed_by, reason)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, fieldName, oldValue == null ? null : String(oldValue), newValue == null ? null : String(newValue), userId, reason || null]
    );
}

async function writeOrderHistory(connection, orderId, actor, fieldName, oldValue, newValue) {
    await connection.query(
        `INSERT INTO order_history (order_id, changed_by, field_name, old_value, new_value)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, actor, fieldName, oldValue == null ? null : String(oldValue), newValue == null ? null : String(newValue)]
    );
}

// ─── Helper: check if user is a building manager and return their building code ──
async function getBuildingManagerInfo(userId) {
    try {
        const [rows] = await db.query(
            `SELECT bm.id, b.code as building_code, b.name as building_name
             FROM building_managers bm
             JOIN buildings b ON bm.building_id = b.id
             WHERE bm.user_id = ?
             LIMIT 1`,
            [userId]
        );
        if (rows.length > 0) {
            return { isBuildingManager: true, buildingCode: rows[0].building_code, buildingName: rows[0].building_name };
        }
        return { isBuildingManager: false, buildingCode: null, buildingName: null };
    } catch (err) {
        console.error('[BuildingManager] getBuildingManagerInfo error:', err.message);
        return { isBuildingManager: false, buildingCode: null, buildingName: null };
    }
}

// ─── NEW: GET /api/orders/building-manager-status ────────────────────────────
// Called by frontend after login to detect if the logged-in user is a building manager
exports.getBuildingManagerStatus = async (req, res) => {
    try {
        const info = await getBuildingManagerInfo(req.user.id);
        res.json({ success: true, ...info });
    } catch (error) {
        console.error('getBuildingManagerStatus error:', error);
        res.status(500).json({ success: false, isBuildingManager: false });
    }
};

exports.createOrder = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const {
            itemDescription, partNumber, category,
            quantity, dateNeeded, priority, notes, costCenterId
        } = req.body;
        const building = req.user.building;
        const requester = req.user.name;
        const requesterEmail = req.user.email;

        // Input length validation
        const validationErrors = [];
        if (!itemDescription || typeof itemDescription !== 'string' || itemDescription.trim().length === 0) {
            validationErrors.push('Item description is required.');
        } else if (itemDescription.length > 1000) {
            validationErrors.push('Item description must be 1000 characters or fewer.');
        }
        if (partNumber && typeof partNumber === 'string' && partNumber.length > 100) {
            validationErrors.push('Part number must be 100 characters or fewer.');
        }
        if (notes && typeof notes === 'string' && notes.length > 2000) {
            validationErrors.push('Notes must be 2000 characters or fewer.');
        }
        if (!building || typeof building !== 'string' || building.trim().length === 0) {
            validationErrors.push('Your account is not assigned to a building.');
        }
        if (!quantity || isNaN(parseInt(quantity)) || parseInt(quantity) < 1) {
            validationErrors.push('Quantity must be a positive number.');
        }
        if (validationErrors.length > 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: validationErrors.join(' ') });
        }

        const [[activeBuilding]] = await connection.query(
            'SELECT code FROM buildings WHERE code = ? AND active = 1',
            [building]
        );
        if (!activeBuilding) {
            await connection.rollback();
            return res.status(403).json({ success: false, message: 'Your account is not assigned to an active building.' });
        }

        if (costCenterId) {
            const [[costCenter]] = await connection.query(
                'SELECT id FROM cost_centers WHERE id = ? AND building_code = ? AND active = 1',
                [costCenterId, building]
            );
            if (!costCenter) {
                await connection.rollback();
                return res.status(403).json({ success: false, message: 'Cost center does not belong to your building.' });
            }
        }

        const [result] = await connection.query(
            `INSERT INTO orders (
                building, cost_center_id, item_description, part_number, category,
                quantity, date_needed, priority, notes,
                requester_id, requester_name, requester_email, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New')`,
            [building, costCenterId || null, itemDescription, partNumber || null, category || null,
             quantity, dateNeeded || null, priority || 'Normal', notes || null,
             req.user.id, requester, requesterEmail]
        );

        const orderId = result.insertId;

        // Handle file uploads
        if (req.files && req.files.length > 0) {
            const fileInserts = req.files.map(file => [
                orderId, file.originalname, `/uploads/${file.filename}`, file.mimetype, file.size
            ]);

            await connection.query(
                `INSERT INTO order_files
                (order_id, file_name, file_path, file_type, file_size)
                VALUES ?`,
                [fileInserts]
            );
        }

        // Get cost center code for email
        let costCenterCode = null;
        if (costCenterId) {
            const [cc] = await connection.query(
                'SELECT code FROM cost_centers WHERE id = ?',
                [costCenterId]
            );
            if (cc.length > 0) costCenterCode = cc[0].code;
        }

        // Log order creation in history
        await connection.query(
            `INSERT INTO order_history (order_id, field_name, old_value, new_value, changed_by, changed_at)
             VALUES (?, 'status', NULL, 'New', ?, NOW())`,
            [orderId, requester || req.user.name || req.user.username]
        );

        await connection.commit();

        // Send email notification to admin/procurement (non-blocking)
        emailService.sendNewOrderNotification({
            orderId,
            building,
            itemDescription,
            quantity,
            requester,
            dateNeeded,
            priority: priority || 'Normal',
            costCenterCode
        }).catch(err => console.error('New order email failed:', err.message));

        // ⭐ NEW: Notify building manager of this building (non-blocking)
        emailService.sendBuildingManagerNewOrderNotification({
            orderId,
            building,
            itemDescription,
            quantity,
            requester,
            requesterEmail,
            dateNeeded,
            priority: priority || 'Normal',
            costCenterCode
        }).catch(err => console.error('Building manager new order email failed:', err.message));

        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            orderId
        });
    } catch (error) {
        await connection.rollback();
        console.error('Create order error:', error);
        res.status(500).json({ success: false, message: 'Failed to create order' });
    } finally {
        connection.release();
    }
};

exports.getOrders = async (req, res) => {
    try {
        const { status, building, priority, supplier_id, search, assigned_filter, date_from, date_to, was, by: byUser } = req.query;

        let query = `
            SELECT o.*,
                   o.cad_review_required,
                   o.cad_status,
                   IFNULL(o.is_template, 0) as is_template,
                   o.template_name,
                   (SELECT oh.new_value FROM order_history oh
                    WHERE oh.order_id = o.id AND oh.field_name = 'cancellation_reason'
                    ORDER BY oh.changed_at DESC LIMIT 1) as cancellation_reason,
                   (SELECT oh.changed_by FROM order_history oh
                    WHERE oh.order_id = o.id AND oh.field_name = 'cancellation_reason'
                    ORDER BY oh.changed_at DESC LIMIT 1) as cancelled_by,
                   (SELECT oh.changed_at FROM order_history oh
                    WHERE oh.order_id = o.id AND oh.field_name = 'status' AND oh.new_value = 'Cancelled'
                    ORDER BY oh.changed_at DESC LIMIT 1) as cancelled_at,
                   s.name as supplier_name,
                   q.quote_number,
                   cc.code as cost_center_code,
                   cc.name as cost_center_name,
                   u_assigned.name as assigned_to_name,
                   u_assigned.username as assigned_to_username,
                   TIMESTAMPDIFF(MINUTE, o.last_activity_at, NOW()) as minutes_since_activity,
                   GROUP_CONCAT(
                       DISTINCT JSON_OBJECT(
                           'id', f.id,
                           'name', f.file_name,
                           'path', f.file_path,
                           'type', f.file_type,
                           'size', f.file_size
                       )
                   ) as files,
                   GROUP_CONCAT(
                       DISTINCT JSON_OBJECT(
                           'id', d.id,
                           'name', d.file_name,
                           'description', IFNULL(d.description, '')
                       )
                   ) as documents
            FROM orders o
            LEFT JOIN order_files f ON o.id = f.order_id
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            LEFT JOIN quotes q ON o.quote_ref = q.id
            LEFT JOIN cost_centers cc ON o.cost_center_id = cc.id
            LEFT JOIN users u_assigned ON o.assigned_to_user_id = u_assigned.id
            LEFT JOIN order_documents_link odl ON o.id = odl.order_id
            LEFT JOIN documents d ON odl.document_id = d.id
        `;

        const conditions = [];
        const params = [];

        const scope = await getOrderScope(req.user, 'o');
        if (!scope.allowed) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        conditions.push(scope.clause);
        params.push(...scope.params);

        // Always exclude templates from the order list
        conditions.push('(o.is_template IS NULL OR o.is_template = 0)');

        // Date range filter — submission_date (validate YYYY-MM-DD format before using)
        const dateRx = /^\d{4}-\d{2}-\d{2}$/;
        if (date_from && dateRx.test(date_from)) { conditions.push('DATE(o.submission_date) >= ?'); params.push(date_from); }
        if (date_to   && dateRx.test(date_to))   { conditions.push('DATE(o.submission_date) <= ?'); params.push(date_to); }

        // History search — was:Status (find orders that ever had this status)
        // Case-insensitive: LOWER() so 'approved' matches 'Approved'
        if (was) {
            conditions.push('EXISTS (SELECT 1 FROM order_history oh WHERE oh.order_id = o.id AND oh.field_name = ? AND LOWER(oh.new_value) = LOWER(?))');
            params.push('status', was.trim());
        }

        // History search — by:name (find orders touched by this person)
        // Case-insensitive via LOWER()
        if (byUser) {
            conditions.push('EXISTS (SELECT 1 FROM order_history oh WHERE oh.order_id = o.id AND LOWER(oh.changed_by) LIKE LOWER(?))');
            params.push('%' + byUser.trim() + '%');
        }

        // Filters
        if (status) { conditions.push('o.status = ?'); params.push(status); }
        if (building) { conditions.push('o.building = ?'); params.push(building); }
        if (priority) { conditions.push('o.priority = ?'); params.push(priority); }
        if (supplier_id) { conditions.push('o.supplier_id = ?'); params.push(supplier_id); }
        
        // ⭐ NEW: Assignment filter for procurement
        if (assigned_filter === 'mine' && ['admin', 'procurement'].includes(req.user.role)) {
            conditions.push('o.assigned_to_user_id = ?');
            params.push(req.user.id);
        } else if (assigned_filter === 'unassigned') {
            conditions.push('o.assigned_to_user_id IS NULL');
        }
        
        if (search) {
            const rawSearch = search.trim();
            const s = `%${rawSearch}%`;
            const idMatch = parseInt(rawSearch, 10);
            const idClause = !isNaN(idMatch) ? ' OR o.id = ?' : '';
            const idParam = !isNaN(idMatch) ? [idMatch] : [];

            // FULLTEXT boost: if term is 4+ chars and no special prefix, also match via FULLTEXT
            // (FULLTEXT index on item_description, notes, alternative_product_name, alternative_product_description)
            const useFulltext = rawSearch.length >= 4 && !rawSearch.includes('%');
            const fulltextClause = useFulltext
                ? ' OR MATCH(o.item_description, o.notes, o.alternative_product_name, o.alternative_product_description) AGAINST(? IN BOOLEAN MODE)'
                : '';
            const fulltextParam = useFulltext ? [rawSearch + '*'] : [];

            conditions.push(`(
                o.item_description LIKE ?
                OR o.part_number LIKE ?
                OR o.requester_name LIKE ?
                OR o.notes LIKE ?
                OR o.category LIKE ?
                OR o.status LIKE ?
                OR o.building LIKE ?
                OR s.name LIKE ?
                OR cc.code LIKE ?
                OR cc.name LIKE ?
                OR CAST(o.id AS CHAR) LIKE ?
                OR EXISTS (SELECT 1 FROM order_files f2 WHERE f2.order_id = o.id AND f2.file_name LIKE ?)
                OR d.file_name LIKE ?
                OR d.description LIKE ?
                OR o.supplier_notes LIKE ?
                OR o.alternative_product_name LIKE ?
                OR o.alternative_product_description LIKE ?
                ${fulltextClause}
                ${idClause}
            )`);

            params.push(
                s, s, s, s, s, s, s, s, s, s, s, s, s, s, s, s, s,
                ...fulltextParam,
                ...idParam
            );
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' GROUP BY o.id ORDER BY o.submission_date DESC';

        const [orders] = await db.query(query, params);

        // Parse files JSON
        orders.forEach(order => {
            if (order.files && order.files !== 'null') {
                try {
                    order.files = JSON.parse(`[${order.files}]`);
                    order.files = order.files.filter(f => f.id !== null);
                } catch { order.files = []; }
            } else {
                order.files = [];
            }

            // ⭐ NEW: Parse documents JSON (file_name + description for search)
            if (order.documents && order.documents !== 'null') {
                try {
                    order.documents = JSON.parse(`[${order.documents}]`);
                    order.documents = order.documents.filter(d => d.id !== null);
                } catch { order.documents = []; }
            } else {
                order.documents = [];
            }
        });

        res.json({ success: true, orders });
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve orders' });
    }
};

exports.getOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        const isRequester = req.user.role === 'requester';

        // Requester view: strip sensitive supplier/price fields at DB level
        const selectFields = isRequester
            ? `o.id, o.building, o.cost_center_id, o.item_description, o.part_number,
               o.category, o.quantity, o.priority, o.notes, o.status,
               o.submission_date, o.updated_at, o.expected_delivery_date,
               o.requester_id, o.requester_name, o.requester_email,
               o.last_activity_at,
               cc.code as cost_center_code, cc.name as cost_center_name,
               TIMESTAMPDIFF(MINUTE, o.last_activity_at, NOW()) as minutes_since_activity`
            : `o.*,
               s.name as supplier_name, s.email as supplier_email,
               s.contact_person as supplier_contact,
               q.quote_number, q.status as quote_status,
               cc.code as cost_center_code, cc.name as cost_center_name,
               u_assigned.id as assigned_to_id,
               u_assigned.name as assigned_to_name,
               u_assigned.username as assigned_to_username,
               u_assigned.email as assigned_to_email,
               TIMESTAMPDIFF(MINUTE, o.last_activity_at, NOW()) as minutes_since_activity`;

        const joins = isRequester
            ? `LEFT JOIN cost_centers cc ON o.cost_center_id = cc.id`
            : `LEFT JOIN suppliers s ON o.supplier_id = s.id
               LEFT JOIN quotes q ON o.quote_ref = q.id
               LEFT JOIN cost_centers cc ON o.cost_center_id = cc.id
               LEFT JOIN users u_assigned ON o.assigned_to_user_id = u_assigned.id`;

        const [orders] = await db.query(
            `SELECT ${selectFields} FROM orders o ${joins} WHERE o.id = ?`,
            [id]
        );

        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const order = orders[0];

        // The delivery workflow needs the lines belonging to this order's PO.
        // Keep the existing order response shape and add this one field.
        if (order.po_id) {
            const [poItems] = await db.query(
                `SELECT * FROM po_items
                 WHERE po_id = ? AND order_id = ?
                 ORDER BY id ASC`,
                [order.po_id, id]
            );
            order.poItems = poItems;
        } else {
            order.poItems = [];
        }

        // Get files
        const [files] = await db.query(
            'SELECT id, file_name, file_path, file_type, file_size, uploaded_at FROM order_files WHERE order_id = ?',
            [id]
        );
        order.files = files;

        // History & assignment: only for admin/procurement/manager
        if (!isRequester) {
            const [history] = await db.query(
                'SELECT * FROM order_history WHERE order_id = ? ORDER BY changed_at DESC',
                [id]
            );
            order.history = history;

            const [assignmentHistory] = await db.query(
                `SELECT ah.*,
                        u_from.name as from_user_name,
                        u_to.name as to_user_name,
                        u_by.name as by_user_name
                 FROM order_assignment_history ah
                 LEFT JOIN users u_from ON ah.assigned_from_user_id = u_from.id
                 LEFT JOIN users u_to ON ah.assigned_to_user_id = u_to.id
                 LEFT JOIN users u_by ON ah.assigned_by_user_id = u_by.id
                 WHERE ah.order_id = ?
                 ORDER BY ah.created_at DESC
                 LIMIT 5`,
                [id]
            );
            order.assignmentHistory = assignmentHistory;
        } else {
            order.history = [];
            order.assignmentHistory = [];
        }

        // For ALL roles: extract cancellation reason from history if order is Cancelled
        if (order.status === 'Cancelled') {
            const [cancelHistory] = await db.query(
                `SELECT field_name, new_value, changed_by, changed_at
                 FROM order_history
                 WHERE order_id = ? AND field_name IN ('cancellation_reason', 'status')
                 ORDER BY changed_at DESC`,
                [id]
            );
            const reasonRow = cancelHistory.find(h => h.field_name === 'cancellation_reason');
            const statusRow = cancelHistory.find(h => h.field_name === 'status');
            order.cancellation_reason = reasonRow ? reasonRow.new_value : null;
            order.cancelled_by = reasonRow ? reasonRow.changed_by : (statusRow ? statusRow.changed_by : null);
            order.cancelled_at = statusRow ? statusRow.changed_at : null;
        }

        res.json({ success: true, order });
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve order' });
    }
};

exports.updateOrder = async (req, res) => {
    try {
        const result = await withTransaction(db, async connection => {
            const { id } = req.params;
            const updates = req.body || {};
            const [[orderData]] = await connection.query(
                'SELECT * FROM orders WHERE id = ? FOR UPDATE', [id]
            );
            if (!orderData) throw new HttpError(404, 'Order not found');

            if (orderData.assigned_to_user_id && req.user.role !== 'admin' && orderData.assigned_to_user_id !== req.user.id) {
                const [[assignedUser]] = await connection.query(
                    'SELECT name FROM users WHERE id = ?', [orderData.assigned_to_user_id]
                );
                throw new HttpError(403, `This order is currently being processed by ${assignedUser?.name || 'another user'}. Only they or an admin can edit it.`);
            }

            if (!orderData.assigned_to_user_id && ['admin', 'procurement'].includes(req.user.role)) {
                await connection.query(
                    `UPDATE orders
                     SET assigned_to_user_id = ?, assigned_at = NOW(), last_activity_at = NOW()
                     WHERE id = ?`,
                    [req.user.id, id]
                );
                await connection.query(
                    `INSERT INTO order_assignment_history
                     (order_id, assigned_to_user_id, assigned_by_user_id, assignment_type, reason)
                     VALUES (?, ?, ?, 'claim', 'Auto-claimed on first edit')`,
                    [id, req.user.id, req.user.id]
                );
            }

            const allowedFields = [
                'status', 'supplier', 'supplier_id', 'quote_id', 'price',
                'unit_price', 'total_price', 'assigned_to', 'priority',
                'expected_delivery_date', 'notes', 'part_number', 'category',
                'cost_center_id', 'supplier_notes', 'alternative_product_name',
                'alternative_product_description'
            ];
            const changedKeys = Object.keys(updates).filter(key => allowedFields.includes(key));
            if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
                const lifecycleOrder = {
                    ...orderData,
                    supplier_id: Object.prototype.hasOwnProperty.call(updates, 'supplier_id') ? updates.supplier_id : orderData.supplier_id
                };
                const lifecycle = validateOrderTransition(
                    orderData.status,
                    updates.status,
                    await getLifecycleContext(connection, lifecycleOrder)
                );
                if (!lifecycle.ok) throw new HttpError(409, lifecycle.message);
            }

            if (changedKeys.length) {
                const updateFields = changedKeys.map(key => `${key} = ?`);
                const updateValues = changedKeys.map(key => updates[key]);
                await connection.query(
                    `UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?`,
                    [...updateValues, id]
                );
                for (const key of changedKeys) {
                    if (String(orderData[key] ?? '') !== String(updates[key] ?? '')) {
                        await writeOrderHistory(connection, id, req.user.name || req.user.username, key, orderData[key], updates[key]);
                        if (key === 'status') {
                            await writeOrderAudit(connection, id, 'status', orderData.status, updates.status, req.user.id, 'Generic order update');
                        }
                    }
                }
            }

            if (updates.supplier_id && String(updates.supplier_id) !== String(orderData.supplier_id)) {
                const keywords = (orderData.item_description || '')
                    .toLowerCase()
                    .replace(/[^a-z\u0400-\u04ff0-9\s-]/g, ' ')
                    .split(/\s+/)
                    .filter(word => word.length > 2)
                    .join(' ');
                await connection.query(
                    `INSERT INTO supplier_item_history
                     (order_id, supplier_id, item_description, part_number, category, keywords, match_quality)
                     VALUES (?, ?, ?, ?, ?, ?, 'manual')`,
                    [id, updates.supplier_id, orderData.item_description || '', orderData.part_number || null,
                     orderData.category || null, keywords]
                );
            }
            return { orderData, statusChanged: updates.status && updates.status !== orderData.status };
        });

        if (result.statusChanged) {
            emailService.sendStatusUpdateNotification({
                orderId: req.params.id,
                requesterEmail: result.orderData.requester_email,
                requesterName: result.orderData.requester_name,
                requesterId: result.orderData.requester_id,
                oldStatus: result.orderData.status,
                newStatus: req.body.status,
                building: result.orderData.building,
                itemDescription: result.orderData.item_description,
                priority: result.orderData.priority,
                quantity: result.orderData.quantity,
                supplierName: result.orderData.supplier,
                expectedDelivery: result.orderData.expected_delivery_date
            }).catch(error => console.error('Status update email (requester) failed:', error.message));
        }
        res.json({ success: true, message: 'Order updated successfully' });
    } catch (error) {
        sendHttpError(res, error, 'Failed to update order');
    }
};

exports.confirmDelivery = async (req, res) => {
    const orderId = Number(req.params.orderId);
    const { actual_delivery_date: actualDeliveryDate, partial, items, proof_document_id: proofDocumentId } = req.body || {};
    if (!validPositiveInteger(orderId) || !validPositiveInteger(proofDocumentId)) {
        return res.status(422).json({ success: false, message: 'A valid delivery proof document is required' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(actualDeliveryDate || ''))) {
        return res.status(422).json({ success: false, message: 'A valid actual_delivery_date is required' });
    }
    if (typeof partial !== 'boolean' || !Array.isArray(items) || !items.length) {
        return res.status(422).json({ success: false, message: 'partial and at least one delivery item are required' });
    }

    const submitted = new Map();
    for (const item of items) {
        const itemId = Number(item?.id);
        const receivedQuantity = Number(item?.received_quantity);
        if (!Number.isInteger(itemId) || itemId < 1 || !Number.isInteger(receivedQuantity) || receivedQuantity < 0 || submitted.has(itemId)) {
            return res.status(422).json({ success: false, message: 'Delivery items must have unique IDs and non-negative whole received quantities' });
        }
        submitted.set(itemId, receivedQuantity);
    }

    try {
        const delivery = await withTransaction(db, async connection => {
            const [[order]] = await connection.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
            if (!order) throw new HttpError(404, 'Order not found');

            // Delivered is terminal. Without this guard a second confirmation on
            // an already delivered order was accepted: the row lock serialises
            // the requests, but validateOrderTransition treats Delivered ->
            // Delivered as a no-op, so a duplicate submit could silently rewrite
            // the received quantities and the delivery date. Two PM2 workers plus
            // an impatient double click made that reachable in practice.
            if (order.status === 'Delivered') {
                throw new HttpError(409, 'This order is already marked delivered; reopen it before confirming another delivery');
            }
            if (order.status === 'Cancelled') {
                throw new HttpError(409, 'Cannot confirm a delivery for a cancelled order');
            }

            const [[proof]] = await connection.query(
                `SELECT d.id FROM documents d
                 LEFT JOIN order_documents_link odl ON odl.document_id = d.id AND odl.order_id = ?
                 WHERE d.id = ? AND (d.order_id = ? OR odl.order_id IS NOT NULL)
                   AND d.document_type IN ('delivery_proof', 'signed_delivery_note')
                 FOR UPDATE`,
                [orderId, proofDocumentId, orderId]
            );
            if (!proof) throw new HttpError(422, 'Delivery proof must be linked to this order and be a delivery proof or signed delivery note');

            const [[po]] = await connection.query(
                `SELECT * FROM purchase_orders
                 WHERE id = ? OR (po_number = ? AND ? IS NOT NULL)
                 ORDER BY id ASC LIMIT 1 FOR UPDATE`,
                [order.po_id || 0, order.po_number || null, order.po_number || null]
            );
            if (!po) throw new HttpError(409, 'Cannot confirm delivery: missing prerequisite a purchase order');

            const [orderItems] = await connection.query(
                'SELECT * FROM po_items WHERE po_id = ? AND order_id = ? ORDER BY id ASC FOR UPDATE',
                [po.id, orderId]
            );
            if (!orderItems.length) throw new HttpError(422, 'This order has no purchase-order items to receive');
            const byId = new Map(orderItems.map(item => [Number(item.id), item]));
            for (const [itemId, receivedQuantity] of submitted) {
                const poItem = byId.get(itemId);
                if (!poItem) throw new HttpError(422, `PO item ${itemId} does not belong to this order's purchase order`);
                if (receivedQuantity > Number(poItem.quantity)) {
                    throw new HttpError(422, `Received quantity for PO item ${itemId} exceeds its ordered quantity`);
                }
            }

            for (const [itemId, receivedQuantity] of submitted) {
                const poItem = byId.get(itemId);
                const itemStatus = receivedQuantity === 0 ? 'pending'
                    : receivedQuantity === Number(poItem.quantity) ? 'received' : 'partial';
                await connection.query(
                    'UPDATE po_items SET received_quantity = ?, status = ? WHERE id = ? AND po_id = ? AND order_id = ?',
                    [receivedQuantity, itemStatus, itemId, po.id, orderId]
                );
            }

            // A purchase order can cover several orders, because po_items carries
            // its own order_id. The two statuses must therefore be derived from
            // different sets: the ORDER's status from this order's items only,
            // and the PO's status from every item on the PO. Deriving both from
            // the whole PO left a fully received order stuck on "Partially
            // Delivered" whenever a sibling order on the same PO was still open,
            // and that order could then be confirmed again and again.
            const isFullyReceived = items => items.length > 0 && items.every(item =>
                item.status === 'cancelled' || Number(item.received_quantity) >= Number(item.quantity)
            );

            const [thisOrderItems] = await connection.query(
                'SELECT * FROM po_items WHERE po_id = ? AND order_id = ? ORDER BY id ASC',
                [po.id, orderId]
            );
            const [allPoItems] = await connection.query(
                'SELECT * FROM po_items WHERE po_id = ? ORDER BY id ASC FOR UPDATE',
                [po.id]
            );

            const orderFullyReceived = isFullyReceived(thisOrderItems);
            const poFullyReceived = isFullyReceived(allPoItems);
            const nextStatus = orderFullyReceived ? 'Delivered' : 'Partially Delivered';
            const lifecycle = validateOrderTransition(order.status, nextStatus, {
                hasPurchaseOrder: true,
                actualDeliveryDate,
                hasDeliveryProof: true
            });
            if (!lifecycle.ok) throw new HttpError(409, lifecycle.message);

            await connection.query(
                'UPDATE purchase_orders SET actual_delivery_date = ?, status = ? WHERE id = ?',
                [actualDeliveryDate, poFullyReceived ? 'delivered' : 'partially_delivered', po.id]
            );
            await connection.query(
                `UPDATE orders
                 SET status = ?, delivery_confirmed_at = NOW(), delivery_confirmed_by = ?, updated_at = NOW()
                 WHERE id = ?`,
                [nextStatus, req.user.id, orderId]
            );
            await writeOrderHistory(connection, orderId, req.user.name || req.user.username, 'status', order.status, nextStatus);
            await writeOrderAudit(connection, orderId, 'status', order.status, nextStatus, req.user.id, 'Delivery confirmed');
            await writeOrderAudit(connection, orderId, 'delivery_confirmed_at', null, actualDeliveryDate, req.user.id, 'Delivery confirmed');

            const [[updatedOrder]] = await connection.query('SELECT * FROM orders WHERE id = ?', [orderId]);
            const [[updatedPo]] = await connection.query('SELECT * FROM purchase_orders WHERE id = ?', [po.id]);
            const [updatedItems] = await connection.query(
                'SELECT * FROM po_items WHERE po_id = ? AND order_id = ? ORDER BY id ASC',
                [po.id, orderId]
            );
            return { order: updatedOrder, po: updatedPo, poItems: updatedItems };
        });
        res.json({ success: true, ...delivery });
    } catch (error) {
        sendHttpError(res, error, 'Failed to confirm delivery');
    }
};

exports.bulkAssignSupplier = async (req, res) => {
    const rawOrderIds = req.body?.order_ids;
    const supplierId = Number(req.body?.supplier_id);
    if (!Array.isArray(rawOrderIds) || !rawOrderIds.length || !validPositiveInteger(supplierId)) {
        return res.status(422).json({ success: false, message: 'order_ids and a valid supplier_id are required' });
    }
    const orderIds = [...new Set(rawOrderIds.map(Number))];
    if (orderIds.length !== rawOrderIds.length || orderIds.some(id => !validPositiveInteger(id))) {
        return res.status(422).json({ success: false, message: 'order_ids must contain unique positive integers' });
    }

    try {
        // Keep the policy centralized in authz, while returning all bad IDs rather
        // than changing a subset before the caller can correct its selection.
        const access = await Promise.all(orderIds.map(id => canAccessOrder(id, req.user)));
        const inaccessible = access
            .map((result, index) => ({ id: orderIds[index], reason: result.reason }))
            .filter(result => result.reason);
        if (inaccessible.length) {
            return res.status(inaccessible.some(item => item.reason === 'not_found') ? 404 : 403).json({
                success: false,
                message: 'One or more orders are unavailable',
                offending_orders: inaccessible
            });
        }

        const updated = await withTransaction(db, async connection => {
            const [[supplier]] = await connection.query(
                'SELECT id, name FROM suppliers WHERE id = ? AND active = 1 FOR UPDATE',
                [supplierId]
            );
            if (!supplier) throw new HttpError(422, 'Supplier does not exist or is inactive');
            const [orders] = await connection.query(
                'SELECT * FROM orders WHERE id IN (?) ORDER BY id ASC FOR UPDATE',
                [orderIds]
            );
            const rowsById = new Map(orders.map(order => [Number(order.id), order]));
            const offending = orderIds
                .filter(id => !rowsById.has(id))
                .map(id => ({ id, reason: 'not_found' }));
            const assignableStatuses = new Set(['New', 'Pending', 'Quote Requested']);
            for (const order of orders) {
                if (!assignableStatuses.has(order.status)) {
                    offending.push({ id: order.id, reason: `supplier_assignment_not_allowed_in_${order.status}` });
                }
            }
            if (offending.length) {
                const error = new HttpError(409, 'No orders were changed because one or more orders are not eligible for supplier assignment');
                error.offendingOrders = offending;
                throw error;
            }

            for (const order of orders) {
                await connection.query(
                    `UPDATE orders SET supplier_id = ?, supplier = ?, last_activity_at = NOW(), updated_at = NOW()
                     WHERE id = ?`,
                    [supplier.id, supplier.name, order.id]
                );
                await writeOrderHistory(connection, order.id, req.user.name || req.user.username, 'supplier_id', order.supplier_id, supplier.id);
                await writeOrderAudit(connection, order.id, 'supplier_id', order.supplier_id, supplier.id, req.user.id, 'Bulk supplier assignment');
            }
            return orders.length;
        });
        res.json({ success: true, updated, order_ids: orderIds });
    } catch (error) {
        if (error instanceof HttpError && error.offendingOrders) {
            return res.status(error.status).json({
                success: false,
                message: error.message,
                offending_orders: error.offendingOrders
            });
        }
        sendHttpError(res, error, 'Failed to assign supplier');
    }
};

exports.submitApproval = async (req, res) => {
    const orderId = Number(req.params.orderId);
    try {
        await withTransaction(db, async connection => {
            const [[order]] = await connection.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
            if (!order) throw new HttpError(404, 'Order not found');
            const lifecycle = validateOrderTransition(
                order.status,
                'Quote Under Approval',
                await getLifecycleContext(connection, order)
            );
            if (!lifecycle.ok) throw new HttpError(409, lifecycle.message);

            await connection.query(
                `UPDATE orders SET status = 'Quote Under Approval', approval_status = 'pending', updated_at = NOW()
                 WHERE id = ?`,
                [orderId]
            );
            await writeOrderHistory(connection, orderId, req.user.name || req.user.username, 'status', order.status, 'Quote Under Approval');
            await writeOrderAudit(connection, orderId, 'status', order.status, 'Quote Under Approval', req.user.id, 'Submitted for approval');
        });
        res.json({ success: true, message: 'Order submitted for approval' });
    } catch (error) {
        sendHttpError(res, error, 'Failed to submit order for approval');
    }
};

exports.approveOrder = async (req, res) => {
    const orderId = Number(req.params.orderId);
    try {
        await withTransaction(db, async connection => {
            const [[order]] = await connection.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
            if (!order) throw new HttpError(404, 'Order not found');
            const [[approval]] = await connection.query(
                `SELECT * FROM approvals
                 WHERE order_id = ? AND status = 'pending'
                 ORDER BY requested_at DESC, id DESC LIMIT 1 FOR UPDATE`,
                [orderId]
            );
            if (!approval) throw new HttpError(409, 'Cannot approve this order: missing prerequisite a pending approval request');
            if (req.user.role !== 'admin' && Number(approval.assigned_to) !== Number(req.user.id)) {
                throw new HttpError(403, 'This approval is assigned to another manager');
            }
            const lifecycle = validateOrderTransition(
                order.status,
                'Approved',
                await getLifecycleContext(connection, order, { approvalApproved: true })
            );
            if (!lifecycle.ok) throw new HttpError(409, lifecycle.message);

            const [approvalUpdate] = await connection.query(
                `UPDATE approvals SET status = 'approved', approved_by = ?, approved_at = NOW(),
                 comments = CONCAT(COALESCE(comments, ''), ?)
                 WHERE id = ? AND status = 'pending'${req.user.role === 'admin' ? '' : ' AND assigned_to = ?'}`,
                req.user.role === 'admin'
                    ? [req.user.id, req.body?.comments ? `\n\nApproved: ${req.body.comments}` : '', approval.id]
                    : [req.user.id, req.body?.comments ? `\n\nApproved: ${req.body.comments}` : '', approval.id, req.user.id]
            );
            if (approvalUpdate.affectedRows !== 1) throw new HttpError(409, 'This request has already been decided');
            await connection.query(
                `INSERT INTO approval_history (approval_id, action, performed_by, old_status, new_status, comments)
                 VALUES (?, 'approved', ?, 'pending', 'approved', ?)`,
                [approval.id, req.user.id, req.body?.comments || null]
            );
            await connection.query(
                `UPDATE orders
                 SET status = 'Approved', approval_status = 'approved', approved_by = ?, approved_at = NOW(), updated_at = NOW()
                 WHERE id = ?`,
                [req.user.id, orderId]
            );
            await writeOrderHistory(connection, orderId, req.user.name || req.user.username, 'status', order.status, 'Approved');
            await writeOrderAudit(connection, orderId, 'status', order.status, 'Approved', req.user.id, 'Approval granted');
        });
        res.json({ success: true, message: 'Order approved' });
    } catch (error) {
        sendHttpError(res, error, 'Failed to approve order');
    }
};

exports.deleteOrder = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { id } = req.params;

        const [orders] = await connection.query(
            'SELECT * FROM orders WHERE id = ?', [id]
        );

        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Delete files from filesystem
        const [files] = await connection.query(
            'SELECT file_path FROM order_files WHERE order_id = ?', [id]
        );

        files.forEach(file => {
            // Resolve absolute path from the stored relative /uploads/... path
            const absolutePath = file.file_path.startsWith('/')
                ? path.join(__dirname, '../../backend', file.file_path)
                : path.join(__dirname, '../../backend', '/', file.file_path);
            if (fs.existsSync(absolutePath)) {
                try { fs.unlinkSync(absolutePath); } catch (e) { console.warn('Could not delete file:', absolutePath, e.message); }
            }
        });

        // BUG FIX: cascade-delete AI training rows before deleting order
        await connection.query('DELETE FROM supplier_item_history WHERE order_id = ?', [id]);
        await connection.query('DELETE FROM supplier_selection_log WHERE order_id = ?', [id]);
        await connection.query('DELETE FROM orders WHERE id = ?', [id]);
        await connection.commit();

        res.json({ success: true, message: 'Order deleted successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Delete order error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete order' });
    } finally {
        connection.release();
    }
};

// ─── NEW: Building Manager Cancel Endpoint ────────────────────────────────────
// POST /api/orders/:id/cancel-by-manager
// Only building managers of the order's building may call this.
// They can cancel any non-terminal status (unlike requester who is limited to New/Pending/Quote Requested).
exports.cancelOrderByManager = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { reason } = req.body;

        if (!reason || !reason.trim()) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Cancellation reason is required.' });
        }

        const managedBuildings = await getManagedBuildingCodes(req.user.id);
        if (!managedBuildings.length) {
            await connection.rollback();
            return res.status(403).json({ success: false, message: 'Access denied. Building manager only.' });
        }

        // Fetch the order
        const [orders] = await connection.query(
            'SELECT * FROM orders WHERE id = ?', [id]
        );

        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const order = orders[0];

        if (!managedBuildings.includes(order.building)) {
            await connection.rollback();
            return res.status(403).json({ success: false, message: 'You can only cancel orders from your own building.' });
        }

        // Cannot cancel already-terminal statuses
        const TERMINAL_STATUSES = ['Cancelled', 'Delivered'];
        if (TERMINAL_STATUSES.includes(order.status)) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: `Cannot cancel an order with status "${order.status}".` });
        }

        const oldStatus = order.status;
        const cancelledBy = req.user.name || req.user.username;

        // Update order status to Cancelled
        await connection.query(
            `UPDATE orders SET status = 'Cancelled', updated_at = NOW() WHERE id = ?`,
            [id]
        );

        // Log status change
        await connection.query(
            `INSERT INTO order_history (order_id, changed_by, field_name, old_value, new_value)
             VALUES (?, ?, 'status', ?, 'Cancelled')`,
            [id, cancelledBy, oldStatus]
        );

        // Log cancellation reason
        await connection.query(
            `INSERT INTO order_history (order_id, changed_by, field_name, old_value, new_value)
             VALUES (?, ?, 'cancellation_reason', NULL, ?)`,
            [id, cancelledBy, reason.trim()]
        );

        await connection.commit();

        // Notify the requester (non-blocking)
        emailService.sendStatusUpdateNotification({
            orderId: id,
            requesterEmail: order.requester_email,
            requesterName: order.requester_name,
            requesterId: order.requester_id,
            oldStatus,
            newStatus: 'Cancelled',
            building: order.building,
            itemDescription: order.item_description,
            priority: order.priority,
            quantity: order.quantity,
            unit: order.unit,
            supplierName: order.supplier,
            expectedDelivery: order.expected_delivery_date,
        }).catch(err => console.error('Cancel email (requester) failed:', err.message));

        res.json({ success: true, message: 'Order cancelled successfully.' });
    } catch (error) {
        await connection.rollback();
        console.error('cancelOrderByManager error:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel order.' });
    } finally {
        connection.release();
    }
};

exports.getOrderStats = async (req, res) => {
    try {
        const [statusCounts] = await db.query(
            'SELECT status, COUNT(*) as count FROM orders GROUP BY status'
        );

        const [buildingCounts] = await db.query(
            'SELECT building, COUNT(*) as count FROM orders GROUP BY building'
        );

        // BUG FIX: limit totalValue to current month to avoid misleading all-time totals
        const [totalValue] = await db.query(
            `SELECT SUM(total_price) as total FROM orders
             WHERE status NOT IN ('Cancelled')
             AND submission_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
        );

        const [priorityCounts] = await db.query(
            'SELECT priority, COUNT(*) as count FROM orders GROUP BY priority'
        );

        const [recentOrders] = await db.query(`
            SELECT id, building, item_description, status, priority, submission_date
            FROM orders ORDER BY submission_date DESC LIMIT 10
        `);
        
        // ⭐ NEW: Assignment statistics
        const [assignmentStats] = await db.query(`
            SELECT 
                COUNT(CASE WHEN assigned_to_user_id IS NOT NULL THEN 1 END) as assigned_count,
                COUNT(CASE WHEN assigned_to_user_id IS NULL THEN 1 END) as unassigned_count,
                COUNT(CASE WHEN assigned_to_user_id IS NOT NULL AND 
                      TIMESTAMPDIFF(MINUTE, last_activity_at, NOW()) > 30 THEN 1 END) as stale_count
            FROM orders
            WHERE status IN ('New', 'Pending', 'Quote Requested', 'Quote Received')
        `);

        res.json({
            success: true,
            stats: {
                byStatus: statusCounts,
                byBuilding: buildingCounts,
                byPriority: priorityCounts,
                totalValue: totalValue[0].total || 0,
                recentOrders,
                assignments: assignmentStats[0] || {}
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve statistics' });
    }
};
