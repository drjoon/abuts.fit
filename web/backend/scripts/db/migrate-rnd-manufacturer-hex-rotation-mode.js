import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import Request from "../../models/request.model.js";

// canonical: "보정" | "무보정"
// legacy mapping (for migration):
// - "0"  => "보정"
// - "30" => "무보정"

const LEGACY_TO_CANONICAL = {
  "0": "보정",
  "30": "무보정",
};

async function migrateRndManufacturerHexRotationMode() {
  await connectDb();

  try {
    const beforeLegacy0 = await Request.countDocuments({
      "rnd.manufacturerHexRotation": "0",
    });
    const beforeLegacy30 = await Request.countDocuments({
      "rnd.manufacturerHexRotation": "30",
    });

    const beforeTotal = beforeLegacy0 + beforeLegacy30;

    console.log("[db] migrate-rnd-manufacturer-hex-rotation-mode: before", {
      legacy0: beforeLegacy0,
      legacy30: beforeLegacy30,
      total: beforeTotal,
    });

    if (beforeTotal === 0) {
      console.log(
        "[db] migrate-rnd-manufacturer-hex-rotation-mode: nothing to migrate",
      );
      return;
    }

    const [result0, result30] = await Promise.all([
      Request.updateMany(
        { "rnd.manufacturerHexRotation": "0" },
        { $set: { "rnd.manufacturerHexRotation": LEGACY_TO_CANONICAL["0"] } },
      ),
      Request.updateMany(
        { "rnd.manufacturerHexRotation": "30" },
        {
          $set: {
            "rnd.manufacturerHexRotation": LEGACY_TO_CANONICAL["30"],
          },
        },
      ),
    ]);

    const afterLegacy0 = await Request.countDocuments({
      "rnd.manufacturerHexRotation": "0",
    });
    const afterLegacy30 = await Request.countDocuments({
      "rnd.manufacturerHexRotation": "30",
    });
    const canonicalCorrected = await Request.countDocuments({
      "rnd.manufacturerHexRotation": "보정",
    });
    const canonicalUncorrected = await Request.countDocuments({
      "rnd.manufacturerHexRotation": "무보정",
    });

    console.log("[db] migrate-rnd-manufacturer-hex-rotation-mode: done", {
      updatedFromLegacy0: result0.modifiedCount,
      updatedFromLegacy30: result30.modifiedCount,
      remainingLegacy0: afterLegacy0,
      remainingLegacy30: afterLegacy30,
      canonicalCorrected,
      canonicalUncorrected,
    });
  } finally {
    await disconnectDb();
  }
}

migrateRndManufacturerHexRotationMode().catch((error) => {
  console.error("[db] migrate-rnd-manufacturer-hex-rotation-mode failed", error);
  process.exit(1);
});
