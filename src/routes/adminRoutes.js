// src/routes/adminRoutes.js
// Admin routes: login, open/close election, totals, finalize.

const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const authAdmin = require('../middlewares/authAdmin');

// Public: admin login
router.post('/login', adminController.adminLogin);

// Protected: election management
router.post('/open', authAdmin, adminController.openElection);
router.post('/close', authAdmin, adminController.closeElection);

router.get('/totals', authAdmin, adminController.getTotals);
router.post('/finalize', authAdmin, adminController.finalizeElection);

module.exports = router;
