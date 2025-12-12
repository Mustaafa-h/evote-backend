// src/lib/mongo.js
// MongoDB connection helpers using the official driver.

const { MongoClient } = require('mongodb');
const config = require('./config');

let client;
let db;

/**
 * Connect to MongoDB (singleton).
 * Call this once on startup before using getDb().
 */
async function connectMongo() {
  if (client && db) {
    return db;
  }

  client = new MongoClient(config.mongoUri, {
    // You can customize options here if needed
  });

  await client.connect();

  // If your MONGO_URI includes the db name (e.g. .../evote),
  // MongoClient will use that. Otherwise, you can specify it:
  db = client.db(); // Uses database from URI (evote)

  console.log(`Connected to MongoDB database: ${db.databaseName}`);

  return db;
}

/**
 * Get the active DB instance.
 * Will throw if connectMongo() has not been called yet.
 */
function getDb() {
  if (!db) {
    throw new Error('MongoDB not initialized. Call connectMongo() first.');
  }
  return db;
}

/**
 * Run a function inside a MongoDB transaction.
 * Usage:
 *   await withTransaction(async ({ db, session }) => {
 *     const voters = db.collection('voters');
 *     await voters.updateOne(..., { session });
 *     ...
 *   });
 *
 * NOTE: Mongo transactions require a replica set (even a single-node replica set)
 * and MongoDB 4.0+.
 */
async function withTransaction(fn) {
  if (!client || !db) {
    throw new Error('MongoDB not initialized. Call connectMongo() first.');
  }

  const session = client.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      // fn should perform all operations using { session }
      result = await fn({ db, session });
    });

    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  connectMongo,
  getDb,
  withTransaction,
};
