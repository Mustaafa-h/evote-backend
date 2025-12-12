// src/controllers/authController.js
// Handles registration, OTP, and voter login.

const crypto = require('crypto');
const { getDb } = require('../lib/mongo');
const { encodePII } = require('../lib/aesgcm');
const { hashPassword, verifyPassword } = require('../lib/password');
const { signJwt } = require('../lib/jwt');
const otpService = require('../services/otpService');

const OTP_WINDOW_MS = 60 * 60 * 1000; // 1 hour window per phoneHash
const OTP_MAX_PER_WINDOW = 10;        // Max 10 OTPs per hour per phoneHash

const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 min for lockout window
const LOGIN_MAX_FAILED = 5;             // Lock after 5 failed attempts

function hashPhone(phone) {
  return crypto.createHash('sha256').update(phone).digest('hex');
}

// ---------- POST /auth/otp/send ----------

async function sendOtp(req, res, next) {
  try {
    const { phone } = req.body || {};

    if (typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Phone is required',
        details: {},
      });
    }

    const normalizedPhone = phone.trim();
    const phoneHash = hashPhone(normalizedPhone);

    const db = getDb();
    const otpAttempts = db.collection('otp_attempts');
    const now = new Date();

    const existing = await otpAttempts.findOne({ phoneHash });

    if (existing && existing.windowEndsAt && existing.windowEndsAt > now) {
      if (existing.count >= OTP_MAX_PER_WINDOW) {
        return res.status(429).json({
          code: 'OTP_RATE_LIMITED',
          message:
            'Too many OTP requests for this phone. Please try again later.',
          details: {
            maxPerWindow: OTP_MAX_PER_WINDOW,
            windowMs: OTP_WINDOW_MS,
          },
        });
      }

      await otpAttempts.updateOne(
        { _id: existing._id },
        { $inc: { count: 1 } }
      );
    } else {
      const windowEndsAt = new Date(now.getTime() + OTP_WINDOW_MS);

      await otpAttempts.updateOne(
        { phoneHash },
        {
          $set: {
            phoneHash,
            count: 1,
            windowEndsAt,
            createdAt: now,
            meta: {},
          },
        },
        { upsert: true }
      );
    }

    // Generate + "send" OTP via stub service
    await otpService.sendOtp(normalizedPhone, phoneHash);

    return res.json({
      status: 'ok',
      message: 'OTP sent (stub). Check server logs for code in dev.',
    });
  } catch (err) {
    next(err);
  }
}

// ---------- POST /auth/register/verify-otp-and-create ----------

