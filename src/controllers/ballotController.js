// src/controllers/ballotController.js
// Handles GET /ballot?electionId=...

const { getDb } = require('../lib/mongo');
const config = require('../lib/config');

/**
 * GET /ballot?electionId=default
 *
 * Response shape:
 * {
 *   electionId: "default",
 *   parties: [
 *     {
 *       partyId,
 *       name,
 *       symbol,
 *       color,
 *       order,
 *       status,
 *       candidates: [
 *         { candidateId, name, status, partyId }
 *       ]
 *     },
 *     ...
 *   ]
 * }
 */
async function getBallot(req, res, next) {
  try {
    const electionId =
      (req.query.electionId && String(req.query.electionId)) ||
      config.electionId ||
      'default';

    const db = getDb();
    const partiesCol = db.collection('parties');
    const candidatesCol = db.collection('candidates');

    // 1) Fetch active parties for this election, ordered
    const partyDocs = await partiesCol
      .find(
        {
          electionId,
          status: 'active', // assume "active" parties only
        },
        {
          projection: {
            _id: 0,
            electionId: 1,
            partyId: 1,
            name: 1,
            symbol: 1,
            color: 1,
            status: 1,
            order: 1,
          },
        }
      )
      .sort({ order: 1 })
      .toArray();

    // 2) Fetch active candidates for this election
    const candidateDocs = await candidatesCol
      .find(
        {
          electionId,
          status: 'active',
        },
        {
          projection: {
            _id: 0,
            electionId: 1,
            candidateId: 1,
            partyId: 1,
            name: 1,
            status: 1,
          },
        }
      )
      .toArray();

    // Group candidates by partyId
    const candidatesByParty = new Map();
    for (const c of candidateDocs) {
      if (!candidatesByParty.has(c.partyId)) {
        candidatesByParty.set(c.partyId, []);
      }
      candidatesByParty.get(c.partyId).push({
        candidateId: c.candidateId,
        name: c.name,
        status: c.status,
        partyId: c.partyId,
      });
    }

    // Attach candidates to each party, preserving party order
    const parties = partyDocs.map((p) => ({
      partyId: p.partyId,
      name: p.name,
      symbol: p.symbol || null,
      color: p.color || null,
      order: p.order,
      status: p.status,
      candidates: candidatesByParty.get(p.partyId) || [],
    }));

    return res.json({
      electionId,
      parties,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getBallot,
};
