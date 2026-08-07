// related files:
// - web/backend/scripts/db/heal-requests-from-satellites.js
// - web/backend/scripts/db/_mongo.js
// - web/backend/rules.md
//
// Replace live `requests` with docs from a locally-mounted Atlas WiredTiger snapshot.
// Does NOT touch other collections.
//
// Usage:
//   ENV_FILE=local.env ABUTS_DB_FORCE=true \
//     node scripts/db/replace-requests-from-atlas-snapshot.js \
//     --snapshot-uri mongodb://127.0.0.1:27018 \
//     --snapshot-db abuts_fit_test
//   ... add --yes to apply
import mongoose from "mongoose";
import {
  connectDb,
  disconnectDb,
  getDbNameFromMongoUri,
  getMongoUri,
} from "./_mongo.js";

const yes = process.argv.includes("--yes");

function argValue(flag, fallback = "") {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return fallback;
  return String(process.argv[idx + 1] || "").trim() || fallback;
}

const snapshotUri =
  argValue("--snapshot-uri", "mongodb://127.0.0.1:27018/?directConnection=true");
const snapshotDb = argValue("--snapshot-db", "abuts_fit_test");
const expectedLiveDb = argValue("--expect-db", "abuts_fit_test");

async function run() {
  const liveUri = getMongoUri();
  const liveDbName = getDbNameFromMongoUri(liveUri);
  if (liveDbName !== expectedLiveDb) {
    throw new Error(
      `Refusing: live db is "${liveDbName}", expected "${expectedLiveDb}"`,
    );
  }

  const snapConn = await mongoose
    .createConnection(snapshotUri, { serverSelectionTimeoutMS: 8000 })
    .asPromise();
  const snapCol = snapConn.client.db(snapshotDb).collection("requests");
  const docs = await snapCol.find({}).toArray();
  await snapConn.close();

  if (!docs.length) {
    throw new Error(`Snapshot ${snapshotDb}.requests is empty`);
  }

  const { mongoUri } = await connectDb();
  const dbName = getDbNameFromMongoUri(mongoUri);
  if (dbName !== expectedLiveDb) {
    throw new Error(`Refusing after connect: db="${dbName}"`);
  }

  const liveCol = mongoose.connection.db.collection("requests");
  const before = await liveCol.countDocuments();
  const sampleIds = docs
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 5)
    .map((d) => d.requestId);

  console.log(
    JSON.stringify(
      {
        mode: yes ? "APPLY" : "DRY-RUN",
        liveDb: dbName,
        snapshotDb,
        snapshotCount: docs.length,
        liveCountBefore: before,
        newestRequestIds: sampleIds,
      },
      null,
      2,
    ),
  );

  if (!yes) {
    console.log(
      "[replace-requests] dry-run only. Re-run with --yes to delete+insert.",
    );
    await disconnectDb();
    return;
  }

  const del = await liveCol.deleteMany({});
  // Preserve _id and all fields from snapshot docs
  const chunkSize = 200;
  let inserted = 0;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize).map((d) => {
      const copy = { ...d };
      // heal-requests-from-satellites.js default scope uses __restoredFrom
      copy.__restoredFrom = "atlas-daily-snapshot";
      copy.__restoredFromAtlasSnapshotAt = new Date();
      copy.__restoredFromAtlasSnapshot = {
        snapshotDb,
        sourceFile: "Cluster0-2026-08-06T16-06-07.271Z",
        snapshotLabelKst: "2026-08-07 01:24",
      };
      return copy;
    });
    const res = await liveCol.insertMany(chunk, { ordered: false });
    inserted += Object.keys(res.insertedIds || {}).length;
  }
  const after = await liveCol.countDocuments();
  console.log(
    JSON.stringify(
      {
        deleted: del.deletedCount,
        inserted,
        liveCountAfter: after,
      },
      null,
      2,
    ),
  );
  await disconnectDb();
}

run().catch(async (err) => {
  console.error("[replace-requests] failed", err?.message || err);
  try {
    await disconnectDb();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
