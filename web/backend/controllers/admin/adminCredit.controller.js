import CreditLedger from "../../models/creditLedger.model.js";
import ManufacturerCreditLedger from "../../models/manufacturerCreditLedger.model.js";
import AdminCreditLedger from "../../models/adminCreditLedger.model.js";
import BonusGrant from "../../models/bonusGrant.model.js";
import ChargeOrder from "../../models/chargeOrder.model.js";
import BankTransaction from "../../models/bankTransaction.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import User from "../../models/user.model.js";
import SalesmanLedger from "../../models/salesmanLedger.model.js";
import Request from "../../models/request.model.js";
import { Types } from "mongoose";
import {
  getLast30DaysRangeUtc,
  getTodayMidnightUtcInKst,
  getTodayYmdInKst,
  getThisMonthStartYmdInKst,
} from "../../utils/krBusinessDays.js";
import AdminSalesmanCreditsOverviewSnapshot from "../../models/adminSalesmanCreditsOverviewSnapshot.model.js";
import { buildSalesmanReferralAggregation } from "./adminCredit.salesmanAggregation.js";

const REFERRAL_LEADER_ROLES = ["salesman", "devops"];

function normalizeNumber(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v);
}

function buildRequestSummary(doc) {
  if (!doc?._id) return null;
  return {
    requestId: String(doc.requestId || ""),
    manufacturerStage: String(doc.manufacturerStage || ""),
    patientName: String(doc?.caseInfos?.patientName || ""),
    tooth: String(doc?.caseInfos?.tooth || ""),
    clinicName: String(doc?.caseInfos?.clinicName || ""),
    lotNumber: {
      value: String(doc?.lotNumber?.value || ""),
    },
  };
}

function parseBonusGrantIdFromUniqueKey(uniqueKey) {
  const raw = String(uniqueKey || "").trim();
  const m = raw.match(/^bonus_grant:(.+)$/);
  return m ? m[1] : "";
}

