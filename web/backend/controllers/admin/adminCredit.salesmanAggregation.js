import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { Types } from "mongoose";

const REFERRAL_LEADER_ROLES = ["salesman", "devops"];

function normalizeObjectIdString(value) {
  const id = String(value || "").trim();
  return id && Types.ObjectId.isValid(id) ? id : "";
}

function addToSetMap(map, key, value) {
  if (!key || !value) return;
  const set = map.get(key) || new Set();
  set.add(value);
  map.set(key, set);
}

function buildRevenueRowMap(rows) {
  return new Map(
    (rows || []).map((row) => [
      String(row?._id),
      {
        revenueAmount: Math.round(Number(row?.revenueAmount || 0)),
        bonusAmount: Math.round(Number(row?.bonusAmount || 0)),
        orderCount: Math.round(Number(row?.orderCount || 0)),
      },
    ]),
  );
}

export async function buildSalesmanReferralAggregation({ salesmanIds, range }) {
  const normalizedSalesmanIds = Array.from(
    new Set(
      (salesmanIds || [])
        .map((value) => normalizeObjectIdString(value))
        .filter(Boolean),
    ),
  );

  if (!normalizedSalesmanIds.length) {
    return {
      salesmenById: new Map(),
      directOrgIdsBySalesmanId: new Map(),
      level1OrgIdsBySalesmanId: new Map(),
      orgIdsBySalesmanId: new Map(),
      referredSalesmanCountBySalesmanId: new Map(),
      revenueByOrgId: new Map(),
    };
  }

  const salesmanObjectIds = normalizedSalesmanIds.map(
    (id) => new Types.ObjectId(id),
  );

  const salesmen = await User.find({ _id: { $in: salesmanObjectIds } })
    .select({ _id: 1, businessAnchorId: 1, businessId: 1, role: 1 })
    .lean();

  const salesmanBusinessIds = Array.from(
    new Set(
      (salesmen || [])
        .map((salesman) => normalizeObjectIdString(salesman?.businessId))
        .filter(Boolean),
    ),
  ).map((id) => new Types.ObjectId(id));

  const salesmanAnchors = salesmanBusinessIds.length
    ? await BusinessAnchor.find({ _id: { $in: salesmanBusinessIds } })
        .select({ _id: 1, metadata: 1 })
        .lean()
    : [];

  const businessNumberNormalizedSet = new Set(
    (salesmanAnchors || [])
      .map((anchor) =>
        String(anchor?.metadata?.businessNumber || "")
          .replace(/\D/g, "")
          .trim(),
      )
      .filter(Boolean),
  );

  const anchors = businessNumberNormalizedSet.size
    ? await BusinessAnchor.find({
        businessNumberNormalized: {
          $in: Array.from(businessNumberNormalizedSet),
        },
      })
        .select({ _id: 1, businessNumberNormalized: 1, sourceBusinessId: 1 })
        .lean()
    : [];

  const anchorIdBySourceBusinessId = new Map(
    (anchors || [])
      .filter((anchor) => anchor?.sourceBusinessId)
      .map((anchor) => [
        String(anchor?.sourceBusinessId || ""),
        String(anchor?._id || ""),
      ]),
  );

  const anchorIdByBusinessNumber = new Map(
    (anchors || []).map((anchor) => [
      String(anchor?.businessNumberNormalized || ""),
      String(anchor?._id || ""),
    ]),
  );

  const resolvedBusinessAnchorIdByBusinessId = new Map();
  for (const business of businesses || []) {
    const businessId = normalizeObjectIdString(business?._id);
    const directAnchorId = normalizeObjectIdString(business?.businessAnchorId);
    const normalizedBusinessNumber = String(
      business?.extracted?.businessNumber || "",
    )
      .replace(/\D/g, "")
      .trim();
    const resolvedAnchorId =
      directAnchorId ||
      String(anchorIdBySourceBusinessId.get(businessId) || "") ||
      String(anchorIdByBusinessNumber.get(normalizedBusinessNumber) || "");
    if (businessId) {
      resolvedBusinessAnchorIdByBusinessId.set(businessId, resolvedAnchorId);
    }
  }

  const salesmenById = new Map(
    (salesmen || []).map((salesman) => [String(salesman?._id || ""), salesman]),
  );

  const salesmanIdByBusinessAnchorId = new Map(
    (salesmen || [])
      .map((salesman) => {
        const salesmanId = normalizeObjectIdString(salesman?._id);
        const businessId = normalizeObjectIdString(salesman?.businessId);
        const businessAnchorId =
          normalizeObjectIdString(salesman?.businessAnchorId) ||
          String(resolvedBusinessAnchorIdByBusinessId.get(businessId) || "");
        return salesmanId && businessAnchorId
          ? [businessAnchorId, salesmanId]
          : null;
      })
      .filter(Boolean),
  );

  const salesmanBusinessAnchorIds = Array.from(
    salesmanIdByBusinessAnchorId.keys(),
  );
  const salesmanBusinessAnchorObjectIds = salesmanBusinessAnchorIds.map(
    (id) => new Types.ObjectId(id),
  );

  const [directRequestors, childSalesmen] = await Promise.all([
    BusinessAnchor.find({
      businessType: "requestor",
      referredByAnchorId: { $in: salesmanBusinessAnchorObjectIds },
    })
      .select({ _id: 1, referredByAnchorId: 1 })
      .lean(),
    BusinessAnchor.find({
      businessType: { $in: REFERRAL_LEADER_ROLES },
      referredByAnchorId: { $in: salesmanBusinessAnchorObjectIds },
    })
      .select({ _id: 1, referredByAnchorId: 1 })
      .lean(),
  ]);

  const childSalesmanIds = [];
  const childSalesmanBusinessAnchorIds = [];
  const leaderSalesmanIdByChildSalesmanBusinessAnchorId = new Map();
  const referredSalesmanCountBySalesmanId = new Map();

  for (const childSalesman of childSalesmen || []) {
    const childSalesmanId = normalizeObjectIdString(childSalesman?._id);
    const childBusinessAnchorId = normalizeObjectIdString(childSalesman?._id);
    const parentBusinessAnchorId = normalizeObjectIdString(
      childSalesman?.referredByAnchorId,
    );
    const parentSalesmanId =
      salesmanIdByBusinessAnchorId.get(parentBusinessAnchorId) || "";

    if (childSalesmanId) childSalesmanIds.push(childSalesmanId);
    if (childBusinessAnchorId)
      childSalesmanBusinessAnchorIds.push(childBusinessAnchorId);
    if (childBusinessAnchorId && parentSalesmanId) {
      leaderSalesmanIdByChildSalesmanBusinessAnchorId.set(
        childBusinessAnchorId,
        parentSalesmanId,
      );
    }
    if (parentSalesmanId) {
      referredSalesmanCountBySalesmanId.set(
        parentSalesmanId,
        Number(referredSalesmanCountBySalesmanId.get(parentSalesmanId) || 0) +
          1,
      );
    }
  }

  const level1Requestors = childSalesmanBusinessAnchorIds.length
    ? await BusinessAnchor.find({
        businessType: "requestor",
        referredByAnchorId: {
          $in: childSalesmanBusinessAnchorIds.map(
            (id) => new Types.ObjectId(id),
          ),
        },
      })
        .select({ _id: 1, referredByAnchorId: 1 })
        .lean()
    : [];

  const directOrgIdsBySalesmanId = new Map();
  for (const user of directRequestors || []) {
    const parentBusinessAnchorId = normalizeObjectIdString(
      user?.referredByAnchorId,
    );
    const salesmanId =
      salesmanIdByBusinessAnchorId.get(parentBusinessAnchorId) || "";
    const businessAnchorId = normalizeObjectIdString(user?._id);
    addToSetMap(directOrgIdsBySalesmanId, salesmanId, businessAnchorId);
  }

  const level1OrgIdsBySalesmanId = new Map();
  for (const user of level1Requestors || []) {
    const childSalesmanBusinessAnchorId = normalizeObjectIdString(
      user?.referredByAnchorId,
    );
    const salesmanId =
      leaderSalesmanIdByChildSalesmanBusinessAnchorId.get(
        childSalesmanBusinessAnchorId,
      ) || "";
    const businessAnchorId = normalizeObjectIdString(user?._id);
    addToSetMap(level1OrgIdsBySalesmanId, salesmanId, businessAnchorId);
  }

  const orgIdsBySalesmanId = new Map();
  for (const salesmanId of normalizedSalesmanIds) {
    const merged = new Set();
    for (const businessAnchorId of directOrgIdsBySalesmanId.get(salesmanId) ||
      []) {
      merged.add(businessAnchorId);
    }
    for (const businessAnchorId of level1OrgIdsBySalesmanId.get(salesmanId) ||
      []) {
      merged.add(businessAnchorId);
    }
    orgIdsBySalesmanId.set(salesmanId, merged);
  }

  const allOrgIds = Array.from(
    new Set(
      Array.from(orgIdsBySalesmanId.values()).flatMap((set) => Array.from(set)),
    ),
  ).map((id) => new Types.ObjectId(id));

  const hasRange = range?.start instanceof Date && range?.end instanceof Date;
  const revenueRows = allOrgIds.length
    ? await Request.aggregate([
        {
          $match: {
            businessAnchorId: { $in: allOrgIds },
            manufacturerStage: "추적관리",
            ...(hasRange
              ? { createdAt: { $gte: range.start, $lte: range.end } }
              : {}),
          },
        },
        {
          $group: {
            _id: "$businessAnchorId",
            revenueAmount: {
              $sum: {
                $ifNull: [
                  "$price.paidAmount",
                  { $ifNull: ["$price.amount", 0] },
                ],
              },
            },
            bonusAmount: { $sum: { $ifNull: ["$price.bonusAmount", 0] } },
            orderCount: { $sum: 1 },
          },
        },
      ])
    : [];

  return {
    salesmenById,
    childSalesmanIds,
    directOrgIdsBySalesmanId,
    level1OrgIdsBySalesmanId,
    orgIdsBySalesmanId,
    referredSalesmanCountBySalesmanId,
    revenueByOrgId: buildRevenueRowMap(revenueRows),
  };
}
