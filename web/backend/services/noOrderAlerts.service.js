// related files:
// - web/backend/controllers/admin/admin.dashboard.controller.js
// - web/backend/utils/noOrderAlerts.js
// - web/backend/utils/requestorCapabilities.js
import mongoose from "mongoose";
import Request from "../models/request.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  normalizeRequestorKind,
  profileFromLegacyCapabilities,
} from "../utils/requestorCapabilities.js";
import {
  classifyNoOrderTier,
  NO_ORDER_TIER_3M,
  NO_ORDER_TIER_6M,
} from "../utils/noOrderAlerts.js";

export {
  classifyNoOrderTier,
  NO_ORDER_TIER_3M,
  NO_ORDER_TIER_6M,
  NO_ORDER_DAYS_3M,
  NO_ORDER_DAYS_6M,
} from "../utils/noOrderAlerts.js";

/** Happy Call lastCompletedAt 집계와 동일 완료 조건 */
const COMPLETED_COND = {
  $or: [
    { $ne: ["$shippingWorkflow.completedAt", null] },
    { $eq: ["$manufacturerStage", "추적관리"] },
  ],
};

const REQUEST_BASE_FILTER = {
  "caseInfos.implantBrand": { $exists: true, $ne: "" },
};

function toObjectId(id) {
  const raw = String(id || "").trim();
  if (!raw || !mongoose.Types.ObjectId.isValid(raw)) return null;
  return new mongoose.Types.ObjectId(raw);
}

function resolveKind(anchor) {
  const fromKind = normalizeRequestorKind(anchor?.requestorKind);
  if (fromKind) return fromKind;
  const legacy = profileFromLegacyCapabilities(anchor?.requestorCapabilities, {
    businessVerified: String(anchor?.status || "").trim() === "verified",
  });
  return legacy.kind || null;
}

function emptyPayload() {
  return {
    summary: { count3m: 0, count6m: 0, total: 0 },
    items: [],
  };
}

/**
 * @param {{ anchorIds?: unknown[], now?: Date }} [opts]
 */
export async function listNoOrderAlerts({ anchorIds = [], now = new Date() } = {}) {
  const objectIds = [];
  const seen = new Set();
  for (const id of Array.isArray(anchorIds) ? anchorIds : []) {
    const oid = toObjectId(id);
    if (!oid) continue;
    const key = String(oid);
    if (seen.has(key)) continue;
    seen.add(key);
    objectIds.push(oid);
  }

  if (objectIds.length === 0) return emptyPayload();

  const [statsRows, anchors] = await Promise.all([
    Request.aggregate([
      {
        $match: {
          ...REQUEST_BASE_FILTER,
          businessAnchorId: { $in: objectIds },
        },
      },
      {
        $group: {
          _id: "$businessAnchorId",
          lastCompletedAt: {
            $max: {
              $cond: [
                COMPLETED_COND,
                {
                  $ifNull: ["$shippingWorkflow.completedAt", "$createdAt"],
                },
                null,
              ],
            },
          },
        },
      },
    ]),
    BusinessAnchor.find({ _id: { $in: objectIds } })
      .select({
        _id: 1,
        name: 1,
        requestorKind: 1,
        requestorCapabilities: 1,
        status: 1,
      })
      .lean(),
  ]);

  const statsById = new Map(
    (Array.isArray(statsRows) ? statsRows : []).map((row) => [
      String(row?._id || ""),
      row,
    ]),
  );
  const anchorById = new Map(
    (Array.isArray(anchors) ? anchors : []).map((a) => [String(a._id || ""), a]),
  );

  const items = [];
  for (const oid of objectIds) {
    const idStr = String(oid);
    const stats = statsById.get(idStr);
    const lastCompletedAt = stats?.lastCompletedAt
      ? new Date(stats.lastCompletedAt)
      : null;
    if (!lastCompletedAt || Number.isNaN(lastCompletedAt.getTime())) continue;

    const classified = classifyNoOrderTier(lastCompletedAt, now);
    if (!classified) continue;

    const anchor = anchorById.get(idStr);
    if (!anchor) continue;

    items.push({
      businessAnchorId: idStr,
      name: String(anchor.name || "").trim() || "(이름 없음)",
      kind: resolveKind(anchor),
      lastCompletedAt: lastCompletedAt.toISOString(),
      tier: classified.tier,
      daysSinceCompletion: classified.daysSinceCompletion,
    });
  }

  items.sort((a, b) => {
    if (a.tier !== b.tier) {
      return a.tier === NO_ORDER_TIER_6M ? -1 : 1;
    }
    return (
      Number(b.daysSinceCompletion || 0) - Number(a.daysSinceCompletion || 0)
    );
  });

  let count3m = 0;
  let count6m = 0;
  for (const item of items) {
    if (item.tier === NO_ORDER_TIER_6M) count6m += 1;
    else count3m += 1;
  }

  return {
    summary: { count3m, count6m, total: items.length },
    items,
  };
}