function parseYmd(ymd) {
  const parts = String(ymd || "")
    .split("-")
    .map((v) => Number(v));
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function kstMonthRangeUtc({ y, m }) {
  if (!y || !m) return null;
  const startKst = new Date(
    `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01T00:00:00.000+09:00`,
  );
  if (Number.isNaN(startKst.getTime())) return null;
  const nextMonth = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const nextStartKst = new Date(
    `${String(nextMonth.y).padStart(4, "0")}-${String(nextMonth.m).padStart(2, "0")}-01T00:00:00.000+09:00`,
  );
  if (Number.isNaN(nextStartKst.getTime())) return null;
  const start = startKst;
  const end = new Date(nextStartKst.getTime() - 1);
  return { start, end };
}

function getPeriodRangeUtcFromPeriodKey(periodKey) {
  const period = String(periodKey || "").trim();
  const now = new Date();
  const todayMidnight = getTodayMidnightUtcInKst(now);

  if (["7d", "30d", "90d"].includes(period)) {
    if (!todayMidnight) return null;
    if (period === "30d") {
      return getLast30DaysRangeUtc(now);
    }
    const days = period === "7d" ? 7 : 90;
    const end = new Date(todayMidnight.getTime() - 1);
    const start = new Date(
      todayMidnight.getTime() - days * 24 * 60 * 60 * 1000,
    );
    return { start, end };
  }

  if (period === "thisMonth") {
    const ymd = getThisMonthStartYmdInKst(now);
    const p = parseYmd(ymd);
    if (!p) return null;
    return kstMonthRangeUtc({ y: p.y, m: p.m });
  }

  if (period === "lastMonth") {
    const ymd = getThisMonthStartYmdInKst(now);
    const p = parseYmd(ymd);
    if (!p) return null;
    const prev = p.m === 1 ? { y: p.y - 1, m: 12 } : { y: p.y, m: p.m - 1 };
    return kstMonthRangeUtc(prev);
  }

  // fallback
  return getLast30DaysRangeUtc(now);
}

async function computeSalesmanOverviewSnapshot({ range, salesmanIds }) {
  const commissionRate = 0.1;

  const ledgerPeriodRows = await SalesmanLedger.aggregate([
    {
      $match: {
        salesmanId: { $in: salesmanIds },
        createdAt: { $gte: range.start, $lte: range.end },
      },
    },
    {
      $group: {
        _id: "$type",
        total: { $sum: "$amount" },
      },
    },
  ]);

  let earnedAmount = 0;
  let paidOutAmount = 0;
  let adjustedAmount = 0;
  for (const r of ledgerPeriodRows || []) {
    const type = String(r?._id || "");
    const total = normalizeNumber(r?.total || 0);
    if (type === "EARN") earnedAmount += total;
    else if (type === "PAYOUT") paidOutAmount += total;
    else if (type === "ADJUST") adjustedAmount += total;
  }
  const balanceAmount = normalizeNumber(
    earnedAmount - paidOutAmount + adjustedAmount,
  );
  const { directOrgIdsBySalesmanId, level1OrgIdsBySalesmanId, revenueByOrgId } =
    await buildSalesmanReferralAggregation({
      salesmanIds,
      range,
    });

  let paidRevenueAmount = 0;
  let bonusRevenueAmount = 0;
  let orderCount = 0;
  for (const row of revenueByOrgId.values()) {
    paidRevenueAmount += Number(row.revenueAmount || 0);
    bonusRevenueAmount += Number(row.bonusAmount || 0);
    orderCount += Number(row.orderCount || 0);
  }

  let directAmount = 0;
  for (const orgSet of directOrgIdsBySalesmanId.values()) {
    let rev = 0;
    for (const oid of orgSet) {
      rev += Number(revenueByOrgId.get(String(oid))?.revenueAmount || 0);
    }
    directAmount += rev * commissionRate;
  }

  let indirectAmount = 0;
  for (const _entry of level1OrgIdsBySalesmanId.entries()) {
    // 정책 변경: 간접 소개 수수료(2.5%)는 지급하지 않음
    indirectAmount += 0;
  }

  const totalAmount = normalizeNumber(directAmount + indirectAmount);

  return {
    salesmenCount: salesmanIds.length,
    referral: {
      paidRevenueAmount: normalizeNumber(paidRevenueAmount),
      bonusRevenueAmount: normalizeNumber(bonusRevenueAmount),
      orderCount: normalizeNumber(orderCount),
    },
    commission: {
      totalAmount,
      directAmount: normalizeNumber(directAmount),
      indirectAmount: normalizeNumber(indirectAmount),
    },
    walletPeriod: {
      earnedAmount: normalizeNumber(earnedAmount),
      paidOutAmount: normalizeNumber(paidOutAmount),
      adjustedAmount: normalizeNumber(adjustedAmount),
      balanceAmount: normalizeNumber(balanceAmount),
    },
  };
}

export async function recalcAdminSalesmanCreditsOverviewSnapshot({
  periodKey = "30d",
} = {}) {
  const range = getPeriodRangeUtcFromPeriodKey(periodKey);
  if (!range) return null;

  const ymd = getTodayYmdInKst();
  if (!ymd) return null;

  const salesmen = await User.find({
    role: { $in: REFERRAL_LEADER_ROLES },
    active: true,
  })
    .select({ _id: 1 })
    .lean();
  const salesmanIds = (salesmen || [])
    .map((s) => String(s?._id || ""))
    .filter(Boolean)
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  const overview = await computeSalesmanOverviewSnapshot({
    range,
    salesmanIds,
  });

  const payload = {
    ymd,
    periodKey,
    rangeStartUtc: range.start,
    rangeEndUtc: range.end,
    salesmenCount: normalizeNumber(overview.salesmenCount || 0),
    referral: {
      paidRevenueAmount: normalizeNumber(overview?.referral?.paidRevenueAmount),
      bonusRevenueAmount: normalizeNumber(
        overview?.referral?.bonusRevenueAmount,
      ),
      orderCount: normalizeNumber(overview?.referral?.orderCount),
    },
    commission: {
      totalAmount: normalizeNumber(overview?.commission?.totalAmount),
      directAmount: normalizeNumber(overview?.commission?.directAmount),
      indirectAmount: normalizeNumber(overview?.commission?.indirectAmount),
    },
    walletPeriod: {
      earnedAmount: normalizeNumber(overview?.walletPeriod?.earnedAmount),
      paidOutAmount: normalizeNumber(overview?.walletPeriod?.paidOutAmount),
      adjustedAmount: normalizeNumber(overview?.walletPeriod?.adjustedAmount),
      balanceAmount: normalizeNumber(overview?.walletPeriod?.balanceAmount),
    },
    computedAt: new Date(),
  };

  await AdminSalesmanCreditsOverviewSnapshot.updateOne(
    { ymd, periodKey },
    { $set: payload },
    { upsert: true },
  );

  return payload;
}

export async function adminGetSalesmanCreditsOverview(req, res) {
  try {
    const periodKey = String(req.query.period || "30d").trim() || "30d";

    const payload = await recalcAdminSalesmanCreditsOverviewSnapshot({
      periodKey,
    });
    if (!payload) {
      return res.status(500).json({
        success: false,
        message: "영업자 크레딧 요약 조회에 실패했습니다.",
      });
    }

    return res.status(200).json({ success: true, data: payload });
  } catch (error) {
    console.error("adminGetSalesmanCreditsOverview error:", error);
    return res.status(500).json({
      success: false,
      message: "영업자 크레딧 요약 조회에 실패했습니다.",
    });
  }
}

export async function adminGetBusinessLedger(req, res) {
  try {
    const orgIdRaw = String(req.params.id || "");
    if (!Types.ObjectId.isValid(orgIdRaw)) {
      return res.status(400).json({
        success: false,
        message: "사업자 ID가 올바르지 않습니다.",
      });
    }
    const businessAnchorId = new Types.ObjectId(orgIdRaw);

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

    if (!businessAnchorId) {
      return res.status(400).json({
        success: false,
        message: "해당 사업자에 businessAnchorId가 없습니다.",
      });
    }

    const match = { businessAnchorId };

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
      if (Types.ObjectId.isValid(qRaw)) {
        ors.push({ refId: new Types.ObjectId(qRaw) });
      }
      if (ors.length) {
        match.$or = ors;
      }
    }

    // running balance: 전체 잔액 계산 (필터 무관)
    const allLedgerRows = await CreditLedger.aggregate([
      { $match: { businessAnchorId } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    let totalBalance = Number(allLedgerRows[0]?.total || 0);

    const skippedRows =
      (page - 1) * pageSize > 0
        ? await CreditLedger.find(match)
            .sort({ createdAt: -1, _id: -1 })
            .limit((page - 1) * pageSize)
            .select({ amount: 1 })
            .lean()
        : [];
    let skippedSum = 0;
    for (const r of skippedRows) skippedSum += Number(r.amount || 0);

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
              Types.ObjectId.isValid(String(it.refId)),
          )
          .map((it) => String(it.refId)),
      ),
    );

    const shippingPackageRefIds = Array.from(
      new Set(
        (items || [])
          .filter(
            (it) =>
              String(it?.refType || "") === "SHIPPING_PACKAGE" &&
              it?.refId &&
              Types.ObjectId.isValid(String(it.refId)),
          )
          .map((it) => String(it.refId)),
      ),
    );

    const welcomeBonusGrantIds = Array.from(
      new Set(
        (items || [])
          .filter((it) => String(it?.refType || "") === "WELCOME_BONUS")
          .map((it) => parseBonusGrantIdFromUniqueKey(it?.uniqueKey))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    );

    const refRequestIdById = new Map();
    const refRequestSummaryById = new Map();
    if (requestRefIds.length > 0) {
      const requestDocs = await Request.find({
        _id: { $in: requestRefIds.map((id) => new Types.ObjectId(id)) },
      })
        .select({
          _id: 1,
          requestId: 1,
          manufacturerStage: 1,
          lotNumber: 1,
          "caseInfos.patientName": 1,
          "caseInfos.tooth": 1,
          "caseInfos.clinicName": 1,
        })
        .lean();

      for (const doc of requestDocs || []) {
        if (doc?._id) {
          refRequestIdById.set(String(doc._id), String(doc.requestId || ""));
          refRequestSummaryById.set(String(doc._id), buildRequestSummary(doc));
        }
      }
    }

    const shippingTrackingNumbersByPackageId = new Map();
    if (shippingPackageRefIds.length > 0) {
      const packageDocs = await ShippingPackage.find({
        _id: { $in: shippingPackageRefIds.map((id) => new Types.ObjectId(id)) },
      })
        .select({ _id: 1, requestIds: 1 })
        .lean();

      const requestIdSet = new Set();
      for (const pkg of packageDocs || []) {
        for (const requestId of pkg?.requestIds || []) {
          if (requestId) requestIdSet.add(String(requestId));
        }
      }

      const deliveryInfoByRequestId = new Map();
      if (requestIdSet.size > 0) {
        const deliveryInfos = await DeliveryInfo.find({
          request: {
            $in: Array.from(requestIdSet).map((id) => new Types.ObjectId(id)),
          },
        })
          .select({ request: 1, trackingNumber: 1 })
          .lean();

        for (const delivery of deliveryInfos || []) {
          if (delivery?.request) {
            deliveryInfoByRequestId.set(
              String(delivery.request),
              String(delivery.trackingNumber || ""),
            );
          }
        }
      }

      for (const pkg of packageDocs || []) {
        const trackingNumbers = Array.from(
          new Set(
            (pkg?.requestIds || [])
              .map(
                (requestId) =>
                  deliveryInfoByRequestId.get(String(requestId)) || "",
              )
              .filter(Boolean),
          ),
        );
        shippingTrackingNumbersByPackageId.set(
          String(pkg._id),
          trackingNumbers,
        );
      }
    }

    const welcomeBonusReasonByGrantId = new Map();
    if (welcomeBonusGrantIds.length > 0) {
      const grants = await BonusGrant.find({
        _id: { $in: welcomeBonusGrantIds.map((id) => new Types.ObjectId(id)) },
      })
        .select({ _id: 1, source: 1, overrideReason: 1, businessNumber: 1 })
        .lean();

      for (const grant of grants || []) {
        if (!grant?._id) continue;
        const source = String(grant.source || "");
        const overrideReason = String(grant.overrideReason || "").trim();
        const businessNumber = String(grant.businessNumber || "").trim();
        let reason = "가입 축하 크레딧";
        if (source === "admin" && overrideReason) {
          reason = `관리자 지급 · ${overrideReason}`;
        } else if (source === "migrated") {
          reason = "시드/마이그레이션 가입 축하 크레딧";
        }
        if (businessNumber) {
          reason = `${reason} · 사업자번호 ${businessNumber}`;
        }
        welcomeBonusReasonByGrantId.set(String(grant._id), reason);
      }
    }

    const enrichedItems = (items || []).map((it) => {
      const refType = String(it?.refType || "");
      if (refType === "REQUEST") {
        const refId = it?.refId ? String(it.refId) : "";
        const refRequestId = refId ? refRequestIdById.get(refId) || "" : "";
        const requestSummary = refId
          ? refRequestSummaryById.get(refId) || null
          : null;
        return {
          ...it,
          refRequestId,
          refRequestSummary: requestSummary,
          patientName: requestSummary?.patientName || "",
          tooth: requestSummary?.tooth || "",
          clinicName: requestSummary?.clinicName || "",
          manufacturerStage: requestSummary?.manufacturerStage || "",
          lotNumber: requestSummary?.lotNumber || null,
        };
      }

      if (refType === "SHIPPING_PACKAGE") {
        const refId = it?.refId ? String(it.refId) : "";
        return {
          ...it,
          trackingNumbers: refId
            ? shippingTrackingNumbersByPackageId.get(refId) || []
            : [],
        };
      }

      if (refType === "WELCOME_BONUS") {
        const grantId = parseBonusGrantIdFromUniqueKey(it?.uniqueKey);
        return {
          ...it,
          bonusReason: grantId
            ? welcomeBonusReasonByGrantId.get(grantId) || ""
            : "",
        };
      }

      return it;
    });

    return res.json({
      success: true,
      data: { items: enrichedItems, total, page, pageSize },
    });
  } catch (error) {
    console.error("adminGetBusinessLedger error:", error);
    return res.status(500).json({
      success: false,
      message: "사업자 크레딧 원장 조회에 실패했습니다.",
    });
  }
}

export async function adminCreateSalesmanPayout(req, res) {
  try {
    const salesmanIdRaw = String(req.params.id || "");
    if (!Types.ObjectId.isValid(salesmanIdRaw)) {
      return res.status(400).json({
        success: false,
        message: "영업자 ID가 올바르지 않습니다.",
      });
    }
    const salesmanId = new Types.ObjectId(salesmanIdRaw);

    const amountRaw = Number(req.body?.amount || 0);
    const amount = Number.isFinite(amountRaw) ? Math.round(amountRaw) : 0;
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "정산 금액이 올바르지 않습니다.",
      });
    }
    if (amount % 10000 !== 0) {
      return res.status(400).json({
        success: false,
        message: "정산 금액은 10,000원 단위로만 가능합니다.",
      });
    }

    const salesman = await User.findById(salesmanId)
      .select({ _id: 1, role: 1, active: 1 })
      .lean();
    if (!salesman || String(salesman.role || "") !== "salesman") {
      return res.status(404).json({
        success: false,
        message: "영업자를 찾을 수 없습니다.",
      });
    }

    const ledgerRows = await SalesmanLedger.aggregate([
      { $match: { salesmanId } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]);

    let earn = 0;
    let payout = 0;
    let adjust = 0;
    for (const r of ledgerRows || []) {
      const type = String(r?._id || "");
      const total = Number(r?.total || 0);
      if (type === "EARN") earn += total;
      else if (type === "PAYOUT") payout += total;
      else if (type === "ADJUST") adjust += total;
    }
    const balance = Math.round(earn - payout + adjust);
    if (balance < amount) {
      return res.status(400).json({
        success: false,
        message: "정산 전 잔액이 부족합니다.",
      });
    }

    const now = new Date();
    const uniqueKey = `admin:salesman:payout:${String(salesmanId)}:${now.getTime()}`;
    const created = await SalesmanLedger.create({
      salesmanId,
      type: "PAYOUT",
      amount,
      refType: "ADMIN_PAYOUT",
      refId: null,
      uniqueKey,
    });

    return res.status(200).json({
      success: true,
      data: {
        _id: created?._id,
        salesmanId: String(salesmanId),
        amount,
        type: "PAYOUT",
        createdAt: created?.createdAt,
      },
    });
  } catch (error) {
    console.error("adminCreateSalesmanPayout error:", error);
    return res.status(500).json({
      success: false,
      message: "정산 처리에 실패했습니다.",
    });
  }
}

