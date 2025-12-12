// src/routes/ballotRoutes.js
// Ballot routes (GET /ballot).

const express = require('express');
const router = express.Router();

const ballotController = require('../controllers/ballotController');

// Public ballot endpoint
router.get('/', ballotController.getBallot);

module.exports = router;
