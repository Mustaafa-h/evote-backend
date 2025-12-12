// src/lib/jwt.js
// JWT helpers (HS256) for issuing and verifying tokens.

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('./config');

/**
 * Sign a JWT with HS256.
 *
 * @param {object} payload - Custom claims (e.g., { voterId, scopes: ['voter'] }).
 * @param {object} options - { expiresIn, subject, jwtid, scopes }
 *   - expiresIn: e.g. "15m", "1h" (defaults to "15m")
 *   - subject: will be put into "sub" claim
 *   - jwtid: optional; if not provided we generate a UUID
 *   - scopes: optional; if provided and payload has no scope, we'll set payload.scope = scopes
 */
function signJwt(payload = {}, options = {}) {
  const jwtId = options.jwtid || crypto.randomUUID();
  const subject = options.subject;
  const expiresIn = options.expiresIn || '15m';
  const scopes = options.scopes;

  const fullPayload = { ...payload };

  // If scopes provided and payload doesn't already define scope(s), attach them
  if (scopes && !fullPayload.scope && !fullPayload.scopes) {
    fullPayload.scope = scopes;
  }

  const token = jwt.sign(fullPayload, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn,
    jwtid: jwtId,
    subject,
  });

  return token;
}

/**
 * Verify a JWT (HS256).
 *
 * @param {string} token - The Bearer token string.
 * @returns {object} - Decoded payload + standard JWT claims.
 * @throws {Error} - With .code = 'INVALID_TOKEN' and .status = 401
 */
function verifyJwt(token) {
  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
    });
    return decoded;
  } catch (err) {
    const error = new Error('Invalid or expired token');
    error.code = 'INVALID_TOKEN';
    error.status = 401;
    error.details = {};
    throw error;
  }
}

// Small self-test if you run: node src/lib/jwt.js
if (require.main === module) {
  const demoToken = signJwt(
    { voterId: 'demo-voter', scopes: ['voter'] },
    { subject: 'demo-voter', expiresIn: '5m' }
  );

  console.log('Sample JWT:', demoToken);
  console.log('Decoded payload:', verifyJwt(demoToken));
}

module.exports = {
  signJwt,
  verifyJwt,
};
