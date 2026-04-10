// backend/server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
require('dotenv').config();

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
const procurementRoutes = require('./routes/procurement'); // ⭐ v3.0 Procurement Lifecycle
const analyticsRoutes = require('./routes/analytics');
const templateRoutes = require('./routes/templates');
const notificationsRoutes = require('./routes/notifications');
const auditLogRoutes = require('./routes/auditLog');
const partsCatalogRoutes = require('./routes/partsCatalog');
const supplierScorecardRoutes = require('./routes/supplierScorecard');
const duplicateDetectionRoutes = require('./routes/duplicateDetection');
const savedFiltersRoutes = require('./routes/savedFilters');
const equipmentRoutes = require('./routes/equipment');
const commentsRoutes = require('./routes/comments');

// Phase 2 routes
const claimRoutes = require('./routes/claims');
const rfqRoutes = require('./routes/rfq');
const cadRoutes = require('./routes/cad');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// Static files - uploads served with original names
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '../frontend')));

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
app.use('/api/autocomplete', autocompleteRoutes); // ⭐ Intelligent autocomplete
app.use('/api/test', testRoutes);
app.use('/api/procurement', procurementRoutes); // ⭐ v3.0 Procurement Lifecycle
app.use('/api/analytics', analyticsRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/audit-log', auditLogRoutes);
app.use('/api/parts-catalog', partsCatalogRoutes);
app.use('/api/supplier-scorecard', supplierScorecardRoutes);
app.use('/api/duplicate-check', duplicateDetectionRoutes);
app.use('/api/saved-filters', savedFiltersRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/comments', commentsRoutes);

// Phase 2: Order Claiming, RFQ, CAD Workflow
app.use('/api/orders', claimRoutes);
app.use('/api/procurement', rfqRoutes);
app.use('/api/cad', cadRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        version: '3.1.0' // v3.1: Phase 1+2 World-Class Upgrade
    });
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

app.listen(PORT, () => {
    console.log(`PartPulse Orders Server v3.1.0 running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Frontend URL: ${process.env.FRONTEND_URL}`);
    console.log(`Features: Procurement Lifecycle + Smart Quote Send + Smart Autocomplete + Document Management + Approvals + Phase 2 (Super Admin, User Mgmt, Order Claiming, RFQ, CAD Workflow)`);
});

module.exports = app;
