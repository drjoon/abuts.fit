import { clearAllCollections, connectDb, disconnectDb } from "./_mongo.js";
import { seedAccountsDev, seedSalesmenOnly } from "./_seed.shared.js";

async function run() {
  try {
    await connectDb();
    await clearAllCollections();

    const accounts = await seedAccountsDev();
    const { salesmen } = await seedSalesmenOnly();

    console.log("[db] reset+account done", {
      requestorOwner: accounts.requestorOwner?.email,
      requestorStaff: accounts.requestorStaff?.email,
      manufacturerOwner: accounts.manufacturerOwner?.email,
      manufacturerStaff: accounts.manufacturerStaff?.email,
      adminOwner: accounts.adminOwner?.email,
      adminStaff: accounts.adminStaff?.email,
      salesmenCount: salesmen?.length,
    });
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[db] reset+account failed", err);
  process.exit(1);
});
