// src/lib/password.js
// Argon2id password hashing and verification helpers.

const argon2 = require('argon2');

/**
 * Hash a plaintext password using Argon2id.
 *
 * @param {string} plainPassword
 * @returns {Promise<string>} Argon2 hash string
 */
async function hashPassword(plainPassword) {
  if (typeof plainPassword !== 'string' || !plainPassword) {
    throw new Error('Password must be a non-empty string');
  }

  // Reasonable defaults for Argon2id.
  // You can tune these for production if needed.
  const hash = await argon2.hash(plainPassword, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16, // 64MB
    timeCost: 3,
    parallelism: 1,
  });

  return hash;
}

/**
 * Verify a plaintext password against an Argon2 hash.
 *
 * @param {string} plainPassword
 * @param {string} hash
 * @returns {Promise<boolean>} true if match, false otherwise
 */
async function verifyPassword(plainPassword, hash) {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, plainPassword);
  } catch (err) {
    // If hash is invalid/corrupted, treat as non-match.
    return false;
  }
}

// Small self-test if you run: node src/lib/password.js
if (require.main === module) {
  (async () => {
    const pw = 'My$ecretPass123';
    const hash = await hashPassword(pw);
    console.log('Hash:', hash);

    console.log('Verify correct:', await verifyPassword(pw, hash));
    console.log('Verify wrong:', await verifyPassword('oops', hash));
  })().catch(console.error);
}

module.exports = {
  hashPassword,
  verifyPassword,
};
