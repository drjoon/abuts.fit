// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";

// canonical: "STL모델대로" | "헥스30도회전"
// legacy mapping (for migration):
// - "0"  => "STL모델대로"
// - "30" => "헥스30도회전"

const LEGACY_TO_CANONICAL = {
  "0": "STL모델대로",
  "30": "헥스30도회전",
};

async function migrateBusinessAnchorDefaultManufacturerHexRotationMode() {
  await connectDb();

  try {
    const beforeLegacy0 = await BusinessAnchor.countDocuments({
      "requestSettings.defaultManufacturerHexRotation": "0",
    });
    const beforeLegacy30 = await BusinessAnchor.countDocuments({
      "requestSettings.defaultManufacturerHexRotation": "30",
    });

    const beforeTotal = beforeLegacy0 + beforeLegacy30;

    console.log(
      "[db] migrate-business-anchor-default-manufacturer-hex-rotation-mode: before",
      {
        legacy0: beforeLegacy0,
        legacy30: beforeLegacy30,
        total: beforeTotal,
      },
    );

    if (beforeTotal === 0) {
      console.log(
        "[db] migrate-business-anchor-default-manufacturer-hex-rotation-mode: nothing to migrate",
      );
      return;
    }

    const [result0, result30] = await Promise.all([
      BusinessAnchor.updateMany(
        { "requestSettings.defaultManufacturerHexRotation": "0" },
        {
          $set: {
            "requestSettings.defaultManufacturerHexRotation":
              LEGACY_TO_CANONICAL["0"],
          },
        },
      ),
      BusinessAnchor.updateMany(
        { "requestSettings.defaultManufacturerHexRotation": "30" },
        {
          $set: {
            "requestSettings.defaultManufacturerHexRotation":
              LEGACY_TO_CANONICAL["30"],
          },
        },
      ),
    ]);

    const afterLegacy0 = await BusinessAnchor.countDocuments({
      "requestSettings.defaultManufacturerHexRotation": "0",
    });
    const afterLegacy30 = await BusinessAnchor.countDocuments({
      "requestSettings.defaultManufacturerHexRotation": "30",
    });
    const canonicalStl = await BusinessAnchor.countDocuments({
      "requestSettings.defaultManufacturerHexRotation": "STL모델대로",
    });
    const canonicalHex30 = await BusinessAnchor.countDocuments({
      "requestSettings.defaultManufacturerHexRotation": "헥스30도회전",
    });

    console.log(
      "[db] migrate-business-anchor-default-manufacturer-hex-rotation-mode: done",
      {
        updatedFromLegacy0: result0.modifiedCount,
        updatedFromLegacy30: result30.modifiedCount,
        remainingLegacy0: afterLegacy0,
        remainingLegacy30: afterLegacy30,
        canonicalStl,
        canonicalHex30,
      },
    );
  } finally {
    await disconnectDb();
  }
}

migrateBusinessAnchorDefaultManufacturerHexRotationMode().catch((error) => {
  console.error(
    "[db] migrate-business-anchor-default-manufacturer-hex-rotation-mode failed",
    error,
  );
  process.exit(1);
});
