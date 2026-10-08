// related files:
// - web/backend/rules.md
// - web/backend/modules/salesman/salesman.routes.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/controllers/admin/adminCredit.controller.js
// - web/frontend/src/shared/components/CommissionLedgerInline.tsx
// - web/frontend/src/shared/components/SalesmanLedgerModal.tsx
// change-log:
// - 2026-10-09: 딜러 대시보드 수수료 = 거래처 판매가 − 1만원. 지급 완료는 장부 PAYOUT.
// - 2026-10-09: 거래처 판매가 목록에 연락처·구강스캔을 실어 거래처 카드에서 입력한다.
// - 2026-10-05: 딜러 대시보드 — 심플웨이(스토어) 수수료 지급 없음. 커스텀어벗만.
// - 2026-09-27: 딜러 대시보드 — 심플웨이(배송비 제외 10%)·커스텀어벗 수수료를 나눠 반환.
// - 2026-09-24: 딜러 대시보드 — 유치 시점 요율 고정(신규 activeRate · BA 스탬프). 월 매출 누진 철회.
// - 2026-09-24: 딜러 대시보드 — 딜러 BA당 월 매출 누진 수수료(commissionSlices).
import crypto from "node:crypto";
import Request from "../../models/request.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import { Types } from "mongoose";
import {
  buildOccurredAtFromPeriodQuery,
} from "../../utils/kstQueryBounds.js";
import { getPlatformSocialProof } from "../../services/platformGrowthStats.service.js";
import { listNoOrderAlerts } from "../../services/noOrderAlerts.service.js";
import {
  resolveDealershipCommissionPolicy,
} from "../../services/creditRevenuePolicy.service.js";
import {
  validateDealerUnitPrice,
  REQUESTOR_UNIT_PRICE_BASE,
  REQUESTOR_UNIT_PRICE_MIN,
  dealerCommissionMongoExpr,
} from "../../utils/requestorUnitPricePolicy.js";
import { invalidateRequestorUnitPriceCache } from "../../services/requestorUnitPrice.service.js";
import { loadCreditSettingsDefaults } from "../../utils/creditSettingsDefaults.js";
import {
  ensureSalesTeamPersonalAnchor,
  ensureSalesTeamReferralCode,
  resolveSalesTeamReferralAnchorId,
} from "../../utils/salesTeamReferral.util.js";

const SALESMAN_DASHBOARD_ROLES = new Set(["salesman", "devops", "salesTeam"]);

function parsePeriod(input) {
  const raw = String(input || "").trim();
  if (
    raw !== "7d" &&
    raw !== "30d" &&
    raw !== "90d" &&
    raw !== "thisMonth" &&
    raw !== "lastMonth" &&
    raw !== "all"
  ) {
    return null;
  }
  return raw;
}

function parseYearMonth(input) {
  const raw = String(input || "").trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split("-").map((v) => Number(v));
  if (!y || !m || m < 1 || m > 12) return null;
  return { year: y, month: m };
}

function getMonthRangeKst({ year, month }) {
  // KST 기준 월 범위
  const startYmd = `${year}-${String(month).padStart(2, "0")}-01`;
  const start = new Date(`${startYmd}T00:00:00+09:00`);

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endYmd = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  const end = new Date(`${endYmd}T00:00:00+09:00`);

  return { start, end };
}

function toKstYmd(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function getPeriodRangeKst(period) {
  const now = new Date();
  const nowKst = toKstYmd(now);
  const [year, month] = nowKst.split("-").map(Number);

  if (period === "thisMonth") {
    return getMonthRangeKst({ year, month });
  }

  if (period === "lastMonth") {
    const lastMonth = month === 1 ? 12 : month - 1;
    const lastYear = month === 1 ? year - 1 : year;
    return getMonthRangeKst({ year: lastYear, month: lastMonth });
  }

  if (period === "30d") {
    const todayKst = new Date(`${nowKst}T00:00:00+09:00`);
    todayKst.setDate(todayKst.getDate() - 30);
    return { start: todayKst, end: now };
  }

  if (period === "7d" || period === "90d") {
    const days = period === "7d" ? 7 : 90;
    const todayKst = new Date(`${nowKst}T00:00:00+09:00`);
    todayKst.setDate(todayKst.getDate() - days);
    return { start: todayKst, end: now };
  }

  return { start: new Date(0), end: now };
}

function roundMoney(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v);
}

