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
const defaultDevOrigins = ['http://localhost:3000', 'https://zippy-empanada-435ad8.netlify.app', 'http://localhost:3001', 'http://localhost:5173'];
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

app.post('/jitbit-webhook', async (req, res, next) => {
  try {
    const {
      ticketId,
      statusId,
      comment,
    } = req.body;

    if (!ticketId) {
      return res.status(400).json({
        success: false,
        message: 'ticketId is required',
      });
    }

    // 1. Get fresh Zoho access token
    const tokenParams = new URLSearchParams();
    tokenParams.append('refresh_token', process.env.ZOHO_REFRESH_TOKEN);
    tokenParams.append('client_id', process.env.ZOHO_CLIENT_ID);
    tokenParams.append('client_secret', process.env.ZOHO_CLIENT_SECRET);
    tokenParams.append('grant_type', 'refresh_token');

    const tokenResponse = await fetch(
      `${process.env.ZOHO_ACCOUNTS_URL}/oauth/v2/token`,
      {
        method: 'POST',
        body: tokenParams,
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('Zoho token error:', tokenData);

      return res.status(500).json({
        success: false,
        message: 'Could not generate Zoho access token',
      });
    }

    const accessToken = tokenData.access_token;

    // 2. Get all IT access request records
    const recordsUrl =
      `${process.env.ZOHO_API_DOMAIN}/api/forms/it_access_request/getRecords`;

    const recordsResponse = await fetch(recordsUrl, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
    });

    const recordsData = await recordsResponse.json();

    console.log('Zoho records result:', JSON.stringify(recordsData));

    const rawResults = recordsData?.response?.result || [];

    // Flatten Zoho response structure
   const records = rawResults.flatMap(item => {
  const recordId = Object.keys(item)[0];

  return (item[recordId] || []).map(record => ({
    ...record,
    exactRecordId: recordId,
  }));
});

    // 3. Find Zoho record matching Jitbit ticket ID
    const matchingRecord = records.find(
      record => String(record.jitbit_ticket_id) === String(ticketId)
    );

    if (!matchingRecord) {
      return res.status(404).json({
        success: false,
        message: `No Zoho record found for Jitbit ticket ${ticketId}`,
      });
    }

    const recordId = matchingRecord.exactRecordId;

    console.log('Matched Zoho record:', recordId);

    // 4. Prepare Zoho update
    const inputData = {
      jitbit_status: statusId?.toString() || '',
      jitbit_last_comment: comment || '',
    };

    const updateParams = new URLSearchParams();
    updateParams.append('recordId', recordId);
    updateParams.append('inputData', JSON.stringify(inputData));

    // 5. Update Zoho record
    const updateResponse = await fetch(
      `${process.env.ZOHO_API_DOMAIN}/api/forms/json/it_access_request/updateRecord`,
      {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: updateParams,
      }
    );

    const updateData = await updateResponse.json();

    console.log('Zoho update result:', updateData);

    res.status(200).json({
      success: true,
      ticketId,
      zohoRecordId: recordId,
      zohoUpdate: updateData,
    });

  } catch (err) {
    next(err);
  }
});

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

    // Only seed admin if MongoDB connected successfully
    await adminService.ensureInitialAdmin();

    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    console.warn('Starting API without MongoDB...');
  }

  app.listen(PORT, () => {
    console.log(`Evote API listening on port ${PORT}`);
  });
}

start();

