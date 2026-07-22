import Request from "../models/request.model.js";
import ShippingPackage from "../models/shippingPackage.model.js";

export function buildDashboardNormalizedStageExpr() {
  return {
    $let: {
      vars: {
        stage: { $ifNull: ["$manufacturerStage", ""] },
      },
      in: {
        $switch: {
          branches: [
            {
              case: {
                $ne: [{ $ifNull: ["$rnd.unmachinableAt", null] }, null],
              },
              then: "unmachinable",
            },
            {
              case: {
                $and: [
                  { $eq: ["$source", "manufacturer_sample"] },
                  { $ne: [{ $ifNull: ["$rnd.doneAt", null] }, null] },
                ],
              },
              then: "rnd",
            },
            {
              case: {
                $in: ["$$stage", ["tracking", "추적관리"]],
              },
              then: "tracking",
            },
            {
              case: {
                $in: ["$$stage", ["shipping", "포장.발송"]],
              },
              then: "shipping",
            },
            {
              case: {
                $in: ["$$stage", ["packing", "세척.패킹"]],
              },
              then: "packing",
            },
            {
              case: {
                $in: ["$$stage", ["machining", "가공"]],
              },
              then: "machining",
            },
            {
              case: {
                $in: ["$$stage", ["cam", "CAM"]],
              },
              then: "cam",
            },
            {
              case: {
                $in: ["$$stage", ["request", "의뢰"]],
              },
              then: "request",
            },
          ],
          default: "other",
        },
      },
    },
  };
}

export async function getAssignedLikeDashboardSummary({
  baseFilter = {},
  dateFilter = {},
  rndCountFilter = {},
} = {}) {
  const match = {
    ...baseFilter,
    ...dateFilter,
  };

  const [statsResult] = await Request.aggregate([
    { $match: match },
    {
      $addFields: {
        normalizedStage: buildDashboardNormalizedStageExpr(),
      },
    },
    {
      $group: {
        _id: null,
        total: {
          $sum: { $cond: [{ $ne: ["$manufacturerStage", "취소"] }, 1, 0] },
        },
        canceledCount: {
          $sum: { $cond: [{ $eq: ["$manufacturerStage", "취소"] }, 1, 0] },
        },
        trackingCount: {
          $sum: { $cond: [{ $eq: ["$normalizedStage", "tracking"] }, 1, 0] },
        },
        trackingPaidCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$normalizedStage", "tracking"] },
                  { $gt: [{ $ifNull: ["$price.paidAmount", 0] }, 0] },
                ],
              },
              1,
              0,
            ],
          },
        },
        unmachinableCount: {
          $sum: {
            $cond: [{ $eq: ["$normalizedStage", "unmachinable"] }, 1, 0],
          },
        },
        unmachinablePotentialCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  {
                    $ne: [
                      { $ifNull: ["$rnd.unmachinablePotentialAt", null] },
                      null,
                    ],
                  },
                  { $eq: [{ $ifNull: ["$rnd.unmachinableAt", null] }, null] },
                ],
              },
              1,
              0,
            ],
          },
        },
        unmachinablePendingConfirmCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: [{ $ifNull: ["$rnd.unmachinableAt", null] }, null] },
                  {
                    $eq: [
                      { $ifNull: ["$rnd.unmachinableConfirmedAt", null] },
                      null,
                    ],
                  },
                ],
              },
              1,
              0,
            ],
          },
        },
        unmachinableConfirmedCount: {
          $sum: {
            $cond: [
              {
                $ne: [
                  { $ifNull: ["$rnd.unmachinableConfirmedAt", null] },
                  null,
                ],
              },
              1,
              0,
            ],
          },
        },
        requestCount: {
          $sum: { $cond: [{ $eq: ["$normalizedStage", "request"] }, 1, 0] },
        },
        camCount: {
          $sum: { $cond: [{ $eq: ["$normalizedStage", "cam"] }, 1, 0] },
        },
        machiningCount: {
          $sum: {
            $cond: [{ $eq: ["$normalizedStage", "machining"] }, 1, 0],
          },
        },
        packingCount: {
          $sum: { $cond: [{ $eq: ["$normalizedStage", "packing"] }, 1, 0] },
        },
        shippingCount: {
          $sum: {
            $cond: [{ $eq: ["$normalizedStage", "shipping"] }, 1, 0],
          },
        },
      },
    },
  ]);

  const [shippingBoxesAgg, trackingBoxesAgg, rndCount] = await Promise.all([
    Request.aggregate([
      {
        $match: {
          ...match,
          manufacturerStage: { $in: ["포장.발송", "shipping"] },
        },
      },
      {
        $project: {
          mailboxAddress: {
            $trim: { input: { $ifNull: ["$mailboxAddress", ""] } },
          },
          shippingPackageId: {
            $trim: {
              input: {
                $toString: { $ifNull: ["$shippingPackageId", ""] },
              },
            },
          },
        },
      },
      {
        $project: {
          boxKey: {
            $cond: [
              { $ne: ["$mailboxAddress", ""] },
              { $concat: ["mailbox:", "$mailboxAddress"] },
              {
                $cond: [
                  { $ne: ["$shippingPackageId", ""] },
                  { $concat: ["pkg:", "$shippingPackageId"] },
                  null,
                ],
              },
            ],
          },
        },
      },
      { $match: { boxKey: { $ne: null } } },
      { $group: { _id: "$boxKey" } },
      { $count: "count" },
    ]),
    Request.aggregate([
      {
        $match: {
          ...match,
          manufacturerStage: { $in: ["추적관리", "tracking"] },
          shippingPackageId: { $ne: null },
        },
      },
      { $group: { _id: "$shippingPackageId" } },
      { $count: "count" },
    ]),
    Request.countDocuments({
      ...dateFilter,
      source: "manufacturer_sample",
      "rnd.doneAt": { $ne: null },
      "rnd.unmachinableAt": null,
      ...rndCountFilter,
    }),
  ]);

  return {
    total: Number(statsResult?.total ?? 0) || 0,
    canceledCount: Number(statsResult?.canceledCount ?? 0) || 0,
    trackingCount: Number(statsResult?.trackingCount ?? 0) || 0,
    trackingPaidCount: Number(statsResult?.trackingPaidCount ?? 0) || 0,
    trackingBoxes: Number(trackingBoxesAgg?.[0]?.count ?? 0) || 0,
    unmachinableCount: Number(statsResult?.unmachinableCount ?? 0) || 0,
    unmachinablePotentialCount:
      Number(statsResult?.unmachinablePotentialCount ?? 0) || 0,
    unmachinablePendingConfirmCount:
      Number(statsResult?.unmachinablePendingConfirmCount ?? 0) || 0,
    unmachinableConfirmedCount:
      Number(statsResult?.unmachinableConfirmedCount ?? 0) || 0,
    requestCount: Number(statsResult?.requestCount ?? 0) || 0,
    camCount: Number(statsResult?.camCount ?? 0) || 0,
    machiningCount: Number(statsResult?.machiningCount ?? 0) || 0,
    packingCount: Number(statsResult?.packingCount ?? 0) || 0,
    shippingCount: Number(statsResult?.shippingCount ?? 0) || 0,
    shippingBoxes: Number(shippingBoxesAgg?.[0]?.count ?? 0) || 0,
    rndCount: Number(rndCount ?? 0) || 0,
  };
}