function safeRegex(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return new RegExp(escaped, "i");
  } catch {
    return null;
  }
}

function parseLedgerPeriod(period) {
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

export async function getSalesmanLedger(req, res) {
  try {
    res.set("x-abuts-handler", "salesman.getSalesmanLedger");

    const me = req.user;
    if (!me || !SALESMAN_DASHBOARD_ROLES.has(String(me.role || ""))) {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    const ownerRole = me.role === "devops" ? "devops" : "salesman";
    let ownerAnchorIdRaw = String(me?.businessAnchorId || "").trim();
    if (me.role === "salesTeam") {
      const full = await User.findById(me._id);
      if (full) {
        await ensureSalesTeamPersonalAnchor(full);
        ownerAnchorIdRaw = String(
          (await resolveSalesTeamReferralAnchorId(full)) ||
            full.businessAnchorId ||
            "",
        ).trim();
      }
    }
    if (!ownerAnchorIdRaw || !Types.ObjectId.isValid(ownerAnchorIdRaw)) {
      return res.status(400).json({
        success: false,
        message: "사업자 정보가 없습니다.",
      });
    }
    const ownerAnchorId = new Types.ObjectId(ownerAnchorIdRaw);

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

    // SSOT 정책: 역할 정산 원장은 LedgerLine(ownerRole/ownerId) 기준으로 조회한다.
    // 레거시 분리 원장 조회/적재 경로는 제거되었다.
    const match = {
      ownerRole,
      ownerId: ownerAnchorId,
      accountCode: ownerRole === "devops" ? "REV_DEVOPS" : "REV_SALESMAN",
    };

    if (
      typeRaw &&
      typeRaw !== "ALL" &&
      !["EARN", "ADJUST", "PAYOUT"].includes(typeRaw)
    ) {
      return res.json({
        success: true,
        data: { items: [], total: 0, page, pageSize },
      });
    }

    const occurredAt = buildOccurredAtFromPeriodQuery(req.query, {
      parsePreset: parseLedgerPeriod,
    });

    if (Object.keys(occurredAt).length) match.occurredAt = occurredAt;

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: LedgerJournal.collection.name,
          localField: "journalId",
          foreignField: "journalId",
          as: "journalDoc",
        },
      },
      {
        $unwind: {
          path: "$journalDoc",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          uniqueKey: {
            $concat: [
              "gl:",
              { $ifNull: ["$journalDoc.meta.spendUniqueKey", "$journalId"] },
            ],
          },
          type: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$journalDoc.eventType", "SETTLEMENT_PAYOUT"] },
                  then: "PAYOUT",
                },
                {
                  case: { $eq: ["$journalDoc.eventType", "ADJUST"] },
                  then: "ADJUST",
                },
              ],
              default: "EARN",
            },
          },
          amountBase: {
            $ifNull: [
              "$amountIncludingVat",
              { $ifNull: ["$amount", { $ifNull: ["$amountExcludingVat", 0] }] },
            ],
          },
        },
      },
    ];

    if (typeRaw === "EARN" || typeRaw === "ADJUST" || typeRaw === "PAYOUT") {
      pipeline.push({ $match: { type: typeRaw } });
    }

    if (qRaw) {
      const rx = safeRegex(qRaw);
      if (rx) {
        pipeline.push({
          $match: {
            $or: [{ uniqueKey: rx }, { refType: rx }],
          },
        });
      }
    }

    pipeline.push(
      { $sort: { occurredAt: -1, _id: -1 } },
      {
        $project: {
          _id: 1,
          type: 1,
          amount: "$amountBase",
          amountExcludingVat: "$amountBase",
          vatAmount: { $literal: 0 },
          amountIncludingVat: "$amountBase",
          refType: 1,
          refId: 1,
          uniqueKey: 1,
          createdAt: "$occurredAt",
          occurredAt: "$occurredAt",
        },
      },
    );

    // running balance 계산: 전체 누적에서 페이지 이전 분량 차감
    const allRows = await LedgerLine.aggregate(pipeline);

    let totalBalance = 0;
    for (const r of allRows) {
      const t = String(r?.type || "");
      const v = Number(r?.amount || 0);
      if (t === "EARN" || t === "ADJUST") totalBalance += v;
      else if (t === "PAYOUT") totalBalance -= v;
    }

    const total = Array.isArray(allRows) ? allRows.length : 0;
    const startIdx = (page - 1) * pageSize;
    const endIdx = startIdx + pageSize;

    let skippedSum = 0;
    for (const r of allRows.slice(0, startIdx)) {
      const t = String(r?.type || "");
      const v = Number(r?.amount || 0);
      if (t === "EARN" || t === "ADJUST") skippedSum += v;
      else if (t === "PAYOUT") skippedSum -= v;
    }

    let runningBalance = totalBalance - skippedSum;
    const items = allRows.slice(startIdx, endIdx).map((r) => {
      const v = Number(r?.amount || 0);
      const t = String(r?.type || "");
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
    console.error("[salesman.getSalesmanLedger] error", error);
    return res.status(500).json({
      success: false,
      message: "정산 내역 조회에 실패했습니다.",
      error: error.message,
    });
  }
}

