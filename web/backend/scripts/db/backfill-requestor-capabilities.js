// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/user.model.js
// - web/backend/utils/requestorCapabilities.js
// - rules.md
/**
 * 레거시 practice → requestor+clinic, 기존 requestor → lab 백필.
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

const APPLY = process.argv.includes("--apply");

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
          "requestorCapabilities.clinic": { $ne: true },
          "requestorCapabilities.lab": { $ne: true },
        },
      ],
    })
      .select({ _id: 1, name: 1, status: 1, requestorCapabilities: 1 })
      .lean();

    const practiceUsers = await User.find({ role: "practice" })
      .select({ _id: 1, email: 1, businessAnchorId: 1 })
      .lean();

    console.log("[backfill-requestor-capabilities] plan", {
      apply: APPLY,
      practiceAnchors: practiceAnchors.length,
      requestorAnchorsMissingCaps: requestorAnchorsMissing.length,
      practiceUsers: practiceUsers.length,
    });

    if (!APPLY) {
      console.log(
        "[backfill-requestor-capabilities] dry-run only. Re-run with --apply to mutate.",
      );
      return;
    }

    let practiceAnchorUpdated = 0;
    for (const a of practiceAnchors) {
      const res = await BusinessAnchor.updateOne(
        { _id: a._id },
        {
          $set: {
            businessType: "requestor",
            requestorCapabilities: { clinic: true, lab: false },
          },
        },
      );
      if (res.modifiedCount) practiceAnchorUpdated += 1;
    }

    let requestorAnchorUpdated = 0;
    for (const a of requestorAnchorsMissing) {
      const hasClinic = Boolean(a.requestorCapabilities?.clinic);
      const hasLab = Boolean(a.requestorCapabilities?.lab);
      if (hasClinic || hasLab) continue;
      const caps =
        a.status === "verified"
          ? { clinic: false, lab: true }
          : { clinic: true, lab: false };
      const res = await BusinessAnchor.updateOne(
        { _id: a._id },
        { $set: { requestorCapabilities: caps } },
      );
      if (res.modifiedCount) requestorAnchorUpdated += 1;
    }

    let practiceUserUpdated = 0;
    for (const u of practiceUsers) {
      const res = await User.updateOne(
        { _id: u._id },
        {
          $set: {
            role: "requestor",
            requestorCapabilities: { clinic: true, lab: false },
          },
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
      const has =
        Boolean(u.requestorCapabilities?.clinic) ||
        Boolean(u.requestorCapabilities?.lab);
      if (has) continue;
      let caps = { clinic: true, lab: false };
      if (u.businessAnchorId) {
        const anchor = await BusinessAnchor.findById(u.businessAnchorId)
          .select({ requestorCapabilities: 1, status: 1 })
          .lean();
        if (
          anchor?.requestorCapabilities?.clinic ||
          anchor?.requestorCapabilities?.lab
        ) {
          caps = {
            clinic: Boolean(anchor.requestorCapabilities.clinic),
            lab: Boolean(anchor.requestorCapabilities.lab),
          };
        } else if (anchor?.status === "verified") {
          caps = { clinic: false, lab: true };
        }
      }
      const res = await User.updateOne(
        { _id: u._id },
        { $set: { requestorCapabilities: caps } },
      );
      if (res.modifiedCount) userCapsSynced += 1;
    }

    console.log("[backfill-requestor-capabilities] done", {
      practiceAnchorUpdated,
      requestorAnchorUpdated,
      practiceUserUpdated,
      userCapsSynced,
    });
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error("[backfill-requestor-capabilities] failed", err);
  process.exitCode = 1;
});
