import mongoose from "mongoose";
import CreditLedger from "../models/creditLedger.model.js";

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
    Math.max(1, Number(req.query.pageSize || 50) || 50)
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

    if (ors.length) {
      match.$or = ors;
    }
  }

  const [total, items] = await Promise.all([
    CreditLedger.countDocuments(match),
    CreditLedger.find(match)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select({
        type: 1,
        amount: 1,
        refType: 1,
        refId: 1,
        uniqueKey: 1,
        userId: 1,
        createdAt: 1,
      })
      .lean(),
  ]);

  return res.json({
    success: true,
    data: {
      items,
      total,
      page,
      pageSize,
    },
  });
}
