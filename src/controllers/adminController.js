// src/controllers/adminController.js
// Handles admin login and election management.

const { getDb } = require('../lib/mongo');
const config = require('../lib/config');
const { verifyPassword } = require('../lib/password');
const { signJwt } = require('../lib/jwt');

function getElectionIdFromReq(req) {
  return (
    (req.body && req.body.electionId) ||
    (req.query && req.query.electionId) ||
    config.electionId ||
    'default'
  );
}

// ---------- POST /admin/login ----------

async function adminLogin(req, res, next) {
  try {
    const { adminId, password } = req.body || {};

    if (
      typeof adminId !== 'string' ||
      !adminId.trim() ||
      typeof password !== 'string' ||
      !password.trim()
    ) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'adminId and password are required',
        details: {},
      });
    }

    const db = getDb();
    const admins = db.collection('admins');

    const admin = await admins.findOne({ adminId: adminId.trim() });

    if (!admin) {
      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid adminId or password',
        details: {},
      });
    }

    if (admin.status !== 'active') {
      return res.status(403).json({
        code: 'ADMIN_INACTIVE',
        message: 'Admin account is not active',
        details: { status: admin.status },
      });
    }

    const passwordOk = await verifyPassword(password.trim(), admin.passwordHash);

    if (!passwordOk) {
      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid adminId or password',
        details: {},
      });
    }

    // Issue admin JWT
    const token = signJwt(
      {
        adminId: admin.adminId,
        role: admin.role,
        scope: ['admin'],
      },
      {
        subject: admin.adminId,
        expiresIn: '2h',
      }
    );

    return res.json({
      token,
      admin: {
        adminId: admin.adminId,
        role: admin.role,
        status: admin.status,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------- POST /admin/open ----------

async function openElection(req, res, next) {
  try {
    const electionId = getElectionIdFromReq(req);
    const db = getDb();
    const elections = db.collection('elections');

    const now = new Date();

    await elections.updateOne(
      { electionId },
      {
        $set: {
          electionId,
          status: 'open',
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
          meta: {},
        },
      },
      { upsert: true }
    );

    return res.json({
      electionId,
      status: 'open',
    });
  } catch (err) {
    next(err);
  }
}

// ---------- POST /admin/close ----------

async function closeElection(req, res, next) {
  try {
    const electionId = getElectionIdFromReq(req);
    const db = getDb();
    const elections = db.collection('elections');

    const now = new Date();

    await elections.updateOne(
      { electionId },
      {
        $set: {
          electionId,
          status: 'closed',
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
          meta: {},
        },
      },
      { upsert: true }
    );

    return res.json({
      electionId,
      status: 'closed',
    });
  } catch (err) {
    next(err);
  }
}

// ---------- GET /admin/totals?electionId=default ----------

async function getTotals(req, res, next) {
  try {
    const electionId = getElectionIdFromReq(req);
    const db = getDb();

    const voters = db.collection('voters');
    const votes = db.collection('votes');
    const candidates = db.collection('candidates');
    const parties = db.collection('parties');

    // Turnout
    const [totalVoters, votersVoted] = await Promise.all([
      voters.countDocuments({}),
      voters.countDocuments({ hasVoted: true }),
    ]);

    const turnoutRate =
      totalVoters > 0 ? votersVoted / totalVoters : 0;

    // Candidate totals (aggregation)
    const candidateTotalsAgg = await votes
      .aggregate([
        { $match: { electionId } },
        {
          $group: {
            _id: '$candidateId',
            votes: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: 'candidates',
            let: { candidateId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$candidateId', '$$candidateId'] },
                      { $eq: ['$electionId', electionId] },
                    ],
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                  candidateId: 1,
                  name: 1,
                  partyId: 1,
                },
              },
            ],
            as: 'candidate',
          },
        },
        { $unwind: '$candidate' },
        {
          $project: {
            _id: 0,
            candidateId: '$candidate.candidateId',
            name: '$candidate.name',
            partyId: '$candidate.partyId',
            votes: 1,
          },
        },
      ])
      .toArray();

    // Party info
    const partyDocs = await parties
      .find(
        { electionId },
        { projection: { _id: 0, partyId: 1, name: 1 } }
      )
      .toArray();

    const partyInfoById = new Map();
    for (const p of partyDocs) {
      partyInfoById.set(p.partyId, {
        partyId: p.partyId,
        name: p.name,
      });
    }

    // Party totals derived from candidate totals
    const partyTotalsMap = new Map();
    for (const ct of candidateTotalsAgg) {
      const partyId = ct.partyId || null;
      const votesCount = ct.votes || 0;

      if (!partyTotalsMap.has(partyId)) {
        const info = partyInfoById.get(partyId) || {
          partyId,
          name: null,
        };
        partyTotalsMap.set(partyId, {
          partyId: info.partyId,
          name: info.name,
          votes: 0,
        });
      }

      const entry = partyTotalsMap.get(partyId);
      entry.votes += votesCount;
    }

    const partyTotals = Array.from(partyTotalsMap.values());

    return res.json({
      electionId,
      turnout: {
        totalVoters,
        votersVoted,
        turnoutRate,
      },
      candidateTotals: candidateTotalsAgg,
      partyTotals,
    });
  } catch (err) {
    next(err);
  }
}