export async function adminGetCreditStats(req, res) {
  try {
    const totalOrgs = await BusinessAnchor.countDocuments({
      businessType: "requestor",
    });

    // requestor 타입 BusinessAnchor ID 목록 조회 (의뢰자 전용 집계 필터)
    const requestorAnchorIds = await BusinessAnchor.distinct("_id", {
      businessType: "requestor",
    });

    const [
      totalChargeOrders,
      totalBankTransactions,
      pendingChargeOrders,
      matchedChargeOrders,
      newBankTransactions,
      matchedBankTransactions,
    ] = await Promise.all([
      ChargeOrder.countDocuments({
        businessAnchorId: { $in: requestorAnchorIds },
      }),
      BankTransaction.countDocuments(),
      ChargeOrder.countDocuments({
        businessAnchorId: { $in: requestorAnchorIds },
        status: "PENDING",
      }),
      ChargeOrder.countDocuments({
        businessAnchorId: { $in: requestorAnchorIds },
        status: "MATCHED",
      }),
      BankTransaction.countDocuments({ status: "NEW" }),
      BankTransaction.countDocuments({ status: "MATCHED" }),
    ]);

    // 의뢰자 CreditLedger만 집계
    const [creditSummary] = await Promise.all([
      CreditLedger.aggregate([
        {
          $match: {
            businessAnchorId: { $in: requestorAnchorIds },
          },
        },
        {
          $group: {
            _id: null,
            // 유료 크레딧 충전 (CHARGE만 - adminGetBusinessCredits와 동일한 방식)
            chargedPaid: {
              $sum: {
                $cond: [
                  { $eq: ["$type", "CHARGE"] },
                  { $max: [{ $abs: "$amount" }, 0] },
                  0,
                ],
              },
            },
            // REFUND: 소비된 금액을 돌려주는 것이므로 잔액 계산 시 spentPaidSum에서 차감
            refundSum: {
              $sum: {
                $cond: [
                  { $eq: ["$type", "REFUND"] },
                  { $max: [{ $abs: "$amount" }, 0] },
                  0,
                ],
              },
            },
            // 배송비 환불 분리 집계 (fallback 계산용)
            refundShippingSum: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$type", "REFUND"] },
                      {
                        $in: ["$refType", ["SHIPPING_PACKAGE", "SHIPPING_FEE"]],
                      },
                    ],
                  },
                  { $max: [{ $abs: "$amount" }, 0] },
                  0,
                ],
              },
            },
            chargedBonusRequest: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$type", "BONUS"] },
                      { $ne: ["$refType", "FREE_SHIPPING_CREDIT"] },
                    ],
                  },
                  { $max: ["$amount", 0] },
                  0,
                ],
              },
            },
            chargedBonusShipping: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$type", "BONUS"] },
                      { $eq: ["$refType", "FREE_SHIPPING_CREDIT"] },
                    ],
                  },
                  { $max: ["$amount", 0] },
                  0,
                ],
              },
            },
            adjustSum: {
              $sum: {
                $cond: [{ $eq: ["$type", "ADJUST"] }, "$amount", 0],
              },
            },
            spentTotal: {
              $sum: {
                $cond: [{ $eq: ["$type", "SPEND"] }, { $abs: "$amount" }, 0],
              },
            },
            // refType이 null/undefined/빈 문자열인 레거시 데이터는 REQUEST로 간주
            spentByRequestSum: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$type", "SPEND"] },
                      {
                        $or: [
                          {
                            $eq: [
                              { $ifNull: ["$refType", "REQUEST"] },
                              "REQUEST",
                            ],
                          },
                          { $eq: ["$refType", null] },
                          { $eq: ["$refType", ""] },
                        ],
                      },
                    ],
                  },
                  { $abs: "$amount" },
                  0,
                ],
              },
            },
            spentByShippingSum: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$type", "SPEND"] },
                      {
                        $in: ["$refType", ["SHIPPING_PACKAGE", "SHIPPING_FEE"]],
                      },
                    ],
                  },
                  { $abs: "$amount" },
                  0,
                ],
              },
            },
            spentPaidSum: {
              $sum: {
                $cond: [
                  { $eq: ["$type", "SPEND"] },
                  { $ifNull: ["$spentPaidAmount", 0] },
                  0,
                ],
              },
            },
            // refType이 null/undefined/빈 문자열인 레거시 데이터는 REQUEST로 간주
            spentBonusRequestSum: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$type", "SPEND"] },
                      {
                        $or: [
                          {
                            $eq: [
                              { $ifNull: ["$refType", "REQUEST"] },
                              "REQUEST",
                            ],
                          },
                          { $eq: ["$refType", null] },
                          { $eq: ["$refType", ""] },
                        ],
                      },
                    ],
                  },
                  { $ifNull: ["$spentBonusAmount", 0] },
                  0,
                ],
              },
            },
            spentBonusShippingSum: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$type", "SPEND"] },
                      { $eq: ["$refType", "SHIPPING_PACKAGE"] },
                    ],
                  },
                  { $ifNull: ["$spentBonusAmount", 0] },
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    const summary = creditSummary[0] || {};
    const totalSpentPaidAmount = Number(summary.spentPaidSum || 0);
    const totalSpentBonusRequestAmount = Number(
      summary.spentBonusRequestSum || 0,
    );
    const totalSpentBonusShippingAmount = Number(
      summary.spentBonusShippingSum || 0,
    );
    const refundSum = Number(summary.refundSum || 0);
    const refundShippingSum = Number(summary.refundShippingSum || 0);
    const refundRequestSum = refundSum - refundShippingSum;
    const spentTotal = Math.max(0, Number(summary.spentTotal || 0) - refundSum);

    const spentBonusTotal =
      totalSpentBonusRequestAmount + totalSpentBonusShippingAmount;
    let netSpentPaidAmount = 0;
    let resolvedSpentBonusRequestAmount = 0;
    let resolvedSpentBonusShippingAmount = 0;

    if (
      Math.round(totalSpentPaidAmount + spentBonusTotal) ===
      Math.round(spentTotal)
    ) {
      netSpentPaidAmount = Math.max(0, totalSpentPaidAmount);
      resolvedSpentBonusRequestAmount = Math.max(
        0,
        totalSpentBonusRequestAmount,
      );
      resolvedSpentBonusShippingAmount = Math.max(
        0,
        totalSpentBonusShippingAmount,
      );
    } else {
      const spentByRequest = Math.max(
        0,
        Number(summary.spentByRequestSum || 0) - refundRequestSum,
      );
      const spentByShipping = Math.max(
        0,
        Number(summary.spentByShippingSum || 0) - refundShippingSum,
      );

      const chargedBonusRequest = Number(summary.chargedBonusRequest || 0);
      const chargedBonusShipping = Number(summary.chargedBonusShipping || 0);

      const bonusShippingUsed = Math.min(chargedBonusShipping, spentByShipping);
      const paidFromShipping = spentByShipping - bonusShippingUsed;

      const bonusRequestUsed = Math.min(chargedBonusRequest, spentByRequest);
      const paidFromRequest = spentByRequest - bonusRequestUsed;

      netSpentPaidAmount = Math.max(0, paidFromRequest + paidFromShipping);
      resolvedSpentBonusRequestAmount = Math.max(0, bonusRequestUsed);
      resolvedSpentBonusShippingAmount = Math.max(0, bonusShippingUsed);
    }

    const totalSpent =
      netSpentPaidAmount +
      resolvedSpentBonusRequestAmount +
      resolvedSpentBonusShippingAmount;

    const chargedPaid = Number(summary.chargedPaid || 0);
    const chargedBonusRequest = Number(summary.chargedBonusRequest || 0);
    const chargedBonusShipping = Number(summary.chargedBonusShipping || 0);
    const adjustSum = Number(summary.adjustSum || 0);

    const totalCharged = chargedPaid;
    const totalBonus = chargedBonusRequest + chargedBonusShipping;
    const totalBonusRequest = chargedBonusRequest;
    const totalBonusShipping = chargedBonusShipping;

    const totalPaidCredit = Math.max(
      0,
      chargedPaid + adjustSum - netSpentPaidAmount,
    );
    const totalBonusRequestCredit = Math.max(
      0,
      chargedBonusRequest - resolvedSpentBonusRequestAmount,
    );
    const totalBonusShippingCredit = Math.max(
      0,
      chargedBonusShipping - resolvedSpentBonusShippingAmount,
    );

    return res.json({
      success: true,
      data: {
        totalOrgs,
        totalChargeOrders,
        totalBankTransactions,
        pendingChargeOrders,
        matchedChargeOrders,
        newBankTransactions,
        matchedBankTransactions,
        totalCharged: Math.max(0, Math.round(totalCharged)),
        totalSpent: Math.max(0, Math.round(totalSpent)),
        totalBonus: Math.max(0, Math.round(totalBonus)),
        totalBonusRequest: Math.max(0, Math.round(totalBonusRequest)),
        totalBonusShipping: Math.max(0, Math.round(totalBonusShipping)),
        totalSpentPaidAmount: Math.max(0, Math.round(netSpentPaidAmount)),
        totalSpentBonusRequestAmount: Math.max(
          0,
          Math.round(resolvedSpentBonusRequestAmount),
        ),
        totalSpentBonusShippingAmount: Math.max(
          0,
          Math.round(resolvedSpentBonusShippingAmount),
        ),
        totalPaidCredit: Math.max(0, Math.round(totalPaidCredit)),
        totalBonusRequestCredit: Math.max(
          0,
          Math.round(totalBonusRequestCredit),
        ),
        totalBonusShippingCredit: Math.max(
          0,
          Math.round(totalBonusShippingCredit),
        ),
        ledgerByType: {},
      },
    });
  } catch (error) {
    console.error("adminGetCreditStats error:", error);
    return res.status(500).json({
      success: false,
      message: "크레딧 통계 조회에 실패했습니다.",
    });
  }
}

