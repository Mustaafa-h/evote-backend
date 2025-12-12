// src/services/adminService.js
// Admin-related helpers (e.g., seeding initial admin).

const { getDb } = require('../lib/mongo');
const { hashPassword } = require('../lib/password');
const config = require('../lib/config');

/**
 * Ensure there is at least one admin user.
 * If no admins exist, create a default "superadmin" using ADMIN_INIT_PASSWORD.
 */
async function ensureInitialAdmin() {
  const db = getDb();
  const admins = db.collection('admins');

  const count = await admins.countDocuments({});
  if (count > 0) {
    return; // already have admins
  }

  const now = new Date();
  const passwordHash = await hashPassword(config.adminInitPassword);

  const adminDoc = {
    adminId: 'superadmin',
    passwordHash,
    role: 'superadmin',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    version: 1,
    meta: {},
  };

  await admins.insertOne(adminDoc);
  console.log(
    'Initial admin seeded: adminId="superadmin" using ADMIN_INIT_PASSWORD'
  );
}

module.exports = {
  ensureInitialAdmin,
};
