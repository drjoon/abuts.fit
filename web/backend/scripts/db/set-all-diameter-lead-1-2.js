// related files:
// - web/backend/controllers/businesses/leadTime.controller.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/systemSettings.model.js
// One-off: 전 직경(6/8/10/12mm) 리드타임 1~2영업일 고정.
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";

const LEAD_TIMES = {
  d6: { minBusinessDays: 1, maxBusinessDays: 2 },
  d8: { minBusinessDays: 1, maxBusinessDays: 2 },
  d10: { minBusinessDays: 1, maxBusinessDays: 2 },
  d12: { minBusinessDays: 1, maxBusinessDays: 2 },
};

const DELIVERY_ETA_LEAD_DAYS = { d6: 1, d8: 1, d10: 1, d12: 1 };

async function main() {
  await connectDb();

  const mfRes = await mongoose.connection.db
    .collection("businessanchors")
    .updateMany(
      { businessType: "manufacturer" },
      {
        $set: {
          "shippingPolicy.leadTimes": LEAD_TIMES,
          "shippingPolicy.updatedAt": new Date(),
        },
      },
    );
  console.log("[db] manufacturer leadTimes", {
    matched: mfRes.matchedCount,
    modified: mfRes.modifiedCount,
  });

  const ssRes = await mongoose.connection.db
    .collection("systemsettings")
    .updateMany({}, { $set: { deliveryEtaLeadDays: DELIVERY_ETA_LEAD_DAYS } });
  console.log("[db] systemsettings deliveryEtaLeadDays", {
    matched: ssRes.matchedCount,
    modified: ssRes.modifiedCount,
  });

  const sample = await mongoose.connection.db
    .collection("businessanchors")
    .find(
      { businessType: "manufacturer" },
      { projection: { name: 1, "shippingPolicy.leadTimes": 1 } },
    )
    .limit(3)
    .toArray();
  console.log("[db] sample", JSON.stringify(sample, null, 2));

  await disconnectDb();
}

main().catch((err) => {
  console.error("[db] set-all-diameter-lead-1-2 failed", err);
  process.exit(1);
});
