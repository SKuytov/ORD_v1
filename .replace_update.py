from pathlib import Path
import re
path = Path('/home/user/workspace/wt-endpoints/backend/controllers/orderController.js')
text = path.read_text()
replacement = r'''exports.updateOrder = async (req, res) => {
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

'''
pattern = r"exports\.updateOrder = async \(req, res\) => \{.*?\n\};\n\n(?=exports\.deleteOrder)"
text2, count = re.subn(pattern, lambda match: replacement, text, flags=re.S)
if count != 1:
    raise SystemExit(f'Expected one updateOrder block, replaced {count}')
path.write_text(text2)
