// backend/controllers/orderController.js
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const emailService = require('../utils/emailService');

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
            building, itemDescription, partNumber, category,
            quantity, dateNeeded, priority, notes,
            requester, requesterEmail, costCenterId
        } = req.body;

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
            validationErrors.push('Building is required.');
        }
        if (!quantity || isNaN(parseInt(quantity)) || parseInt(quantity) < 1) {
            validationErrors.push('Quantity must be a positive number.');
        }
        if (validationErrors.length > 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: validationErrors.join(' ') });
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

        // Role-based filtering
        if (req.user.role === 'requester') {
            // ⭐ Building managers see ALL orders from their building
            // Regular requesters see only their own orders
            if (req.user.isBuildingManager && req.user.managedBuilding) {
                conditions.push('o.building = ?');
                params.push(req.user.managedBuilding);
            } else {
                conditions.push('o.requester_id = ?');
                params.push(req.user.id);
            }
        }

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

        // SECURITY: requesters can only see orders from their own building
        // Building managers (who have role=requester) can see all orders in their building
        const isRequester = req.user.role === 'requester';
        const isBuildingManager = isRequester && req.user.isBuildingManager && req.user.managedBuilding;

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

        // Building managers can see any order in their building
        // Regular requesters can only see orders from their own building
        let whereClause, queryParams;
        if (isBuildingManager) {
            whereClause = `WHERE o.id = ? AND o.building = ?`;
            queryParams = [id, req.user.managedBuilding];
        } else if (isRequester) {
            whereClause = `WHERE o.id = ? AND o.building = ?`;
            queryParams = [id, req.user.building];
        } else {
            whereClause = `WHERE o.id = ?`;
            queryParams = [id];
        }

        const [orders] = await db.query(
            `SELECT ${selectFields} FROM orders o ${joins} ${whereClause}`,
            queryParams
        );

        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const order = orders[0];

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
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const updates = req.body;

        const [currentOrder] = await connection.query(
            'SELECT * FROM orders WHERE id = ?', [id]
        );

        if (currentOrder.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const orderData = currentOrder[0];
        
        // ⭐ NEW: Check assignment permissions
        if (orderData.assigned_to_user_id && req.user.role !== 'admin') {
            // If order is assigned, only the assigned user can edit it
            if (orderData.assigned_to_user_id !== req.user.id) {
                await connection.rollback();
                
                // Get assigned user name
                const [assignedUser] = await connection.query(
                    'SELECT name FROM users WHERE id = ?',
                    [orderData.assigned_to_user_id]
                );
                
                return res.status(403).json({ 
                    success: false, 
                    message: `This order is currently being processed by ${assignedUser[0]?.name || 'another user'}. Only they or an admin can edit it.`,
                    assigned_to: assignedUser[0]?.name
                });
            }
        }
        
        // ⭐ NEW: Auto-claim order on first edit if not assigned
        if (!orderData.assigned_to_user_id && ['admin', 'procurement'].includes(req.user.role)) {
            const now = new Date();
            await connection.query(
                `UPDATE orders 
                 SET assigned_to_user_id = ?, assigned_at = ?, last_activity_at = ?
                 WHERE id = ?`,
                [req.user.id, now, now, id]
            );
            
            // Log the auto-claim
            await connection.query(
                `INSERT INTO order_assignment_history 
                 (order_id, assigned_to_user_id, assigned_by_user_id, assignment_type, reason)
                 VALUES (?, ?, ?, 'claim', 'Auto-claimed on first edit')`,
                [id, req.user.id, req.user.id]
            );
        }

        // Allowed updatable fields
        const allowedFields = [
            'status', 'supplier', 'supplier_id', 'quote_id', 'price',
            'unit_price', 'total_price', 'assigned_to', 'priority',
            'expected_delivery_date', 'notes', 'part_number', 'category',
            'cost_center_id',
            'supplier_notes', 'alternative_product_name', 'alternative_product_description'
        ];

        const updateFields = [];
        const updateValues = [];

        for (const key of Object.keys(updates)) {
            if (allowedFields.includes(key)) {
                updateFields.push(`${key} = ?`);
                updateValues.push(updates[key]);
            }
        }

        if (updateFields.length > 0) {
            updateValues.push(id);

            await connection.query(
                `UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?`,
                updateValues
            );

            // Log history for each changed field
            for (const key of Object.keys(updates)) {
                if (allowedFields.includes(key) && String(orderData[key]) !== String(updates[key])) {
                    await connection.query(
                        `INSERT INTO order_history
                        (order_id, changed_by, field_name, old_value, new_value)
                        VALUES (?, ?, ?, ?, ?)`,
                        [id, req.user.name || req.user.username, key,
                         String(orderData[key] || ''), String(updates[key] || '')]
                    );
                }
            }
        }

        // ⭐ Write to supplier_item_history when a supplier is newly assigned
        if (updates.supplier_id && String(updates.supplier_id) !== String(orderData.supplier_id)) {
            const keywords = (orderData.item_description || '')
                .toLowerCase()
                .replace(/[^a-z\u0400-\u04ff0-9\s-]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 2)
                .join(' ');
            // BUG FIX: must use await so this runs inside the transaction
            await connection.query(
                `INSERT INTO supplier_item_history
                 (order_id, supplier_id, item_description, part_number, category, keywords, match_quality)
                 VALUES (?, ?, ?, ?, ?, ?, 'manual')
                 ON DUPLICATE KEY UPDATE
                 supplier_id = VALUES(supplier_id),
                 keywords = VALUES(keywords)`,
                [
                    id,
                    updates.supplier_id,
                    orderData.item_description || '',
                    orderData.part_number || null,
                    orderData.category || null,
                    keywords
                ]
            ).catch(err => console.warn('[AI] supplier_item_history insert failed:', err.message));
        }

        await connection.commit();

        // Send email if status changed
        if (updates.status && updates.status !== orderData.status) {
            // Notify the requester
            emailService.sendStatusUpdateNotification({
                orderId: id,
                requesterEmail: orderData.requester_email,
                requesterName: orderData.requester_name,
                requesterId: orderData.requester_id,
                oldStatus: orderData.status,
                newStatus: updates.status,
                building: orderData.building,
                itemDescription: orderData.item_description,
                priority: orderData.priority,
                quantity: orderData.quantity,
                unit: orderData.unit,
                supplierName: orderData.supplier,
                expectedDelivery: orderData.expected_delivery_date,
            }).catch(err => console.error('Status update email (requester) failed:', err.message));

            // ⭐ NEW: Also notify the building manager of this order's building
            emailService.sendBuildingManagerStatusUpdateNotification({
                orderId: id,
                building: orderData.building,
                itemDescription: orderData.item_description,
                requesterName: orderData.requester_name,
                oldStatus: orderData.status,
                newStatus: updates.status,
                priority: orderData.priority,
                quantity: orderData.quantity,
                supplierName: orderData.supplier,
                expectedDelivery: orderData.expected_delivery_date,
                // Exclude if the requester IS the building manager (to avoid duplicate email)
                excludeUserId: orderData.requester_id,
            }).catch(err => console.error('Status update email (building manager) failed:', err.message));
        }

        res.json({ success: true, message: 'Order updated successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Update order error:', error);
        res.status(500).json({ success: false, message: 'Failed to update order' });
    } finally {
        connection.release();
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

        // Only building managers can call this endpoint
        if (!req.user.isBuildingManager || !req.user.managedBuilding) {
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

        // Verify the order belongs to the manager's building
        if (order.building !== req.user.managedBuilding) {
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
