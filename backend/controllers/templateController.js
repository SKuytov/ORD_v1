// backend/controllers/templateController.js
const db = require('../config/database');

exports.getTemplates = async (req, res) => {
    try {
        const { role, building, id: userId } = req.user;

        let query = `
            SELECT t.*, u.name as created_by_name, cc.code as cost_center_code, cc.name as cost_center_name
            FROM order_templates t
            LEFT JOIN users u ON t.created_by = u.id
            LEFT JOIN cost_centers cc ON t.cost_center_id = cc.id
            WHERE t.active = 1
        `;
        const params = [];

        if (role === 'requester') {
            // Requesters see their own templates + templates matching their building
            query += ' AND (t.created_by = ? OR t.building = ?)';
            params.push(userId, building);
        }
        // admin and procurement see all templates

        query += ' ORDER BY t.use_count DESC, t.updated_at DESC';

        const [templates] = await db.query(query, params);

        res.json({
            success: true,
            templates
        });
    } catch (error) {
        console.error('Get templates error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve templates' });
    }
};

exports.getTemplateById = async (req, res) => {
    try {
        const { id } = req.params;

        const [templates] = await db.query(
            `SELECT t.*, u.name as created_by_name, cc.code as cost_center_code, cc.name as cost_center_name
             FROM order_templates t
             LEFT JOIN users u ON t.created_by = u.id
             LEFT JOIN cost_centers cc ON t.cost_center_id = cc.id
             WHERE t.id = ? AND t.active = 1`,
            [id]
        );

        if (templates.length === 0) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }

        res.json({
            success: true,
            template: templates[0]
        });
    } catch (error) {
        console.error('Get template by ID error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve template' });
    }
};

exports.createTemplate = async (req, res) => {
    try {
        const {
            name, description, building, cost_center_id,
            item_description, part_number, category,
            quantity, priority, notes, equipment_id, supplier_id
        } = req.body;

        if (!name || !item_description) {
            return res.status(400).json({
                success: false,
                message: 'Name and item_description are required'
            });
        }

        const [result] = await db.query(
            `INSERT INTO order_templates (
                name, description, building, cost_center_id,
                item_description, part_number, category,
                quantity, priority, notes, equipment_id, supplier_id,
                created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name, description || null, building || null, cost_center_id || null,
                item_description, part_number || null, category || null,
                quantity || 1, priority || 'Normal', notes || null,
                equipment_id || null, supplier_id || null,
                req.user.id
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Template created successfully',
            templateId: result.insertId
        });
    } catch (error) {
        console.error('Create template error:', error);
        res.status(500).json({ success: false, message: 'Failed to create template' });
    }
};

exports.updateTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, id: userId } = req.user;

        // Check ownership
        const [existing] = await db.query(
            'SELECT created_by FROM order_templates WHERE id = ? AND active = 1',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }

        if (role !== 'admin' && existing[0].created_by !== userId) {
            return res.status(403).json({ success: false, message: 'Access denied. Only the owner or admin can update this template.' });
        }

        const {
            name, description, building, cost_center_id,
            item_description, part_number, category,
            quantity, priority, notes, equipment_id, supplier_id
        } = req.body;

        if (!name || !item_description) {
            return res.status(400).json({
                success: false,
                message: 'Name and item_description are required'
            });
        }

        await db.query(
            `UPDATE order_templates SET
                name = ?, description = ?, building = ?, cost_center_id = ?,
                item_description = ?, part_number = ?, category = ?,
                quantity = ?, priority = ?, notes = ?, equipment_id = ?, supplier_id = ?
             WHERE id = ?`,
            [
                name, description || null, building || null, cost_center_id || null,
                item_description, part_number || null, category || null,
                quantity || 1, priority || 'Normal', notes || null,
                equipment_id || null, supplier_id || null,
                id
            ]
        );

        res.json({
            success: true,
            message: 'Template updated successfully'
        });
    } catch (error) {
        console.error('Update template error:', error);
        res.status(500).json({ success: false, message: 'Failed to update template' });
    }
};

exports.deleteTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, id: userId } = req.user;

        const [existing] = await db.query(
            'SELECT created_by FROM order_templates WHERE id = ? AND active = 1',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }

        if (role !== 'admin' && existing[0].created_by !== userId) {
            return res.status(403).json({ success: false, message: 'Access denied. Only the owner or admin can delete this template.' });
        }

        // Soft delete
        await db.query('UPDATE order_templates SET active = 0 WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Template deleted successfully'
        });
    } catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete template' });
    }
};

exports.useTemplate = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { id } = req.params;

        // Get template
        const [templates] = await connection.query(
            'SELECT * FROM order_templates WHERE id = ? AND active = 1',
            [id]
        );

        if (templates.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Template not found' });
        }

        const template = templates[0];

        // Create order from template
        const [result] = await connection.query(
            `INSERT INTO orders (
                building, cost_center_id, item_description, part_number, category,
                quantity, priority, notes, equipment_id, supplier_id,
                requester_id, requester_name, requester_email, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New')`,
            [
                template.building, template.cost_center_id, template.item_description,
                template.part_number, template.category, template.quantity,
                template.priority, template.notes, template.equipment_id,
                template.supplier_id, req.user.id, req.user.name, req.user.email
            ]
        );

        // Increment use_count
        await connection.query(
            'UPDATE order_templates SET use_count = use_count + 1 WHERE id = ?',
            [id]
        );

        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'Order created from template',
            orderId: result.insertId,
            templateId: parseInt(id)
        });
    } catch (error) {
        await connection.rollback();
        console.error('Use template error:', error);
        res.status(500).json({ success: false, message: 'Failed to create order from template' });
    } finally {
        connection.release();
    }
};
