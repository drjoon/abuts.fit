import mongoose from "mongoose";
import CreditLedger from "../../models/creditLedger.model.js";
import Request from "../../models/request.model.js";

function parsePeriod(period) {
  const p = String(period || "").trim();
  if (!p || p === "all") return null;
  const now = Date.now();
  if (p === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (p === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  if (p === "90d") return new Date(now - 90 * 24 * 60 * 60 * 1000);
  return null;
}

function safeRegex(query) {
  const q = String(query || "").trim();
  if (!q) return null;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

export async function listMyCreditLedger(req, res) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    return res.status(403).json({
      success: false,
      message: "기공소 정보가 설정되지 않았습니다.",
    });
  }

  const typeRaw = String(req.query.type || "")
    .trim()
    .toUpperCase();
  const periodRaw = String(req.query.period || "").trim();
  const qRaw = String(req.query.q || "").trim();

  const page = Math.max(1, Number(req.query.page || 1) || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, Number(req.query.pageSize || 50) || 50),
  );

  const match = {
    organizationId: new mongoose.Types.ObjectId(String(organizationId)),
  };

  if (
    typeRaw &&
    typeRaw !== "ALL" &&
    ["CHARGE", "BONUS", "SPEND", "REFUND", "ADJUST"].includes(typeRaw)
  ) {
    match.type = typeRaw;
  }

  const createdAt = {};

  const sinceFromPeriod = parsePeriod(periodRaw);
  if (sinceFromPeriod) {
    createdAt.$gte = sinceFromPeriod;
  }

  const fromRaw = String(req.query.from || "").trim();
  const toRaw = String(req.query.to || "").trim();

  if (fromRaw) {
    const from = new Date(fromRaw);
    if (!Number.isNaN(from.getTime())) {
      createdAt.$gte = from;
    }
  }

  if (toRaw) {
    const to = new Date(toRaw);
    if (!Number.isNaN(to.getTime())) {
      createdAt.$lte = to;
    }
  }

  if (Object.keys(createdAt).length) {
    match.createdAt = createdAt;
  }

  if (qRaw) {
    const rx = safeRegex(qRaw);
    const ors = [];
    if (rx) {
      ors.push({ uniqueKey: rx });
      ors.push({ refType: rx });
    }

    if (mongoose.Types.ObjectId.isValid(qRaw)) {
      ors.push({ refId: new mongoose.Types.ObjectId(qRaw) });
    }

    const looksLikeRequestId = /^\d{8}-\d{6}$/.test(qRaw);
    if (looksLikeRequestId) {
      const requestDoc = await Request.findOne({ requestId: qRaw })
        .select({ _id: 1 })
        .lean();
      if (requestDoc?._id) {
        ors.push({
          refId: new mongoose.Types.ObjectId(String(requestDoc._id)),
        });
      }
    }

    if (ors.length) {
      match.$or = ors;
    }
  }

  // running balance: 전체 잔액 계산 (필터 무관)
  const orgId = new mongoose.Types.ObjectId(String(organizationId));
  const allLedgerRows = await CreditLedger.aggregate([
    { $match: { organizationId: orgId } },
    { $group: { _id: "$type", total: { $sum: "$amount" } } },
  ]);
  let totalBalance = 0;
  for (const r of allLedgerRows) {
    totalBalance += Number(r.total || 0);
  }

  const skippedRows =
    (page - 1) * pageSize > 0
      ? await CreditLedger.find(match)
          .sort({ createdAt: -1, _id: -1 })
          .limit((page - 1) * pageSize)
          .select({ type: 1, amount: 1 })
          .lean()
      : [];
  let skippedSum = 0;
  for (const r of skippedRows) {
    skippedSum += Number(r.amount || 0);
  }

  const [total, rawItems] = await Promise.all([
    CreditLedger.countDocuments(match),
    CreditLedger.find(match)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select({
        type: 1,
        amount: 1,
        spentPaidAmount: 1,
        spentBonusAmount: 1,
        refType: 1,
        refId: 1,
        uniqueKey: 1,
        userId: 1,
        createdAt: 1,
      })
      .lean(),
  ]);

  let runningBalance = totalBalance - skippedSum;
  const items = (Array.isArray(rawItems) ? rawItems : []).map((r) => {
    const balanceAfter = runningBalance;
    runningBalance -= Number(r.amount || 0);
    return { ...r, balanceAfter };
  });

  const requestRefIds = Array.from(
    new Set(
      (items || [])
        .filter(
          (it) =>
            String(it?.refType || "") === "REQUEST" &&
            it?.refId &&
            mongoose.Types.ObjectId.isValid(String(it.refId)),
        )
        .map((it) => String(it.refId)),
    ),
  );

  const refRequestIdById = new Map();
  if (requestRefIds.length > 0) {
    const requestDocs = await Request.find({
      _id: { $in: requestRefIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select({ _id: 1, requestId: 1 })
      .lean();

    for (const doc of requestDocs || []) {
      if (doc?._id) {
        refRequestIdById.set(String(doc._id), String(doc.requestId || ""));
      }
    }
  }

  const enrichedItems = (items || []).map((it) => {
    if (String(it?.refType || "") !== "REQUEST") return it;
    const refRequestId = it?.refId
      ? refRequestIdById.get(String(it.refId)) || ""
      : "";
    return { ...it, refRequestId };
  });

  return res.json({
    success: true,
    data: {
      items: enrichedItems,
      total,
      page,
      pageSize,
    },
  });
}
