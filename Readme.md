# Evote Backend (Express + MongoDB)

Secure e-voting backend built with **Node.js LTS**, **Express.js**, and **MongoDB**.

- **Auth:** JWT (HS256) + Argon2id passwords  
- **PII:** AES-256-GCM per column (e.g. phone)  
- **Privacy:** No linkage between voter identity and vote choice in the DB  
- **Transactions:** Vote casting is fully atomic (MongoDB transaction)

---

## 1. Project Structure

```text
evote-backend/
  .env
  package.json
  src/
    server.js

    lib/
      config.js       # env validation, global config
      mongo.js        # Mongo connection + withTransaction
      jwt.js          # signJwt, verifyJwt
      password.js     # Argon2id helpers
      aesgcm.js       # AES-256-GCM helpers

    middlewares/
      authVoter.js
      authAdmin.js
      requestLogger.js
      rateLimiters.js

    controllers/
      authController.js
      ballotController.js
      voteController.js
      adminController.js

    routes/
      authRoutes.js
      ballotRoutes.js
      voteRoutes.js
      adminRoutes.js

    services/
      otpService.js
      voteService.js
      adminService.js
2. Environment Variables (.env)
Example:

env
Copy code
PORT=3000

MONGO_URI=mongodb+srv://user:pass@cluster0.yvr9ugh.mongodb.net/evote?appName=Cluster0

# JWT secret for HS256
JWT_SECRET=replace_with_long_random_secret_string

# AES-256-GCM key (32 random bytes, base64-encoded)
AES_GCM_KEY=BASE64_32_BYTES_HERE

# Default electionId
ELECTION_ID=default

# Initial admin password for adminId="superadmin"
ADMIN_INIT_PASSWORD=ChangeThisAdminPassword123!

# Optional: CORS allowlist (comma-separated origins)
# Example for dev:
# CORS_ORIGINS=http://localhost:3000,http://localhost:5173
config.js will:

Ensure MONGO_URI, JWT_SECRET, AES_GCM_KEY, ADMIN_INIT_PASSWORD are present.

Ensure AES_GCM_KEY decodes to exactly 32 bytes.

Parse PORT and default ELECTION_ID.

Parse CORS_ORIGINS → config.corsOrigins: string[].

3. Install & Run
Install dependencies:

bash
Copy code
npm install
Dev mode (with nodemon):

bash
Copy code
npm run dev
Production mode:

bash
Copy code
npm run start
If everything is OK:

text
Copy code
Connected to MongoDB database: evote
Initial admin seeded: adminId="superadmin" using ADMIN_INIT_PASSWORD
Evote API listening on port 3000
Health check:

bash
Copy code
curl http://localhost:3000/health
# -> {"status":"ok","db":"up"}
4. Database Contract
Database: evote

Collections:

voters

votingTokens

votes

candidates

parties

admins

otp_attempts

login_attempts

elections

electionSnapshots (snapshots of final results)

4.1 Collection Shapes (logical)
js
Copy code
// voters
{
  voterId: String,
  phoneEnc: { iv: String, data: String, tag: String }, // AES-GCM
  passwordHash: String,                                // Argon2id
  hasVoted: Boolean,
  status: "pending" | "active" | "blocked",
  createdAt: Date,
  updatedAt: Date,
  version: Number,
  meta: Object
}

// votingTokens
{
  tokenId: String,
  electionId: String,
  spent: Boolean,
  expiresAt: Date,            // TTL index
  createdAt: Date,
  updatedAt: Date,
  version: Number,
  meta: { nonce: String }
}

// votes   (NO voterId)
{
  electionId: String,
  candidateId: String,
  createdAt: Date,
  serverSig: String,          // random server signature
  version: Number,
  meta: Object
}

// candidates
{
  electionId: String,
  candidateId: String,
  partyId: String,
  name: String,
  status: String,             // e.g. "active"
  createdAt: Date,
  updatedAt: Date,
  version: Number,
  meta: Object
}

// parties
{
  electionId: String,
  partyId: String,
  name: String,
  symbol: String,
  color: String,
  status: String,
  order: Number,
  createdAt: Date,
  updatedAt: Date,
  version: Number,
  meta: Object
}

// admins
{
  adminId: String,
  passwordHash: String,       // Argon2id
  role: "superadmin" | "electionAdmin" | "viewer",
  status: String,
  createdAt: Date,
  updatedAt: Date,
  version: Number,
  meta: Object
}

// otp_attempts  (per-phone rate limiting)
{
  phoneHash: String,
  count: Number,
  windowEndsAt: Date,         // TTL index
  createdAt: Date,
  meta: Object
}

// login_attempts  (per-voter lockouts)
{
  voterId: String,
  count: Number,
  windowEndsAt: Date,         // TTL index
  createdAt: Date,
  meta: Object
}

// elections
{
  electionId: String,
  status: "open" | "closed" | "finalized",
  createdAt: Date,
  updatedAt: Date,
  meta: Object
}

// electionSnapshots
{
  electionId: String,
  createdAt: Date,
  turnout: {
    totalVoters: Number,
    votersVoted: Number,
    turnoutRate: Number
  },
  candidateTotals: Array,
  partyTotals: Array
}
4.2 Recommended Indexes
In Mongo shell / Atlas:

js
Copy code
// voters
db.voters.createIndex({ voterId: 1 }, { unique: true });
db.voters.createIndex({ hasVoted: 1 });

// votingTokens
db.votingTokens.createIndex({ tokenId: 1 }, { unique: true });
db.votingTokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// votes
db.votes.createIndex({ electionId: 1, candidateId: 1 });

// candidates
db.candidates.createIndex(
  { electionId: 1, candidateId: 1 },
  { unique: true }
);

// parties
db.parties.createIndex(
  { electionId: 1, partyId: 1 },
  { unique: true }
);
db.parties.createIndex({ electionId: 1, order: 1 });

// otp_attempts
db.otp_attempts.createIndex({ windowEndsAt: 1 }, { expireAfterSeconds: 0 });
db.otp_attempts.createIndex({ phoneHash: 1 });

// login_attempts
db.login_attempts.createIndex({ windowEndsAt: 1 }, { expireAfterSeconds: 0 });
db.login_attempts.createIndex({ voterId: 1 });
5. Security & Crypto
5.1 JWT (lib/jwt.js)
Algorithm: HS256

Secret: JWT_SECRET

Standard claims: sub, jti, iat, exp

Payload for voter tokens:

js
Copy code
{
  voterId,
  hasVoted,
  status,
  scope: ["voter"]
}
Payload for admin tokens:

js
Copy code
{
  adminId,
  role,
  scope: ["admin"]
}
5.2 Passwords (lib/password.js)
hashPassword() → Argon2id encoded hash

verifyPassword() → constant-time verification

5.3 PII Encryption (lib/aesgcm.js)
AES-256-GCM

Key = 32-byte secret from AES_GCM_KEY (base64)

Encoded shape: { iv, data, tag }

5.4 Rate Limiting
IP-based via express-rate-limit:

OTP: 3 / minute / IP

Login: 10 / 15 minutes / IP

Additional DB-based:

otp_attempts per phoneHash (max ~10/hour)

login_attempts per voterId (lockout after 5 failed attempts)

5.5 CORS & Headers
helmet() enabled for basic security headers.

CORS allowlist using CORS_ORIGINS (or default to common dev origins).

x-powered-by header disabled.

requestLogger logs only: method, path, status, duration, IP (no bodies, no tokens).

6. API Endpoints
6.1 Health
GET /health
→ { "status": "ok", "db": "up" }

6.2 Auth / Registration (Voters)
Base path: /auth

POST /auth/otp/send
Request:

json
Copy code
{ "phone": "+9647701234567" }
Validates + rate-limits (IP & per-phone).

In dev, otpService is an in-memory stub; OTP is printed to server logs.

Response (dev):

json
Copy code
{
  "status": "ok",
  "message": "OTP sent (stub). Check server logs for code in dev."
}
POST /auth/register/verify-otp-and-create
Request:

json
Copy code
{
  "voterId": "voter1",
  "phone": "+9647701234567",
  "otpCode": "123456",
  "password": "Secret123!"
}
Process:

Verifies OTP via otpService.verifyOtp.

Inserts new doc in voters with:

phoneEnc (AES-GCM encrypted phone)

passwordHash (Argon2id)

status: "active", hasVoted: false

Returns a voter JWT.

Response:

json
Copy code
{
  "token": "JWT_HERE",
  "voter": {
    "voterId": "voter1",
    "hasVoted": false,
    "status": "active"
  }
}
POST /auth/login
Request:

json
Copy code
{
  "voterId": "voter1",
  "password": "Secret123!"
}
Checks per-voter login_attempts (lockout after 5 failures in 15 minutes).

Returns voter JWT on success.

Response:

json
Copy code
{
  "token": "JWT_HERE",
  "voter": {
    "voterId": "voter1",
    "hasVoted": false,
    "status": "active"
  }
}
GET /me (Auth: voter)
Headers: Authorization: Bearer <voter JWT>

Response:

json
Copy code
{
  "voterId": "voter1",
  "hasVoted": false,
  "status": "active"
}
6.3 Ballot
GET /ballot?electionId=default
Returns parties (ordered) and active candidates:

json
Copy code
{
  "electionId": "default",
  "parties": [
    {
      "partyId": "p1",
      "name": "Party One",
      "symbol": "P1",
      "color": "#ff0000",
      "order": 1,
      "status": "active",
      "candidates": [
        {
          "candidateId": "c1",
          "name": "Candidate One",
          "status": "active",
          "partyId": "p1"
        }
      ]
    }
  ]
}
Implementation:

Query parties (status = active, sorted by order).

Query candidates (status = active).

Group and attach candidates by partyId in code.

6.4 Voting
Base path: /vote (Auth: voter)

POST /vote/issue-token
Headers: Authorization: Bearer <voter JWT>

Body:

json
Copy code
{ "electionId": "default" }
Process:

Ensure:

Voter exists, status="active", hasVoted=false.

Election is open (elections.status="open" or default open if missing).

Insert into votingTokens:

js
Copy code
{
  tokenId,            // crypto.randomUUID()
  electionId,
  spent: false,
  expiresAt: now + 5 minutes,
  createdAt, updatedAt,
  version: 1,
  meta: { nonce }     // random hex
}
// NOTE: no voterId stored here
Returns token details.

Response:

json
Copy code
{
  "tokenId": "UUID_HERE",
  "nonce": "RANDOM_HEX",
  "expiresAt": "2025-11-28T21:12:47.080Z"
}
Error codes examples:

409 ALREADY_VOTED – voter already has hasVoted: true

409 ELECTION_NOT_OPEN – election not open

POST /vote/submit
Headers: Authorization: Bearer <voter JWT>

Body:

json
Copy code
{
  "tokenId": "UUID_FROM_ISSUE_TOKEN",
  "candidateId": "c1",
  "electionId": "default",
  "nonce": "NONCE_FROM_ISSUE_TOKEN"   // optional but recommended
}
Runs MongoDB transaction using withTransaction:

Load voter:

Must exist.

status = "active".

hasVoted = false.

Load token from votingTokens:

Must exist for (tokenId, electionId).

spent = false.

expiresAt > now.

Optional nonce match.

Mark token as spent:

js
Copy code
updateOne(
  { _id: tokenDoc._id, spent: false },
  { $set: { spent: true, updatedAt: now } }
)
Insert vote into votes (NO voterId):

js
Copy code
{
  electionId,
  candidateId,
  createdAt: now,
  serverSig: randomHex,
  version: 1,
  meta: {}
}
Update voter doc:

js
Copy code
{ $set: { hasVoted: true, updatedAt: now } }
If any step fails, the transaction aborts and nothing is written.

Success response:

json
Copy code
{
  "status": "accepted",
  "electionId": "default",
  "candidateId": "c1"
}
Error codes:

400 VALIDATION_ERROR – missing tokenId/candidateId

400 INVALID_VOTE_TOKEN – unknown tokenId/electionId

400 INVALID_CANDIDATE – candidate not active / not in election

400 TOKEN_NONCE_MISMATCH – nonce mismatch

404 VOTER_NOT_FOUND

409 ALREADY_VOTED – voter already has hasVoted: true

409 TOKEN_ALREADY_USED – token already spent

410 TOKEN_EXPIRED – token expiresAt <= now

500 TRANSACTION_NOT_SUPPORTED – if DB doesn’t support transactions

6.5 Admin
Base path: /admin

POST /admin/login
Body:

json
Copy code
{
  "adminId": "superadmin",
  "password": "ADMIN_INIT_PASSWORD"
}
adminService.ensureInitialAdmin() seeds this user if admins is empty.

On success returns admin JWT.

Response:

json
Copy code
{
  "token": "JWT_HERE",
  "admin": {
    "adminId": "superadmin",
    "role": "superadmin",
    "status": "active"
  }
}
All routes below require Authorization: Bearer <admin JWT> (scope admin).

POST /admin/open
Body:

json
Copy code
{ "electionId": "default" }
Sets/creates elections doc with status: "open".

Response:

json
Copy code
{ "electionId": "default", "status": "open" }
POST /admin/close
Body:

json
Copy code
{ "electionId": "default" }
Sets status: "closed".

Response:

json
Copy code
{ "electionId": "default", "status": "closed" }
GET /admin/totals?electionId=default
Returns turnout + candidate and party totals:

json
Copy code
{
  "electionId": "default",
  "turnout": {
    "totalVoters": 1,
    "votersVoted": 1,
    "turnoutRate": 1
  },
  "candidateTotals": [
    {
      "candidateId": "c1",
      "name": "Candidate One",
      "partyId": "p1",
      "votes": 1
    }
  ],
  "partyTotals": [
    {
      "partyId": "p1",
      "name": "Party One",
      "votes": 1
    }
  ]
}
POST /admin/finalize
Body:

json
Copy code
{ "electionId": "default" }
Recomputes totals (like /admin/totals).

Inserts a snapshot into electionSnapshots.

Sets elections.status = "finalized".

Response: the snapshot document:

json
Copy code
{
  "electionId": "default",
  "createdAt": "2025-11-28T21:30:00.000Z",
  "turnout": { ... },
  "candidateTotals": [ ... ],
  "partyTotals": [ ... ]
}
7. Privacy & Transaction Guarantees (Recap)
Privacy

votes collection never stores voterId, phone, or any PII.

votingTokens documents also do not store voterId.

The only link is voters.hasVoted (boolean), which does not reveal choice.

Crypto & Auth

Passwords: Argon2id hashes.

Phone (and any other PII) encrypted via AES-256-GCM with a 32-byte key.

JWT with HS256, short TTL, standard claims.

No logging of passwords, OTPs, raw phones, or JWTs.

Transactional Vote

submitVote runs as a MongoDB transaction:

Validate voter.

Validate and consume token (single-use + TTL).

Insert vote (no voter link).

Mark voter hasVoted = true.

All steps succeed together or none are applied, preventing:

Double voting via races.

Orphaned tokens or votes.

Inconsistent hasVoted flags.