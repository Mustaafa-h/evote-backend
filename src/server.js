// src/server.js
// Entry point for the e-voting backend (Express app)

require('dotenv').config(); // Load .env first

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const config = require('./lib/config');
const { connectMongo, getDb } = require('./lib/mongo');
const requestLogger = require('./middlewares/requestLogger'); // 🔴 add this

const authRoutes = require('./routes/authRoutes');
const authVoter = require('./middlewares/authVoter');
const authController = require('./controllers/authController');

const ballotRoutes = require('./routes/ballotRoutes');

const voteRoutes = require('./routes/voteRoutes');


const adminRoutes = require('./routes/adminRoutes');
const adminService = require('./services/adminService');

const app = express();

// Disable X-Powered-By header
app.disable('x-powered-by');

// CORS allowlist:
// - If CORS_ORIGINS is set, use that.
// - Otherwise allow common local dev origins.
const defaultDevOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'];
const allowedOrigins =
  config.corsOrigins.length > 0 ? config.corsOrigins : defaultDevOrigins;

const corsOptions = {
  origin(origin, callback) {
    // Postman / curl (no Origin header) → allow
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    const err = new Error('Not allowed by CORS');
    err.code = 'CORS_NOT_ALLOWED';
    err.status = 403;
    return callback(err);
  },
  credentials: false, // we use Authorization header, not cookies
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());


// Request logger
app.use(requestLogger);

// Auth routes
app.use('/auth', authRoutes);

// Ballot route
app.use('/ballot', ballotRoutes);

// Vote routes
app.use('/vote', voteRoutes);

// /me at root (not under /auth)
app.get('/me', authVoter, authController.getMe);

app.use('/admin', adminRoutes);

// /me at root (not under /auth)
app.get('/me', authVoter, authController.getMe);



// TODO: mount routers for auth, ballot, vote, admin (Steps 7–11)

// const voteRoutes = require('./routes/voteRoutes');



/**
 * Health endpoint with DB ping.
 * - If DB is up: { status: "ok", db: "up" }
 * - If DB is down: returns 500 with JSON error.
 */
app.get('/health', async (req, res, next) => {
  try {
    const db = getDb();
    // Ping the database
    await db.command({ ping: 1 });

    res.json({ status: 'ok', db: 'up' });
  } catch (err) {
    // If ping fails, pass error to error handler
    err.status = 500;
    err.code = 'DB_UNAVAILABLE';
    err.message = 'Database is not reachable';
    next(err);
  }
});

// Basic error handler (will be replaced with centralized handler in Step 12)
app.use((err, req, res, next) => {
  console.error(err); // TODO: redact sensitive data

  res.status(err.status || 500).json({
    code: err.code || 'INTERNAL_ERROR',
    message: err.message || 'Internal server error',
    details: err.details || err.errInfo || {},
  });
});

const PORT = config.port;

/**
 * Start server:
 * - Connect to MongoDB
 * - Then start listening on PORT
 */
async function start() {
  try {
    await connectMongo();

    // 🔴 Seed initial admin if needed
    await adminService.ensureInitialAdmin();

    app.listen(PORT, () => {
      console.log(`Evote API listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}


start();
