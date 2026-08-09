// backend/middleware/buildingManagerMiddleware.js
//
// Enriches req.user with building manager information.
// Must be applied AFTER the JWT auth middleware (authenticateToken).
//
// Usage in routes:
//   const { enrichBuildingManager } = require('../middleware/buildingManagerMiddleware');
//   router.use(enrichBuildingManager);
//
// After this middleware runs, req.user will have:
//   req.user.isBuildingManager  {boolean}
//   req.user.managedBuilding    {string|null}  e.g. 'CT', 'WW', 'CBP'
//   req.user.managedBuildingId  {number|null}

'use strict';

const db = require('../config/database');

/**
 * Cache to avoid DB hit on every request for the same user.
 * TTL: 5 minutes. Simple in-process map — fine for single-process PM2.
 */
const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function enrichBuildingManager(req, res, next) {
    // Only enrich requesters — admins/procurement/managers are never building managers
    if (!req.user || req.user.role !== 'requester') {
        if (req.user) {
            req.user.isBuildingManager = false;
            req.user.managedBuilding   = null;
            req.user.managedBuildingId = null;
        }
        return next();
    }

    const userId = req.user.id;
    const cached = _cache.get(userId);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
        req.user.isBuildingManager = cached.isBuildingManager;
        req.user.managedBuilding   = cached.managedBuilding;
        req.user.managedBuildingId = cached.managedBuildingId;
        return next();
    }

    try {
        const [rows] = await db.query(
            `SELECT bm.building_id, b.code as building_code
             FROM building_managers bm
             JOIN buildings b ON bm.building_id = b.id
             WHERE bm.user_id = ?
             LIMIT 1`,
            [userId]
        );

        const info = rows.length > 0
            ? { isBuildingManager: true,  managedBuilding: rows[0].building_code, managedBuildingId: rows[0].building_id }
            : { isBuildingManager: false, managedBuilding: null,                  managedBuildingId: null };

        _cache.set(userId, { ...info, ts: Date.now() });

        req.user.isBuildingManager = info.isBuildingManager;
        req.user.managedBuilding   = info.managedBuilding;
        req.user.managedBuildingId = info.managedBuildingId;
    } catch (err) {
        console.error('[BuildingManagerMiddleware] DB error:', err.message);
        req.user.isBuildingManager = false;
        req.user.managedBuilding   = null;
        req.user.managedBuildingId = null;
    }

    next();
}

/**
 * Invalidate cache for a user (call when building_managers table changes).
 */
function invalidateBuildingManagerCache(userId) {
    if (userId) {
        _cache.delete(userId);
    } else {
        _cache.clear();
    }
}

module.exports = { enrichBuildingManager, invalidateBuildingManagerCache };
