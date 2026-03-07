import { connectDb, disconnectDb } from "./_mongo.js";
import { seedCoreShared } from "./_core.shared.js";
import { seedRequestData } from "./_seed.shared.js";

function parseCountArg() {
  const raw = process.argv[2];
  if (!raw) return 50;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid seed-data count: ${raw}`);
  }
  return value;
}

async function run() {
  try {
    await connectDb();
    const count = parseCountArg();
    const core = await seedCoreShared();
    const result = await seedRequestData({ count });

    console.log("[db] seed-data done", {
      count,
      core,
      result,
    });
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[db] seed-data failed", err);
  process.exit(1);
});
