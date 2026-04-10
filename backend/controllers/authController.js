// backend/controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

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
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const user = users[0];

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Parse roles JSON
        let roles = [];
        if (user.roles) {
            try {
                roles = typeof user.roles === 'string' ? JSON.parse(user.roles) : user.roles;
            } catch (e) {
                roles = [];
            }
        }

        // Generate JWT token with extended fields
        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                roles: roles,
                building: user.building,
                is_super_admin: !!user.is_super_admin
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        // Update last_login_at
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
                roles: roles,
                building: user.building,
                is_super_admin: !!user.is_super_admin
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
            'SELECT id, username, name, email, role, roles, building, is_super_admin FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        // Parse roles JSON
        let roles = [];
        if (user.roles) {
            try {
                roles = typeof user.roles === 'string' ? JSON.parse(user.roles) : user.roles;
            } catch (e) {
                roles = [];
            }
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                role: user.role,
                roles: roles,
                building: user.building,
                is_super_admin: !!user.is_super_admin
            }
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
