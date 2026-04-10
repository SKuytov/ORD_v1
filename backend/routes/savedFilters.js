// backend/routes/savedFilters.js - Saved Filter Presets API
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// GET /api/saved-filters - Get user's saved filters
router.get('/', async (req, res) => {
    try {
        const [filters] = await db.query(
            `SELECT * FROM saved_filters
             WHERE user_id = ?
             ORDER BY is_default DESC, name ASC`,
            [req.user.id]
        );
        res.json({ success: true, filters });
    } catch (error) {
        console.error('Get saved filters error:', error);
        res.json({ success: true, filters: [] });
    }
});

// POST /api/saved-filters - Create saved filter
router.post('/', async (req, res) => {
    try {
        const { name, filter_config, is_default } = req.body;
        if (!name || !filter_config) {
            return res.status(400).json({ success: false, message: 'Name and filter config required' });
        }

        // If setting as default, unset existing default
        if (is_default) {
            await db.query(
                'UPDATE saved_filters SET is_default = 0 WHERE user_id = ?',
                [req.user.id]
            );
        }

        const [result] = await db.query(
            `INSERT INTO saved_filters (user_id, name, filter_config, is_default)
             VALUES (?, ?, ?, ?)`,
            [req.user.id, name, JSON.stringify(filter_config), is_default ? 1 : 0]
        );

        res.status(201).json({
            success: true,
            filter: {
                id: result.insertId,
                name,
                filter_config,
                is_default: !!is_default
            }
        });
    } catch (error) {
        console.error('Save filter error:', error);
        res.status(500).json({ success: false, message: 'Failed to save filter' });
    }
});

// DELETE /api/saved-filters/:id - Delete saved filter
router.delete('/:id', async (req, res) => {
    try {
        await db.query(
            'DELETE FROM saved_filters WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Delete filter error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete filter' });
    }
});

module.exports = router;
