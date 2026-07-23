# E-Vote Backend

A privacy-focused REST API for an electronic voting system, built with Node.js, Express, and MongoDB.

The backend handles voter authentication, encrypted personal data, ballot retrieval, single-use voting tokens, vote submission, and administrative election workflows.

## Key Features

- Voter registration and authentication
- JWT-based authorization for voters and administrators
- Argon2id password hashing
- AES-256-GCM encryption for sensitive voter information
- OTP and login rate limiting
- Single-use voting tokens
- Atomic vote submission using MongoDB transactions
- Separation between voter identity and ballot choice
- Election opening, closing, and finalization
- Election totals and turnout calculation
- Database health monitoring

## Privacy-Focused Vote Flow

1. An authenticated voter requests a single-use voting token.
2. The server verifies that the voter is eligible and has not voted.
3. The voter submits the token with the selected candidate.
4. A MongoDB transaction records the anonymous vote, spends the token, and marks the voter as having voted.
5. The stored vote does not contain the voter's identity.

## Technology Stack

- Node.js
- Express.js
- MongoDB
- JSON Web Tokens
- Argon2id
- AES-256-GCM
- Helmet
- Express Rate Limit

## API Overview

### Authentication

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/auth/otp/send` | Request a registration OTP |
| `POST` | `/auth/register/verify-otp-and-create` | Verify the OTP and create a voter |
| `POST` | `/auth/login` | Authenticate a voter |
| `GET` | `/me` | Retrieve the authenticated voter |

### Voting

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/ballot` | Retrieve the election ballot |
| `POST` | `/vote/issue-token` | Issue a single-use voting token |
| `POST` | `/vote/submit` | Submit a vote securely |

### Administration

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/admin/login` | Authenticate an administrator |
| `POST` | `/admin/open` | Open an election |
| `POST` | `/admin/close` | Close an election |
| `GET` | `/admin/totals` | Retrieve election totals |
| `POST` | `/admin/finalize` | Finalize election results |

### System

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Check API and database availability |

## Project Structure

```text
src/
├── controllers/     # Request handlers
├── lib/             # Database, JWT, encryption and password utilities
├── middlewares/     # Authentication, logging and rate limiting
├── routes/          # API route definitions
├── services/        # Voting, OTP and administration logic
└── server.js        # Application entry point
```

## Running Locally

### Prerequisites

- Node.js
- npm
- MongoDB database or MongoDB Atlas cluster

### Installation

```bash
git clone https://github.com/Mustaafa-h/evote-backend.git
cd evote-backend
npm install
```

Create a `.env` file in the project root:

```env
PORT=3000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_long_random_jwt_secret
AES_GCM_KEY=your_base64_encoded_32_byte_key
ELECTION_ID=default
ADMIN_INIT_PASSWORD=your_secure_admin_password
CORS_ORIGINS=http://localhost:3001
```

Generate a suitable AES key with Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Initialize the database:

```bash
npm run db:init
```

Start the development server:

```bash
npm run dev
```

The API will run at:

```text
http://localhost:3000
```

Check its status at:

```text
http://localhost:3000/health
```

## Related Repositories

- [E-Vote Frontend](https://github.com/Mustaafa-h/evote-front)
- [OpenCV Liveness Detection](https://github.com/Mustaafa-h/opencv-liveness)
- [MediaPipe Liveness Detection](https://github.com/Mustaafa-h/mediapipe-liveness)

## Project Context

This electronic voting system was developed as an individual full-stack graduation project. It demonstrates REST API development, authentication, database transactions, privacy-oriented data modeling, encryption, rate limiting, and computer-vision-based voter verification.

This is a portfolio and academic project, not a production election platform.

## Author

**Mustafa Haider**

- [LinkedIn](https://linkedin.com/in/mustafa-haider-0b027a2a7)
- [GitHub](https://github.com/Mustaafa-h)