// ---------- POST /admin/finalize ----------

async function finalizeElection(req, res, next) {
  try {
    const electionId = getElectionIdFromReq(req);
    const db = getDb();
    const elections = db.collection('elections');
    const snapshots = db.collection('electionSnapshots');

    // Reuse getTotals logic by calling it internally? For now,
    // recompute similar to getTotals to avoid circular calls.
    const voters = db.collection('voters');
    const votes = db.collection('votes');
    const candidates = db.collection('candidates');
    const parties = db.collection('parties');

    const [totalVoters, votersVoted] = await Promise.all([
      voters.countDocuments({}),
      voters.countDocuments({ hasVoted: true }),
    ]);

    const turnoutRate =
      totalVoters > 0 ? votersVoted / totalVoters : 0;

    const candidateTotalsAgg = await votes
      .aggregate([
        { $match: { electionId } },
        {
          $group: {
            _id: '$candidateId',
            votes: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: 'candidates',
            let: { candidateId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$candidateId', '$$candidateId'] },
                      { $eq: ['$electionId', electionId] },
                    ],
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                  candidateId: 1,
                  name: 1,
                  partyId: 1,
                },
              },
            ],
            as: 'candidate',
          },
        },
        { $unwind: '$candidate' },
        {
          $project: {
            _id: 0,
            candidateId: '$candidate.candidateId',
            name: '$candidate.name',
            partyId: '$candidate.partyId',
            votes: 1,
          },
        },
      ])
      .toArray();

    const partyDocs = await parties
      .find(
        { electionId },
        { projection: { _id: 0, partyId: 1, name: 1 } }
      )
      .toArray();

    const partyInfoById = new Map();
    for (const p of partyDocs) {
      partyInfoById.set(p.partyId, {
        partyId: p.partyId,
        name: p.name,
      });
    }

    const partyTotalsMap = new Map();
    for (const ct of candidateTotalsAgg) {
      const partyId = ct.partyId || null;
      const votesCount = ct.votes || 0;

      if (!partyTotalsMap.has(partyId)) {
        const info = partyInfoById.get(partyId) || {
          partyId,
          name: null,
        };
        partyTotalsMap.set(partyId, {
          partyId: info.partyId,
          name: info.name,
          votes: 0,
        });
      }

      const entry = partyTotalsMap.get(partyId);
      entry.votes += votesCount;
    }

    const partyTotals = Array.from(partyTotalsMap.values());

    const snapshot = {
      electionId,
      createdAt: new Date(),
      turnout: {
        totalVoters,
        votersVoted,
        turnoutRate,
      },
      candidateTotals: candidateTotalsAgg,
      partyTotals,
    };

    // Store snapshot (optional but useful)
    await snapshots.insertOne(snapshot);

    // Mark election as finalized
    await elections.updateOne(
      { electionId },
      {
        $set: {
          electionId,
          status: 'finalized',
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
          meta: {},
        },
      },
      { upsert: true }
    );

    return res.json(snapshot);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  adminLogin,
  openElection,
  closeElection,
  getTotals,
  finalizeElection,
};
