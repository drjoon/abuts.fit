#!/usr/bin/env node
// related files:
// - web/backend/services/referralOwnershipReset.service.js
/**
 * 소개 귀속 리셋·재적용 통합 스모크 (임시 BA 생성 후 정리).
 *
 * cd web/backend && \
 *   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
 *   node scripts/db/verify-referral-ownership-reset-smoke.js
 */
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import {
  applyReferralCodeToUnownedRequestor,
  resetExpiredReferralOwnerships,
} from "../../services/referralOwnershipReset.service.js";

const TAG = `ref-reset-smoke-${Date.now()}`;

async function cleanup(ids) {
  const objectIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (objectIds.length) {
    await Request.deleteMany({ businessAnchorId: { $in: objectIds } });
    await BusinessAnchor.deleteMany({ _id: { $in: objectIds } });
    await User.deleteMany({ businessAnchorId: { $in: objectIds } });
  }
}

async function main() {
  await connectDb();
  const created = [];

  try {
    const salesman = await BusinessAnchor.create({
      businessType: "salesman",
      businessNumberNormalized: `SMOKE${Date.now()}1`,
      name: `${TAG}-salesman`,
      status: "active",
    });
    created.push(salesman._id);

    const salesmanUser = await User.create({
      email: `${TAG}-sales@example.com`,
      password: "SmokeTest123!",
      name: `${TAG}-sales`,
      role: "salesman",
      referralCode: "SMK",
      businessAnchorId: salesman._id,
      active: true,
    });
    created.push(salesmanUser.businessAnchorId);

    const oldCreatedAt = new Date("2026-01-01T00:00:00+09:00");
    const requestor = await BusinessAnchor.create({
      businessType: "requestor",
      businessNumberNormalized: `SMOKE${Date.now()}2`,
      name: `${TAG}-requestor`,
      status: "active",
      referredByAnchorId: salesman._id,
      defaultReferralAnchorId: salesman._id,
      createdAt: oldCreatedAt,
      updatedAt: oldCreatedAt,
    });
    // createdAt setOnInsert may ignore; force
    await BusinessAnchor.updateOne(
      { _id: requestor._id },
      { $set: { createdAt: oldCreatedAt } },
    );
    created.push(requestor._id);

    const requestorUser = await User.create({
      email: `${TAG}-req@example.com`,
      password: "SmokeTest123!",
      name: `${TAG}-req`,
      role: "requestor",
      businessAnchorId: requestor._id,
      referredByAnchorId: salesman._id,
      active: true,
    });

    const before = await BusinessAnchor.findById(requestor._id)
      .select({ referredByAnchorId: 1 })
      .lean();
    if (String(before?.referredByAnchorId) !== String(salesman._id)) {
      throw new Error("setup failed: referredBy not set");
    }

    const resetResult = await resetExpiredReferralOwnerships({
      dryRun: false,
      limit: 5000,
      now: new Date("2026-09-21T12:00:00+09:00"),
    });
    const afterReset = await BusinessAnchor.findById(requestor._id)
      .select({ referredByAnchorId: 1 })
      .lean();
    const userAfter = await User.findById(requestorUser._id)
      .select({ referredByAnchorId: 1 })
      .lean();

    if (afterReset?.referredByAnchorId) {
      throw new Error(
        `expected reset to null, got ${afterReset.referredByAnchorId}; resetResult=${JSON.stringify(resetResult)}`,
      );
    }
    if (userAfter?.referredByAnchorId) {
      throw new Error("expected user referredBy mirror cleared");
    }

    const reclaim = await applyReferralCodeToUnownedRequestor({
      requestorBusinessAnchorId: requestor._id,
      referralCode: "SMK",
      actorUserId: requestorUser._id,
    });
    if (String(reclaim.referredByAnchorId) !== String(salesman._id)) {
      throw new Error("reclaim failed");
    }

    // 최근 주문이 있으면 리셋되지 않아야 함
    await Request.collection.insertOne({
      businessAnchorId: requestor._id,
      requestor: requestorUser._id,
      manufacturerStage: "포장.발송",
      createdAt: new Date("2026-09-01T00:00:00+09:00"),
      updatedAt: new Date("2026-09-01T00:00:00+09:00"),
    });
    // re-set ownership then try reset with recent order
    await BusinessAnchor.updateOne(
      { _id: requestor._id },
      {
        $set: {
          referredByAnchorId: salesman._id,
          createdAt: oldCreatedAt,
        },
      },
    );
    const resetWithOrder = await resetExpiredReferralOwnerships({
      dryRun: false,
      limit: 5000,
      now: new Date("2026-09-21T12:00:00+09:00"),
    });
    const stillOwned = await BusinessAnchor.findById(requestor._id)
      .select({ referredByAnchorId: 1 })
      .lean();
    if (String(stillOwned?.referredByAnchorId) !== String(salesman._id)) {
      throw new Error(
        `recent order should keep ownership; got ${stillOwned?.referredByAnchorId}; ${JSON.stringify(resetWithOrder)}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          resetCleared: true,
          reclaimOk: true,
          recentOrderKeepsOwnership: true,
          resetCount: resetResult.reset,
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanup(created);
    await User.deleteMany({ email: { $regex: `^${TAG}` } });
    await BusinessAnchor.deleteMany({ name: { $regex: `^${TAG}` } });
    // fire-and-forget 스냅샷이 끊기지 않게 잠시 대기
    await new Promise((r) => setTimeout(r, 500));
    await disconnectDb();
  }
}

main().catch(async (err) => {
  console.error(err);
  try {
    await disconnectDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
