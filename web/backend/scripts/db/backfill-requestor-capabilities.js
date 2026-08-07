// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/user.model.js
// - web/backend/utils/requestorCapabilities.js
// - rules.md
/**
 * 레거시 practice role → requestor+practice, clinic 키 → practice 키, 기존 requestor caps 백필.
 *
 * Usage:
 *   node scripts/db/backfill-requestor-capabilities.js
 *   ABUTS_DB_FORCE=true node scripts/db/backfill-requestor-capabilities.js  # remote
 *
 * Dry-run (default): prints counts. Pass --apply to mutate.
 */
import "../../bootstrap/env.js";
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import { normalizeRequestorCapabilities } from "../../utils/requestorCapabilities.js";

const APPLY = process.argv.includes("--apply");

const toCanonicalCaps = (raw, fallback) => {
  const n = normalizeRequestorCapabilities(raw);
  if (n.practice || n.lab) return n;
  return fallback;
};

async function main() {
  await connectDb();
  try {
    const practiceAnchors = await BusinessAnchor.find({
      businessType: "practice",
    })
      .select({ _id: 1, name: 1, requestorCapabilities: 1 })
      .lean();

    const requestorAnchorsMissing = await BusinessAnchor.find({
      businessType: "requestor",
      $or: [
        { requestorCapabilities: { $exists: false } },
        {
          "requestorCapabilities.practice": { $ne: true },
          "requestorCapabilities.clinic": { $ne: true },
          "requestorCapabilities.lab": { $ne: true },
        },
      ],
    })
      .select({ _id: 1, name: 1, status: 1, requestorCapabilities: 1 })
      .lean();

    const legacyClinicKeyAnchors = await BusinessAnchor.find({
      "requestorCapabilities.clinic": { $exists: true },
    })
      .select({ _id: 1, requestorCapabilities: 1 })
      .lean();

    const practiceUsers = await User.find({ role: "practice" })
      .select({ _id: 1, email: 1, businessAnchorId: 1 })
      .lean();

    const legacyClinicKeyUsers = await User.find({
      "requestorCapabilities.clinic": { $exists: true },
    })
      .select({ _id: 1, requestorCapabilities: 1 })
      .lean();

    console.log("[backfill-requestor-capabilities] plan", {
      apply: APPLY,
      practiceAnchors: practiceAnchors.length,
      requestorAnchorsMissingCaps: requestorAnchorsMissing.length,
      legacyClinicKeyAnchors: legacyClinicKeyAnchors.length,
      practiceUsers: practiceUsers.length,
      legacyClinicKeyUsers: legacyClinicKeyUsers.length,
    });

    if (!APPLY) {
      console.log(
        "[backfill-requestor-capabilities] dry-run only. Re-run with --apply to mutate.",
      );
      return;
    }

    let practiceAnchorUpdated = 0;
    for (const a of practiceAnchors) {
      const caps = toCanonicalCaps(a.requestorCapabilities, {
        practice: true,
        lab: false,
      });
      const res = await BusinessAnchor.updateOne(
        { _id: a._id },
        {
          $set: {
            businessType: "requestor",
            requestorCapabilities: caps,
          },
          $unset: { "requestorCapabilities.clinic": "" },
        },
      );
      if (res.modifiedCount) practiceAnchorUpdated += 1;
    }

    let requestorAnchorUpdated = 0;
    for (const a of requestorAnchorsMissing) {
      const n = normalizeRequestorCapabilities(a.requestorCapabilities);
      if (n.practice || n.lab) continue;
      const caps =
        a.status === "verified"
          ? { practice: false, lab: true }
          : { practice: true, lab: false };
      const res = await BusinessAnchor.updateOne(
        { _id: a._id },
        {
          $set: { requestorCapabilities: caps },
          $unset: { "requestorCapabilities.clinic": "" },
        },
      );
      if (res.modifiedCount) requestorAnchorUpdated += 1;
    }

    let clinicKeyAnchorMigrated = 0;
    for (const a of legacyClinicKeyAnchors) {
      const caps = toCanonicalCaps(a.requestorCapabilities, {
        practice: true,
        lab: false,
      });
      const res = await BusinessAnchor.updateOne(
        { _id: a._id },
        {
          $set: { requestorCapabilities: caps },
          $unset: { "requestorCapabilities.clinic": "" },
        },
      );
      if (res.modifiedCount) clinicKeyAnchorMigrated += 1;
    }

    let practiceUserUpdated = 0;
    for (const u of practiceUsers) {
      const res = await User.updateOne(
        { _id: u._id },
        {
          $set: {
            role: "requestor",
            requestorCapabilities: { practice: true, lab: false },
          },
          $unset: { "requestorCapabilities.clinic": "" },
        },
      );
      if (res.modifiedCount) practiceUserUpdated += 1;
    }

    // Sync user caps from their anchors when missing
    const requestorUsers = await User.find({ role: "requestor" })
      .select({ _id: 1, businessAnchorId: 1, requestorCapabilities: 1 })
      .lean();
    let userCapsSynced = 0;
    for (const u of requestorUsers) {
      const has = normalizeRequestorCapabilities(u.requestorCapabilities);
      if (has.practice || has.lab) continue;
      let caps = { practice: true, lab: false };
      if (u.businessAnchorId) {
        const anchor = await BusinessAnchor.findById(u.businessAnchorId)
          .select({ requestorCapabilities: 1, status: 1 })
          .lean();
        const fromAnchor = normalizeRequestorCapabilities(
          anchor?.requestorCapabilities,
        );
        if (fromAnchor.practice || fromAnchor.lab) {
          caps = fromAnchor;
        } else if (anchor?.status === "verified") {
          caps = { practice: false, lab: true };
        }
      }
      const res = await User.updateOne(
        { _id: u._id },
        {
          $set: { requestorCapabilities: caps },
          $unset: { "requestorCapabilities.clinic": "" },
        },
      );
      if (res.modifiedCount) userCapsSynced += 1;
    }

    let clinicKeyUserMigrated = 0;
    for (const u of legacyClinicKeyUsers) {
      const caps = toCanonicalCaps(u.requestorCapabilities, {
        practice: true,
        lab: false,
      });
      const res = await User.updateOne(
        { _id: u._id },
        {
          $set: { requestorCapabilities: caps },
          $unset: { "requestorCapabilities.clinic": "" },
        },
      );
      if (res.modifiedCount) clinicKeyUserMigrated += 1;
    }

    console.log("[backfill-requestor-capabilities] done", {
      practiceAnchorUpdated,
      requestorAnchorUpdated,
      clinicKeyAnchorMigrated,
      practiceUserUpdated,
      userCapsSynced,
      clinicKeyUserMigrated,
    });
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error("[backfill-requestor-capabilities] failed", err);
  process.exitCode = 1;
});
