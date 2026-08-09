// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// Brute-force protection: max 10 login attempts per IP per 15 minutes
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
    skipSuccessfulRequests: true // don't count successful logins against the limit
});

// Login route
router.post('/login', loginLimiter, authController.login);

// Verify token route
router.get('/verify', authenticateToken, authController.verify);

// Logout route
router.post('/logout', authenticateToken, authController.logout);

module.exports = router;
