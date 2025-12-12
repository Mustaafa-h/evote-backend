// src/controllers/voteController.js
// Handles issuing and submitting voting tokens.

const crypto = require('crypto');

const { getDb, withTransaction } = require('../lib/mongo');
const config = require('../lib/config');
const voteService = require('../services/voteService');

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes (for issueToken)

/**
 * POST /vote/issue-token
 * Auth: voter
 */
async function issueToken(req, res, next) {
  try {
    const user = req.user || {};
    const voterId = user.voterId || user.sub;

    if (!voterId) {
      return res.status(400).json({
        code: 'BAD_TOKEN',
        message: 'Token is missing voterId',
        details: {},
      });
    }

    const electionId =
      (req.body && req.body.electionId) ||
      config.electionId ||
      'default';

    const db = getDb();
    const voters = db.collection('voters');
    const votingTokens = db.collection('votingTokens');

    // 1) Check election is open
    const isOpen = await voteService.isElectionOpen(electionId);
    if (!isOpen) {
      return res.status(409).json({
        code: 'ELECTION_NOT_OPEN',
        message: 'Election is not open for voting',
        details: {
          electionId,
        },
      });
    }

    // 2) Load voter
    const voter = await voters.findOne({ voterId });

    if (!voter) {
      return res.status(404).json({
        code: 'VOTER_NOT_FOUND',
        message: 'Voter not found',
        details: {},
      });
    }

    if (voter.status !== 'active') {
      return res.status(403).json({
        code: 'VOTER_INACTIVE',
        message: 'Voter is not active',
        details: {
          status: voter.status,
        },
      });
    }

    if (voter.hasVoted) {
      return res.status(409).json({
        code: 'ALREADY_VOTED',
        message: 'Voter has already cast a vote',
        details: {},
      });
    }

    // 3) Insert voting token (no voterId stored!)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);
    const tokenId = crypto.randomUUID();
    const nonce = crypto.randomBytes(16).toString('hex');

    const tokenDoc = {
      tokenId,          // unique tokenId
      electionId,       // election group
      spent: false,     // single-use
      expiresAt,        // used for TTL index later
      createdAt: now,
      updatedAt: now,
      version: 1,
      meta: {
        nonce,          // used to bind token to client challenge
      },
    };

    await votingTokens.insertOne(tokenDoc);

    // 4) Return token info to client
    return res.status(201).json({
      tokenId,
      nonce,
      expiresAt,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /vote/submit
 * Auth: voter
 *
 * Body:
 * {
 *   "tokenId": "uuid-from-issue-token",
 *   "candidateId": "c1",
 *   "electionId": "default",       // optional, defaults to config.electionId
 *   "nonce": "nonce-from-issue-token"  // optional but recommended
 * }
 *
 * Transaction steps:
 *  1) votingTokens.updateOne(...) -> spent:true  (only if unspent + not expired)
 *  2) votes.insertOne({ electionId, candidateId, createdAt, serverSig, ... })
 *  3) voters.updateOne({ voterId }, { hasVoted:true, updatedAt: now })
 *
 * Error codes:
 *  - 400 INVALID_CANDIDATE / INVALID_SUBMISSION / TOKEN_NONCE_MISMATCH
 *  - 404 VOTER_NOT_FOUND
 *  - 409 ALREADY_VOTED / TOKEN_ALREADY_USED
 *  - 410 TOKEN_EXPIRED
 */
async function submitVote(req, res, next) {
  try {
    const user = req.user || {};
    const voterId = user.voterId || user.sub;

    if (!voterId) {
      return res.status(400).json({
        code: 'BAD_TOKEN',
        message: 'Token is missing voterId',
        details: {},
      });
    }

    const { tokenId, candidateId, nonce } = req.body || {};
    const electionId =
      (req.body && req.body.electionId) ||
      config.electionId ||
      'default';

    if (
      typeof tokenId !== 'string' ||
      !tokenId.trim() ||
      typeof candidateId !== 'string' ||
      !candidateId.trim()
    ) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'tokenId and candidateId are required',
        details: {},
      });
    }

    const trimmedTokenId = tokenId.trim();
    const trimmedCandidateId = candidateId.trim();

    const now = new Date();

    // Run everything inside a MongoDB transaction
    const result = await withTransaction(async ({ db, session }) => {
      const voters = db.collection('voters');
      const votingTokens = db.collection('votingTokens');
      const candidates = db.collection('candidates');
      const votes = db.collection('votes');

      // 1) Load voter (with session)
      const voter = await voters.findOne(
        { voterId },
        { session }
      );

      if (!voter) {
        const error = new Error('Voter not found');
        error.code = 'VOTER_NOT_FOUND';
        error.status = 404;
        throw error;
      }

      if (voter.status !== 'active') {
        const error = new Error('Voter is not active');
        error.code = 'VOTER_INACTIVE';
        error.status = 403;
        error.details = { status: voter.status };
        throw error;
      }

      if (voter.hasVoted) {
        const error = new Error('Voter has already cast a vote');
        error.code = 'ALREADY_VOTED';
        error.status = 409;
        throw error;
      }

      // 2) Load the voting token
      const tokenDoc = await votingTokens.findOne(
        {
          tokenId: trimmedTokenId,
          electionId,
        },
        { session }
      );

      if (!tokenDoc) {
        const error = new Error('Invalid voting token');
        error.code = 'INVALID_VOTE_TOKEN';
        error.status = 400;
        throw error;
      }

      // Token already spent?
      if (tokenDoc.spent) {
        const error = new Error('Voting token already used');
        error.code = 'TOKEN_ALREADY_USED';
        error.status = 409;
        throw error;
      }

      // Token expired?
      if (tokenDoc.expiresAt && tokenDoc.expiresAt <= now) {
        const error = new Error('Voting token has expired');
        error.code = 'TOKEN_EXPIRED';
        error.status = 410;
        throw error;
      }

      // Optional: nonce check if client sends one
      if (nonce != null) {
        const tokenNonce = tokenDoc.meta && tokenDoc.meta.nonce;
        if (!tokenNonce || String(nonce) !== String(tokenNonce)) {
          const error = new Error('Token nonce does not match');
          error.code = 'TOKEN_NONCE_MISMATCH';
          error.status = 400;
          throw error;
        }
      }

      // 3) Validate candidate
      const candidate = await candidates.findOne(
        {
          electionId,
          candidateId: trimmedCandidateId,
          status: 'active',
        },
        { session }
      );

      if (!candidate) {
        const error = new Error('Invalid candidate for this election');
        error.code = 'INVALID_CANDIDATE';
        error.status = 400;
        throw error;
      }

      // 4) Mark token as spent (single-use)
      const updateTokenResult = await votingTokens.updateOne(
        {
          _id: tokenDoc._id,
          spent: false,
        },
        {
          $set: {
            spent: true,
            updatedAt: now,
          },
        },
        { session }
      );

      if (updateTokenResult.matchedCount === 0) {
        const error = new Error('Voting token already used');
        error.code = 'TOKEN_ALREADY_USED';
        error.status = 409;
        throw error;
      }

      // 5) Insert vote (NO voterId)
      const serverSig = crypto.randomBytes(32).toString('hex');

      await votes.insertOne(
        {
          electionId,
          candidateId: trimmedCandidateId,
          createdAt: now,
          serverSig,
          version: 1,
          meta: {},
        },
        { session }
      );

      // 6) Mark voter as hasVoted = true
      const updateVoterResult = await voters.updateOne(
        { voterId },
        {
          $set: {
            hasVoted: true,
            updatedAt: now,
          },
        },
        { session }
      );

      if (updateVoterResult.matchedCount === 0) {
        const error = new Error('Voter not found during update');
        error.code = 'VOTER_NOT_FOUND';
        error.status = 404;
        throw error;
      }

      // Everything done
      return {
        electionId,
        candidateId: trimmedCandidateId,
      };
    });

    // If we reach here, transaction committed successfully
    return res.status(201).json({
      status: 'accepted',
      electionId: result.electionId,
      candidateId: result.candidateId,
    });
  } catch (err) {
    // If error was thrown inside transaction with status/code, respect it
    if (err && err.status && err.code) {
      return res.status(err.status).json({
        code: err.code,
        message: err.message || 'Vote submission failed',
        details: err.details || {},
      });
    }

    // Replica set / transaction errors (common dev issue)
    if (
      err &&
      err.message &&
      err.message.includes(
        'Transaction numbers are only allowed on a replica set member or mongos'
      )
    ) {
      return res.status(500).json({
        code: 'TRANSACTION_NOT_SUPPORTED',
        message:
          'MongoDB transactions require a replica set. Please ensure your MongoDB instance is a replica set or use Atlas.',
        details: {},
      });
    }

    next(err);
  }
}

module.exports = {
  issueToken,
  submitVote,
};
