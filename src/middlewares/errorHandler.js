// src/middlewares/errorHandler.js
// Centralized error handler to produce unified JSON error responses.
// Will be wired in later (Step 12).

module.exports = function errorHandler(err, req, res, next) {
  console.error(err); // TODO: structured logging, redaction

  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Internal server error';
  const details = err.details || {};

  res.status(status).json({ code, message, details });
};
