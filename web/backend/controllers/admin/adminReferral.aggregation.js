import { Types } from "mongoose";
import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";

const REFERRAL_LEADER_ROLES = ["requestor", "salesman", "devops"];
const REFERRAL_CHILD_ROLES = ["requestor", "salesman", "devops"];
const REFERRAL_SELF_METRIC_ROLES = ["requestor", "devops"];

function normalizeObjectIdString(value) {
  const id = String(value || "").trim();
  return id && Types.ObjectId.isValid(id) ? id : "";
}

export async function buildReferralLeaderAggregation({
  leaders,
  periodStart,
  periodEnd,
}) {
  const leaderBusinessIds = Array.from(
    new Set(
      (leaders || [])
        .map((leader) => normalizeObjectIdString(leader?.businessId))
        .filter(Boolean),
    ),
  );

  const emptyResult = {
    directChildren: [],
    directCountByLeaderBusinessId: new Map(),
    childIdsByLeaderBusinessId: new Map(),
    childBusinessIdsByLeaderBusinessId: new Map(),
    ordersByBusinessId: new Map(),
    revenueByBusinessId: new Map(),
    bonusByBusinessId: new Map(),
    requestorBusinessStatsByBusinessId: new Map(),
  };

  if (!leaderBusinessIds.length) return emptyResult;

  const leaderBusinessObjectIds = leaderBusinessIds.map(
    (id) => new Types.ObjectId(id),
  );

  const [directCounts, directChildren] = await Promise.all([
    User.aggregate([
      {
        $match: {
          referredByBusinessId: { $in: leaderBusinessObjectIds },
          active: true,
          role: { $in: REFERRAL_CHILD_ROLES },
        },
      },
      { $group: { _id: "$referredByBusinessId", count: { $sum: 1 } } },
    ]),
    User.find({
      referredByBusinessId: { $in: leaderBusinessObjectIds },
      role: { $in: REFERRAL_CHILD_ROLES },
      active: true,
    })
      .select({ _id: 1, referredByBusinessId: 1, businessId: 1 })
      .lean(),
  ]);

  const directCountByLeaderBusinessId = new Map(
    (directCounts || []).map((row) => [
      String(row?._id || ""),
      Number(row?.count || 0),
    ]),
  );

  const childIdsByLeaderBusinessId = new Map();
  const childBusinessIdsByLeaderBusinessId = new Map();
  for (const user of directChildren || []) {
    const leaderBusinessId = normalizeObjectIdString(
      user?.referredByBusinessId,
    );
    if (!leaderBusinessId) continue;

    const childIds = childIdsByLeaderBusinessId.get(leaderBusinessId) || [];
    childIds.push(String(user?._id || ""));
    childIdsByLeaderBusinessId.set(leaderBusinessId, childIds);

    const childBusinessId = normalizeObjectIdString(user?.businessId);
    if (childBusinessId) {
      const businessIds =
        childBusinessIdsByLeaderBusinessId.get(leaderBusinessId) || new Set();
      businessIds.add(childBusinessId);
      childBusinessIdsByLeaderBusinessId.set(leaderBusinessId, businessIds);
    }
  }

  const relevantBusinessIds = Array.from(
    new Set(
      [...(leaders || []), ...(directChildren || [])]
        .map((user) => normalizeObjectIdString(user?.businessId))
        .filter(Boolean),
    ),
  );

  const hasPeriod = periodStart instanceof Date && periodEnd instanceof Date;
  const relevantBusinessObjectIds = relevantBusinessIds.map(
    (id) => new Types.ObjectId(id),
  );

  const requestRows = relevantBusinessObjectIds.length
    ? await Request.aggregate([
        {
          $match: {
            businessId: { $in: relevantBusinessObjectIds },
            manufacturerStage: "추적관리",
            ...(hasPeriod
              ? { createdAt: { $gte: periodStart, $lte: periodEnd } }
              : {}),
          },
        },
        {
          $group: {
            _id: "$businessId",
            orderCount: { $sum: 1 },
            revenueAmount: {
              $sum: {
                $ifNull: [
                  "$price.paidAmount",
                  { $ifNull: ["$price.amount", 0] },
                ],
              },
            },
            bonusAmount: { $sum: { $ifNull: ["$price.bonusAmount", 0] } },
          },
        },
      ])
    : [];

  const requestorLeaderBusinessIds = (leaders || [])
    .filter((leader) =>
      REFERRAL_SELF_METRIC_ROLES.includes(String(leader?.role || "")),
    )
    .map((leader) => normalizeObjectIdString(leader?.businessId))
    .filter(Boolean);

  const requestorBusinessRows = requestorLeaderBusinessIds.length
    ? await Request.aggregate([
        {
          $match: {
            businessId: {
              $in: requestorLeaderBusinessIds.map(
                (id) => new Types.ObjectId(id),
              ),
            },
            manufacturerStage: "추적관리",
            ...(hasPeriod
              ? { createdAt: { $gte: periodStart, $lte: periodEnd } }
              : {}),
          },
        },
        {
          $group: {
            _id: "$businessId",
            orderCount: { $sum: 1 },
            revenueAmount: {
              $sum: {
                $ifNull: [
                  "$price.paidAmount",
                  { $ifNull: ["$price.amount", 0] },
                ],
              },
            },
            bonusAmount: { $sum: { $ifNull: ["$price.bonusAmount", 0] } },
          },
        },
      ])
    : [];

  return {
    directChildren,
    directCountByLeaderBusinessId,
    childIdsByLeaderBusinessId,
    childBusinessIdsByLeaderBusinessId,
    ordersByBusinessId: new Map(
      requestRows.map((row) => [
        String(row?._id || ""),
        Number(row?.orderCount || 0),
      ]),
    ),
    revenueByBusinessId: new Map(
      requestRows.map((row) => [
        String(row?._id || ""),
        Number(row?.revenueAmount || 0),
      ]),
    ),
    bonusByBusinessId: new Map(
      requestRows.map((row) => [
        String(row?._id || ""),
        Number(row?.bonusAmount || 0),
      ]),
    ),
    requestorBusinessStatsByBusinessId: new Map(
      requestorBusinessRows.map((row) => [
        String(row?._id || ""),
        {
          orderCount: Number(row?.orderCount || 0),
          revenueAmount: Number(row?.revenueAmount || 0),
          bonusAmount: Number(row?.bonusAmount || 0),
        },
      ]),
    ),
  };
}
