// src/middlewares/authAdmin.js
// Middleware to authenticate admin JWTs (scope: "admin").

const { verifyJwt } = require('../lib/jwt');

function extractBearerToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

function hasScope(payload, requiredScope) {
  if (!payload) return false;

  const scope = payload.scope || payload.scopes;

  if (!scope) return false;

  if (Array.isArray(scope)) {
    return scope.includes(requiredScope);
  }

  if (typeof scope === 'string') {
    return scope.split(/\s+/).includes(requiredScope);
  }

  return false;
}

module.exports = function authAdmin(req, res, next) {
  const token = extractBearerToken(req);

  if (!token) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Missing or invalid Authorization header',
      details: {},
    });
  }

  try {
    const decoded = verifyJwt(token);

    if (!hasScope(decoded, 'admin')) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Admin scope required',
        details: {},
      });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(err.status || 401).json({
      code: err.code || 'INVALID_TOKEN',
      message: err.message || 'Invalid or expired token',
      details: err.details || {},
    });
  }
};
