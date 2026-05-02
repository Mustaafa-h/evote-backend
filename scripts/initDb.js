// scripts/initDb.js
// Safe MongoDB initialization script for the Evote graduation project.
// Creates indexes + default election + Iraqi demo parties/candidates.
// This script is intentionally NON-DESTRUCTIVE:
// - Does not drop database
// - Does not delete collections
// - Does not delete documents
// - Does not create demo voters

require('dotenv').config();

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI;
const ELECTION_ID = process.env.ELECTION_ID || 'default';

if (!MONGO_URI || !MONGO_URI.trim()) {
  throw new Error('Missing required environment variable: MONGO_URI');
}

const EXPECTED_DB_NAME = 'evote';

const parties = [
  {
    electionId: ELECTION_ID,
    partyId: 'p1',
    name: 'قائمة الرافدين',
    symbol: 'RAF',
    color: '#1E40AF',
    order: 1,
    status: 'active',
  },
  {
    electionId: ELECTION_ID,
    partyId: 'p2',
    name: 'تحالف النخيل',
    symbol: 'NKH',
    color: '#15803D',
    order: 2,
    status: 'active',
  },
  {
    electionId: ELECTION_ID,
    partyId: 'p3',
    name: 'قائمة دجلة',
    symbol: 'DIJ',
    color: '#9333EA',
    order: 3,
    status: 'active',
  },
  {
    electionId: ELECTION_ID,
    partyId: 'p4',
    name: 'تجمع الفرات',
    symbol: 'FRT',
    color: '#EA580C',
    order: 4,
    status: 'active',
  },
];

const candidates = [
  { electionId: ELECTION_ID, candidateId: 'c1', partyId: 'p1', name: 'علي حسن', status: 'active' },
  { electionId: ELECTION_ID, candidateId: 'c2', partyId: 'p1', name: 'زهراء كريم', status: 'active' },
  { electionId: ELECTION_ID, candidateId: 'c3', partyId: 'p1', name: 'عمر صباح', status: 'active' },

  { electionId: ELECTION_ID, candidateId: 'c4', partyId: 'p2', name: 'مريم عبد الله', status: 'active' },
  { electionId: ELECTION_ID, candidateId: 'c5', partyId: 'p2', name: 'حسين ناظم', status: 'active' },
  { electionId: ELECTION_ID, candidateId: 'c6', partyId: 'p2', name: 'نور عباس', status: 'active' },

  { electionId: ELECTION_ID, candidateId: 'c7', partyId: 'p3', name: 'أحمد جاسم', status: 'active' },
  { electionId: ELECTION_ID, candidateId: 'c8', partyId: 'p3', name: 'فاطمة مهدي', status: 'active' },
  { electionId: ELECTION_ID, candidateId: 'c9', partyId: 'p3', name: 'سجاد قاسم', status: 'active' },

  { electionId: ELECTION_ID, candidateId: 'c10', partyId: 'p4', name: 'مصطفى رياض', status: 'active' },
  { electionId: ELECTION_ID, candidateId: 'c11', partyId: 'p4', name: 'آية محمد', status: 'active' },
  { electionId: ELECTION_ID, candidateId: 'c12', partyId: 'p4', name: 'كرار سامي', status: 'active' },
];

async function createIndexes(db) {
  console.log('\nCreating indexes...');

  await db.collection('admins').createIndex(
    { adminId: 1 },
    {
      unique: true,
      name: 'uniq_adminId',
      partialFilterExpression: { adminId: { $type: 'string' } },
    }
  );

  await db.collection('voters').createIndex(
    { voterId: 1 },
    {
      unique: true,
      name: 'uniq_voterId',
      partialFilterExpression: { voterId: { $type: 'string' } },
    }
  );

  await db.collection('elections').createIndex(
    { electionId: 1 },
    {
      unique: true,
      name: 'uniq_electionId',
      partialFilterExpression: { electionId: { $type: 'string' } },
    }
  );

  await db.collection('parties').createIndex(
    { electionId: 1, partyId: 1 },
    {
      unique: true,
      name: 'uniq_party_per_election',
      partialFilterExpression: {
        electionId: { $type: 'string' },
        partyId: { $type: 'string' },
      },
    }
  );

  await db.collection('candidates').createIndex(
    { electionId: 1, candidateId: 1 },
    {
      unique: true,
      name: 'uniq_candidate_per_election',
      partialFilterExpression: {
        electionId: { $type: 'string' },
        candidateId: { $type: 'string' },
      },
    }
  );

  await db.collection('votingTokens').createIndex(
    { tokenId: 1 },
    {
      unique: true,
      name: 'uniq_tokenId',
      partialFilterExpression: { tokenId: { $type: 'string' } },
    }
  );

  await db.collection('votingTokens').createIndex(
    { expiresAt: 1 },
    {
      name: 'ttl_votingTokens_expiresAt',
      expireAfterSeconds: 0,
    }
  );

  await db.collection('otp_attempts').createIndex(
    { phoneHash: 1 },
    {
      unique: true,
      name: 'uniq_otp_phoneHash',
      partialFilterExpression: { phoneHash: { $type: 'string' } },
    }
  );

  await db.collection('login_attempts').createIndex(
    { voterId: 1 },
    {
      unique: true,
      name: 'uniq_loginAttempts_voterId',
      partialFilterExpression: { voterId: { $type: 'string' } },
    }
  );

  await db.collection('votes').createIndex(
    { electionId: 1, candidateId: 1 },
    {
      name: 'idx_votes_election_candidate',
    }
  );

  console.log('Indexes created/verified.');
}

