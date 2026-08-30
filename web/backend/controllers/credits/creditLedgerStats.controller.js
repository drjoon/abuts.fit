// change-log:
// - 2026-08-31: 요약 — 유료/무료 충전 분리. 기공소 정산 적립(보류 포함) 유지.
// - 2026-08-31: 기공소 통계 — PTX lab-share 적립 보류를 정산 적립·파트너·보철유형에 포함.
// - 2026-08-26: 보철유형 — 견적 라인 공급가 그대로(장부 비례배분 제거·의뢰당 1회).
// - 2026-08-26: 소비 집계에 HOLD(에스크로 REQ_* 차감) 포함.
// - 2026-08-23: 보철유형 집계에 커스텀어벗 포함(견적 라인 정규화·toothWorks 플래그·어벗생산).
// - 2026-08-23: STORE_SALE을 소비·스토어 카테고리에 포함.
// - 2026-08-22: 보철유형 집계 — 견적 라인 공급가 기준·정수 원 반올림(소수 분배 제거).
// - 2026-08-22: 의뢰자 정산 페이지 통계 탭 — 기간·유형·파트너·보철유형 집계 API.
// related files:
// - web/backend/modules/credits/credit.routes.js
// - web/backend/controllers/credits/creditLedger.controller.js
// - web/backend/controllers/credits/creditLedger.utils.js
// - web/frontend/src/pages/requestor/credits/components/CreditStatisticsTab.tsx
import mongoose from "mongoose";
import LedgerLine from "../../models/ledgerLine.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import Request from "../../models/request.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { normalizeRequestorKind } from "../../utils/requestorCapabilities.js";
import { buildFeeQuotesForTransferDocs } from "../../services/practiceTransferBilling.service.js";
import { parseKstQueryBoundDate } from "../../utils/kstQueryBounds.js";
import { listPendingLabSettlementLedgerRows } from "./creditLedger.utils.js";
import {
  isCustomAbutmentLabFeeLineType,
  isCustomAbutmentWork,
  isRemovableTempFeeName,
} from "../../utils/labFeeSchedule.js";

const REQUESTOR_CREDIT_ACCOUNT_CODES = [
  "REQ_PAID_CREDIT",
  "REQ_FREE_REQUEST_CREDIT",
  "REQ_FREE_SHIPPING_CREDIT",
  "LAB_SETTLEMENT_CREDIT",
];

const SPEND_EVENT_TYPES = new Set([
  "REQUEST_SPEND_COMMIT",
  "REQUEST_SPEND_HOLD",
  "SHIPPING_SPEND_COMMIT",
  "SHIPPING_SPEND_HOLD",
  "PRACTICE_TRANSFER_SPEND_COMMIT",
  "PRACTICE_TRANSFER_SPEND_HOLD",
  "PRACTICE_TRANSFER_HOLD_ADJUST",
  "PRACTICE_MEMBERSHIP_SPEND",
  "STORE_SALE",
]);

const CHARGE_EVENT_TYPES = new Set([
  "CHARGE_PAID",
  "CHARGE_FREE_REQUEST",
  "CHARGE_FREE_SHIPPING",
]);

const CATEGORY_LABELS = {
  charge: "충전",
  practice_transfer: "기공의뢰",
  abutment_production: "어벗생산",
  shipping: "배송",
  store: "스토어",
  settlement_earn: "정산 적립",
  settlement_payout: "정산 지급",
  adjust: "조정",
  other: "기타",
};

