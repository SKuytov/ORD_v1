// backend/routes/analytics.js
const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// All analytics routes require authentication + admin/procurement/manager role
const ANALYTICS_ROLES = ['admin', 'procurement', 'manager'];
router.get('/summary', authenticateToken, authorizeRoles(...ANALYTICS_ROLES), analyticsController.getSummary);
router.get('/spend-over-time', authenticateToken, authorizeRoles(...ANALYTICS_ROLES), analyticsController.getSpendOverTime);
router.get('/spend-by-building', authenticateToken, authorizeRoles(...ANALYTICS_ROLES), analyticsController.getSpendByBuilding);
router.get('/spend-by-supplier', authenticateToken, authorizeRoles(...ANALYTICS_ROLES), analyticsController.getSpendBySupplier);
router.get('/spend-by-category', authenticateToken, authorizeRoles(...ANALYTICS_ROLES), analyticsController.getSpendByCategory);
router.get('/spend-by-cost-center', authenticateToken, authorizeRoles(...ANALYTICS_ROLES), analyticsController.getSpendByCostCenter);
router.get('/order-status-distribution', authenticateToken, authorizeRoles(...ANALYTICS_ROLES), analyticsController.getOrderStatusDistribution);
router.get('/supplier-performance', authenticateToken, authorizeRoles(...ANALYTICS_ROLES), analyticsController.getSupplierPerformance);
router.get('/monthly-orders-count', authenticateToken, authorizeRoles(...ANALYTICS_ROLES), analyticsController.getMonthlyOrdersCount);
router.get('/approval-stats', authenticateToken, authorizeRoles(...ANALYTICS_ROLES), analyticsController.getApprovalStats);
router.get('/top-parts', authenticateToken, authorizeRoles(...ANALYTICS_ROLES), analyticsController.getTopParts);
router.get('/drill-down', authenticateToken, authorizeRoles(...ANALYTICS_ROLES), analyticsController.getDrillDown);

// NEW routes
router.get('/delivery-time-distribution', authenticateToken, authorizeRoles(...ANALYTICS_ROLES), analyticsController.getDeliveryTimeDistribution);
router.get('/sla-breach', authenticateToken, authorizeRoles(...ANALYTICS_ROLES), analyticsController.getSLABreach);
router.get('/supplier-concentration', authenticateToken, authorizeRoles(...ANALYTICS_ROLES), analyticsController.getSupplierConcentration);
router.get('/ai-acceptance-rate', authenticateToken, authorizeRoles(...ANALYTICS_ROLES), analyticsController.getAIAcceptanceRate);
router.get('/recurring-items', authenticateToken, authorizeRoles(...ANALYTICS_ROLES), analyticsController.getRecurringItems);

module.exports = router;
