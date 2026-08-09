const express = require('express');
const router = express.Router();
const buildingController = require('../controllers/buildingController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Everyone logged-in can read buildings (for dropdowns)
router.get('/',
    authenticateToken,
    buildingController.getBuildings
);

// Admin can manage buildings
router.post('/',
    authenticateToken,
    authorizeRoles('admin'),
    buildingController.createBuilding
);

router.put('/:id',
    authenticateToken,
    authorizeRoles('admin'),
    buildingController.updateBuilding
);

// ─── Building Managers ────────────────────────────────────────────────────────
const db = require('../config/database');

// GET /api/buildings/:id/managers
router.get('/:id/managers',
    authenticateToken,
    authorizeRoles('admin'),
    async (req, res) => {
        try {
            const [rows] = await db.query(`
                SELECT u.id, u.name, u.email, u.role
                FROM building_managers bm
                JOIN users u ON u.id = bm.user_id
                WHERE bm.building_id = ?
                ORDER BY u.name
            `, [req.params.id]);
            res.json({ success: true, managers: rows });
        } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    }
);

// POST /api/buildings/:id/managers  — body: { userId }
router.post('/:id/managers',
    authenticateToken,
    authorizeRoles('admin'),
    async (req, res) => {
        try {
            const { userId } = req.body;
            if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
            await db.query(
                'INSERT IGNORE INTO building_managers (building_id, user_id) VALUES (?, ?)',
                [req.params.id, userId]
            );
            res.json({ success: true });
        } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    }
);

// DELETE /api/buildings/:id/managers/:userId
router.delete('/:id/managers/:userId',
    authenticateToken,
    authorizeRoles('admin'),
    async (req, res) => {
        try {
            await db.query(
                'DELETE FROM building_managers WHERE building_id = ? AND user_id = ?',
                [req.params.id, req.params.userId]
            );
            res.json({ success: true });
        } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    }
);

module.exports = router;
