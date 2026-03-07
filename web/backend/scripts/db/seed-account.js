import { connectDb, disconnectDb } from "./_mongo.js";
import { seedBulkAccounts, seedDefaultAccounts } from "./_seed.shared.js";

function parseCountArg(name) {
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(`${name}=`));
  if (!raw) return null;
  const value = Number.parseInt(raw.slice(name.length + 1), 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${name} count: ${raw}`);
  }
  return value;
}

async function run() {
  try {
    await connectDb();

    const requestorCount = parseCountArg("r");
    const salesmanCount = parseCountArg("s");

    if (requestorCount == null && salesmanCount == null) {
      const result = await seedDefaultAccounts();
      console.log("[db] seed-account done", {
        mode: "default",
        emails: Object.values(result.users || {}).map((user) => user?.email).filter(Boolean),
      });
      return;
    }

    const result = await seedBulkAccounts({
      requestorCount: requestorCount ?? 0,
      salesmanCount: salesmanCount ?? 0,
    });

    console.log("[db] seed-account done", {
      mode: "bulk",
      requestorCount: result.requestors.length,
      salesmanCount: result.salesmen.length,
    });
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[db] seed-account failed", err);
  process.exit(1);
});
