// related files:
// - web/backend/controllers/businesses/business.demoMode.util.js
// - web/backend/scripts/db/_mongo.js
import mongoose from "mongoose";
import {
  assertSafeToMutateDb,
  getMongoUri,
} from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import { enableDemoModeAndGrantCreditIfEligible } from "../../controllers/businesses/business.demoMode.util.js";
import { getBusinessCreditBalanceSnapshot } from "../../services/creditBalance.service.js";

async function main() {
  const uri = getMongoUri();
  assertSafeToMutateDb(uri);
  await mongoose.connect(uri);

  const emailHint = String(process.argv[2] || "").trim().toLowerCase();
  let user = null;
  if (emailHint) {
    user = await User.findOne({
      email: new RegExp(emailHint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      role: "requestor",
      businessAnchorId: { $ne: null },
    })
      .select({ email: 1, name: 1, businessAnchorId: 1, requestorKind: 1 })
      .lean();
  }
  if (!user) {
    const users = await User.find({
      role: "requestor",
      businessAnchorId: { $ne: null },
    })
      .select({ email: 1, name: 1, businessAnchorId: 1, requestorKind: 1 })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();
    for (const u of users) {
      const a = await BusinessAnchor.findById(u.businessAnchorId)
        .select({ requestorKind: 1, name: 1, demoMode: 1 })
        .lean();
      if (a?.requestorKind === "practice") {
        user = u;
        break;
      }
      if (!user) user = u;
    }
  }
  if (!user?.businessAnchorId) {
    throw new Error("No requestor with businessAnchorId found");
  }

  const before = await BusinessAnchor.findById(user.businessAnchorId)
    .select({ name: 1, demoMode: 1, requestorKind: 1 })
    .lean();
  console.log("target", {
    email: user.email,
    anchorId: String(user.businessAnchorId),
    name: before?.name,
    kind: before?.requestorKind,
    demoMode: before?.demoMode,
  });

  // Force-enable even if previously exited (local test only)
  await BusinessAnchor.updateOne(
    { _id: user.businessAnchorId },
    {
      $set: {
        demoMode: true,
        demoModeExitedAt: null,
        demoModeStartedAt: new Date(),
      },
    },
  );

  // Reset prior DEMO_CREDIT grant so charge can post again
  const FreeCreditGrant = (await import("../../models/freeCreditGrant.model.js"))
    .default;
  const anchor = await BusinessAnchor.findById(user.businessAnchorId)
    .select({ businessNumberNormalized: 1, metadata: 1 })
    .lean();
  const bn =
    String(anchor?.metadata?.businessNumber || "")
      .replace(/\D/g, "")
      .trim() ||
    String(anchor?.businessNumberNormalized || "")
      .trim()
      .toLowerCase();
  if (bn) {
    await FreeCreditGrant.deleteMany({ type: "DEMO_CREDIT", businessNumber: bn });
  }

  const result = await enableDemoModeAndGrantCreditIfEligible({
    businessAnchorId: user.businessAnchorId,
    userId: user._id,
  });
  const bal = await getBusinessCreditBalanceSnapshot({
    businessAnchorId: user.businessAnchorId,
  });
  const after = await BusinessAnchor.findById(user.businessAnchorId)
    .select({ demoMode: 1, demoModeExitedAt: 1 })
    .lean();
  console.log("enabled", { result, after, freeRequestCredit: bal.freeRequestCredit, balance: bal.balance });
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
