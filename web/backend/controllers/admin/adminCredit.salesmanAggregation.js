import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
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
    .select({ _id: 1, businessId: 1 })
    .lean();

  const salesmenById = new Map(
    (salesmen || []).map((salesman) => [String(salesman?._id || ""), salesman]),
  );

  const salesmanIdByBusinessId = new Map(
    (salesmen || [])
      .map((salesman) => {
        const salesmanId = normalizeObjectIdString(salesman?._id);
        const businessId = normalizeObjectIdString(salesman?.businessId);
        return salesmanId && businessId ? [businessId, salesmanId] : null;
      })
      .filter(Boolean),
  );

  const salesmanBusinessIds = Array.from(salesmanIdByBusinessId.keys());
  const salesmanBusinessObjectIds = salesmanBusinessIds.map(
    (id) => new Types.ObjectId(id),
  );

  const [directRequestors, childSalesmen] = await Promise.all([
    User.find({
      role: "requestor",
      referredByBusinessId: { $in: salesmanBusinessObjectIds },
      active: true,
      businessId: { $ne: null },
    })
      .select({ _id: 1, referredByBusinessId: 1, businessId: 1 })
      .lean(),
    User.find({
      role: { $in: REFERRAL_LEADER_ROLES },
      referredByBusinessId: { $in: salesmanBusinessObjectIds },
      active: true,
    })
      .select({ _id: 1, referredByBusinessId: 1, businessId: 1 })
      .lean(),
  ]);

  const childSalesmanIds = [];
  const childSalesmanBusinessIds = [];
  const leaderSalesmanIdByChildSalesmanBusinessId = new Map();
  const referredSalesmanCountBySalesmanId = new Map();

  for (const childSalesman of childSalesmen || []) {
    const childSalesmanId = normalizeObjectIdString(childSalesman?._id);
    const childBusinessId = normalizeObjectIdString(childSalesman?.businessId);
    const parentBusinessId = normalizeObjectIdString(
      childSalesman?.referredByBusinessId,
    );
    const parentSalesmanId = salesmanIdByBusinessId.get(parentBusinessId) || "";

    if (childSalesmanId) childSalesmanIds.push(childSalesmanId);
    if (childBusinessId) childSalesmanBusinessIds.push(childBusinessId);
    if (childBusinessId && parentSalesmanId) {
      leaderSalesmanIdByChildSalesmanBusinessId.set(
        childBusinessId,
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

  const level1Requestors = childSalesmanBusinessIds.length
    ? await User.find({
        role: "requestor",
        referredByBusinessId: {
          $in: childSalesmanBusinessIds.map((id) => new Types.ObjectId(id)),
        },
        active: true,
        businessId: { $ne: null },
      })
        .select({ _id: 1, referredByBusinessId: 1, businessId: 1 })
        .lean()
    : [];

  const directOrgIdsBySalesmanId = new Map();
  for (const user of directRequestors || []) {
    const parentBusinessId = normalizeObjectIdString(
      user?.referredByBusinessId,
    );
    const salesmanId = salesmanIdByBusinessId.get(parentBusinessId) || "";
    const businessId = normalizeObjectIdString(user?.businessId);
    addToSetMap(directOrgIdsBySalesmanId, salesmanId, businessId);
  }

  const level1OrgIdsBySalesmanId = new Map();
  for (const user of level1Requestors || []) {
    const childSalesmanBusinessId = normalizeObjectIdString(
      user?.referredByBusinessId,
    );
    const salesmanId =
      leaderSalesmanIdByChildSalesmanBusinessId.get(childSalesmanBusinessId) ||
      "";
    const businessId = normalizeObjectIdString(user?.businessId);
    addToSetMap(level1OrgIdsBySalesmanId, salesmanId, businessId);
  }

  const orgIdsBySalesmanId = new Map();
  for (const salesmanId of normalizedSalesmanIds) {
    const merged = new Set();
    for (const businessId of directOrgIdsBySalesmanId.get(salesmanId) || []) {
      merged.add(businessId);
    }
    for (const businessId of level1OrgIdsBySalesmanId.get(salesmanId) || []) {
      merged.add(businessId);
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
            businessId: { $in: allOrgIds },
            manufacturerStage: "추적관리",
            ...(hasRange
              ? { createdAt: { $gte: range.start, $lte: range.end } }
              : {}),
          },
        },
        {
          $group: {
            _id: "$businessId",
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