async function verifyOtpAndCreateVoter(req, res, next) {
  try {
    const { voterId, phone, otpCode, password } = req.body || {};

    if (
      typeof voterId !== 'string' ||
      !voterId.trim() ||
      typeof phone !== 'string' ||
      !phone.trim() ||
      typeof otpCode !== 'string' && typeof otpCode !== 'number' ||
      typeof password !== 'string' ||
      !password.trim()
    ) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'voterId, phone, otpCode, and password are required',
        details: {},
      });
    }

    const normalizedVoterId = voterId.trim();
    const normalizedPhone = phone.trim();
    const phoneHash = hashPhone(normalizedPhone);

    const otpValid = await otpService.verifyOtp(
      normalizedPhone,
      phoneHash,
      otpCode
    );

    if (!otpValid) {
      return res.status(400).json({
        code: 'INVALID_OTP',
        message: 'Invalid or expired OTP code',
        details: {},
      });
    }

    const db = getDb();
    const voters = db.collection('voters');

    const existing = await voters.findOne({ voterId: normalizedVoterId });
    if (existing) {
      return res.status(409).json({
        code: 'VOTER_ID_TAKEN',
        message: 'This voterId is already registered',
        details: {},
      });
    }

    const passwordHash = await hashPassword(password.trim());
    const phoneEnc = encodePII(normalizedPhone);
    const now = new Date();

    const voterDoc = {
      voterId: normalizedVoterId,
      phoneEnc, // { iv, data, tag }
      passwordHash,
      hasVoted: false,
      status: 'active', // after OTP verification
      createdAt: now,
      updatedAt: now,
      version: 1,
      meta: {},
    };

    await voters.insertOne(voterDoc);

    // Issue voter JWT
    const token = signJwt(
      {
        voterId: voterDoc.voterId,
        hasVoted: voterDoc.hasVoted,
        status: voterDoc.status,
        scope: ['voter'],
      },
      {
        subject: voterDoc.voterId,
        expiresIn: '1h',
      }
    );

    return res.status(201).json({
      token,
      voter: {
        voterId: voterDoc.voterId,
        hasVoted: voterDoc.hasVoted,
        status: voterDoc.status,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------- POST /auth/login ----------

async function login(req, res, next) {
  try {
    const { voterId, password } = req.body || {};

    if (
      typeof voterId !== 'string' ||
      !voterId.trim() ||
      typeof password !== 'string' ||
      !password.trim()
    ) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'voterId and password are required',
        details: {},
      });
    }

    const normalizedVoterId = voterId.trim();
    const db = getDb();
    const voters = db.collection('voters');
    const loginAttempts = db.collection('login_attempts');

    const now = new Date();

    // Check lockout
    const attemptDoc = await loginAttempts.findOne({
      voterId: normalizedVoterId,
    });

    if (
      attemptDoc &&
      attemptDoc.windowEndsAt &&
      attemptDoc.windowEndsAt > now &&
      attemptDoc.count >= LOGIN_MAX_FAILED
    ) {
      return res.status(423).json({
        code: 'ACCOUNT_LOCKED',
        message:
          'Too many failed login attempts. Please try again after the lockout window.',
        details: {
          maxFailedAttempts: LOGIN_MAX_FAILED,
          windowMs: LOGIN_WINDOW_MS,
        },
      });
    }

    const voter = await voters.findOne({ voterId: normalizedVoterId });

    if (!voter) {
      // Increment failed attempts for this voterId anyway (prevents enumeration)
      await recordLoginFailure(loginAttempts, normalizedVoterId, attemptDoc, now);

      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid voterId or password',
        details: {},
      });
    }

    if (voter.status !== 'active') {
      return res.status(403).json({
        code: 'VOTER_INACTIVE',
        message: 'Voter is not active',
        details: {
          status: voter.status,
        },
      });
    }

    const passwordOk = await verifyPassword(password.trim(), voter.passwordHash);
    if (!passwordOk) {
      await recordLoginFailure(loginAttempts, normalizedVoterId, attemptDoc, now);

      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid voterId or password',
        details: {},
      });
    }

    // Successful login: clear attempts
    await loginAttempts.deleteOne({ voterId: normalizedVoterId });

    // Issue voter JWT
    const token = signJwt(
      {
        voterId: voter.voterId,
        hasVoted: voter.hasVoted,
        status: voter.status,
        scope: ['voter'],
      },
      {
        subject: voter.voterId,
        expiresIn: '1h',
      }
    );

    return res.json({
      token,
      voter: {
        voterId: voter.voterId,
        hasVoted: voter.hasVoted,
        status: voter.status,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function recordLoginFailure(loginAttempts, voterId, attemptDoc, now) {
  if (
    !attemptDoc ||
    !attemptDoc.windowEndsAt ||
    attemptDoc.windowEndsAt <= now
  ) {
    const windowEndsAt = new Date(now.getTime() + LOGIN_WINDOW_MS);
    await loginAttempts.updateOne(
      { voterId },
      {
        $set: {
          voterId,
          count: 1,
          windowEndsAt,
          createdAt: now,
          meta: {},
        },
      },
      { upsert: true }
    );
  } else {
    await loginAttempts.updateOne(
      { voterId },
      { $inc: { count: 1 } }
    );
  }
}

// ---------- GET /me (Auth: voter) ----------

async function getMe(req, res, next) {
  try {
    const user = req.user || {};
    const voterId = user.voterId || user.sub; // sub fallback

    if (!voterId) {
      return res.status(400).json({
        code: 'BAD_TOKEN',
        message: 'Token is missing voterId',
        details: {},
      });
    }

    const db = getDb();
    const voters = db.collection('voters');

    const voter = await voters.findOne(
      { voterId },
      { projection: { _id: 0, voterId: 1, hasVoted: 1, status: 1 } }
    );

    if (!voter) {
      return res.status(404).json({
        code: 'VOTER_NOT_FOUND',
        message: 'Voter not found',
        details: {},
      });
    }

    return res.json(voter);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  sendOtp,
  verifyOtpAndCreateVoter,
  login,
  getMe,
};