async function seedElection(db) {
  console.log('\nSeeding default election...');

  const now = new Date();

  const result = await db.collection('elections').updateOne(
    { electionId: ELECTION_ID },
    {
      $setOnInsert: {
        electionId: ELECTION_ID,
        status: 'open',
        createdAt: now,
        updatedAt: now,
        meta: {
          seededBy: 'scripts/initDb.js',
          seedType: 'default-election',
        },
      },
    },
    { upsert: true }
  );

  if (result.upsertedCount === 1) {
    console.log(`Election inserted: ${ELECTION_ID} / open`);
  } else {
    console.log(`Election already exists: ${ELECTION_ID} / left unchanged`);
  }
}

async function seedParties(db) {
  console.log('\nSeeding Iraqi demo parties...');

  const now = new Date();
  let upserted = 0;
  let matched = 0;

  for (const party of parties) {
    const result = await db.collection('parties').updateOne(
      {
        electionId: party.electionId,
        partyId: party.partyId,
      },
      {
        $set: {
          ...party,
          updatedAt: now,
          version: 1,
          meta: {
            seededBy: 'scripts/initDb.js',
            seedType: 'demo-party',
          },
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true }
    );

    upserted += result.upsertedCount || 0;
    matched += result.matchedCount || 0;
  }

  console.log(`Parties upserted: ${upserted}, updated/existing: ${matched}`);
}

async function seedCandidates(db) {
  console.log('\nSeeding Iraqi demo candidates...');

  const now = new Date();
  let upserted = 0;
  let matched = 0;

  for (const candidate of candidates) {
    const result = await db.collection('candidates').updateOne(
      {
        electionId: candidate.electionId,
        candidateId: candidate.candidateId,
      },
      {
        $set: {
          ...candidate,
          updatedAt: now,
          version: 1,
          meta: {
            seededBy: 'scripts/initDb.js',
            seedType: 'demo-candidate',
          },
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true }
    );

    upserted += result.upsertedCount || 0;
    matched += result.matchedCount || 0;
  }

  console.log(`Candidates upserted: ${upserted}, updated/existing: ${matched}`);
}

async function printSummary(db) {
  console.log('\nFinal database summary:');

  const collections = [
    'admins',
    'voters',
    'otp_attempts',
    'login_attempts',
    'elections',
    'parties',
    'candidates',
    'votingTokens',
    'votes',
    'electionSnapshots',
  ];

  for (const name of collections) {
    const count = await db.collection(name).countDocuments({});
    console.log(`- ${name}: ${count}`);
  }

  const election = await db.collection('elections').findOne(
    { electionId: ELECTION_ID },
    { projection: { _id: 0 } }
  );

  console.log('\nDefault election:');
  console.log(JSON.stringify(election, null, 2));

  const ballotPreview = await db.collection('parties')
    .find(
      { electionId: ELECTION_ID },
      { projection: { _id: 0, electionId: 1, partyId: 1, name: 1, symbol: 1, order: 1, status: 1 } }
    )
    .sort({ order: 1 })
    .toArray();

  console.log('\nParty preview:');
  console.log(JSON.stringify(ballotPreview, null, 2));
}

async function main() {
  const client = new MongoClient(MONGO_URI);

  try {
    console.log('Connecting to MongoDB...');
    await client.connect();

    const db = client.db();

    console.log(`Connected to database: ${db.databaseName}`);

    if (db.databaseName !== EXPECTED_DB_NAME) {
      throw new Error(
        `Refusing to initialize wrong database. Expected "${EXPECTED_DB_NAME}", got "${db.databaseName}". ` +
        `Make sure MONGO_URI contains "/evote" before the query string.`
      );
    }

    await db.command({ ping: 1 });
    console.log('MongoDB ping: ok');

    await createIndexes(db);
    await seedElection(db);
    await seedParties(db);
    await seedCandidates(db);
    await printSummary(db);

    console.log('\nDB initialization completed successfully.');
  } catch (err) {
    console.error('\nDB initialization failed.');
    console.error(err);
    process.exitCode = 1;
  } finally {
    await client.close();
    console.log('MongoDB connection closed.');
  }
}

main();