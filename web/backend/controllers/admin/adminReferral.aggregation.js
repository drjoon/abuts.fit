import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
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
  const leaderBusinessAnchorIds = Array.from(
    new Set(
      (leaders || [])
        .map((leader) => normalizeObjectIdString(leader?.businessAnchorId))
        .filter(Boolean),
    ),
  );

  const emptyResult = {
    directChildren: [],
    directCountByLeaderBusinessAnchorId: new Map(),
    childIdsByLeaderBusinessAnchorId: new Map(),
    childBusinessAnchorIdsByLeaderBusinessAnchorId: new Map(),
    ordersByBusinessAnchorId: new Map(),
    revenueByBusinessAnchorId: new Map(),
    bonusByBusinessAnchorId: new Map(),
    requestorBusinessStatsByBusinessAnchorId: new Map(),
  };

  if (!leaderBusinessAnchorIds.length) return emptyResult;

  const leaderBusinessAnchorObjectIds = leaderBusinessAnchorIds.map(
    (id) => new Types.ObjectId(id),
  );

  // BusinessAnchor 조회를 한 번만 수행하고 count는 메모리에서 계산
  const directChildren = await BusinessAnchor.find({
    referredByAnchorId: { $in: leaderBusinessAnchorObjectIds },
    businessType: { $in: REFERRAL_CHILD_ROLES },
  })
    .select({ _id: 1, referredByAnchorId: 1, businessType: 1 })
    .lean();

  // 메모리에서 count 계산
  const directCountMap = new Map();
  for (const child of directChildren) {
    const parentId = String(child?.referredByAnchorId || "");
    if (parentId) {
      directCountMap.set(parentId, (directCountMap.get(parentId) || 0) + 1);
    }
  }

  const directCountByLeaderBusinessAnchorId = directCountMap;

  const childIdsByLeaderBusinessAnchorId = new Map();
  const childBusinessAnchorIdsByLeaderBusinessAnchorId = new Map();
  for (const anchor of directChildren || []) {
    const leaderBusinessAnchorId = normalizeObjectIdString(
      anchor?.referredByAnchorId,
    );
    if (!leaderBusinessAnchorId) continue;

    const childIds =
      childIdsByLeaderBusinessAnchorId.get(leaderBusinessAnchorId) || [];
    childIds.push(String(anchor?._id || ""));
    childIdsByLeaderBusinessAnchorId.set(leaderBusinessAnchorId, childIds);

    const childBusinessAnchorId = normalizeObjectIdString(anchor?._id);
    if (!childBusinessAnchorId) continue;

    const businessAnchorIds =
      childBusinessAnchorIdsByLeaderBusinessAnchorId.get(
        leaderBusinessAnchorId,
      ) || new Set();
    businessAnchorIds.add(childBusinessAnchorId);
    childBusinessAnchorIdsByLeaderBusinessAnchorId.set(
      leaderBusinessAnchorId,
      businessAnchorIds,
    );
  }

  const relevantBusinessAnchorIds = Array.from(
    new Set(
      [...(leaders || []), ...(directChildren || [])]
        .map((row) =>
          normalizeObjectIdString(row?.businessAnchorId || row?._id),
        )
        .filter(Boolean),
    ),
  );

  const hasPeriod = periodStart instanceof Date && periodEnd instanceof Date;
  const relevantBusinessAnchorObjectIds = relevantBusinessAnchorIds.map(
    (id) => new Types.ObjectId(id),
  );

  const requestRows = relevantBusinessAnchorObjectIds.length
    ? await Request.aggregate([
        {
          $match: {
            businessAnchorId: { $in: relevantBusinessAnchorObjectIds },
            manufacturerStage: "추적관리",
            ...(hasPeriod
              ? { createdAt: { $gte: periodStart, $lte: periodEnd } }
              : {}),
          },
        },
        {
          $group: {
            _id: "$businessAnchorId",
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

  const requestorLeaderBusinessAnchorIds = (leaders || [])
    .filter((leader) =>
      REFERRAL_SELF_METRIC_ROLES.includes(String(leader?.role || "")),
    )
    .map((leader) => normalizeObjectIdString(leader?.businessAnchorId))
    .filter(Boolean);

  const requestorBusinessRows = requestorLeaderBusinessAnchorIds.length
    ? await Request.aggregate([
        {
          $match: {
            businessAnchorId: {
              $in: requestorLeaderBusinessAnchorIds.map(
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
            _id: "$businessAnchorId",
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
    directCountByLeaderBusinessAnchorId,
    childIdsByLeaderBusinessAnchorId,
    childBusinessAnchorIdsByLeaderBusinessAnchorId,
    ordersByBusinessAnchorId: new Map(
      requestRows.map((row) => [
        String(row?._id || ""),
        Number(row?.orderCount || 0),
      ]),
    ),
    revenueByBusinessAnchorId: new Map(
      requestRows.map((row) => [
        String(row?._id || ""),
        Number(row?.revenueAmount || 0),
      ]),
    ),
    bonusByBusinessAnchorId: new Map(
      requestRows.map((row) => [
        String(row?._id || ""),
        Number(row?.bonusAmount || 0),
      ]),
    ),
    requestorBusinessStatsByBusinessAnchorId: new Map(
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
