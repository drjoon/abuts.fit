// One-off: 애크로덴트 사업자를 플랫폼 제어로 표시한다.
// cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true node scripts/db/mark-platform-manufacturer.js
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";

async function main() {
  await connectDb();
  const dbName = mongoose.connection?.db?.databaseName || "";
  console.log("dbName", dbName);
  if (dbName !== "abuts_fit_test") {
    throw new Error(`expected abuts_fit_test, got ${dbName || "(empty)"}`);
  }
  const result = await mongoose.connection.db
    .collection("businessanchors")
    .updateMany(
      {
        businessType: "manufacturer",
        name: { $regex: "애크로덴트|acrodent", $options: "i" },
      },
      {
        $set: {
          productionControl: "platform",
          operatingStatus: "running",
        },
      },
    );
  console.log(
    "matched",
    result.matchedCount,
    "modified",
    result.modifiedCount,
  );
  await disconnectDb();
}

main().catch(async (error) => {
  console.error(error?.message || error);
  try {
    await disconnectDb();
  } catch {
    // already closed
  }
  process.exit(1);
});
