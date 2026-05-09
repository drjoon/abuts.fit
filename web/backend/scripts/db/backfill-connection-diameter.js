import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import Connection from "../../models/connection.model.js";
import { CONNECTIONS_SEED } from "./data/connections.seed.js";

async function backfillConnectionDiameter() {
  await connectDb();

  try {
    const seeds = Array.isArray(CONNECTIONS_SEED) ? CONNECTIONS_SEED : [];
    let matched = 0;
    let modified = 0;

    for (const seed of seeds) {
      const seedDiameter = Number(seed?.diameter ?? seed?.connection);
      if (!Number.isFinite(seedDiameter)) continue;

      const result = await Connection.updateMany(
        {
          manufacturer: seed.manufacturer,
          brand: seed.brand,
          family: seed.family,
          type: seed.type,
          category: seed.category,
        },
        {
          $set: { diameter: seedDiameter },
        },
      );

      matched += Number(result?.matchedCount || 0);
      modified += Number(result?.modifiedCount || 0);
    }

    console.log("[db] backfill-connection-diameter done", {
      seedCount: seeds.length,
      matched,
      modified,
    });
  } finally {
    await disconnectDb();
  }
}

backfillConnectionDiameter().catch((error) => {
  console.error("[db] backfill-connection-diameter failed", error);
  process.exit(1);
});
