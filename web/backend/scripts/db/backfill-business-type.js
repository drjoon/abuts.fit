import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";

const VALID_BUSINESS_TYPES = [
  "requestor",
  "salesman",
  "manufacturer",
  "devops",
  "admin",
];

async function backfillBusinessType() {
  await connectDb();

  try {
    // Find anchors with missing or empty top-level businessType
    const query = {
      $or: [
        { businessType: { $exists: false } },
        { businessType: "" },
        { businessType: null },
      ],
    };

    const anchors = await BusinessAnchor.find(query).lean();
    console.log(`[db] backfill-business-type: found ${anchors.length} anchors with missing businessType`);

    let modified = 0;
    let errors = 0;
    const details = [];

    for (const anchor of anchors) {
      const anchorId = String(anchor._id);
      const metadataType = String(anchor.metadata?.businessType || "").trim();
      
      // Determine the correct businessType
      let newBusinessType = "requestor"; // default
      
      if (metadataType && VALID_BUSINESS_TYPES.includes(metadataType)) {
        newBusinessType = metadataType;
      }

      try {
        const result = await BusinessAnchor.updateOne(
          { _id: anchor._id },
          { $set: { businessType: newBusinessType } },
        );

        if (result.modifiedCount > 0) {
          modified++;
          details.push({
            id: anchorId,
            name: anchor.name,
            oldMetadataType: metadataType || "(empty)",
            newBusinessType,
          });
        }
      } catch (err) {
        errors++;
        console.error(`[db] backfill-business-type: failed to update ${anchorId}`, err.message);
      }
    }

    console.log("[db] backfill-business-type done", {
      found: anchors.length,
      modified,
      errors,
      details: details.slice(0, 10), // Show first 10 for brevity
    });

    if (details.length > 10) {
      console.log(`[db] backfill-business-type: ... and ${details.length - 10} more`);
    }
  } finally {
    await disconnectDb();
  }
}

backfillBusinessType().catch((error) => {
  console.error("[db] backfill-business-type failed", error);
  process.exit(1);
});
