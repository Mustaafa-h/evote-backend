// src/middlewares/requestLogger.js
// Simple request logger with basic redaction (no bodies, no auth headers).

module.exports = function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    // Minimal, structured log line
    const log = {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      ip: req.ip,
    };

    // In a real app, you'd send this to a logger; for now console.log is fine
    console.log(JSON.stringify(log));
  });

  next();
};
