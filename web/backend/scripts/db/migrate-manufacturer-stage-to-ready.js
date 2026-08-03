import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import Request from "../../models/request.model.js";

// related files:
// - web/backend/models/request.model.js
// - web/backend/controllers/requests/utils.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts

async function migrateManufacturerStageToReady() {
  await connectDb();

  try {
    const before = {
      ready: await Request.countDocuments({ manufacturerStage: "준비" }),
      legacyKorean: await Request.countDocuments({ manufacturerStage: "의뢰" }),
      legacyEnglish: await Request.countDocuments({ manufacturerStage: "request" }),
      total: await Request.countDocuments({}),
    };

    console.log("[db] migrate-manufacturer-stage-to-ready: before", before);

    const result = await Request.updateMany(
      { manufacturerStage: { $in: ["의뢰", "request"] } },
      { $set: { manufacturerStage: "준비" } },
    );

    const after = {
      ready: await Request.countDocuments({ manufacturerStage: "준비" }),
      legacyKorean: await Request.countDocuments({ manufacturerStage: "의뢰" }),
      legacyEnglish: await Request.countDocuments({ manufacturerStage: "request" }),
      total: await Request.countDocuments({}),
    };

    console.log("[db] migrate-manufacturer-stage-to-ready: done", {
      matched: Number(result.matchedCount || 0),
      modified: Number(result.modifiedCount || 0),
      after,
    });
  } finally {
    await disconnectDb();
  }
}

migrateManufacturerStageToReady().catch((error) => {
  console.error("[db] migrate-manufacturer-stage-to-ready failed", error);
  process.exit(1);
});
