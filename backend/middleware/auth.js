// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authenticateToken = (req, res, next) => {
    // 1. Try Authorization header (standard)
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    // 2. Fallback: cookie (works when Cloudflare strips Authorization header)
    // Parse manually — no cookie-parser dependency needed
    if (!token) {
        const cookieHeader = req.headers['cookie'] || '';
        const match = cookieHeader.match(/(?:^|;\s*)pp_token=([^;]*)/);
        if (match) token = decodeURIComponent(match[1]);
    }

    // NOTE: query param fallback removed (security: JWT must not appear in URLs/logs)
    // Document viewing uses fetchDocAsDataUrl() with Authorization header instead.

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access token required'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256'],
        clockTolerance: 0,
        ignoreExpiration: false
    }, async (err, decoded) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Token expired',
                    code: 'TOKEN_EXPIRED'
                });
            }
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }
        try {
            // Authorization-critical fields come from the current database row, not
            // a potentially stale JWT claim. This also blocks deactivated users.
            const [[user]] = await db.query(
                `SELECT id, username, name, email, role, building
                 FROM users WHERE id = ? AND active = 1`,
                [decoded.id]
            );
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'User account is inactive or unavailable'
                });
            }
            req.user = { ...decoded, ...user };
            next();
        } catch (dbError) {
            console.error('Authentication user lookup failed:', dbError.message);
            return res.status(500).json({ success: false, message: 'Authentication failed' });
        }
    });
};

const authenticateHeaderToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !/^Bearer\s+\S+$/i.test(authHeader)) {
        return res.status(401).json({
            success: false,
            message: 'Authorization header required'
        });
    }
    return authenticateToken(req, res, next);
};

const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        next();
    };
};

module.exports = { authenticateToken, authenticateHeaderToken, authorizeRoles };
