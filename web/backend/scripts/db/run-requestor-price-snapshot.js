// related files:
// - web/backend/services/pricingReferralSnapshot.service.js
// - web/backend/jobs/dailyReferralSnapshotWorker.js
// - web/backend/utils/requestorUnitPricePolicy.js
/**
 * 오늘(KST) 의뢰자 건당 의뢰비 스냅샷을 즉시 한 번 만든다(자정 워커와 동일 집계).
 * 이미 단가가 있는 오늘 스냅샷은 건드리지 않는다(--force로 단가 재확정).
 *
 * ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
 *   node scripts/db/run-requestor-price-snapshot.js [--force]
 */
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import User from "../../models/user.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import PricingReferralDailyOrderBucket from "../../models/pricingReferralDailyOrderBucket.model.js";
import PricingReferralRolling30dAggregate from "../../models/pricingReferralRolling30dAggregate.model.js";
import { recomputePricingReferralSnapshotForLeaderAnchorId } from "../../services/pricingReferralSnapshot.service.js";
import { recomputePricingReferralDailyOrderBucketsForBusinessAnchorId } from "../../services/pricingReferralOrderBucket.service.js";
import { getTodayYmdInKst } from "../../utils/krBusinessDays.js";

const valid = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));

async function main() {
  const force = process.argv.includes("--force");
  const ymd = getTodayYmdInKst();
  await connectDb();

  if (force) {
    const r = await PricingReferralRolling30dAggregate.updateMany(
      { ymd },
      { $set: { unitPrice: null, priceRule: null } },
    );
    console.log("[price-snapshot] reset unitPrice", r.modifiedCount);
  }

  const leaders = await User.find({
    $or: [
      { role: "salesman" },
      { role: "devops" },
      { role: "requestor", subRole: "owner" },
    ],
    active: true,
    businessAnchorId: { $ne: null },
  })
    .select({ businessAnchorId: 1 })
    .lean();
  const leaderIds = [
    ...new Set(leaders.map((l) => String(l.businessAnchorId)).filter(valid)),
  ];

  const orderAnchorIds = [
    ...new Set(
      [
        ...(await ShippingPackage.distinct("businessAnchorId")),
        ...(await PricingReferralDailyOrderBucket.distinct("businessAnchorId")),
      ]
        .map(String)
        .filter(valid),
    ),
  ];
  for (const id of orderAnchorIds) {
    await recomputePricingReferralDailyOrderBucketsForBusinessAnchorId(id);
  }

  let n = 0;
  for (const id of leaderIds) {
    if (await recomputePricingReferralSnapshotForLeaderAnchorId(id)) n++;
  }

  const priced = await PricingReferralRolling30dAggregate.countDocuments({
    ymd,
    unitPrice: { $ne: null },
  });
  const byRule = await PricingReferralRolling30dAggregate.aggregate([
    { $match: { ymd, unitPrice: { $ne: null } } },
    { $group: { _id: { rule: "$priceRule", price: "$unitPrice" }, c: { $sum: 1 } } },
  ]);
  console.log("[price-snapshot]", { ymd, snapshots: n, priced, byRule });
  await disconnectDb();
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDb().catch(() => {});
  process.exit(1);
});
