// src/lib/aesgcm.js
// AES-256-GCM helpers for encrypting/decrypting PII (e.g., phone).

const crypto = require('crypto');
const config = require('./config');

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM

// Decode the base64 key from config (already validated to be 32 bytes)
const key = Buffer.from(config.aesGcmKeyBase64, 'base64');

/**
 * Encrypt a UTF-8 string using AES-256-GCM.
 *
 * @param {string|null|undefined} str
 * @returns {{iv: string, data: string, tag: string} | null}
 */
function encodePII(str) {
  if (str == null) return null; // keep null/undefined as null

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(str, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    data: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypt an AES-256-GCM payload back into a UTF-8 string.
 *
 * @param {{iv: string, data: string, tag: string} | null} obj
 * @returns {string|null}
 */
function decodePII(obj) {
  if (!obj) return null;

  const iv = Buffer.from(obj.iv, 'base64');
  const encrypted = Buffer.from(obj.data, 'base64');
  const tag = Buffer.from(obj.tag, 'base64');

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

// Small self-test if you run: node src/lib/aesgcm.js
if (require.main === module) {
  const original = '+9647701234567';
  const enc = encodePII(original);
  console.log('Encrypted object:', enc);

  const dec = decodePII(enc);
  console.log('Decrypted value:', dec);
}

module.exports = {
  encodePII,
  decodePII,
};
