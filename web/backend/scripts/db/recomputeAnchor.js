// scripts/recomputeAnchor.js
// Usage:
//   MONGODB_URI="mongodb://..." node scripts/recomputeAnchor.js <anchorId_or_name>
import mongoose from "mongoose";
import { Types } from "mongoose";
import path from "path";
import "../../bootstrap/env.js"; // load environment from ENV_FILE if set

// Replace these paths if your project uses different relative paths
import BusinessAnchor from "../../models/businessAnchor.model.js";
import Request from "../../models/request.model.js";
import { recomputePricingReferralDailyOrderBucketsForBusinessAnchorId } from "../../services/pricingReferralOrderBucket.service.js";
import { recomputePricingReferralSnapshotsForAffectedAnchorId } from "../../services/pricingReferralSnapshot.service.js";

(async function main() {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGODB_URI_TEST;
    if (!uri) {
      console.error(
        "MONGODB_URI (or MONGODB_URI_TEST) environment variable is required.",
      );
      process.exit(1);
    }

    await mongoose.connect(uri, {
      // optional settings - tune as needed
      // mongoose v6+ doesn't use these options but we keep them for compatibility
    });

    const arg = process.argv[2];
    if (!arg) {
      console.error(
        "Usage: node scripts/recomputeAnchor.js <anchorId_or_name>",
      );
      process.exit(1);
    }

    let anchorDoc = null;
    const maybeId = String(arg || "").trim();
    if (Types.ObjectId.isValid(maybeId)) {
      anchorDoc = await BusinessAnchor.findById(maybeId).lean();
    }

    if (!anchorDoc) {
      // Try to find by name (case-insensitive, partial match)
      anchorDoc = await BusinessAnchor.findOne({
        $or: [
          { name: { $regex: maybeId, $options: "i" } },
          { businessName: { $regex: maybeId, $options: "i" } },
          { displayName: { $regex: maybeId, $options: "i" } },
        ],
      }).lean();
    }

    if (!anchorDoc) {
      console.error("BusinessAnchor not found for input:", arg);
      process.exit(2);
    }

    const anchorId = String(anchorDoc._id);
    console.log(
      "Found anchor:",
      anchorId,
      anchorDoc.name || anchorDoc.businessName || anchorDoc.displayName,
    );

    // 1) recompute daily buckets for this anchor
    console.log(
      "Recomputing PricingReferralDailyOrderBucket for anchor:",
      anchorId,
    );
    const buckets =
      await recomputePricingReferralDailyOrderBucketsForBusinessAnchorId(
        anchorId,
      );
    console.log("Recompute returned buckets count:", buckets.length);

    // 2) recompute snapshots affected by this anchor
    console.log(
      "Recomputing pricing referral snapshots (affected) for anchor:",
      anchorId,
    );
    const snapshotResults =
      await recomputePricingReferralSnapshotsForAffectedAnchorId(anchorId);
    console.log("Snapshot recompute results length:", snapshotResults.length);

    console.log("Done. Disconnecting.");
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Error during recompute:", err);
    try {
      await mongoose.disconnect();
    } catch (e) {}
    process.exit(99);
  }
})();
