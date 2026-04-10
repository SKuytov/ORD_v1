const db = require('../config/database');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Helper to generate a random strong-ish password
function generatePassword(length = 10) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@#$%^&*';
    let pwd = '';
    for (let i = 0; i < length; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
}

exports.listUsers = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, username, name, email, role, roles, building, active,
                    is_super_admin, last_login_at, created_at, updated_at
             FROM users ORDER BY id`
        );
        // Parse roles JSON for each user
        rows.forEach(u => {
            if (u.roles && typeof u.roles === 'string') {
                try { u.roles = JSON.parse(u.roles); } catch (e) { u.roles = []; }
            }
            u.roles = u.roles || [];
        });
        res.json({ success: true, users: rows });
    } catch (err) {
        console.error('listUsers error:', err);
        res.status(500).json({ success: false, message: 'Failed to load users' });
    }
};

exports.createUser = async (req, res) => {
    try {
        const { username, name, email, role, building, active = 1, password } = req.body;

        if (!username || !name || !email || !role) {
            return res.status(400).json({ success: false, message: 'Username, name, email and role are required' });
        }

        // Use provided password if present, otherwise generate one
        const plainPassword = password && password.trim().length >= 6
            ? password.trim()
            : generatePassword(10);

        const passwordHash = await bcrypt.hash(plainPassword, 10);

        const [result] = await db.query(
            'INSERT INTO users (username, password_hash, name, email, role, building, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [username, passwordHash, name, email, role, building || null, active ? 1 : 0]
        );

        const [rows] = await db.query(
            'SELECT id, username, name, email, role, roles, building, active, is_super_admin, created_at, updated_at FROM users WHERE id = ?',
            [result.insertId]
        );

        res.json({
            success: true,
            user: rows[0],
            password: plainPassword // returned so admin can share it with the user
        });
    } catch (err) {
        console.error('createUser error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Username or email already exists' });
        }
        res.status(500).json({ success: false, message: 'Failed to create user' });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const { username, name, email, role, building, active } = req.body;

        const [existingRows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (existingRows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = existingRows[0];

        const newUsername = username || user.username;
        const newName = name || user.name;
        const newEmail = email || user.email;
        const newRole = role || user.role;
        const newBuilding = building !== undefined ? building : user.building;
        const newActive = active !== undefined ? (active ? 1 : 0) : user.active;

        await db.query(
            'UPDATE users SET username = ?, name = ?, email = ?, role = ?, building = ?, active = ? WHERE id = ?',
            [newUsername, newName, newEmail, newRole, newBuilding, newActive, userId]
        );

        const [rows] = await db.query(
            'SELECT id, username, name, email, role, roles, building, active, is_super_admin, created_at, updated_at FROM users WHERE id = ?',
            [userId]
        );

        res.json({ success: true, user: rows[0] });
    } catch (err) {
        console.error('updateUser error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Username or email already exists' });
        }
        res.status(500).json({ success: false, message: 'Failed to update user' });
    }
};

/**
 * Update roles for a user (Super Admin only).
 * POST /admin/users/:id/roles
 * Body: { roles: ["procurement", "cad_designer", ...] }
 */
exports.updateUserRoles = async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const { roles } = req.body;

        if (!Array.isArray(roles)) {
            return res.status(400).json({ success: false, message: 'roles must be an array' });
        }

        const validRoles = ['procurement', 'cad_designer', 'manager', 'admin', 'requester'];
        const filtered = roles.filter(r => validRoles.includes(r));

        const [existingRows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (existingRows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = existingRows[0];

        // Cannot demote super admin
        if (user.is_super_admin && req.user.id !== userId) {
            return res.status(403).json({ success: false, message: 'Cannot modify Super Admin roles' });
        }

        // Determine primary role (first admin if present, else first in list, else current)
        let primaryRole = user.role;
        if (filtered.includes('admin')) {
            primaryRole = 'admin';
        } else if (filtered.length > 0) {
            primaryRole = filtered[0];
        }

        await db.query(
            'UPDATE users SET roles = ?, role = ? WHERE id = ?',
            [JSON.stringify(filtered), primaryRole, userId]
        );

        const [rows] = await db.query(
            'SELECT id, username, name, email, role, roles, building, active, is_super_admin, last_login_at, created_at, updated_at FROM users WHERE id = ?',
            [userId]
        );

        const updatedUser = rows[0];
        if (updatedUser.roles && typeof updatedUser.roles === 'string') {
            try { updatedUser.roles = JSON.parse(updatedUser.roles); } catch (e) { updatedUser.roles = []; }
        }

        res.json({ success: true, user: updatedUser });
    } catch (err) {
        console.error('updateUserRoles error:', err);
        res.status(500).json({ success: false, message: 'Failed to update user roles' });
    }
};

/**
 * Deactivate a user (soft-delete).
 * POST /admin/users/:id/deactivate
 */
exports.deactivateUser = async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);

        const [existingRows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (existingRows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Cannot deactivate super admin
        if (existingRows[0].is_super_admin) {
            return res.status(403).json({ success: false, message: 'Cannot deactivate Super Admin' });
        }

        await db.query('UPDATE users SET active = 0 WHERE id = ?', [userId]);

        res.json({ success: true, message: 'User deactivated' });
    } catch (err) {
        console.error('deactivateUser error:', err);
        res.status(500).json({ success: false, message: 'Failed to deactivate user' });
    }
};

/**
 * Reactivate a user.
 * POST /admin/users/:id/activate
 */
exports.activateUser = async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        await db.query('UPDATE users SET active = 1 WHERE id = ?', [userId]);
        res.json({ success: true, message: 'User activated' });
    } catch (err) {
        console.error('activateUser error:', err);
        res.status(500).json({ success: false, message: 'Failed to activate user' });
    }
};

/**
 * Generate invite link for a new user.
 * POST /admin/users/invite
 * Body: { email, name, role }
 */
exports.generateInvite = async (req, res) => {
    try {
        const { email, name, role } = req.body;

        if (!email || !name) {
            return res.status(400).json({ success: false, message: 'Email and name are required' });
        }

        const inviteToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        // Generate a temporary username from email
        const tempUsername = email.split('@')[0] + '_' + Date.now().toString(36);
        const tempPassword = generatePassword(12);
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        const [result] = await db.query(
            `INSERT INTO users (username, password_hash, name, email, role, active, invite_token, invite_expires_at)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
            [tempUsername, passwordHash, name, email, role || 'requester', inviteToken, expiresAt]
        );

        const inviteLink = `/invite?token=${inviteToken}`;

        res.json({
            success: true,
            invite_token: inviteToken,
            invite_link: inviteLink,
            expires_at: expiresAt,
            temp_password: tempPassword,
            user_id: result.insertId
        });
    } catch (err) {
        console.error('generateInvite error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }
        res.status(500).json({ success: false, message: 'Failed to generate invite' });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const { password } = req.body || {};

        if (!password || password.trim().length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const [existingRows] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (existingRows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const plainPassword = password.trim();
        const passwordHash = await bcrypt.hash(plainPassword, 10);

        await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);

        res.json({ success: true });
    } catch (err) {
        console.error('resetPassword error:', err);
        res.status(500).json({ success: false, message: 'Failed to reset password' });
    }
};