export async function adminGetSalesmanCredits(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const commissionRate = 0.1;

    // 기간 필터: startDate/endDate 파라미터 우선, 없으면 KST 자정 기준 최근 30일
    const startDateRaw = String(req.query.startDate || "").trim();
    const endDateRaw = String(req.query.endDate || "").trim();
    const defaultRange = getLast30DaysRangeUtc();
    const periodCutoff = startDateRaw
      ? new Date(startDateRaw)
      : (defaultRange?.start ?? null);
    const periodEnd = endDateRaw
      ? new Date(endDateRaw)
      : (defaultRange?.end ?? null);

    // 전체 개수 조회
    const totalSalesmen = await User.countDocuments({
      role: { $in: REFERRAL_LEADER_ROLES },
    });

    // 페이지네이션 적용하여 필요한 영업자만 조회
    const salesmen = await User.find({
      role: { $in: REFERRAL_LEADER_ROLES },
    })
      .select({
        _id: 1,
        name: 1,
        email: 1,
        referralCode: 1,
        active: 1,
        role: 1,
        businessAnchorId: 1,
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const salesmanIds = salesmen
      .map((u) => String(u?._id || ""))
      .filter(Boolean)
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (salesmanIds.length === 0) {
      return res.json({
        success: true,
        data: { items: [], total: 0, skip, limit },
      });
    }

    const businessAnchorIds = Array.from(
      new Set(
        salesmen
          .map((u) => String(u?.businessAnchorId || ""))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ).map((id) => new Types.ObjectId(id));

    // 기간 필터 적용된 ledger 집계
    const ledgerPeriodMatch = { salesmanId: { $in: salesmanIds } };
    if (periodCutoff) ledgerPeriodMatch.createdAt = { $gte: periodCutoff };
    if (periodEnd) {
      ledgerPeriodMatch.createdAt = ledgerPeriodMatch.createdAt || {};
      ledgerPeriodMatch.createdAt.$lte = periodEnd;
    }

    // 병렬 실행: BusinessAnchor 조회 + 2개의 SalesmanLedger aggregate
    const [anchors, ledgerRows, ledgerRowsPeriod] = await Promise.all([
      businessAnchorIds.length
        ? BusinessAnchor.find({ _id: { $in: businessAnchorIds } })
            .select({
              _id: 1,
              name: 1,
              businessType: 1,
              metadata: 1,
              status: 1,
            })
            .lean()
        : Promise.resolve([]),
      SalesmanLedger.aggregate([
        { $match: { salesmanId: { $in: salesmanIds } } },
        {
          $group: {
            _id: { salesmanId: "$salesmanId", type: "$type" },
            total: { $sum: "$amount" },
          },
        },
      ]),
      SalesmanLedger.aggregate([
        { $match: ledgerPeriodMatch },
        {
          $group: {
            _id: { salesmanId: "$salesmanId", type: "$type" },
            total: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    const anchorById = new Map(
      (anchors || []).map((a) => [String(a?._id || ""), a]),
    );

    // 잔액(balance)은 항상 전체 기간 기준 (정산 전 잔액)
    const ledgerBySalesmanId = new Map();
    for (const r of ledgerRows) {
      const sid = String(r?._id?.salesmanId || "");
      const type = String(r?._id?.type || "");
      const total = Number(r?.total || 0);
      if (!sid) continue;
      const prev = ledgerBySalesmanId.get(sid) || {
        earn: 0,
        payout: 0,
        adjust: 0,
      };
      if (type === "EARN") prev.earn += total;
      else if (type === "PAYOUT") prev.payout += total;
      else if (type === "ADJUST") prev.adjust += total;
      ledgerBySalesmanId.set(sid, prev);
    }

    const ledgerPeriodBySalesmanId = new Map();
    for (const r of ledgerRowsPeriod) {
      const sid = String(r?._id?.salesmanId || "");
      const type = String(r?._id?.type || "");
      const total = Number(r?.total || 0);
      if (!sid) continue;
      const prev = ledgerPeriodBySalesmanId.get(sid) || {
        earn: 0,
        payout: 0,
        adjust: 0,
      };
      if (type === "EARN") prev.earn += total;
      else if (type === "PAYOUT") prev.payout += total;
      else if (type === "ADJUST") prev.adjust += total;
      ledgerPeriodBySalesmanId.set(sid, prev);
    }

    const range =
      periodCutoff || periodEnd
        ? {
            start: periodCutoff || new Date(0),
            end: periodEnd || new Date(),
          }
        : null;
    const {
      directOrgIdsBySalesmanId,
      level1OrgIdsBySalesmanId,
      referredSalesmanCountBySalesmanId,
      revenueByOrgId,
    } = await buildSalesmanReferralAggregation({
      salesmanIds,
      range,
    });

    const items = salesmen.map((s) => {
      const sid = String(s._id);
      const ledger = ledgerBySalesmanId.get(sid) || {
        earn: 0,
        payout: 0,
        adjust: 0,
      };

      const ledgerPeriod = ledgerPeriodBySalesmanId.get(sid) || {
        earn: 0,
        payout: 0,
        adjust: 0,
      };
      const balance = Math.round(
        Number(ledger.earn || 0) -
          Number(ledger.payout || 0) +
          Number(ledger.adjust || 0),
      );

      const balancePeriod = Math.round(
        Number(ledgerPeriod.earn || 0) -
          Number(ledgerPeriod.payout || 0) +
          Number(ledgerPeriod.adjust || 0),
      );

      const directOrgSet = directOrgIdsBySalesmanId.get(sid) || new Set();
      const level1OrgSet = level1OrgIdsBySalesmanId.get(sid) || new Set();

      let directRevenue30d = 0;
      let directBonus30d = 0;
      let directOrders30d = 0;
      for (const orgId of directOrgSet) {
        const row = revenueByOrgId.get(String(orgId));
        if (!row) continue;
        directRevenue30d += Number(row.revenueAmount || 0);
        directBonus30d += Number(row.bonusAmount || 0);
        directOrders30d += Number(row.orderCount || 0);
      }

      let level1Revenue30d = 0;
      let level1Bonus30d = 0;
      let level1Orders30d = 0;
      for (const orgId of level1OrgSet) {
        const row = revenueByOrgId.get(String(orgId));
        if (!row) continue;
        level1Revenue30d += Number(row.revenueAmount || 0);
        level1Bonus30d += Number(row.bonusAmount || 0);
        level1Orders30d += Number(row.orderCount || 0);
      }

      const revenue30d = directRevenue30d + level1Revenue30d;
      const bonus30d = directBonus30d + level1Bonus30d;
      const orders30d = directOrders30d + level1Orders30d;
      const myCommission30d = Math.round(directRevenue30d * commissionRate);
      const level1Commission30d = 0;
      const commission30d = myCommission30d + level1Commission30d;
      const anchorId = String(s?.businessAnchorId || "");
      const anchor = anchorById.get(anchorId) || null;

      return {
        salesmanId: sid,
        name: String(s?.name || ""),
        email: String(s?.email || ""),
        role: String(s?.role || ""),
        referralCode: String(s?.referralCode || ""),
        active: Boolean(s?.active),
        businessAnchorId: anchorId || null,
        businessAnchor: anchor
          ? {
              id: String(anchor?._id || ""),
              name: String(anchor?.name || ""),
              businessType: String(anchor?.businessType || ""),
              status: String(anchor?.status || ""),
              representativeName: String(
                anchor?.metadata?.representativeName || "",
              ),
              email: String(anchor?.metadata?.email || ""),
              phoneNumber: String(anchor?.metadata?.phoneNumber || ""),
            }
          : null,
        referredSalesmanCount: referredSalesmanCountBySalesmanId.get(sid) || 0,
        wallet: {
          earnedAmount: Math.round(Number(ledger.earn || 0)),
          paidOutAmount: Math.round(Number(ledger.payout || 0)),
          adjustedAmount: Math.round(Number(ledger.adjust || 0)),
          balanceAmount: balance,
          earnedAmountPeriod: Math.round(Number(ledgerPeriod.earn || 0)),
          paidOutAmountPeriod: Math.round(Number(ledgerPeriod.payout || 0)),
          adjustedAmountPeriod: Math.round(Number(ledgerPeriod.adjust || 0)),
          balanceAmountPeriod: balancePeriod,
        },
        performance30d: {
          referredOrgCount: directOrgSet.size,
          level1OrgCount: level1OrgSet.size,
          revenueAmount: Math.round(revenue30d),
          directRevenueAmount: Math.round(directRevenue30d),
          level1RevenueAmount: Math.round(level1Revenue30d),
          bonusAmount: Math.round(bonus30d),
          directBonusAmount: Math.round(directBonus30d),
          level1BonusAmount: Math.round(level1Bonus30d),
          orderCount: Math.round(orders30d),
          commissionAmount: Math.round(commission30d),
          myCommissionAmount: Math.round(myCommission30d),
          level1CommissionAmount: Math.round(level1Commission30d),
        },
      };
    });

    const sortedItems = [...items].sort(
      (a, b) =>
        Number(b.wallet?.balanceAmountPeriod || 0) -
          Number(a.wallet?.balanceAmountPeriod || 0) ||
        Number(b.performance30d?.commissionAmount || 0) -
          Number(a.performance30d?.commissionAmount || 0) ||
        String(a.name || "").localeCompare(String(b.name || ""), "ko"),
    );

    return res.json({
      success: true,
      data: {
        items: sortedItems,
        total: totalSalesmen,
        skip,
        limit,
      },
    });
  } catch (error) {
    console.error("adminGetSalesmanCredits error:", error);
    return res.status(500).json({
      success: false,
      message: "영업자 크레딧 조회에 실패했습니다.",
    });
  }
}

export async function adminGetManufacturerSummary(req, res) {
  try {
    const periodKey = String(req.query.period || "30d").trim() || "30d";
    const range = getPeriodRangeUtcFromPeriodKey(periodKey);

    const [anchorCount, periodLedgerRows, allLedgerRows] = await Promise.all([
      BusinessAnchor.countDocuments({ businessType: "manufacturer" }),
      range
        ? ManufacturerCreditLedger.aggregate([
            {
              $match: {
                occurredAt: { $gte: range.start, $lte: range.end },
              },
            },
            {
              $group: {
                _id: "$type",
                total: { $sum: "$amount" },
              },
            },
          ])
        : Promise.resolve([]),
      ManufacturerCreditLedger.aggregate([
        {
          $group: {
            _id: { org: "$manufacturerOrganization", type: "$type" },
            total: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    let periodEarnedAmount = 0;
    let periodPaidOutAmount = 0;
    let periodAdjustedAmount = 0;
    for (const r of periodLedgerRows || []) {
      const type = String(r?._id || "");
      const total = normalizeNumber(r?.total || 0);
      if (type === "EARN") periodEarnedAmount += total;
      else if (type === "PAYOUT") periodPaidOutAmount += total;
      else if (type === "ADJUST") periodAdjustedAmount += total;
    }
    const periodBalanceAmount = normalizeNumber(
      periodEarnedAmount - periodPaidOutAmount + periodAdjustedAmount,
    );

    const balanceByOrg = new Map();
    for (const r of allLedgerRows || []) {
      const org = String(r?._id?.org || "");
      const type = String(r?._id?.type || "");
      const total = Number(r?.total || 0);
      if (!org) continue;
      const prev = balanceByOrg.get(org) || { earn: 0, payout: 0, adjust: 0 };
      if (type === "EARN") prev.earn += total;
      else if (type === "PAYOUT") prev.payout += total;
      else if (type === "ADJUST") prev.adjust += total;
      balanceByOrg.set(org, prev);
    }
    let totalBalanceAmount = 0;
    for (const v of balanceByOrg.values()) {
      totalBalanceAmount += Math.max(
        0,
        normalizeNumber(v.earn - v.payout + v.adjust),
      );
    }

    return res.json({
      success: true,
      data: {
        anchorCount,
        periodEarnedAmount,
        periodPaidOutAmount,
        periodBalanceAmount,
        totalBalanceAmount,
      },
    });
  } catch (error) {
    console.error("adminGetManufacturerSummary error:", error);
    return res.status(500).json({
      success: false,
      message: "제조사 통계 조회에 실패했습니다.",
    });
  }
}

function parsePeriod(period) {
  const p = String(period || "").trim();
  if (!p || p === "all") return null;

  // KST 기준 N일 전 계산
  const now = new Date();
  const kstDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const todayKst = new Date(`${kstDate}T00:00:00+09:00`);

  if (p === "7d") {
    todayKst.setDate(todayKst.getDate() - 7);
    return todayKst;
  }
  if (p === "30d") {
    todayKst.setDate(todayKst.getDate() - 30);
    return todayKst;
  }
  if (p === "90d") {
    todayKst.setDate(todayKst.getDate() - 90);
    return todayKst;
  }
  return null;
}

function safeRegex(query) {
  const q = String(query || "").trim();
  if (!q) return null;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

export async function adminGetSalesmanLedger(req, res) {
  try {
    const salesmanIdRaw = String(req.params.id || "");
    if (!Types.ObjectId.isValid(salesmanIdRaw)) {
      return res.status(400).json({
        success: false,
        message: "영업자 ID가 올바르지 않습니다.",
      });
    }
    const salesmanId = new Types.ObjectId(salesmanIdRaw);

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

    const match = { salesmanId };

    if (
      typeRaw &&
      typeRaw !== "ALL" &&
      ["EARN", "PAYOUT", "ADJUST"].includes(typeRaw)
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
      if (Types.ObjectId.isValid(qRaw)) {
        ors.push({ refId: new Types.ObjectId(qRaw) });
      }
      if (ors.length) {
        match.$or = ors;
      }
    }

    // running balance를 위해 전체 누적 잔액 계산 (필터 무관)
    const allLedgerRows = await SalesmanLedger.aggregate([
      { $match: { salesmanId } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]);
    let totalBalance = 0;
    for (const r of allLedgerRows) {
      const t = String(r._id || "");
      const v = Number(r.total || 0);
      if (t === "EARN" || t === "ADJUST") totalBalance += v;
      else if (t === "PAYOUT") totalBalance -= v;
    }

    // 현재 페이지 이후(더 오래된) 항목들의 합산 잔액 계산
    // sort: createdAt desc → 페이지1이 가장 최신
    // skip된 항목들(더 최신)의 합을 전체잔액에서 빼면 현재 페이지 첫 항목 직후 잔액
    const skippedRows =
      (page - 1) * pageSize > 0
        ? await SalesmanLedger.find(match)
            .sort({ createdAt: -1, _id: -1 })
            .limit((page - 1) * pageSize)
            .select({ type: 1, amount: 1 })
            .lean()
        : [];
    let skippedSum = 0;
    for (const r of skippedRows) {
      const t = String(r.type || "");
      const v = Number(r.amount || 0);
      if (t === "EARN" || t === "ADJUST") skippedSum += v;
      else if (t === "PAYOUT") skippedSum -= v;
    }

    const [total, rawItems] = await Promise.all([
      SalesmanLedger.countDocuments(match),
      SalesmanLedger.find(match)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .select({
          type: 1,
          amount: 1,
          amountExcludingVat: 1,
          vatAmount: 1,
          amountIncludingVat: 1,
          refType: 1,
          refId: 1,
          uniqueKey: 1,
          createdAt: 1,
        })
        .lean(),
    ]);

    // running balance: 각 행 이후의 잔액 (최신→과거 순)
    let runningBalance = totalBalance - skippedSum;
    const items = (Array.isArray(rawItems) ? rawItems : []).map((r) => {
      const v = Number(r.amount || 0);
      const t = String(r.type || "");
      const balanceAfter = runningBalance;
      if (t === "EARN" || t === "ADJUST") runningBalance -= v;
      else if (t === "PAYOUT") runningBalance += v;
      return { ...r, balanceAfter };
    });

    return res.json({
      success: true,
      data: { items, total, page, pageSize },
    });
  } catch (error) {
    console.error("adminGetSalesmanLedger error:", error);
    return res.status(500).json({
      success: false,
      message: "영업자 원장 조회에 실패했습니다.",
    });
  }
}

export async function adminGetBusinessCredits(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = Math.max(Number(req.query.skip) || 0, 0);

    // 전체 개수 조회 (캐싱 가능)
    const total = await BusinessAnchor.countDocuments({});

    // SSOT: metadata 사용 (extracted 레거시 제거)
    // 페이지네이션 적용하여 필요한 데이터만 조회
    const orgs = await BusinessAnchor.find({})
      .select({
        name: 1,
        primaryContactUserId: 1,
        metadata: 1,
        businessAnchorId: 1,
        businessType: 1,
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const ownerIds = Array.from(
      new Set(
        (orgs || [])
          .map((o) => o?.primaryContactUserId)
          .filter(Boolean)
          .map((id) => String(id)),
      ),
    )
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const owners = ownerIds.length
      ? await User.find({ _id: { $in: ownerIds } })
          .select({ _id: 1, name: 1, email: 1 })
          .lean()
      : [];

    const ownerById = new Map(
      (owners || []).map((u) => [
        String(u._id),
        { name: u.name, email: u.email },
      ]),
    );

    // BusinessAnchor._id 자체가 businessAnchorId이므로 직접 사용
    const orgAnchorIds = (orgs || [])
      .map((org) => org._id)
      .filter(Boolean)
      .map((id) => new Types.ObjectId(String(id)));

    // CreditLedger 집계: 무료 크레딧을 의뢰용과 배송비용으로 분리
    // - bonusRequestCredit: 의뢰 결제만 가능 (배송비 결제 불가)
    // - bonusShippingCredit: 배송비 결제만 가능 (의뢰 결제 불가)
    // - paidCredit: 의뢰 + 배송비 모두 가능
    const ledgerData = orgAnchorIds.length
      ? await CreditLedger.aggregate([
          { $match: { businessAnchorId: { $in: orgAnchorIds } } },
          {
            $group: {
              _id: "$businessAnchorId",
              // 유료 크레딧 충전 (CHARGE만 - REFUND는 별도 집계)
              chargedPaid: {
                $sum: {
                  $cond: [
                    { $eq: ["$type", "CHARGE"] },
                    { $max: [{ $abs: "$amount" }, 0] },
                    0,
                  ],
                },
              },
              // REFUND: 이미 소비된 금액을 돌려주는 것 (배송비 환불 등)
              // spentTotal에서 차감하여 순소비를 계산하는 데 사용
              refundSum: {
                $sum: {
                  $cond: [
                    { $eq: ["$type", "REFUND"] },
                    { $max: [{ $abs: "$amount" }, 0] },
                    0,
                  ],
                },
              },
              // 배송비 환불만 별도 집계 (refType 기반 fallback에서 spentByShipping 보정용)
              refundShippingSum: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$type", "REFUND"] },
                        {
                          $in: [
                            "$refType",
                            ["SHIPPING_PACKAGE", "SHIPPING_FEE"],
                          ],
                        },
                      ],
                    },
                    { $max: [{ $abs: "$amount" }, 0] },
                    0,
                  ],
                },
              },
              // 무료 의뢰 크레딧 충전 (BONUS이지만 FREE_SHIPPING_CREDIT 아님)
              // BONUS는 양수여야 하므로 음수면 0으로 처리
              chargedBonusRequest: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$type", "BONUS"] },
                        { $ne: ["$refType", "FREE_SHIPPING_CREDIT"] },
                      ],
                    },
                    { $max: ["$amount", 0] },
                    0,
                  ],
                },
              },
              // 무료 배송비 크레딧 충전 (BONUS + FREE_SHIPPING_CREDIT)
              // BONUS는 양수여야 하므로 음수면 0으로 처리
              chargedBonusShipping: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$type", "BONUS"] },
                        { $eq: ["$refType", "FREE_SHIPPING_CREDIT"] },
                      ],
                    },
                    { $max: ["$amount", 0] },
                    0,
                  ],
                },
              },
              adjustSum: {
                $sum: {
                  $cond: [{ $eq: ["$type", "ADJUST"] }, "$amount", 0],
                },
              },
              spentTotal: {
                $sum: {
                  $cond: [{ $eq: ["$type", "SPEND"] }, { $abs: "$amount" }, 0],
                },
              },
              // fallback용: refType별 SPEND 총액 (spentBonusAmount 미저장 레거시 대응)
              // refType이 null/undefined/빈 문자열인 레거시 데이터는 REQUEST로 간주
              spentByRequestSum: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$type", "SPEND"] },
                        {
                          $or: [
                            {
                              $eq: [
                                { $ifNull: ["$refType", "REQUEST"] },
                                "REQUEST",
                              ],
                            },
                            { $eq: ["$refType", null] },
                            { $eq: ["$refType", ""] },
                          ],
                        },
                      ],
                    },
                    { $abs: "$amount" },
                    0,
                  ],
                },
              },
              spentByShippingSum: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$type", "SPEND"] },
                        {
                          $in: [
                            "$refType",
                            ["SHIPPING_PACKAGE", "SHIPPING_FEE"],
                          ],
                        },
                        // hasFreeRequest=false인 패키지는 무료배송 크레딧 사용 불가
                        { $ne: ["$hasFreeRequest", false] },
                      ],
                    },
                    { $abs: "$amount" },
                    0,
                  ],
                },
              },
              // 무료 의뢰 없는 패키지의 배송비 (유료 크레딧에서만 차감 가능)
              spentByShippingNoFreeSum: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$type", "SPEND"] },
                        {
                          $in: [
                            "$refType",
                            ["SHIPPING_PACKAGE", "SHIPPING_FEE"],
                          ],
                        },
                        { $eq: ["$hasFreeRequest", false] },
                      ],
                    },
                    { $abs: "$amount" },
                    0,
                  ],
                },
              },
              spentPaidSum: {
                $sum: {
                  $cond: [
                    { $eq: ["$type", "SPEND"] },
                    { $ifNull: ["$spentPaidAmount", 0] },
                    0,
                  ],
                },
              },
              // 무료 의뢰 크레딧 소비 (배송비가 아닌 의뢰 결제에 사용된 무료 크레딧)
              // refType이 null/undefined/빈 문자열인 레거시 데이터는 REQUEST로 간주
              spentBonusRequestSum: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$type", "SPEND"] },
                        {
                          $or: [
                            {
                              $eq: [
                                { $ifNull: ["$refType", "REQUEST"] },
                                "REQUEST",
                              ],
                            },
                            { $eq: ["$refType", null] },
                            { $eq: ["$refType", ""] },
                          ],
                        },
                      ],
                    },
                    { $ifNull: ["$spentBonusAmount", 0] },
                    0,
                  ],
                },
              },
              // 무료 배송비 크레딧 소비 (배송비 결제에 사용된 무료 크레딧)
              spentBonusShippingSum: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$type", "SPEND"] },
                        { $eq: ["$refType", "SHIPPING_PACKAGE"] },
                      ],
                    },
                    { $ifNull: ["$spentBonusAmount", 0] },
                    0,
                  ],
                },
              },
            },
          },
        ])
      : [];

    const balanceMap = {};
    ledgerData.forEach((item) => {
      const chargedPaid = Number(item.chargedPaid || 0);
      const chargedBonusRequest = Number(item.chargedBonusRequest || 0);
      const chargedBonusShipping = Number(item.chargedBonusShipping || 0);
      const adjustSum = Number(item.adjustSum || 0);
      // REFUND는 이미 소비된 금액을 돌려주는 것이므로 순소비에서 차감
      // REFUND refType이 SHIPPING_PACKAGE이면 배송비 소비를 취소한 것
      const refundSum = Number(item.refundSum || 0);
      const refundShippingSum = Number(item.refundShippingSum || 0);
      const refundRequestSum = refundSum - refundShippingSum;
      const spentTotal = Math.max(0, Number(item.spentTotal || 0) - refundSum);
      const spentPaidRaw = Number(item.spentPaidSum || 0);
      const spentBonusRequestRaw = Number(item.spentBonusRequestSum || 0);
      const spentBonusShippingRaw = Number(item.spentBonusShippingSum || 0);

      // CreditLedger에 spentPaidAmount/spentBonusAmount가 저장되어 있으면 그 값 사용
      // 저장된 값이 없거나 합계가 맞지 않으면 fallback 로직 사용
      const spentBonusTotal = spentBonusRequestRaw + spentBonusShippingRaw;
      let spentPaid, spentBonusRequest, spentBonusShipping;

      if (
        Math.round(spentPaidRaw + spentBonusTotal) === Math.round(spentTotal)
      ) {
        // 저장된 값이 신뢰 가능한 경우 그대로 사용
        spentPaid = spentPaidRaw;
        spentBonusRequest = spentBonusRequestRaw;
        spentBonusShipping = spentBonusShippingRaw;
      } else {
        // fallback: refType 기반 분리 계산
        // 의뢰(REQUEST) SPEND → bonusRequest 우선 차감
        // 배송(SHIPPING_PACKAGE/SHIPPING_FEE) SPEND → bonusShipping 우선 차감
        // 각 refund는 해당 타입의 순소비에서 차감
        const spentByRequest = Math.max(
          0,
          Number(item.spentByRequestSum || 0) - refundRequestSum,
        );
        // spentByShippingSum: 무료 의뢰 포함 패키지 배송비 (bonusShipping 차감 가능)
        // spentByShippingNoFreeSum: 무료 의뢰 없는 패키지 배송비 (paid에서만 차감)
        const spentByShipping = Math.max(
          0,
          Number(item.spentByShippingSum || 0) - refundShippingSum,
        );
        const spentByShippingNoFree = Math.max(
          0,
          Number(item.spentByShippingNoFreeSum || 0),
        );

        const bonusShippingUsed = Math.min(
          chargedBonusShipping,
          spentByShipping,
        );
        const paidFromShipping =
          spentByShipping - bonusShippingUsed + spentByShippingNoFree;

        const bonusRequestUsed = Math.min(chargedBonusRequest, spentByRequest);
        const paidFromRequest = spentByRequest - bonusRequestUsed;

        spentBonusShipping = bonusShippingUsed;
        spentBonusRequest = bonusRequestUsed;
        spentPaid = paidFromRequest + paidFromShipping;
      }

      // 최종 잔액 계산
      // - paidCredit: 유료 크레딧 잔액 (의뢰 + 배송비 모두 사용 가능)
      // - bonusRequestCredit: 무료 의뢰 크레딧 잔액 (의뢰만 사용 가능)
      // - bonusShippingCredit: 무료 배송비 크레딧 잔액 (배송비만 사용 가능)
      const paidCredit = Math.round(chargedPaid + adjustSum - spentPaid);
      const bonusRequestCredit = Math.round(
        chargedBonusRequest - spentBonusRequest,
      );
      const bonusShippingCredit = Math.round(
        chargedBonusShipping - spentBonusShipping,
      );

      balanceMap[String(item._id)] = {
        balance: Math.max(
          0,
          paidCredit + bonusRequestCredit + bonusShippingCredit,
        ),
        paidCredit: Math.max(0, paidCredit),
        bonusRequestCredit: Math.max(0, bonusRequestCredit),
        bonusShippingCredit: Math.max(0, bonusShippingCredit),
        spentAmount: Math.max(0, Math.round(spentTotal)),
        chargedPaidAmount: Math.max(0, Math.round(chargedPaid)),
        chargedBonusRequestAmount: Math.max(0, Math.round(chargedBonusRequest)),
        chargedBonusShippingAmount: Math.max(
          0,
          Math.round(chargedBonusShipping),
        ),
        spentPaidAmount: Math.max(
          0,
          Math.min(
            Math.round(spentPaid),
            Math.max(0, Math.round(chargedPaid + adjustSum)),
          ),
        ),
        spentBonusRequestAmount: Math.max(0, Math.round(spentBonusRequest)),
        spentBonusShippingAmount: Math.max(0, Math.round(spentBonusShipping)),
      };
    });

    const result = orgs.map((org) => {
      const anchorId = String(org?._id || "");
      const balanceInfo = balanceMap[anchorId] || {
        balance: 0,
        paidCredit: 0,
        bonusRequestCredit: 0,
        bonusShippingCredit: 0,
        spentAmount: 0,
        chargedPaidAmount: 0,
        chargedBonusRequestAmount: 0,
        chargedBonusShippingAmount: 0,
        spentPaidAmount: 0,
        spentBonusRequestAmount: 0,
        spentBonusShippingAmount: 0,
      };

      const ownerInfo =
        ownerById.get(String(org?.primaryContactUserId || "")) || null;

      return {
        _id: org._id,
        businessAnchorId: anchorId,
        businessType: String(org.businessType || "").trim(),
        name: org.name,
        ownerName: ownerInfo?.name || "",
        ownerEmail: ownerInfo?.email || "",
        companyName: org.metadata?.companyName || "",
        businessNumber: org.metadata?.businessNumber || "",
        // 프론트엔드 호환: paidBalance, bonusBalance 필드 제공
        paidBalance: balanceInfo.paidCredit, // 유료 잔액
        bonusBalance:
          balanceInfo.bonusRequestCredit + balanceInfo.bonusShippingCredit, // 무료 잔액 (의뢰용 + 배송비용)
        // 상세 정보: bonusRequestCredit, bonusShippingCredit 등 모든 필드 포함
        ...balanceInfo,
      };
    });

    const sortedResult = [...result].sort(
      (a, b) =>
        Number(b.paidCredit || 0) - Number(a.paidCredit || 0) ||
        Number(b.bonusRequestCredit || 0) - Number(a.bonusRequestCredit || 0) ||
        String(a.name || "").localeCompare(String(b.name || ""), "ko"),
    );

    return res.json({
      success: true,
      data: {
        items: sortedResult,
        total,
        skip,
        limit,
      },
    });
  } catch (error) {
    console.error("adminGetBusinessCredits error:", error);
    return res.status(500).json({
      success: false,
      message: "사업자별 크레딧 조회에 실패했습니다.",
    });
  }
}