function createReferralCode3() {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const a = alphabet[crypto.randomInt(0, alphabet.length)];
  const b = alphabet[crypto.randomInt(0, alphabet.length)];
  const c = alphabet[crypto.randomInt(0, alphabet.length)];
  return `${a}${b}${c}`;
}

async function ensureUniqueReferralCode3() {
  for (let i = 0; i < 200; i += 1) {
    const code = createReferralCode3();
    const exists = await User.exists({ referralCode: code });
    if (!exists) return code;
  }
  throw new Error("리퍼럴 코드 생성에 실패했습니다.");
}

export async function getSalesmanDashboard(req, res) {
  try {
    res.set("x-abuts-handler", "salesman.getSalesmanDashboard");

    const me = req.user;
    if (!me || !SALESMAN_DASHBOARD_ROLES.has(String(me.role || ""))) {
      return res.status(403).json({
        success: false,
        message: "접근 권한이 없습니다.",
      });
    }

    let effectiveReferralCode = String(me.referralCode || "").trim();
    if (me.role === "salesTeam") {
      const full = await User.findById(me._id);
      if (full) {
        effectiveReferralCode = await ensureSalesTeamReferralCode(full);
        me.businessAnchorId =
          (await resolveSalesTeamReferralAnchorId(full)) ||
          full.businessAnchorId;
      }
    } else if (!/^[A-Z0-9]{3}$/.test(effectiveReferralCode)) {
      try {
        effectiveReferralCode = await ensureUniqueReferralCode3();
        await User.updateOne(
          { _id: me._id },
          { $set: { referralCode: effectiveReferralCode } },
        );
      } catch (e) {
        console.error(
          "[salesman.getSalesmanDashboard] referralCode refresh failed",
          e,
        );
      }
    }

    const period = parsePeriod(req.query?.period) || "30d";
    const ymInput = parseYearMonth(req.query?.ym);
    const now = new Date();
    let effectiveYm;
    if (ymInput) {
      effectiveYm = ymInput;
    } else {
      // KST 기준 년/월
      const kstDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
      }).format(now);
      const [year, month] = kstDate.split("-").map(Number);
      effectiveYm = { year, month };
    }

    const isDevops = me.role === "devops";
    const creditDefaults = await loadCreditSettingsDefaults();
    const dealershipPolicy = resolveDealershipCommissionPolicy(creditDefaults);
    // 딜러: 유치 시점 요율(스탬프). devops: BA devopsRate.
    let commissionRate = dealershipPolicy.activeRate;
    let unaffiliatedCommissionRate = 0;
    const dealershipActiveCommissionRate = dealershipPolicy.activeRate;
    const dealershipBaseCommissionRate = dealershipPolicy.baseRate;
    const dealershipEventCommissionRate = dealershipPolicy.activeRate;
    const dealershipEventCommissionEnabled = true;
    const dealershipRateChangeScheduledAt =
      dealershipPolicy.rateChangeScheduledAt;
    const dealershipRateChangeScheduledRate =
      dealershipPolicy.rateChangeScheduledRate;

    if (isDevops && me.businessAnchorId) {
      const devopsAnchor = await BusinessAnchor.findById(me.businessAnchorId)
        .select({ payoutRates: 1 })
        .lean();
      commissionRate = Number(devopsAnchor?.payoutRates?.devopsRate || 0.1);
      unaffiliatedCommissionRate = Number(
        devopsAnchor?.payoutRates?.devopsRate || 0.1,
      );
    }
    const payoutDayOfMonth = 1;

    const { start, end } = getPeriodRangeKst(period);

    const myBusinessAnchorId = me?.businessAnchorId;
    if (
      !myBusinessAnchorId ||
      !Types.ObjectId.isValid(String(myBusinessAnchorId))
    ) {
      console.error("[getSalesmanDashboard] businessAnchorId 없음", {
        userId: me?._id,
        role: me?.role,
        name: me?.name,
        email: me?.email,
        businessAnchorId: myBusinessAnchorId,
      });
      return res.status(400).json({
        success: false,
        message: "사업자 정보가 없습니다.",
      });
    }

    const myBusinessAnchorObjectId = new Types.ObjectId(
      String(myBusinessAnchorId),
    );

    const myOwnerRole = isDevops ? "devops" : "salesman";
    const myRevenueAccountCode = isDevops ? "REV_DEVOPS" : "REV_SALESMAN";

    const [freeBreakdownRow] = await LedgerLine.aggregate([
      {
        $match: {
          ownerRole: myOwnerRole,
          ownerId: myBusinessAnchorObjectId,
          accountCode: myRevenueAccountCode,
          occurredAt: { $gte: start, $lt: end },
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
      {
        $unwind: {
          path: "$journalDoc",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          eventType: { $ifNull: ["$journalDoc.eventType", ""] },
          baseAmount: {
            $ifNull: [
              "$amountIncludingVat",
              { $ifNull: ["$amount", { $ifNull: ["$amountExcludingVat", 0] }] },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          freeRequestAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$creditKind", "FREE_REQUEST"] },
                    { $eq: ["$eventType", "REQUEST_SPEND_COMMIT"] },
                  ],
                },
                "$baseAmount",
                0,
              ],
            },
          },
          freeShippingAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$creditKind", "FREE_SHIPPING"] },
                    { $eq: ["$eventType", "SHIPPING_SPEND_COMMIT"] },
                  ],
                },
                "$baseAmount",
                0,
              ],
            },
          },
          payoutAmount: {
            $sum: {
              $cond: [
                { $eq: ["$eventType", "SETTLEMENT_PAYOUT"] },
                { $abs: "$baseAmount" },
                0,
              ],
            },
          },
        },
      },
    ]);

    const freeNetRequestAmount = roundMoney(Number(freeBreakdownRow?.freeRequestAmount || 0));
    const freeNetShippingAmount = roundMoney(Number(freeBreakdownRow?.freeShippingAmount || 0));
    const freeNetAmount = roundMoney(freeNetRequestAmount + freeNetShippingAmount);
    const paidNetCommissionAmount = roundMoney(
      Number(freeBreakdownRow?.payoutAmount || 0),
    );

    const referredRequestors = await BusinessAnchor.find({
      referredByAnchorId: myBusinessAnchorObjectId,
      businessType: "requestor",
    })
      .select({
        _id: 1,
        createdAt: 1,
        requestorKind: 1,
        name: 1,
        referralAssignedAt: 1,
      })
      .lean();

    // 개발운영사: 소개 영업자가 없는 의뢰자(referredByAnchorId=null)도 수수료 대상
    // 영업자 소개가 없을 때 영업자 소개 수수료와 동일한 효과 (rules.md 2.4)
    const unaffiliatedRequestors = isDevops
      ? await BusinessAnchor.find({
          businessType: "requestor",
          $or: [
            { referredByAnchorId: null },
            { referredByAnchorId: { $exists: false } },
          ],
        })
          .select({
            _id: 1,
            createdAt: 1,
            requestorKind: 1,
            name: 1,
            referralAssignedAt: 1,
          })
          .lean()
      : [];

    const requestorMetaById = new Map();
    for (const row of [
      ...(referredRequestors || []),
      ...(unaffiliatedRequestors || []),
    ]) {
      const idStr = row?._id ? String(row._id) : "";
      if (!idStr) continue;
      requestorMetaById.set(idStr, {
        createdAt: row?.createdAt || null,
        referralAssignedAt: row?.referralAssignedAt || null,
        requestorKind:
          row?.requestorKind === "lab" || row?.requestorKind === "practice"
            ? row.requestorKind
            : null,
        name: String(row?.name || ""),
      });
    }

    const directOrgIdSet = new Set(
      (referredRequestors || [])
        .map((u) => (u?._id ? String(u._id) : ""))
        .filter(Boolean),
    );
    // 개발운영사 전용: 영업자 미설정 의뢰자 별도 추적 (동일 devopsRate 적용)
    const unaffiliatedOrgIdSet = new Set(
      (isDevops ? unaffiliatedRequestors : [])
        .map((u) => (u?._id ? String(u._id) : ""))
        .filter(Boolean),
    );
    const organizationAnchorIds = Array.from(
      new Set([...directOrgIdSet, ...unaffiliatedOrgIdSet]),
    );

    if (organizationAnchorIds.length === 0) {
      const totalCommissionAmount = 0;
      return res.status(200).json({
        success: true,
        data: {
          ym:
            period === "all"
              ? `${effectiveYm.year}-${String(effectiveYm.month).padStart(2, "0")}`
              : null,
          period: period || null,
          commissionRate,
          dealershipActiveCommissionRate,
          dealershipBaseCommissionRate,
          dealershipEventCommissionRate,
          dealershipEventCommissionEnabled,
          dealershipRateChangeScheduledAt,
          dealershipRateChangeScheduledRate,
          payoutDayOfMonth,
          referralCode: effectiveReferralCode,
          overview: {
            referredOrganizationCount: 0,
            monthRevenueAmount: 0,
            monthCommissionAmount: 0,
            directOrganizationCount: 0,
            totalOrganizationCount: 0,
            directCommissionAmount: 0,
            unaffiliatedCommissionAmount: 0,
            totalCommissionAmount: 0,
            payableGrossCommissionAmount: 0,
            paidNetCommissionAmount,
            freeNetRequestAmount,
            freeNetShippingAmount,
            freeNetAmount,
            eventOrganizationCount: 0,
            baseOrganizationCount: 0,
            eventCommissionAmount: 0,
            baseCommissionAmount: 0,
            eventRevenueAmount: 0,
            baseRevenueAmount: 0,
            eventOrderCount: 0,
            baseOrderCount: 0,
            practiceOrganizationCount: 0,
            labOrganizationCount: 0,
          },
          organizations: [],
        },
      });
    }

    const orgDocs = await BusinessAnchor.find({
      _id: { $in: organizationAnchorIds },
    })
      .select({
        _id: 1,
        name: 1,
        metadata: 1,
        verification: 1,
        createdAt: 1,
        requestorKind: 1,
      })
      .lean();

    const orgNameById = new Map(
      (orgDocs || []).map((o) => [String(o._id || ""), String(o.name || "")]),
    );
    for (const o of orgDocs || []) {
      const idStr = String(o?._id || "");
      if (!idStr) continue;
      const prev = requestorMetaById.get(idStr) || {};
      requestorMetaById.set(idStr, {
        createdAt: o?.createdAt || prev.createdAt || null,
        requestorKind:
          o?.requestorKind === "lab" || o?.requestorKind === "practice"
            ? o.requestorKind
            : prev.requestorKind || null,
        name: String(o?.name || prev.name || ""),
      });
    }

    const orgObjectIds = organizationAnchorIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const revenueRows = await Request.aggregate([
        {
          $match: {
            businessAnchorId: { $in: orgObjectIds },
            manufacturerStage: "추적관리",
            createdAt: { $gte: start, $lt: end },
          },
        },
        {
          $group: {
            _id: "$businessAnchorId",
            revenueAmount: {
              $sum: {
                $ifNull: ["$price.paidAmount", { $ifNull: ["$price.amount", 0] }],
              },
            },
            orderCount: { $sum: 1 },
            commissionAmount: { $sum: dealerCommissionMongoExpr() },
          },
        },
      ]);

    const revenueByOrgId = new Map(
      (revenueRows || []).map((r) => [
        String(r._id),
        Number(r.revenueAmount || 0),
      ]),
    );
    const ordersByOrgId = new Map(
      (revenueRows || []).map((r) => [
        String(r._id),
        Number(r.orderCount || 0),
      ]),
    );
    const commissionByOrgId = new Map(
      (revenueRows || []).map((r) => [
        String(r._id),
        Number(r.commissionAmount || 0),
      ]),
    );

    const organizations = organizationAnchorIds
      .map((id) => {
        const idStr = String(id);
        const revenueAmount = roundMoney(revenueByOrgId.get(idStr) || 0);
        const orderCount = ordersByOrgId.get(idStr) || 0;
        const meta = requestorMetaById.get(idStr) || {};

        const isDirect = directOrgIdSet.has(idStr);
        const isUnaffiliated = unaffiliatedOrgIdSet.has(idStr);
        let commissionRateForOrg = commissionRate;
        let commissionTier = String(Math.round(commissionRate * 100));
        let commissionAmount;
        if (isUnaffiliated) {
          commissionRateForOrg = unaffiliatedCommissionRate;
          commissionTier = String(Math.round(commissionRateForOrg * 100));
          commissionAmount = roundMoney(revenueAmount * commissionRateForOrg);
        } else if (isDevops) {
          commissionAmount = roundMoney(revenueAmount * commissionRateForOrg);
        } else {
          // 딜러: 거래처 판매가 − 1만원. 유치 요율은 쓰지 않는다.
          commissionRateForOrg = null;
          commissionTier = null;
          commissionAmount = roundMoney(commissionByOrgId.get(idStr) || 0);
        }

        return {
          businessAnchorId: idStr,
          name: orgNameById.get(idStr) || meta.name || "",
          requestorKind: meta.requestorKind || null,
          acquiredAt: (meta.referralAssignedAt || meta.createdAt)
            ? new Date(meta.referralAssignedAt || meta.createdAt).toISOString()
            : null,
          commissionTier,
          commissionRate: commissionRateForOrg,
          monthRevenueAmount: revenueAmount,
          monthSimplewayRevenueAmount: 0,
          monthOrderCount: orderCount,
          monthCommissionAmount: commissionAmount,
          monthCustomAbutmentCommissionAmount: commissionAmount,
          monthSimplewayCommissionAmount: 0,
          referralLevel: isDirect ? "direct" : "unaffiliated",
        };
      })
      .sort(
        (a, b) => (b.monthRevenueAmount || 0) - (a.monthRevenueAmount || 0),
      );

    const directOrganizations = organizations.filter(
      (o) => o.referralLevel === "direct",
    );
    const unaffiliatedOrganizations = organizations.filter(
      (o) => o.referralLevel === "unaffiliated",
    );
    const sumField = (rows, key) =>
      rows.reduce((acc, o) => acc + Number(o[key] || 0), 0);

    const directCommissionAmount = roundMoney(
      sumField(directOrganizations, "monthCommissionAmount"),
    );
    const unaffiliatedCommissionAmount = roundMoney(
      sumField(unaffiliatedOrganizations, "monthCommissionAmount"),
    );
    const totalCommissionAmount =
      directCommissionAmount + unaffiliatedCommissionAmount;
    const monthRevenueAmount = roundMoney(
      sumField(organizations, "monthRevenueAmount"),
    );
    const customAbutmentCommissionAmount = roundMoney(
      sumField(organizations, "monthCustomAbutmentCommissionAmount"),
    );
    const monthCommissionAmount = totalCommissionAmount;
    const payableGrossCommissionAmount = customAbutmentCommissionAmount;
    const practiceOrganizationCount = organizations.filter(
      (o) => o.requestorKind === "practice",
    ).length;
    const labOrganizationCount = organizations.filter(
      (o) => o.requestorKind === "lab",
    ).length;

    return res.status(200).json({
      success: true,
      data: {
        ym:
          period === "all"
            ? `${effectiveYm.year}-${String(effectiveYm.month).padStart(2, "0")}`
            : null,
        period,
        commissionRate,
        dealershipActiveCommissionRate,
        dealershipBaseCommissionRate,
        dealershipEventCommissionRate,
        dealershipEventCommissionEnabled,
        dealershipRateChangeScheduledAt,
        dealershipRateChangeScheduledRate,
        unaffiliatedCommissionRate,
        payoutDayOfMonth,
        referralCode: effectiveReferralCode,
        overview: {
          referredOrganizationCount: organizations.length,
          monthRevenueAmount,
          monthCommissionAmount: roundMoney(monthCommissionAmount),
          simplewayCommissionAmount: 0,
          customAbutmentCommissionAmount,
          directOrganizationCount: directOrganizations.length,
          totalOrganizationCount: organizations.length,
          directCommissionAmount,
          unaffiliatedCommissionAmount,
          totalCommissionAmount: roundMoney(totalCommissionAmount),
          payableGrossCommissionAmount,
          paidNetCommissionAmount,
          freeNetRequestAmount,
          freeNetShippingAmount,
          freeNetAmount,
          practiceOrganizationCount,
          labOrganizationCount,
        },
        organizations,
      },
    });
  } catch (error) {
    console.error("[salesman.getSalesmanDashboard] error", error);
    return res.status(500).json({
      success: false,
      message: "딜러 대시보드 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/** 소개 의뢰자 중 3·6개월 무주문(마지막 완료 기준) 알람 */
export async function getSalesmanNoOrderAlerts(req, res) {
  try {
    const me = req.user;
    let myBusinessAnchorId = me?.businessAnchorId;
    if (me?.role === "salesTeam") {
      const full = await User.findById(me._id);
      if (full) {
        await ensureSalesTeamPersonalAnchor(full);
        myBusinessAnchorId =
          (await resolveSalesTeamReferralAnchorId(full)) ||
          full.businessAnchorId;
      }
    }
    if (
      !myBusinessAnchorId ||
      !Types.ObjectId.isValid(String(myBusinessAnchorId))
    ) {
      return res.status(200).json({
        success: true,
        data: { summary: { count3m: 0, count6m: 0, total: 0 }, items: [] },
      });
    }

    const myBusinessAnchorObjectId = new Types.ObjectId(
      String(myBusinessAnchorId),
    );
    const referredRequestors = await BusinessAnchor.find({
      referredByAnchorId: myBusinessAnchorObjectId,
      businessType: "requestor",
    })
      .select({ _id: 1 })
      .lean();

    const data = await listNoOrderAlerts({
      anchorIds: (referredRequestors || []).map((a) => a?._id),
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[salesman.getSalesmanNoOrderAlerts] error", error);
    return res.status(500).json({
      success: false,
      message: "무주문 의뢰자 알람 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/** 고객 대면용 소셜 프루프 (매출 제외) */
export async function getPlatformPitch(req, res) {
  try {
    res.set("x-abuts-handler", "salesman.getPlatformPitch");
    const data = await getPlatformSocialProof();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[salesman.getPlatformPitch] error", error);
    return res.status(500).json({
      success: false,
      message: "플랫폼 소개 통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

async function resolveMyDealerAnchorId(me) {
  let id = me?.businessAnchorId;
  if (me?.role === "salesTeam") {
    const full = await User.findById(me._id);
    if (full) {
      await ensureSalesTeamPersonalAnchor(full);
      id = (await resolveSalesTeamReferralAnchorId(full)) || full.businessAnchorId;
    }
  }
  return id && Types.ObjectId.isValid(String(id)) ? new Types.ObjectId(String(id)) : null;
}

/** 내 거래처별 의뢰비 목록. 가격은 본인 소개 거래처에게만 보인다. */
export async function getMyCustomerUnitPrices(req, res) {
  try {
    const myAnchorId = await resolveMyDealerAnchorId(req.user);
    if (!myAnchorId) {
      return res.status(200).json({ success: true, data: { items: [], min: REQUESTOR_UNIT_PRICE_MIN, max: REQUESTOR_UNIT_PRICE_BASE } });
    }
    const rows = await BusinessAnchor.find({
      referredByAnchorId: myAnchorId,
      businessType: "requestor",
    })
      .select({
        _id: 1,
        name: 1,
        requestorKind: 1,
        dealerUnitPrice: 1,
        dealerPriceApproval: 1,
        usesOralScan: 1,
        updatedAt: 1,
        "metadata.representativeName": 1,
        "metadata.phoneNumber": 1,
        "metadata.address": 1,
        "metadata.addressDetail": 1,
        "metadata.lat": 1,
        "metadata.lng": 1,
      })
      .select("+dealerUnitPrice +dealerPriceApproval")
      .sort({ name: 1 })
      .lean();
    return res.status(200).json({
      success: true,
      data: {
        min: REQUESTOR_UNIT_PRICE_MIN,
        max: REQUESTOR_UNIT_PRICE_BASE,
        items: rows.map((r) => {
          const address = [r.metadata?.address, r.metadata?.addressDetail]
            .map((v) => String(v || "").trim())
            .filter(Boolean)
            .join(" ");
          const lat = Number(r.metadata?.lat);
          const lng = Number(r.metadata?.lng);
          return {
            anchorId: String(r._id),
            name: r.name || "",
            requestorKind: r.requestorKind || null,
            unitPrice: r.dealerUnitPrice ?? REQUESTOR_UNIT_PRICE_BASE,
            isCustom: r.dealerUnitPrice != null,
            approvalStatus: r.dealerPriceApproval?.status || "approved",
            requestedPrice: r.dealerPriceApproval?.status === "pending" ? r.dealerPriceApproval.requestedPrice ?? null : null,
            rejectReason: r.dealerPriceApproval?.status === "rejected" ? r.dealerPriceApproval.rejectReason || "" : "",
            representativeName: String(r.metadata?.representativeName || "").trim(),
            phone: String(r.metadata?.phoneNumber || "").trim(),
            address,
            lat: Number.isFinite(lat) ? lat : null,
            lng: Number.isFinite(lng) ? lng : null,
            usesOralScan: Boolean(r.usesOralScan),
            updatedAt: r.updatedAt || null,
          };
        }),
      },
    });
  } catch (error) {
    console.error("[salesman.getMyCustomerUnitPrices] error", error);
    return res.status(500).json({ success: false, message: "거래처 가격 조회 중 오류가 발생했습니다." });
  }
}

/** 거래처별 의뢰비 설정. 12,000~15,000원. unitPrice=null이면 기본가로 되돌린다. */
export async function setMyCustomerUnitPrice(req, res) {
  try {
    const targetId = String(req.params.anchorId || "").trim();
    if (!Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ success: false, message: "거래처 ID가 올바르지 않습니다." });
    }
    const raw = req.body?.unitPrice;
    let next = null;
    if (raw != null) {
      const checked = validateDealerUnitPrice(raw);
      if (!checked.ok) {
        return res.status(400).json({ success: false, message: checked.message });
      }
      next = checked.price;
    }
    const myAnchorId = await resolveMyDealerAnchorId(req.user);
    if (!myAnchorId) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }
    const filter = { _id: targetId, referredByAnchorId: myAnchorId, businessType: "requestor" };
    // 영업팀: 본사 승인 후 반영(승인 전 거래 불가). 딜러: 즉시 반영.
    const needsApproval = req.user?.role === "salesTeam";
    if (needsApproval) {
      const requested = next ?? REQUESTOR_UNIT_PRICE_BASE;
      const pending = await BusinessAnchor.findOneAndUpdate(
        filter,
        {
          $set: {
            dealerPriceApproval: {
              status: "pending",
              requestedPrice: requested,
              requestedBy: req.user._id,
              requestedAt: new Date(),
              decidedBy: null,
              decidedAt: null,
              rejectReason: "",
            },
          },
        },
        { new: true },
      )
        .select({ _id: 1 })
        .lean();
      if (!pending) {
        return res.status(404).json({ success: false, message: "내 거래처가 아닙니다." });
      }
      return res.status(200).json({
        success: true,
        data: { anchorId: targetId, unitPrice: null, isCustom: false, approvalStatus: "pending", requestedPrice: requested },
      });
    }
    const updated = await BusinessAnchor.findOneAndUpdate(
      filter,
      { $set: { dealerUnitPrice: next } },
      { new: true, runValidators: true },
    )
      .select({ _id: 1 })
      .lean();
    if (!updated) {
      return res.status(404).json({ success: false, message: "내 거래처가 아닙니다." });
    }
    invalidateRequestorUnitPriceCache(targetId);
    return res.status(200).json({
      success: true,
      data: { anchorId: targetId, unitPrice: next ?? REQUESTOR_UNIT_PRICE_BASE, isCustom: next != null, approvalStatus: "approved" },
    });
  } catch (error) {
    console.error("[salesman.setMyCustomerUnitPrice] error", error);
    return res.status(500).json({ success: false, message: "거래처 가격 저장 중 오류가 발생했습니다." });
  }
}
