// src/routes/voteRoutes.js
// Voting routes (issue token, submit vote).

const express = require('express');
const router = express.Router();

const voteController = require('../controllers/voteController');
const authVoter = require('../middlewares/authVoter');

// Issue a single-use voting token
router.post('/issue-token', authVoter, voteController.issueToken);

// Submit vote (transaction)
router.post('/submit', authVoter, voteController.submitVote);

module.exports = router;