export async function adminGetBusinessCreditDetail(req, res) {
  try {
    const orgId = req.params.id;
    const org = await BusinessAnchor.findById(orgId)
      .select({ name: 1, metadata: 1 })
      .lean();

    if (!org) {
      return res.status(404).json({
        success: false,
        message: "해당 사업자를 찾을 수 없습니다.",
      });
    }

    const businessAnchorId = org?.businessAnchorId;
    if (!businessAnchorId) {
      return res.status(400).json({
        success: false,
        message: "해당 사업자에 businessAnchorId가 없습니다.",
      });
    }

    const ledgers = await CreditLedger.find({ businessAnchorId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    let paid = 0;
    let bonusRequest = 0;
    let bonusShipping = 0;
    let spent = 0;
    const history = [];

    for (const ledger of ledgers.reverse()) {
      const type = ledger.type;
      const amount = Number(ledger.amount || 0);
      if (!Number.isFinite(amount)) continue;
      const absAmount = Math.abs(amount);

      if (type === "CHARGE" || type === "REFUND") {
        paid += absAmount;
      } else if (type === "BONUS") {
        if (String(ledger.refType || "") === "FREE_SHIPPING_CREDIT") {
          bonusShipping += absAmount;
        } else {
          bonusRequest += absAmount;
        }
      } else if (type === "ADJUST") {
        paid += amount;
      } else if (type === "SPEND") {
        let spend = absAmount;
        spent += spend;
        if (
          String(ledger.refType || "") === "SHIPPING_PACKAGE" ||
          String(ledger.refType || "") === "SHIPPING_FEE"
        ) {
          const canUseFreeShipping = ledger?.hasFreeRequest !== false;
          if (canUseFreeShipping) {
            const fromBonusShipping = Math.min(bonusShipping, spend);
            bonusShipping -= fromBonusShipping;
            spend -= fromBonusShipping;
          }
        } else {
          const fromBonusRequest = Math.min(bonusRequest, spend);
          bonusRequest -= fromBonusRequest;
          spend -= fromBonusRequest;
        }
        paid -= spend;
      }

      history.push({
        ...ledger,
        balanceAfter: Math.max(0, paid + bonusRequest + bonusShipping),
        paidCreditAfter: Math.max(0, paid),
        bonusRequestCreditAfter: Math.max(0, bonusRequest),
        bonusShippingCreditAfter: Math.max(0, bonusShipping),
      });
    }

    return res.json({
      success: true,
      data: {
        business: org,
        balance: Math.max(0, paid + bonusRequest + bonusShipping),
        paidCredit: Math.max(0, paid),
        bonusRequestCredit: Math.max(0, bonusRequest),
        bonusShippingCredit: Math.max(0, bonusShipping),
        spentAmount: Math.max(0, spent),
        history: history.reverse(),
      },
    });
  } catch (error) {
    console.error("adminGetBusinessCreditDetail error:", error);
    return res.status(500).json({
      success: false,
      message: "사업자 크레딧 상세 조회에 실패했습니다.",
    });
  }
}

export async function adminGetAdminCredits(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = Math.max(Number(req.query.skip) || 0, 0);

    // 관리자 사용자 목록 조회
    const total = await User.countDocuments({ role: "admin" });

    const admins = await User.find({ role: "admin" })
      .select({
        _id: 1,
        name: 1,
        email: 1,
        active: 1,
        createdAt: 1,
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const adminIds = admins.map((admin) => admin._id);

    // 관리자별 레저 집계
    const ledgerAggregations = await Promise.all(
      adminIds.map((adminId) =>
        AdminCreditLedger.aggregate([
          { $match: { adminUserId: adminId } },
          {
            $group: {
              _id: "$type",
              total: { $sum: "$amount" },
            },
          },
        ]),
      ),
    );

    // 결과 조합
    const results = admins.map((admin, index) => {
      const ledgerRows = ledgerAggregations[index] || [];
      let earnedAmount = 0;
      let paidOutAmount = 0;
      let adjustedAmount = 0;

      for (const row of ledgerRows) {
        const type = String(row._id || "");
        const total = Number(row.total || 0);
        if (type === "EARN") earnedAmount += total;
        else if (type === "PAYOUT") paidOutAmount += total;
        else if (type === "ADJUST") adjustedAmount += total;
      }

      const balanceAmount = earnedAmount - paidOutAmount + adjustedAmount;

      return {
        adminUserId: admin._id,
        name: admin.name,
        email: admin.email,
        active: admin.active,
        createdAt: admin.createdAt,
        wallet: {
          earnedAmount,
          paidOutAmount,
          adjustedAmount,
          balanceAmount,
        },
      };
    });

    return res.json({
      success: true,
      data: {
        items: results,
        total,
        skip,
        limit,
      },
    });
  } catch (error) {
    console.error("adminGetAdminCredits error:", error);
    return res.status(500).json({
      success: false,
      message: "관리자 크레딧 조회에 실패했습니다.",
    });
  }
}

export async function adminGetAdminLedger(req, res) {
  try {
    const adminIdRaw = String(req.params.id || "");
    if (!Types.ObjectId.isValid(adminIdRaw)) {
      return res.status(400).json({
        success: false,
        message: "관리자 ID가 올바르지 않습니다.",
      });
    }
    const adminUserId = new Types.ObjectId(adminIdRaw);

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

    const match = { adminUserId };

    if (
      typeRaw &&
      typeRaw !== "ALL" &&
      ["EARN", "PAYOUT", "ADJUST"].includes(typeRaw)
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
      if (Types.ObjectId.isValid(qRaw)) {
        ors.push({ refId: new Types.ObjectId(qRaw) });
      }
      if (ors.length) {
        match.$or = ors;
      }
    }

    // running balance를 위해 전체 누적 잔액 계산 (필터 무관)
    const allLedgerRows = await AdminCreditLedger.aggregate([
      { $match: { adminUserId } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]);
    let totalBalance = 0;
    for (const r of allLedgerRows) {
      const t = String(r._id || "");
      const v = Number(r.total || 0);
      if (t === "EARN" || t === "ADJUST") totalBalance += v;
      else if (t === "PAYOUT") totalBalance -= v;
    }

    // 현재 페이지 이후(더 오래된) 항목들의 합산 잔액 계산
    const skippedRows =
      (page - 1) * pageSize > 0
        ? await AdminCreditLedger.find(match)
            .sort({ occurredAt: -1, _id: -1 })
            .limit((page - 1) * pageSize)
            .select({ type: 1, amount: 1 })
            .lean()
        : [];
    let skippedSum = 0;
    for (const r of skippedRows) {
      const t = String(r.type || "");
      const v = Number(r.amount || 0);
      if (t === "EARN" || t === "ADJUST") skippedSum += v;
      else if (t === "PAYOUT") skippedSum -= v;
    }

    const [total, rawItems] = await Promise.all([
      AdminCreditLedger.countDocuments(match),
      AdminCreditLedger.find(match)
        .sort({ occurredAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .select({
          type: 1,
          amount: 1,
          amountExcludingVat: 1,
          vatAmount: 1,
          amountIncludingVat: 1,
          refType: 1,
          refId: 1,
          uniqueKey: 1,
          occurredAt: 1,
          createdAt: 1,
        })
        .lean(),
    ]);

    // running balance: 각 행 이후의 잔액 (최신→과거 순)
    let runningBalance = totalBalance - skippedSum;
    const items = (Array.isArray(rawItems) ? rawItems : []).map((r) => {
      const v = Number(r.amount || 0);
      const t = String(r.type || "");
      const balanceAfter = runningBalance;
      if (t === "EARN" || t === "ADJUST") runningBalance -= v;
      else if (t === "PAYOUT") runningBalance += v;
      return { ...r, balanceAfter };
    });

    return res.json({
      success: true,
      data: { items, total, page, pageSize },
    });
  } catch (error) {
    console.error("adminGetAdminLedger error:", error);
    return res.status(500).json({
      success: false,
      message: "관리자 원장 조회에 실패했습니다.",
    });
  }
}
