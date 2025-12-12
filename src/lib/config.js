// src/lib/config.js
// Central config loader + environment validation.

require('dotenv').config();  // 🔴 add this line

const crypto = require('crypto');

function requireEnv(name, options = {}) {
  const value = process.env[name];

  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  if (options.allowed && !options.allowed.includes(value)) {
    throw new Error(
      `Invalid value for ${name}. Allowed: ${options.allowed.join(', ')}`
    );
  }

  return value;
}

// Validate and build config at module load time.
// If anything is wrong, the app will crash early with a clear message.

const config = (() => {
  // Required basics
  const port = parseInt(process.env.PORT || '3000', 10);

  if (Number.isNaN(port)) {
    throw new Error('PORT must be a valid number');
  }

  const mongoUri = requireEnv('MONGO_URI');
  const jwtSecret = requireEnv('JWT_SECRET');
  const aesGcmKeyBase64 = requireEnv('AES_GCM_KEY');
  const electionId = process.env.ELECTION_ID || 'default';
  const adminInitPassword = requireEnv('ADMIN_INIT_PASSWORD');

  // Optional: CORS origins allowlist (comma-separated)
  // Example: CORS_ORIGINS=http://localhost:3000,http://localhost:5173
  const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Validate AES_GCM_KEY length (should be 32 bytes when decoded)
  let aesGcmKeyBuffer;
  try {
    aesGcmKeyBuffer = Buffer.from(aesGcmKeyBase64, 'base64');
  } catch (err) {
    throw new Error('AES_GCM_KEY must be valid base64');
  }

  if (aesGcmKeyBuffer.length !== 32) {
    throw new Error(
      `AES_GCM_KEY must decode to 32 bytes (got ${aesGcmKeyBuffer.length})`
    );
  }

  return {
    port,
    mongoUri,
    jwtSecret,
    aesGcmKeyBase64,
    electionId,
    adminInitPassword,
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigins,
  };
})();


module.exports = config;
