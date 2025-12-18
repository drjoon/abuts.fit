import { clearAllCollections, connectDb, disconnectDb } from "./_mongo.js";

async function run() {
  try {
    await connectDb();
    await clearAllCollections();
    console.log("[db] reset done");
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[db] reset failed", err);
  process.exit(1);
});
