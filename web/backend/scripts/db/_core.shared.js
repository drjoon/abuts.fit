import Connection from "../../models/connection.model.js";
import FilenameRule from "../../models/filenameRule.model.js";
import SystemSettings from "../../models/systemSettings.model.js";
import { CONNECTIONS_SEED } from "./data/connections.seed.js";
import { FILENAME_RULES_SEED } from "./data/filenameRules.seed.js";

async function ensureSystemSettings() {
  await SystemSettings.findOneAndUpdate(
    { key: "global" },
    { $setOnInsert: { key: "global" } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

async function upsertConnections() {
  const ops = (Array.isArray(CONNECTIONS_SEED) ? CONNECTIONS_SEED : []).map(
    (c) => ({
      updateOne: {
        filter: {
          manufacturer: c.manufacturer,
          brand: c.brand,
          family: c.family,
          type: c.type,
          category: c.category,
        },
        update: c,
        upsert: true,
      },
    }),
  );
  if (ops.length === 0) return { matched: 0, modified: 0, upserted: 0 };
  const result = await Connection.bulkWrite(ops, { ordered: false });
  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
    upserted: Object.keys(result.upsertedIds || {}).length,
  };
}

async function upsertFilenameRules() {
  const ops = (
    Array.isArray(FILENAME_RULES_SEED) ? FILENAME_RULES_SEED : []
  ).map((r) => ({
    updateOne: {
      filter: { ruleId: r.ruleId },
      update: r,
      upsert: true,
    },
  }));
  if (ops.length === 0) return { matched: 0, modified: 0, upserted: 0 };
  const result = await FilenameRule.bulkWrite(ops, { ordered: false });
  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
    upserted: Object.keys(result.upsertedIds || {}).length,
  };
}

export async function seedCoreShared() {
  await ensureSystemSettings();
  const connections = await upsertConnections();
  const filenameRules = await upsertFilenameRules();
  return { connections, filenameRules };
}
