import Connection from "../../models/connection.model.js";
import FilenameRule from "../../models/filenameRule.model.js";
import SystemSettings from "../../models/systemSettings.model.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import { CONNECTIONS_SEED } from "./data/connections.seed.js";
import { FILENAME_RULES_SEED } from "./data/filenameRules.seed.js";

async function upsertConnections() {
  const ops = CONNECTIONS_SEED.map((c) => ({
    updateOne: {
      filter: {
        manufacturer: c.manufacturer,
        system: c.system,
        type: c.type,
        category: c.category,
      },
      update: c,
      upsert: true,
    },
  }));

  const result = await Connection.bulkWrite(ops, { ordered: false });
  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
    upserted: Object.keys(result.upsertedIds || {}).length,
  };
}

async function upsertFilenameRules() {
  const ops = FILENAME_RULES_SEED.map((r) => ({
    updateOne: {
      filter: { ruleId: r.ruleId },
      update: r,
      upsert: true,
    },
  }));

  const result = await FilenameRule.bulkWrite(ops, { ordered: false });
  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
    upserted: Object.keys(result.upsertedIds || {}).length,
  };
}

async function ensureSystemSettings() {
  await SystemSettings.findOneAndUpdate(
    { key: "global" },
    { $setOnInsert: { key: "global" } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function run() {
  try {
    await connectDb();

    await ensureSystemSettings();
    const connections = await upsertConnections();
    const filenameRules = await upsertFilenameRules();

    console.log("[db] seed core done", { connections, filenameRules });
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[db] seed core failed", err);
  process.exit(1);
});
