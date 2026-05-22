// scripts/recomputeAllAnchors.js
// Usage:
//   MONGODB_URI="mongodb://..." node scripts/db/recomputeAllAnchors.js
import mongoose from "mongoose";
import "../../bootstrap/env.js"; // load environment from ENV_FILE if set

import BusinessAnchor from "../../models/businessAnchor.model.js";
import { recomputePricingReferralDailyOrderBucketsForBusinessAnchorId } from "../../services/pricingReferralOrderBucket.service.js";
import { recomputePricingReferralSnapshotsForAffectedAnchorId } from "../../services/pricingReferralSnapshot.service.js";

async function main() {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGODB_URI_TEST;
    if (!uri) {
      console.error("MONGODB_URI (or MONGODB_URI_TEST) environment variable is required.");
      process.exit(1);
    }

    await mongoose.connect(uri);

    console.log("Connected to MongoDB.");

    const anchors = await BusinessAnchor.find({}).select({ _id: 1, name: 1 }).lean();
    console.log(`Found ${anchors.length} anchors.`);

    let idx = 0;
    for (const a of anchors) {
      idx += 1;
      const anchorId = String(a._id);
      const label = a.name || a.businessName || a.displayName || anchorId;
      try {
        console.log(`[${idx}/${anchors.length}] Recomputing buckets for ${label} (${anchorId})...`);
        const buckets = await recomputePricingReferralDailyOrderBucketsForBusinessAnchorId(anchorId);
        console.log(`  -> buckets: ${buckets.length}`);

        console.log(`  Recomputing snapshots for ${label} (${anchorId})...`);
        const snaps = await recomputePricingReferralSnapshotsForAffectedAnchorId(anchorId);
        console.log(`  -> snapshots: ${snaps.length}`);
      } catch (err) {
        console.error(`  Error for anchor ${anchorId}:`, err);
      }
    }

    console.log("All anchors processed. Disconnecting.");
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Failed to recompute all anchors:", err);
    try { await mongoose.disconnect(); } catch (e) {}
    process.exit(2);
  }
}

main();
