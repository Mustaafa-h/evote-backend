// src/middlewares/rateLimiters.js
// Basic rate limiters for OTP and login endpoints.
// NOTE: These are IP-based. We'll also enforce per-phone/per-voter limits
// using MongoDB collections (otp_attempts, login_attempts) in later steps.

const rateLimit = require('express-rate-limit');

const otpRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3,              // 3 OTP sends per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    res.status(429).json({
      code: 'RATE_LIMITED',
      message: 'Too many OTP requests. Please wait a bit before trying again.',
      details: {
        windowMs: options.windowMs,
        max: options.max,
      },
    });
  },
});

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 login attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    res.status(429).json({
      code: 'RATE_LIMITED',
      message: 'Too many login attempts. Please try again later.',
      details: {
        windowMs: options.windowMs,
        max: options.max,
      },
    });
  },
});

module.exports = {
  otpRateLimiter,
  loginRateLimiter,
};
