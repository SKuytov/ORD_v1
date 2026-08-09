// backend/server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const db = require('./config/database');

const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const orderAssignmentRoutes = require('./routes/orderAssignments');
const supplierRoutes = require('./routes/suppliers');
const quoteRoutes = require('./routes/quotes');
const quoteEmailRoutes = require('./routes/quoteEmail'); // ⭐ Smart Quote Send
const userRoutes = require('./routes/users');
const buildingRoutes = require('./routes/buildings');
const costCenterRoutes = require('./routes/costCenters');
const documentsRoutes = require('./routes/documents');
const approvalsRoutes = require('./routes/approvals');
const autocompleteRoutes = require('./routes/autocomplete');
const testRoutes = require('./routes/test');
const analyticsRoutes = require('./routes/analytics');
const procurementRoutes = require('./routes/procurement'); // ⭐ PO + Quote Responses + Invoices
const accountingRoutes = require('./routes/accounting');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://www.googletagmanager.com", "https://www.google-analytics.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://raw.githubusercontent.com"],
            imgSrc: ["'self'", "data:", "blob:", "https://partpulse.eu"],
            connectSrc: ["'self'", "https://www.google-analytics.com"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));
app.use(cors({
    origin: (process.env.FRONTEND_URL || false).split ? (process.env.FRONTEND_URL || '').split(',').filter(Boolean) : false,
    credentials: true
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());
app.use((req, res, next) => {
    req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
    res.setHeader('X-Request-ID', req.requestId);
    next();
});

// The existing route middleware verifies JWT signatures. This lightweight
// state check is deliberately mounted before every API router so revocation,
// role/building changes, and disabled accounts take effect across both PM2
// workers without editing that shared middleware. Public endpoints remain
// available without an Authorization header.
async function getTokenState(userId) {
    try {
        const [rows] = await db.query(
            'SELECT id, role, building, active, token_version FROM users WHERE id=?',
            [userId]
        );
        return { user: rows[0] || null, tokenVersionSupported: true };
    } catch (error) {
        if (error.code !== 'ER_BAD_FIELD_ERROR' && !/token_version/i.test(error.message || '')) throw error;
        const [rows] = await db.query(
            'SELECT id, role, building, active FROM users WHERE id=?',
            [userId]
        );
        return { user: rows[0] || null, tokenVersionSupported: false };
    }
}
app.use('/api', async (req, res, next) => {
    if (req.path === '/health' || req.path === '/auth/login') return next();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return next();
    try {
        const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
        const { user, tokenVersionSupported } = await getTokenState(payload.id);
        const stale = !user || !user.active ||
            user.role !== payload.role ||
            (user.building || null) !== (payload.building || null) ||
            (tokenVersionSupported && Number(payload.tokenVersion) !== Number(user.token_version || 0));
        if (stale) return res.status(401).json({ success: false, message: 'Session is no longer valid', requestId: req.requestId });
        next();
    } catch (error) {
        // Signature failures are handled consistently by the existing route
        // middleware. Database failures should not silently bypass revocation.
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') return next();
        console.error(`[${req.requestId}] token state check failed:`, error.stack || error);
        res.status(503).json({ success: false, message: 'Authentication service unavailable', requestId: req.requestId });
    }
});

// Uploaded documents are NOT served statically. Invoices, quotes, delivery
// notes and customs declarations are only reachable through the authenticated
// streaming routes in routes/documents.js, which check the caller's role and
// their relationship to the order. The matching Nginx `location /uploads`
// alias must be removed too, or it will keep serving these files directly.
app.use(express.static(path.join(__dirname, '../frontend'), { dotfiles: 'deny' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/order-assignments', orderAssignmentRoutes); // ⭐ Assignment system
app.use('/api/suppliers', supplierRoutes);
app.use('/api/quotes', quoteEmailRoutes); // ⭐ Smart Quote Send (must be before quoteRoutes)
app.use('/api/quotes', quoteRoutes);
app.use('/api/users', userRoutes);
app.use('/api/buildings', buildingRoutes);
app.use('/api/cost-centers', costCenterRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/approvals', approvalsRoutes);
app.use('/api/autocomplete', autocompleteRoutes); // ⭐ NEW: Intelligent autocomplete
app.use('/api/test', testRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/procurement', procurementRoutes); // ⭐ PO creation, supplier responses, invoices
app.use('/api/accounting', accountingRoutes);

// Health check: PM2/load balancers must only receive OK after MySQL responds.
app.get('/api/health', async (req, res) => {
    let timer;
    try {
        await Promise.race([
            db.query('SELECT 1 AS ok'),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('database health timeout')), 2_000);
            }),
        ]);
        res.json({ success: true, status: 'OK', timestamp: new Date().toISOString(), environment: process.env.NODE_ENV, version: '2.6.0' });
    } catch (error) {
        console.error('[Health] database check failed:', error.message);
        res.status(503).json({ success: false, status: 'UNAVAILABLE', message: 'Service temporarily unavailable' });
    } finally {
        clearTimeout(timer);
    }
});

// Serve frontend.
//
// The catch-all must never answer for API or upload paths. Before this guard a
// mistyped endpoint returned index.html with status 200, so the client tried to
// JSON.parse a page of HTML and reported a confusing parse error instead of a
// 404. Uploads are equally important: they are served only by the authenticated
// routes in routes/documents.js, and a 200 here made it look as though a public
// upload directory still existed.
app.use('/api', (req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint not found' });
});

app.use('/uploads', (req, res) => {
    res.status(404).json({ success: false, message: 'Not found' });
});

app.get('*', (req, res) => {
    if (path.basename(req.path).startsWith('.')) {
        return res.status(404).json({ success: false, message: 'Not found' });
    }
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handling: never expose driver messages, SQL, or stack traces.
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const requestId = req.requestId || crypto.randomUUID();
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
    console.error(`[${requestId}] ${req.method} ${req.originalUrl}:`, err.stack || err);
    res.status(status).json({ success: false, message: status === 500 ? 'Internal server error' : (err.publicMessage || 'Request could not be completed'), requestId });
});

const server = app.listen(PORT, () => {
    console.log(`PartPulse Orders Server v2.6.0 running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
});

let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received; draining in-flight requests`);
    const forceTimer = setTimeout(() => {
        console.error('Graceful shutdown timed out; forcing process exit');
        process.exit(1);
    }, 30_000).unref();
    server.close(async error => {
        try { await db.end(); }
        catch (dbError) { console.error('Database pool close failed:', dbError.message); }
        clearTimeout(forceTimer);
        if (error) { console.error('HTTP server close failed:', error.message); process.exitCode = 1; }
        process.exit();
    });
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
