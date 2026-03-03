import { clearAllCollections, connectDb, disconnectDb } from "./_mongo.js";
import { seedAccountsDev } from "./_seed.shared.js";

async function run() {
  try {
    await connectDb();
    await clearAllCollections();

    const accounts = await seedAccountsDev();

    console.log("[db] reset+account done", {
      requestorOwner: accounts.requestorOwner?.email,
      requestorStaff: accounts.requestorStaff?.email,
      manufacturerOwner: accounts.manufacturerOwner?.email,
      manufacturerStaff: accounts.manufacturerStaff?.email,
      adminOwner: accounts.adminOwner?.email,
      adminStaff: accounts.adminStaff?.email,
    });
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[db] reset+account failed", err);
  process.exit(1);
});
