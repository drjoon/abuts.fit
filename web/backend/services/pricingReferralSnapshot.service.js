import { Types } from "mongoose";
import User from "../models/user.model.js";
import ShippingPackage from "../models/shippingPackage.model.js";
import PricingReferralStatsSnapshot from "../models/pricingReferralStatsSnapshot.model.js";
import {
  getLast30DaysRangeUtc,
  getTodayYmdInKst,
  toKstYmd,
} from "../utils/krBusinessDays.js";

const LEADER_ROLES = new Set(["requestor", "salesman", "devops"]);

const getOrderCountMapByBusinessAnchorIds = async ({
  businessAnchorIds,
  startYmd,
  endYmd,
}) => {
  const anchorIds = Array.from(
    new Set(
      (businessAnchorIds || [])
        .map((id) => String(id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id)),
    ),
  );

  if (!anchorIds.length || !startYmd || !endYmd) {
    return new Map();
  }

  const rows = await ShippingPackage.aggregate([
    {
      $match: {
        businessAnchorId: {
          $in: anchorIds.map((id) => new Types.ObjectId(id)),
        },
        shipDateYmd: { $gte: startYmd, $lte: endYmd },
      },
    },
    {
      $unwind: {
        path: "$requestIds",
        preserveNullAndEmptyArrays: false,
      },
    },
    {
      $group: {
        _id: {
          businessAnchorId: "$businessAnchorId",
          requestId: "$requestIds",
        },
      },
    },
    {
      $group: {
        _id: "$_id.businessAnchorId",
        count: { $sum: 1 },
      },
    },
  ]);

  return new Map(
    rows.map((row) => [String(row?._id || "").trim(), Number(row?.count || 0)]),
  );
};

const resolveLeaderUserByAnchorId = async (businessAnchorId) => {
  const anchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId)) return null;

  const rows = await User.find({
    businessAnchorId: new Types.ObjectId(anchorId),
    active: true,
    role: { $in: Array.from(LEADER_ROLES) },
  })
    .select({
      _id: 1,
      role: 1,
      requestorRole: 1,
      businessId: 1,
      businessAnchorId: 1,
    })
    .lean();

  if (!rows.length) return null;

  const requestorOwner = rows.find(
    (row) => row?.role === "requestor" && row?.requestorRole === "owner",
  );
  if (requestorOwner) return requestorOwner;

  const salesman = rows.find((row) => row?.role === "salesman");
  if (salesman) return salesman;

  const devops = rows.find((row) => row?.role === "devops");
  if (devops) return devops;

  return rows[0] || null;
};

export const recomputePricingReferralSnapshotForLeaderAnchorId = async (
  businessAnchorId,
) => {
  const leaderAnchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(leaderAnchorId)) return null;

  const leader = await resolveLeaderUserByAnchorId(leaderAnchorId);
  if (!leader) return null;

  const now = new Date();
  const range30 = getLast30DaysRangeUtc(now);
  if (!range30) return null;
  const startYmd = toKstYmd(range30.start);
  const endYmd = getTodayYmdInKst();
  const ymd = endYmd;
  if (!startYmd || !endYmd || !ymd) return null;

  const directChildren = await User.find({
    referredByAnchorId: new Types.ObjectId(leaderAnchorId),
    role: { $in: ["requestor", "salesman", "devops"] },
    active: true,
    businessAnchorId: { $ne: null },
  })
    .select({ businessAnchorId: 1 })
    .lean();

  const groupAnchorIds = Array.from(
    new Set(
      [
        leaderAnchorId,
        ...(directChildren || []).map((row) =>
          String(row?.businessAnchorId || "").trim(),
        ),
      ].filter((id) => Types.ObjectId.isValid(id)),
    ),
  );

  const countMap = await getOrderCountMapByBusinessAnchorIds({
    businessAnchorIds: groupAnchorIds,
    startYmd,
    endYmd,
  });

  const groupTotalOrders = groupAnchorIds.reduce(
    (acc, id) => acc + Number(countMap.get(String(id)) || 0),
    0,
  );
  const selfBusinessOrders = Number(countMap.get(String(leaderAnchorId)) || 0);

  const snapshotBusinessId =
    leader?.businessId && Types.ObjectId.isValid(String(leader.businessId))
      ? new Types.ObjectId(String(leader.businessId))
      : null;
  const snapshotBusinessAnchorId = new Types.ObjectId(leaderAnchorId);

  await PricingReferralStatsSnapshot.findOneAndUpdate(
    { businessAnchorId: snapshotBusinessAnchorId, ymd },
    {
      $set: {
        businessId: snapshotBusinessId,
        businessAnchorId: snapshotBusinessAnchorId,
        leaderUserId: leader._id,
        groupMemberCount: groupAnchorIds.length,
        groupTotalOrders,
        selfBusinessOrders,
        computedAt: new Date(),
      },
    },
    { upsert: true },
  );

  return {
    businessAnchorId: leaderAnchorId,
    ymd,
    groupMemberCount: groupAnchorIds.length,
    groupTotalOrders,
    selfBusinessOrders,
  };
};

export const recomputePricingReferralSnapshotsForAffectedAnchorId = async (
  businessAnchorId,
) => {
  const anchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId)) return [];

  const sameAnchorUsers = await User.find({
    businessAnchorId: new Types.ObjectId(anchorId),
    active: true,
  })
    .select({ referredByAnchorId: 1 })
    .lean();

  const leaderAnchorIds = Array.from(
    new Set(
      [
        anchorId,
        ...(sameAnchorUsers || []).map((row) =>
          String(row?.referredByAnchorId || "").trim(),
        ),
      ].filter((id) => Types.ObjectId.isValid(id)),
    ),
  );

  const results = await Promise.all(
    leaderAnchorIds.map((leaderAnchorId) =>
      recomputePricingReferralSnapshotForLeaderAnchorId(leaderAnchorId),
    ),
  );

  return results.filter(Boolean);
};
