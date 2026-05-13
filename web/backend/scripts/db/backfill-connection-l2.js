import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import Connection from "../../models/connection.model.js";
import { CONNECTIONS_SEED } from "./data/connections.seed.js";

async function backfillConnectionL2() {
  await connectDb();

  try {
    const seeds = Array.isArray(CONNECTIONS_SEED) ? CONNECTIONS_SEED : [];
    let matched = 0;
    let modified = 0;

    for (const seed of seeds) {
      const seedL2 = Number(seed?.l2);
      if (!Number.isFinite(seedL2)) continue;

      const result = await Connection.updateMany(
        {
          manufacturer: seed.manufacturer,
          brand: seed.brand,
          family: seed.family,
          type: seed.type,
          category: seed.category,
        },
        {
          $set: { l2: seedL2 },
        },
      );

      matched += Number(result?.matchedCount || 0);
      modified += Number(result?.modifiedCount || 0);
    }

    console.log("[db] backfill-connection-l2 done", {
      seedCount: seeds.length,
      matched,
      modified,
    });
  } finally {
    await disconnectDb();
  }
}

backfillConnectionL2().catch((error) => {
  console.error("[db] backfill-connection-l2 failed", error);
  process.exit(1);
});
