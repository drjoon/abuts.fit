// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import Request from "../../models/request.model.js";

// canonical: "STL모델대로" | "헥스30도회전"
// legacy mapping (for migration):
// - "0"  => "STL모델대로"
// - "30" => "헥스30도회전"

const LEGACY_TO_CANONICAL = {
  "0": "STL모델대로",
  "30": "헥스30도회전",
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
    const canonicalStl = await Request.countDocuments({
      "rnd.manufacturerHexRotation": "STL모델대로",
    });
    const canonicalHex30 = await Request.countDocuments({
      "rnd.manufacturerHexRotation": "헥스30도회전",
    });

    console.log("[db] migrate-rnd-manufacturer-hex-rotation-mode: done", {
      updatedFromLegacy0: result0.modifiedCount,
      updatedFromLegacy30: result30.modifiedCount,
      remainingLegacy0: afterLegacy0,
      remainingLegacy30: afterLegacy30,
      canonicalStl,
      canonicalHex30,
    });
  } finally {
    await disconnectDb();
  }
}

migrateRndManufacturerHexRotationMode().catch((error) => {
  console.error("[db] migrate-rnd-manufacturer-hex-rotation-mode failed", error);
  process.exit(1);
});
