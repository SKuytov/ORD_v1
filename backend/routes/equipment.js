// backend/routes/equipment.js - Equipment/Machine Management API
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

router.use(authenticateToken);

// GET /api/equipment - Get all equipment
router.get('/', async (req, res) => {
    try {
        const { building, status } = req.query;
        let query = 'SELECT * FROM equipment WHERE active = 1';
        const params = [];

        if (building) {
            query += ' AND building_code = ?';
            params.push(building);
        }
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        query += ' ORDER BY criticality ASC, name ASC';
        const [equipment] = await db.query(query, params);
        res.json({ success: true, equipment });
    } catch (error) {
        console.error('Get equipment error:', error);
        res.json({ success: true, equipment: [] });
    }
});

// GET /api/equipment/:id - Get single equipment
router.get('/:id', async (req, res) => {
    try {
        const [[equipment]] = await db.query('SELECT * FROM equipment WHERE id = ?', [req.params.id]);
        if (!equipment) {
            return res.status(404).json({ success: false, message: 'Equipment not found' });
        }

        // Get related orders
        const [orders] = await db.query(
            `SELECT id, item_description, status, priority, created_at
             FROM orders WHERE equipment_id = ?
             ORDER BY created_at DESC LIMIT 20`,
            [req.params.id]
        );

        res.json({ success: true, equipment, related_orders: orders });
    } catch (error) {
        console.error('Get equipment error:', error);
        res.status(500).json({ success: false, message: 'Failed to load equipment' });
    }
});

// POST /api/equipment - Create equipment (admin only)
router.post('/', authorizeRoles('admin'), async (req, res) => {
    try {
        const { code, name, building_code, department, manufacturer, model, serial_number, install_date, status, criticality, notes } = req.body;

        if (!code || !name) {
            return res.status(400).json({ success: false, message: 'Code and name are required' });
        }

        const [result] = await db.query(
            `INSERT INTO equipment (code, name, building_code, department, manufacturer, model, serial_number, install_date, status, criticality, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [code, name, building_code || null, department || null, manufacturer || null, model || null, serial_number || null, install_date || null, status || 'operational', criticality || 'medium', notes || null]
        );

        res.status(201).json({ success: true, id: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Equipment code already exists' });
        }
        console.error('Create equipment error:', error);
        res.status(500).json({ success: false, message: 'Failed to create equipment' });
    }
});

// PUT /api/equipment/:id - Update equipment (admin only)
router.put('/:id', authorizeRoles('admin'), async (req, res) => {
    try {
        const { name, building_code, department, manufacturer, model, serial_number, install_date, status, criticality, notes, active } = req.body;

        await db.query(
            `UPDATE equipment SET name=?, building_code=?, department=?, manufacturer=?, model=?, serial_number=?, install_date=?, status=?, criticality=?, notes=?, active=?
             WHERE id=?`,
            [name, building_code || null, department || null, manufacturer || null, model || null, serial_number || null, install_date || null, status || 'operational', criticality || 'medium', notes || null, active !== undefined ? active : 1, req.params.id]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Update equipment error:', error);
        res.status(500).json({ success: false, message: 'Failed to update equipment' });
    }
});

module.exports = router;