export function buildMonitoringByStatusFromAssignedLikeSummary(summary = {}) {
  return {
    의뢰: Number(summary.requestCount || 0),
    CAM: Number(summary.camCount || 0),
    가공: Number(summary.machiningCount || 0),
    "세척.패킹": Number(summary.packingCount || 0),
    "포장.발송": Number(summary.shippingCount || 0),
    추적관리: Number(summary.trackingCount || 0),
    취소: Number(summary.canceledCount || 0),
    "포장.발송박스": Number(summary.shippingBoxes || 0),
    추적관리박스: Number(summary.trackingBoxes || 0),
    가공불가: Number(summary.unmachinableCount || 0),
    "R&D": Number(summary.rndCount || 0),
  };
}

export async function getAdminPricingStatsSummary({
  start,
  end,
  excludeManufacturerSample = true,
  baseFilter = {},
} = {}) {
  const createdAt = {};
  if (start instanceof Date && !Number.isNaN(start.getTime())) {
    createdAt.$gte = start;
  }
  if (end instanceof Date && !Number.isNaN(end.getTime())) {
    createdAt.$lte = end;
  }

  const preMatch = {
    ...baseFilter,
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    ...(excludeManufacturerSample
      ? { source: { $ne: "manufacturer_sample" } }
      : {}),
  };

  const rows = await Request.aggregate([
    { $match: preMatch },
    {
      $addFields: {
        normalizedStage: buildDashboardNormalizedStageExpr(),
      },
    },
    {
      $match: {
        normalizedStage: "tracking",
      },
    },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        explicitPaidOrders: {
          $sum: {
            $cond: [{ $gt: [{ $ifNull: ["$price.paidAmount", 0] }, 0] }, 1, 0],
          },
        },
        explicitBonusOrders: {
          $sum: {
            $cond: [{ $gt: [{ $ifNull: ["$price.bonusAmount", 0] }, 0] }, 1, 0],
          },
        },
        legacyAmountOnlyOrders: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$price.paidAmount", null] },
                  { $eq: ["$price.bonusAmount", null] },
                  { $gt: [{ $ifNull: ["$price.amount", 0] }, 0] },
                ],
              },
              1,
              0,
            ],
          },
        },
        totalRevenue: {
          $sum: { $ifNull: ["$price.paidAmount", 0] },
        },
        totalBonusRevenueExplicit: {
          $sum: { $ifNull: ["$price.bonusAmount", 0] },
        },
        totalLegacyAmountOnlyRevenue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$price.paidAmount", null] },
                  { $eq: ["$price.bonusAmount", null] },
                  { $gt: [{ $ifNull: ["$price.amount", 0] }, 0] },
                ],
              },
              { $ifNull: ["$price.amount", 0] },
              0,
            ],
          },
        },
        totalBaseAmount: { $sum: { $ifNull: ["$price.baseAmount", 0] } },
        totalDiscountAmount: {
          $sum: { $ifNull: ["$price.discountAmount", 0] },
        },
        shippingPackageIds: { $addToSet: "$shippingPackageId" },
      },
    },
  ]);

  const summary = rows?.[0] || {};
  const totalOrders = Number(summary.totalOrders || 0);
  const explicitPaidOrders = Number(summary.explicitPaidOrders || 0);
  const explicitBonusOrders = Number(summary.explicitBonusOrders || 0);
  const legacyAmountOnlyOrders = Number(summary.legacyAmountOnlyOrders || 0);
  const paidOrders = explicitPaidOrders;
  const bonusOrders = explicitBonusOrders + legacyAmountOnlyOrders;
  const totalRevenue = Number(summary.totalRevenue || 0);
  const totalBonusRevenue =
    Number(summary.totalBonusRevenueExplicit || 0) +
    Number(summary.totalLegacyAmountOnlyRevenue || 0);
  const totalBaseAmount = Number(summary.totalBaseAmount || 0);
  const totalDiscountAmount = Number(summary.totalDiscountAmount || 0);

  const shippingPackageIds = Array.isArray(summary.shippingPackageIds)
    ? summary.shippingPackageIds.filter(Boolean)
    : [];
  const shippingPackages = shippingPackageIds.length
    ? await ShippingPackage.find({ _id: { $in: shippingPackageIds } })
        .select({ shippingFeeSupply: 1 })
        .lean()
    : [];
  const rawPackageCount = shippingPackages.length;
  const totalShippingFeeSupply = shippingPackages.reduce(
    (acc, pkg) => acc + Number(pkg?.shippingFeeSupply || 0),
    0,
  );
  const avgShippingFeeSupply = rawPackageCount
    ? Math.round(totalShippingFeeSupply / rawPackageCount)
    : 0;

  const referralRows = await Request.aggregate([
    { $match: preMatch },
    {
      $addFields: {
        normalizedStage: buildDashboardNormalizedStageExpr(),
      },
    },
    {
      $match: {
        normalizedStage: "tracking",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "requestor",
        foreignField: "_id",
        as: "requestorUser",
      },
    },
    { $unwind: "$requestorUser" },
    {
      $group: {
        _id: "$requestorUser.referredByAnchorId",
        referralOrders: { $sum: 1 },
      },
    },
    { $match: { _id: { $ne: null } } },
  ]);
  const totalReferralOrders = referralRows.reduce(
    (acc, r) => acc + Number(r.referralOrders || 0),
    0,
  );

  const avgUnitPrice = totalOrders ? Math.round(totalRevenue / totalOrders) : 0;
  const avgBonusUnitPrice = bonusOrders
    ? Math.round(totalBonusRevenue / bonusOrders)
    : 0;

  return {
    totalOrders,
    paidOrders,
    bonusOrders,
    totalReferralOrders,
    totalRevenue,
    totalBonusRevenue,
    totalBaseAmount,
    totalDiscountAmount,
    totalShippingFeeSupply,
    avgShippingFeeSupply,
    avgUnitPrice,
    avgBonusUnitPrice,
    avgDiscountPerOrder: totalOrders
      ? Math.round(totalDiscountAmount / totalOrders)
      : 0,
  };
}
