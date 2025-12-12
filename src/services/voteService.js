// src/services/voteService.js
// Voting-related logic (e.g., election status, totals).

const { getDb } = require('../lib/mongo');

/**
 * Check if an election is open.
 *
 * Collection: elections
 * Document shape (simple):
 * { electionId, status: "open" | "closed" | "finalized", ... }
 *
 * For dev:
 * - If no document is found for this electionId, we treat it as OPEN.
 *   (Admin routes in Step 11 will manage this properly.)
 */
async function isElectionOpen(electionId) {
  const db = getDb();
  const elections = db.collection('elections');

  const doc = await elections.findOne({ electionId });

  if (!doc) {
    // Default to "open" in dev if not explicitly created
    return true;
  }

  return doc.status === 'open';
}

module.exports = {
  isElectionOpen,
  // later: computeTotals(electionId), finalizeElection(electionId), etc.
};
