// src/routes/authRoutes.js
// Auth & registration routes.

const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const {
  otpRateLimiter,
  loginRateLimiter,
} = require('../middlewares/rateLimiters');

// POST /auth/otp/send
router.post('/otp/send', otpRateLimiter, authController.sendOtp);

// POST /auth/register/verify-otp-and-create
router.post(
  '/register/verify-otp-and-create',
  authController.verifyOtpAndCreateVoter
);

// POST /auth/login
router.post('/login', loginRateLimiter, authController.login);

module.exports = router;