function parseStatsPeriod(query = {}) {
  const periodRaw = String(query.period || "30d").trim();
  const fromRaw = String(query.from || "").trim();
  const toRaw = String(query.to || "").trim();

  const now = new Date();
  const kstDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const todayKst = new Date(`${kstDate}T23:59:59.999+09:00`);
  const todayStartKst = new Date(`${kstDate}T00:00:00+09:00`);

  let from = null;
  let to = todayKst;

  if (fromRaw) {
    const parsed = parseKstQueryBoundDate(fromRaw, "start");
    if (parsed) from = parsed;
  }
  if (toRaw) {
    const parsed = parseKstQueryBoundDate(toRaw, "end");
    if (parsed) to = parsed;
  }

  if (!from) {
    const start = new Date(todayStartKst);
    if (periodRaw === "7d") start.setDate(start.getDate() - 7);
    else if (periodRaw === "90d") start.setDate(start.getDate() - 90);
    else if (periodRaw === "thisMonth") {
      const [y, m] = kstDate.split("-").map(Number);
      start.setTime(new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00+09:00`).getTime());
    } else {
      start.setDate(start.getDate() - 30);
    }
    from = start;
  }

  const fromYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(from);
  const toYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(to);

  return { from, to, fromYmd, toYmd, period: periodRaw || "30d" };
}

function resolveStatsCategory(eventType, refType, accountCode, amount) {
  const et = String(eventType || "").trim();
  const rt = String(refType || "").trim().toUpperCase();
  const ac = String(accountCode || "").trim();
  const amt = Number(amount || 0);

  if (CHARGE_EVENT_TYPES.has(et)) return "charge";
  if (et === "ADJUST") return "adjust";
  if (et === "SETTLEMENT_PAYOUT") return "settlement_payout";
  if (
    et === "LAB_SETTLEMENT_CHARGE" ||
    (et === "PRACTICE_TRANSFER_SPEND_COMMIT" &&
      ac === "LAB_SETTLEMENT_CREDIT" &&
      amt > 0)
  ) {
    return "settlement_earn";
  }
  if (et.includes("PRACTICE_TRANSFER") || rt === "PRACTICE_TRANSFER") {
    return "practice_transfer";
  }
  if (et === "STORE_SALE" || rt === "STORE_ORDER") return "store";
  if (et.includes("SHIPPING") || rt === "SHIPPING_PACKAGE") return "shipping";
  if (et.includes("REQUEST") || rt === "REQUEST") return "abutment_production";
  if (SPEND_EVENT_TYPES.has(et)) return "other";
  return "other";
}

function roundSupplyAmount(value) {
  return Math.max(0, Math.round(Number(value || 0)));
}

function absSpendSupply(amountBase) {
  const n = Number(amountBase || 0);
  return n < 0 ? roundSupplyAmount(Math.abs(n)) : 0;
}

function absChargeSupply(amountBase, eventType) {
  const n = Number(amountBase || 0);
  if (!CHARGE_EVENT_TYPES.has(String(eventType || ""))) return 0;
  return n > 0 ? roundSupplyAmount(n) : 0;
}

function bumpMap(map, key, { amount = 0, count = 0 } = {}) {
  const k = String(key || "").trim() || "미분류";
  const prev = map.get(k) || { key: k, label: k, amountSupply: 0, count: 0 };
  prev.amountSupply = roundSupplyAmount(prev.amountSupply + Number(amount || 0));
  prev.count += Number(count || 0);
  map.set(k, prev);
}

const CUSTOM_ABUTMENT_STATS_LABEL = "커스텀어벗";

function normalizeProsthesisStatsLabel(rawType) {
  const type = String(rawType || "").trim();
  if (!type) return "미분류";
  if (isCustomAbutmentLabFeeLineType(type)) return CUSTOM_ABUTMENT_STATS_LABEL;
  const compact = type.replace(/\s+/g, "");
  if (
    isRemovableTempFeeName(type) ||
    compact.startsWith("임시치아") ||
    /가철성\s*임시/i.test(type)
  ) {
    return "임시치아";
  }
  return type;
}

function collectProsthesisTypesFromToothWorks(toothWorks) {
  const out = [];
  for (const row of Array.isArray(toothWorks) ? toothWorks : []) {
    const type = String(row?.prosthesisType || row?.type || "").trim();
    if (type) out.push(normalizeProsthesisStatsLabel(type));
    // 크라운·브리지·임시치아 + 커스텀어벗 플래그는 보철과 별도 집계
    if (isCustomAbutmentWork(row) && type && !isCustomAbutmentLabFeeLineType(type)) {
      out.push(CUSTOM_ABUTMENT_STATS_LABEL);
    }
  }
  return out;
}

function mapToSortedRows(map, { limit = 12 } = {}) {
  return Array.from(map.values())
    .map((row) => ({
      ...row,
      amountSupply: roundSupplyAmount(row.amountSupply),
    }))
    .sort((a, b) => b.amountSupply - a.amountSupply || b.count - a.count)
    .slice(0, limit);
}

function lineRetailAmount(line) {
  return roundSupplyAmount(
    Number(line?.labFee || 0) +
      Number(line?.labAbutmentFee || 0) +
      Number(line?.abutmentRetail || 0),
  );
}

function buildProsthesisAllocations({ quote, toothWorks, fallbackAmount }) {
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  if (lines.length) {
    const byType = new Map();
    for (const line of lines) {
      const type = normalizeProsthesisStatsLabel(line?.prosthesisType);
      const amt = lineRetailAmount(line);
      if (amt <= 0) continue;
      bumpMap(byType, type, { amount: amt, count: 1 });
    }
    const entries = [...byType.entries()];
    // 견적 라인 공급가 그대로(장부 소비액 비례배분 금지 → 천원 단위 유지)
    if (entries.length) return entries;
  }

  const types = [
    ...new Set(collectProsthesisTypesFromToothWorks(toothWorks).filter(Boolean)),
  ];
  if (!types.length) return [];

  const target = roundSupplyAmount(fallbackAmount);
  if (types.length === 1) {
    return [
      [
        types[0],
        {
          key: types[0],
          label: types[0],
          amountSupply: target,
          count: 1,
        },
      ],
    ];
  }

  const base = Math.floor(target / types.length);
  let remainder = target - base * types.length;
  return types.map((type) => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    return [
      type,
      {
        key: type,
        label: type,
        amountSupply: base + extra,
        count: 1,
      },
    ];
  });
}

export async function getMyCreditLedgerStats(req, res) {
  const businessAnchorId = req.user?.businessAnchorId;
  if (!businessAnchorId) {
    return res.status(403).json({
      success: false,
      message: "사업자 정보가 설정되지 않았습니다.",
    });
  }

  const anchorObjectId = new mongoose.Types.ObjectId(String(businessAnchorId));
  const { from, to, fromYmd, toYmd, period } = parseStatsPeriod(req.query);

  const anchor = await BusinessAnchor.findById(anchorObjectId)
    .select({ requestorKind: 1, name: 1, companyName: 1 })
    .lean();
  const requestorKind =
    normalizeRequestorKind(anchor?.requestorKind) ||
    normalizeRequestorKind(req.user?.requestorKind) ||
    "practice";
  const isLab = requestorKind === "lab";

  const journalRows = await LedgerLine.aggregate([
    {
      $match: {
        ownerRole: "requestor",
        ownerId: anchorObjectId,
        accountCode: { $in: REQUESTOR_CREDIT_ACCOUNT_CODES },
        occurredAt: { $gte: from, $lte: to },
      },
    },
    {
      $lookup: {
        from: LedgerJournal.collection.name,
        localField: "journalId",
        foreignField: "journalId",
        as: "journalDoc",
      },
    },
    { $unwind: { path: "$journalDoc", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        amountBase: { $ifNull: ["$amountExcludingVat", "$amount"] },
        eventType: { $ifNull: ["$journalDoc.eventType", ""] },
        refType: {
          $ifNull: ["$refType", { $ifNull: ["$journalDoc.refType", ""] }],
        },
        refId: { $ifNull: ["$refId", { $ifNull: ["$journalDoc.refId", null] }] },
        ymd: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$occurredAt",
            timezone: "Asia/Seoul",
          },
        },
      },
    },
    {
      $group: {
        _id: "$journalId",
        ymd: { $first: "$ymd" },
        occurredAt: { $max: "$occurredAt" },
        eventType: { $first: "$eventType" },
        refType: { $first: "$refType" },
        refId: { $first: "$refId" },
        accountCode: { $first: "$accountCode" },
        amount: { $sum: "$amountBase" },
      },
    },
    { $sort: { occurredAt: 1 } },
  ]);

  const ptxIds = new Set();
  const requestIds = new Set();
  for (const row of journalRows) {
    const rt = String(row?.refType || "").trim().toUpperCase();
    const refId = row?.refId ? String(row.refId) : "";
    if (rt === "PRACTICE_TRANSFER" && mongoose.Types.ObjectId.isValid(refId)) {
      ptxIds.add(refId);
    }
    if (rt === "REQUEST" && mongoose.Types.ObjectId.isValid(refId)) {
      requestIds.add(refId);
    }
  }

  const pendingLabRows = isLab
    ? await listPendingLabSettlementLedgerRows({
        labAnchorId: anchorObjectId,
        occurredAt: { $gte: from, $lte: to },
        limit: 500,
      })
    : [];
  for (const row of pendingLabRows) {
    const refId = row?.refId ? String(row.refId) : "";
    if (refId && mongoose.Types.ObjectId.isValid(refId)) ptxIds.add(refId);
  }

  const [ptxDocs, requestDocs] = await Promise.all([
    ptxIds.size
      ? PracticeTransfer.find({ _id: { $in: [...ptxIds] } })
          .select({
            transferId: 1,
            targetLabName: 1,
            assigneeLabName: 1,
            practiceBusinessAnchorId: 1,
            targetLabAnchorId: 1,
            toothWorks: 1,
            billing: 1,
            matchingMode: 1,
            createdAt: 1,
            remake: 1,
            "production.rushProcessing": 1,
            status: 1,
            autoMatch: 1,
          })
          .lean()
      : Promise.resolve([]),
    requestIds.size
      ? Request.find({ _id: { $in: [...requestIds] } })
          .select({
            requestId: 1,
            prosthesisType: 1,
            toothWorks: 1,
            "caseInfos.clinicName": 1,
          })
          .lean()
      : Promise.resolve([]),
  ]);

  const practiceAnchorIds = [
    ...new Set(
      (ptxDocs || [])
        .map((d) => String(d?.practiceBusinessAnchorId || ""))
        .filter(Boolean),
    ),
  ];
  const practiceAnchors = practiceAnchorIds.length
    ? await BusinessAnchor.find({
        _id: {
          $in: practiceAnchorIds.map((id) => new mongoose.Types.ObjectId(id)),
        },
      })
        .select({ name: 1, companyName: 1 })
        .lean()
    : [];

  const ptxById = new Map();
  for (const doc of ptxDocs || []) {
    if (doc?._id) ptxById.set(String(doc._id), doc);
  }
  const requestById = new Map();
  for (const doc of requestDocs || []) {
    if (doc?._id) requestById.set(String(doc._id), doc);
  }
  const practiceNameByAnchorId = new Map();
  for (const doc of practiceAnchors || []) {
    if (!doc?._id) continue;
    practiceNameByAnchorId.set(
      String(doc._id),
      String(doc.companyName || doc.name || "").trim() || "치과",
    );
  }

  const quotesByPtxId =
    (ptxDocs || []).length > 0
      ? await buildFeeQuotesForTransferDocs({
          docs: ptxDocs,
          viewingLabAnchorId: isLab ? String(anchorObjectId) : null,
        })
      : new Map();

  const byPeriodMap = new Map();
  const byCategoryMap = new Map();
  const byPartnerMap = new Map();
  const byProsthesisMap = new Map();
  // 기공의뢰별 소비(폴백용) + 어벗생산 소비 — 보철유형은 의뢰당 1회만 집계
  const ptxSpendForProsthesis = new Map();
  const requestSpendForProsthesis = new Map();

  let totalChargeSupply = 0;
  let totalPaidChargeSupply = 0;
  let totalFreeChargeSupply = 0;
  let totalSpendSupply = 0;
  let totalSettlementEarnSupply = 0;
  let totalSettlementPayoutSupply = 0;
  let transactionCount = 0;
  let orderCount = 0;

  for (const row of journalRows) {
    const eventType = String(row?.eventType || "");
    const refType = String(row?.refType || "");
    const accountCode = String(row?.accountCode || "");
    const amount = Number(row?.amount || 0);
    const ymd = String(row?.ymd || "");
    const category = resolveStatsCategory(
      eventType,
      refType,
      accountCode,
      amount,
    );

    const chargeSupply = absChargeSupply(amount, eventType);
    const paidChargeSupply =
      eventType === "CHARGE_PAID" && amount > 0
        ? roundSupplyAmount(amount)
        : 0;
    const freeChargeSupply =
      (eventType === "CHARGE_FREE_REQUEST" ||
        eventType === "CHARGE_FREE_SHIPPING") &&
      amount > 0
        ? roundSupplyAmount(amount)
        : 0;
    const spendSupply =
      SPEND_EVENT_TYPES.has(eventType) && amount < 0 ? Math.abs(amount) : 0;
    const settlementEarnSupply =
      category === "settlement_earn" && amount > 0 ? amount : 0;
    const settlementPayoutSupply =
      category === "settlement_payout" && amount < 0 ? Math.abs(amount) : 0;

    totalChargeSupply += chargeSupply;
    totalPaidChargeSupply += paidChargeSupply;
    totalFreeChargeSupply += freeChargeSupply;
    totalSpendSupply += spendSupply;
    totalSettlementEarnSupply += settlementEarnSupply;
    totalSettlementPayoutSupply += settlementPayoutSupply;
    transactionCount += 1;

    const isOrder =
      category === "practice_transfer" ||
      category === "abutment_production" ||
      category === "shipping";
    if (isOrder) orderCount += 1;

    const periodPrev = byPeriodMap.get(ymd) || {
      ymd,
      chargeSupply: 0,
      spendSupply: 0,
      settlementEarnSupply: 0,
      count: 0,
    };
    periodPrev.chargeSupply += chargeSupply;
    periodPrev.spendSupply += spendSupply;
    periodPrev.settlementEarnSupply += settlementEarnSupply;
    periodPrev.count += 1;
    byPeriodMap.set(ymd, periodPrev);

    const catKey = category;
    bumpMap(byCategoryMap, catKey, {
      amount:
        chargeSupply ||
        spendSupply ||
        settlementEarnSupply ||
        settlementPayoutSupply ||
        Math.abs(amount),
      count: 1,
    });
    const catRow = byCategoryMap.get(catKey);
    if (catRow) catRow.label = CATEGORY_LABELS[catKey] || catKey;

    const refId = row?.refId ? String(row.refId) : "";
    const rt = refType.trim().toUpperCase();
    let partnerLabel = "";

    if (rt === "PRACTICE_TRANSFER" && ptxById.has(refId)) {
      const ptx = ptxById.get(refId);
      if (isLab) {
        const practiceAnchorId = String(ptx?.practiceBusinessAnchorId || "");
        partnerLabel =
          practiceNameByAnchorId.get(practiceAnchorId) || "치과";
      } else {
        partnerLabel =
          String(ptx?.assigneeLabName || ptx?.targetLabName || "").trim() ||
          "기공소";
      }
    } else if (rt === "REQUEST" && requestById.has(refId)) {
      const req = requestById.get(refId);
      partnerLabel =
        String(req?.caseInfos?.clinicName || "").trim() || (isLab ? "치과" : "");
    }

    const rowAmount = roundSupplyAmount(
      spendSupply ||
        settlementEarnSupply ||
        chargeSupply ||
        settlementPayoutSupply ||
        Math.abs(amount),
    );

    if (partnerLabel) {
      bumpMap(byPartnerMap, partnerLabel, { amount: rowAmount, count: 1 });
    }

    const prosthesisAmount = roundSupplyAmount(spendSupply || settlementEarnSupply);
    if (prosthesisAmount <= 0) continue;

    if (rt === "PRACTICE_TRANSFER" && ptxById.has(refId)) {
      ptxSpendForProsthesis.set(
        refId,
        roundSupplyAmount(
          (ptxSpendForProsthesis.get(refId) || 0) + prosthesisAmount,
        ),
      );
    } else if (rt === "REQUEST" && requestById.has(refId)) {
      requestSpendForProsthesis.set(
        refId,
        roundSupplyAmount(
          (requestSpendForProsthesis.get(refId) || 0) + prosthesisAmount,
        ),
      );
    }
  }

  // 기공소: 작업완료 전 lab-share HOLD → 정산 적립(보류)으로 통계에 포함.
  for (const row of pendingLabRows) {
    const amount = roundSupplyAmount(row?.amount || 0);
    if (amount <= 0) continue;
    const refId = row?.refId ? String(row.refId) : "";
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(row?.occurredAt || Date.now()));

    totalSettlementEarnSupply += amount;
    transactionCount += 1;
    orderCount += 1;

    const periodPrev = byPeriodMap.get(ymd) || {
      ymd,
      chargeSupply: 0,
      spendSupply: 0,
      settlementEarnSupply: 0,
      count: 0,
    };
    periodPrev.settlementEarnSupply += amount;
    periodPrev.count += 1;
    byPeriodMap.set(ymd, periodPrev);

    bumpMap(byCategoryMap, "settlement_earn", { amount, count: 1 });
    const catRow = byCategoryMap.get("settlement_earn");
    if (catRow) catRow.label = CATEGORY_LABELS.settlement_earn || "정산 적립";

    if (refId && ptxById.has(refId)) {
      const ptx = ptxById.get(refId);
      const practiceAnchorId = String(ptx?.practiceBusinessAnchorId || "");
      const partnerLabel =
        practiceNameByAnchorId.get(practiceAnchorId) || "치과";
      bumpMap(byPartnerMap, partnerLabel, { amount, count: 1 });
      ptxSpendForProsthesis.set(
        refId,
        roundSupplyAmount((ptxSpendForProsthesis.get(refId) || 0) + amount),
      );
    }
  }

  for (const [refId, fallbackAmount] of ptxSpendForProsthesis) {
    const allocations = buildProsthesisAllocations({
      quote: quotesByPtxId.get(refId) || null,
      toothWorks: ptxById.get(refId)?.toothWorks,
      fallbackAmount,
    });
    for (const [, allocRow] of allocations) {
      bumpMap(byProsthesisMap, allocRow.label, {
        amount: allocRow.amountSupply,
        count: allocRow.count,
      });
    }
  }

  for (const [refId, fallbackAmount] of requestSpendForProsthesis) {
    const allocations = buildProsthesisAllocations({
      quote: null,
      toothWorks: [{ prosthesisType: CUSTOM_ABUTMENT_STATS_LABEL }],
      fallbackAmount,
    });
    for (const [, allocRow] of allocations) {
      bumpMap(byProsthesisMap, allocRow.label, {
        amount: allocRow.amountSupply,
        count: allocRow.count,
      });
    }
  }

  return res.json({
    success: true,
    data: {
      requestorKind,
      period: { key: period, fromYmd, toYmd },
      summary: {
        totalChargeSupply: roundSupplyAmount(totalChargeSupply),
        totalPaidChargeSupply: roundSupplyAmount(totalPaidChargeSupply),
        totalFreeChargeSupply: roundSupplyAmount(totalFreeChargeSupply),
        totalSpendSupply: roundSupplyAmount(totalSpendSupply),
        totalSettlementEarnSupply: roundSupplyAmount(totalSettlementEarnSupply),
        totalSettlementPayoutSupply: roundSupplyAmount(totalSettlementPayoutSupply),
        transactionCount,
        orderCount,
      },
      byPeriod: Array.from(byPeriodMap.values()).sort((a, b) =>
        a.ymd.localeCompare(b.ymd),
      ),
      byCategory: mapToSortedRows(byCategoryMap),
      byPartner: mapToSortedRows(byPartnerMap),
      byProsthesisType: mapToSortedRows(byProsthesisMap),
    },
  });
}
