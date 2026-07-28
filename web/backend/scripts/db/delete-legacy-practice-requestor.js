/**
 * 구 practice 샘플 계정 정리 스크립트
 *
 * 대상(엄격):
 * - User.role === "requestor" 이고 email 이 `practice.`로 시작하는 계정
 * - 위 사용자와 연결된 BusinessAnchor
 * - 또는 businessNumberNormalized 가 `practice-`로 시작하는 requestor anchor
 *
 * 기본은 dry-run이며, 실제 삭제는 `--execute` 플래그가 필요합니다.
 *
 * 사용:
 *   cross-env ENV_FILE=local.env node scripts/db/delete-legacy-practice-requestor.js
 *   cross-env ENV_FILE=local.env node scripts/db/delete-legacy-practice-requestor.js --execute
 */

import mongoose from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import User from "../../models/user.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";

const shouldExecute = process.argv.includes("--execute");

async function run() {
  const { mongoUri } = await connectDb();
  console.log("[cleanup-legacy-practice] connected", {
    mongoUri: String(mongoUri || "").replace(/\/\/(.*)@/, "//***@"),
    mode: shouldExecute ? "execute" : "dry-run",
  });

  const legacyUsers = await User.find({
    role: "requestor",
    email: { $regex: /^practice\./i },
  })
    .select({ _id: 1, email: 1, businessAnchorId: 1, business: 1 })
    .lean();

  const legacyUserIds = legacyUsers.map((u) => String(u._id));
  const legacyUserObjectIds = legacyUsers.map((u) => u._id);

  const anchorsByUser = legacyUserObjectIds.length
    ? await BusinessAnchor.find({
        $or: [
          { primaryContactUserId: { $in: legacyUserObjectIds } },
          { owners: { $in: legacyUserObjectIds } },
          { members: { $in: legacyUserObjectIds } },
        ],
      })
        .select({ _id: 1, businessType: 1, name: 1, businessNumberNormalized: 1 })
        .lean()
    : [];

  const anchorsByPracticeBn = await BusinessAnchor.find({
    businessType: "requestor",
    businessNumberNormalized: { $regex: /^practice-/i },
  })
    .select({ _id: 1, businessType: 1, name: 1, businessNumberNormalized: 1 })
    .lean();

  const anchorMap = new Map();
  for (const a of [...anchorsByUser, ...anchorsByPracticeBn]) {
    anchorMap.set(String(a._id), a);
  }
  const targetAnchors = [...anchorMap.values()];
  const targetAnchorIds = targetAnchors.map((a) => a._id);

  const extraUsersByAnchor = targetAnchorIds.length
    ? await User.find({ businessAnchorId: { $in: targetAnchorIds } })
        .select({ _id: 1, email: 1, role: 1, businessAnchorId: 1 })
        .lean()
    : [];

  const userMap = new Map();
  for (const u of legacyUsers) userMap.set(String(u._id), u);
  for (const u of extraUsersByAnchor) userMap.set(String(u._id), u);
  const targetUsers = [...userMap.values()];
  const targetUserIds = targetUsers.map((u) => u._id);

  console.log("[cleanup-legacy-practice] candidates", {
    users: targetUsers.length,
    anchors: targetAnchors.length,
  });

  if (targetUsers.length > 0) {
    console.log(
      "[cleanup-legacy-practice] user emails:",
      targetUsers.map((u) => String(u.email || "")).filter(Boolean),
    );
  }
  if (targetAnchors.length > 0) {
    console.log(
      "[cleanup-legacy-practice] anchors:",
      targetAnchors.map((a) => ({
        id: String(a._id),
        name: String(a.name || ""),
        businessType: String(a.businessType || ""),
        businessNumberNormalized: String(a.businessNumberNormalized || ""),
      })),
    );
  }

  if (!shouldExecute) {
    console.log("[cleanup-legacy-practice] dry-run complete. Use --execute to delete.");
    return;
  }

  if (targetUserIds.length > 0) {
    await User.deleteMany({ _id: { $in: targetUserIds } });
  }
  if (targetAnchorIds.length > 0) {
    await BusinessAnchor.deleteMany({ _id: { $in: targetAnchorIds } });
  }

  // dangling reference 최소 정리
  if (targetAnchorIds.length > 0) {
    await User.updateMany(
      { businessAnchorId: { $in: targetAnchorIds } },
      { $set: { businessAnchorId: null, subRole: null } },
    );
  }

  console.log("[cleanup-legacy-practice] deleted", {
    users: targetUserIds.length,
    anchors: targetAnchorIds.length,
  });
}

run()
  .catch((err) => {
    console.error("[cleanup-legacy-practice] failed", err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await disconnectDb();
    } finally {
      await mongoose.disconnect().catch(() => undefined);
    }
  });
