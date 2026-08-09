// backend/controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Helper: extract real client IP (handles Cloudflare/proxy)
function getClientIp(req) {
    return req.headers['cf-connecting-ip']
        || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.socket?.remoteAddress
        || null;
}

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password required'
            });
        }

        // Get user from database
        const [users] = await db.query(
            'SELECT * FROM users WHERE username = ? AND active = 1',
            [username]
        );

        if (users.length === 0) {
            // Audit: log failed login — unknown user
            await db.query(
                `INSERT INTO user_login_log (username, success, failure_reason, ip_address, user_agent, logged_at)
                 VALUES (?, 0, 'user_not_found', ?, ?, NOW())`,
                [username, getClientIp(req), req.headers['user-agent'] || null]
            ).catch(() => {}); // non-blocking, never crash login on log failure
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const user = users[0];

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            // Audit: log failed login — wrong password
            await db.query(
                `INSERT INTO user_login_log (user_id, username, name, role, building, success, failure_reason, ip_address, user_agent, logged_at)
                 VALUES (?, ?, ?, ?, ?, 0, 'invalid_password', ?, ?, NOW())`,
                [user.id, user.username, user.name, user.role, user.building, getClientIp(req), req.headers['user-agent'] || null]
            ).catch(() => {});
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                id: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                role: user.role,
                building: user.building
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        // Audit: log successful login + update last_login_at
        await db.query(
            `INSERT INTO user_login_log (user_id, username, name, role, building, success, ip_address, user_agent, logged_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, NOW())`,
            [user.id, user.username, user.name, user.role, user.building, getClientIp(req), req.headers['user-agent'] || null]
        ).catch(() => {});
        await db.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]).catch(() => {});

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                role: user.role,
                building: user.building
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed'
        });
    }
};

exports.verify = async (req, res) => {
    try {
        const [users] = await db.query(
            'SELECT id, username, name, email, role, building FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            user: users[0]
        });

    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({
            success: false,
            message: 'Verification failed'
        });
    }
};

exports.logout = (req, res) => {
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
};
