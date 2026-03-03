import { clearAllCollections, connectDb, disconnectDb } from "./_mongo.js";
import { seedCoreShared } from "./_core.shared.js";
import { seedAccountsDev, seedBulkUsersAndData } from "./_seed.shared.js";

async function run() {
  try {
    await connectDb();
    await clearAllCollections();

    const core = await seedCoreShared();
    const accounts = await seedAccountsDev();
    const bulk = await seedBulkUsersAndData();

    console.log("[db] reset+seed done", { core, accounts: {
      requestorOwner: accounts.requestorOwner?.email,
      requestorStaff: accounts.requestorStaff?.email,
      manufacturerOwner: accounts.manufacturerOwner?.email,
      manufacturerStaff: accounts.manufacturerStaff?.email,
      adminOwner: accounts.adminOwner?.email,
      adminStaff: accounts.adminStaff?.email,
    }, bulk: { requestors: bulk.requestors?.length, salesmen: bulk.salesmen?.length } });
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[db] reset+seed failed", err);
  process.exit(1);
});
