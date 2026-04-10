// backend/middleware/auth.js
const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

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
    }, (err, decoded) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Token expired',
                    code: 'TOKEN_EXPIRED'
                });
            }
            return res.status(403).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }
        req.user = decoded;
        next();
    });
};

const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        // Super admin can do everything any role can do
        if (req.user.is_super_admin) {
            return next();
        }
        // Check primary role
        if (roles.includes(req.user.role)) {
            return next();
        }
        // Check multi-roles array
        if (req.user.roles && Array.isArray(req.user.roles)) {
            const hasRole = roles.some(r => req.user.roles.includes(r));
            if (hasRole) return next();
        }
        return res.status(403).json({
            success: false,
            message: 'Access denied'
        });
    };
};

/**
 * Middleware: require Super Admin.
 * Only passes if req.user.is_super_admin === true.
 */
const requireSuperAdmin = (req, res, next) => {
    if (!req.user || !req.user.is_super_admin) {
        return res.status(403).json({
            success: false,
            message: 'Super Admin access required'
        });
    }
    next();
};

/**
 * Helper: check if user has a specific role (checks primary role + roles array + super_admin).
 */
function userHasRole(user, role) {
    if (!user) return false;
    if (user.is_super_admin) return true;
    if (user.role === role) return true;
    if (user.roles && Array.isArray(user.roles) && user.roles.includes(role)) return true;
    return false;
}

module.exports = { authenticateToken, authorizeRoles, requireSuperAdmin, userHasRole };
