// src/services/otpService.js
// OTP sending & verification logic (DEV STUB).
// In production you'd integrate with SMS/WhatsApp/email provider
// and store OTPs in a secure store or DB.

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory store: phoneHash -> { code, expiresAt }
const otpStore = new Map();

function generateOtpCode() {
  // 6-digit numeric code
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Generate + "send" OTP.
 * For dev we just log it to console.
 *
 * @param {string} phone - normalized phone string
 * @param {string} phoneHash - sha256(phone)
 * @returns {{ code: string, expiresAt: Date }}
 */
async function sendOtp(phone, phoneHash) {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  otpStore.set(phoneHash, { code, expiresAt });

  // DEV ONLY: log to console
  console.log(`[OTP] For phone ${phone}: ${code} (valid 5 minutes)`);

  return { code, expiresAt };
}

/**
 * Verify OTP code for a phone.
 *
 * @param {string} phone - normalized phone
 * @param {string} phoneHash
 * @param {string|number} code
 * @returns {Promise<boolean>} true if valid, false otherwise
 */
async function verifyOtp(phone, phoneHash, code) {
  const entry = otpStore.get(phoneHash);
  if (!entry) return false;

  const now = new Date();
  if (entry.expiresAt < now) {
    otpStore.delete(phoneHash);
    return false;
  }

  const expected = String(entry.code).trim();
  const provided = String(code || '').trim();

  if (expected !== provided) {
    return false;
  }

  // One-time use
  otpStore.delete(phoneHash);
  return true;
}

module.exports = {
  sendOtp,
  verifyOtp,
};
