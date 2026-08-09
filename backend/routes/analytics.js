// backend/routes/analytics.js
const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { scopeManagerToBuildings } = require('../middleware/authz');

// All analytics routes require authentication + admin/procurement/manager role
const ANALYTICS_ROLES = ['admin', 'procurement', 'manager'];
router.use(authenticateToken, authorizeRoles(...ANALYTICS_ROLES), scopeManagerToBuildings);
router.get('/summary', analyticsController.getSummary);
router.get('/spend-over-time', analyticsController.getSpendOverTime);
router.get('/spend-by-building', analyticsController.getSpendByBuilding);
router.get('/spend-by-supplier', analyticsController.getSpendBySupplier);
router.get('/spend-by-category', analyticsController.getSpendByCategory);
router.get('/spend-by-cost-center', analyticsController.getSpendByCostCenter);
router.get('/order-status-distribution', analyticsController.getOrderStatusDistribution);
router.get('/supplier-performance', analyticsController.getSupplierPerformance);
router.get('/monthly-orders-count', analyticsController.getMonthlyOrdersCount);
router.get('/approval-stats', analyticsController.getApprovalStats);
router.get('/top-parts', analyticsController.getTopParts);
router.get('/drill-down', analyticsController.getDrillDown);

// NEW routes
router.get('/delivery-time-distribution', analyticsController.getDeliveryTimeDistribution);
router.get('/sla-breach', analyticsController.getSLABreach);
router.get('/supplier-concentration', analyticsController.getSupplierConcentration);
router.get('/ai-acceptance-rate', analyticsController.getAIAcceptanceRate);
router.get('/recurring-items', analyticsController.getRecurringItems);

module.exports = router;
