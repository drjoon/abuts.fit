// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/practiceMonthlySettlement.model.js
// - web/backend/services/openBankingAdapter.service.js
// - web/backend/services/generalLedger.service.js
// - web/backend/jobs/monthlyPracticeObSettlementWorker.js
// - web/backend/utils/practiceTransferAutoMatchCore.js (OB 집계 — 수행 기공소)
// - web/backend/controllers/credits/practiceOpenBanking.controller.js
import { Types } from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import PracticeMonthlySettlement from "../models/practiceMonthlySettlement.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import Request from "../models/request.model.js";
import StoreOrder from "../models/storeOrder.model.js";
import { postGeneralLedgerJournal } from "./generalLedger.service.js";
import PracticeLabDeposit from "../models/practiceLabDeposit.model.js";
import {
  executeBatchWithdrawal,
  executeDirectTransfer,
  registerLongTermConsent,
  verifyBiometricReauth,
} from "./openBankingAdapter.service.js";
import {
  REQUESTOR_UNIT_PRICE_BASE,
  PRACTICE_DEPOSIT_GUIDANCE_THRESHOLD,
  isPracticeDepositGuidanceRequired,
} from "../utils/requestorUnitPricePolicy.js";
import { loadMonthlyRequestCounts } from "./requestorShipping.service.js";
import { emitCreditBalanceUpdatedToBusiness } from "../utils/creditRealtime.js";
import { resolvePerformingLabAnchorId } from "../utils/practiceTransferAutoMatchCore.js";
import { issuePracticeObPaymentInvoices } from "./practiceObPaymentInvoice.service.js";

export function getKstYearMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    yearMonth: `${map.year}-${map.month}`,
  };
}

export function resolveMonthBoundsFromYearMonth(yearMonth) {
  const [yStr, mStr] = String(yearMonth || "").split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const start = new Date(`${yStr}-${mStr}-01T00:00:00+09:00`);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const nextMStr = String(nextM).padStart(2, "0");
  const end = new Date(`${nextY}-${nextMStr}-01T00:00:00+09:00`);
  return { start, end };
}

export function resolvePreviousKstYearMonth(now = new Date()) {
  const { year, month } = getKstYearMonth(now);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
}

export function resolveScheduledTransferDateForYearMonth(yearMonth) {
  const [yStr, mStr] = String(yearMonth || "").split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const nextMStr = String(nextM).padStart(2, "0");
  // 익월 5일 09:00 KST 자동 일괄이체
  return new Date(`${nextY}-${nextMStr}-05T09:00:00+09:00`);
}

/**
 * 특정 기간(월) 치과 OB 정산 예정액 집계.
 * - 외부 기공소가 수행한 기공물: 그 기공소 계좌로 이체.
 * - 어벗츠 기공사업부(internalLab)가 수행한 기공물·커스텀어벗·스토어: 어벗츠 법인(admin) 계좌.
 *   개인 어벗츠기공소 계좌는 쓰지 않는다.
 * - 커스텀어벗(Request): 기공실 없는 치과만 OB로 법인에 이체.
 *   기공실 있는 치과·기공소는 선결제 크레딧이라 이 집계에 넣지 않는다.
 */
export async function aggregatePracticeMonthUsage({
  practiceAnchorId,
  yearMonth,
}) {
  const anchorObjId = new Types.ObjectId(String(practiceAnchorId));
  const { start, end } = resolveMonthBoundsFromYearMonth(yearMonth);

  const [
    transfers,
    requests,
    storeOrders,
    internalLabAnchor,
    adminAnchor,
    practiceAnchor,
  ] = await Promise.all([
      PracticeTransfer.find({
        practiceBusinessAnchorId: anchorObjId,
        status: { $nin: ["canceled", "rejected"] },
        createdAt: { $gte: start, $lt: end },
      })
        .select({
          _id: 1,
          targetLabAnchorId: 1,
          assigneeLabAnchorId: 1,
          assigneeKind: 1,
          billing: 1,
          feeQuote: 1,
        })
        .lean(),
      Request.find({
        businessAnchorId: anchorObjId,
        requestCategory: "order",
        manufacturerStage: { $nin: ["취소"] },
        createdAt: { $gte: start, $lt: end },
      })
        .select({ _id: 1, price: 1 })
        .lean(),
      StoreOrder.find({
        businessAnchorId: anchorObjId,
        status: "PAID",
        paymentMethod: "OB",
        paidAt: { $gte: start, $lt: end },
      })
        .select({
          _id: 1,
          amountTotal: 1,
          supplyAmount: 1,
          vatAmount: 1,
        })
        .lean(),
      BusinessAnchor.findOne({ businessType: "internalLab" })
        .select({ _id: 1, name: 1, payoutAccount: 1 })
        .lean(),
      BusinessAnchor.findOne({ businessType: "admin" })
        .select({ _id: 1, name: 1, payoutAccount: 1 })
        .lean(),
      BusinessAnchor.findById(anchorObjId)
        .select({ requestorKind: 1, practiceHasInHouseLab: 1 })
        .lean(),
    ]);

  // 기공실 있는 치과가 커스텀어벗 의뢰하기로 내는 건은 선결제 크레딧이다. OB 이체에 넣지 않는다.
  const customAbutmentOnPrepaidCredit =
    String(practiceAnchor?.requestorKind || "") === "practice" &&
    practiceAnchor?.practiceHasInHouseLab === true;

  const directLabMap = new Map();
  const internalLabId = internalLabAnchor?._id
    ? String(internalLabAnchor._id)
    : "";
  let abutmentAmount = 0;
  let labDivisionAmount = 0;
  let storeSupplyAmount = 0;
  let storeVatAmount = 0;
  let storeTotalAmount = 0;

  for (const t of transfers) {
    const labTotal = Math.max(
      0,
      Math.round(
        Number(t?.billing?.labFeeTotal || 0) +
          Number(t?.billing?.labAbutmentTotal || 0),
      ),
    );
    // 어벗츠 어벗. 스키마 필드는 abutmentRetailTotal. 예전 abutmentTotal은 호환용.
    const abutmentTotal = Math.max(
      0,
      Math.round(
        Number(
          t?.billing?.abutmentRetailTotal ?? t?.billing?.abutmentTotal ?? 0,
        ),
      ),
    );
    if (labTotal <= 0 && abutmentTotal <= 0) continue;

    if (labTotal > 0) {
      const performerId = resolvePerformingLabAnchorId(t);
      if (performerId) {
        const labKey = String(performerId);
        if (internalLabId && labKey === internalLabId) {
          labDivisionAmount += labTotal;
        } else {
          directLabMap.set(labKey, (directLabMap.get(labKey) || 0) + labTotal);
        }
      }
    }
    if (abutmentTotal > 0) {
      abutmentAmount += abutmentTotal;
    }
  }

  if (!customAbutmentOnPrepaidCredit) {
    for (const reqDoc of requests) {
      const reqAmt = Math.max(
        0,
        Math.round(
          Number(reqDoc?.price?.paidAmount ?? reqDoc?.price?.amount ?? 0),
        ),
      );
      abutmentAmount += reqAmt;
    }
  }

  for (const storeOrder of storeOrders) {
    const total = Math.max(0, Math.round(Number(storeOrder?.amountTotal || 0)));
    const supply = Math.max(0, Math.round(Number(storeOrder?.supplyAmount || 0)));
    const vat = Math.max(0, Math.round(Number(storeOrder?.vatAmount || 0)));
    storeTotalAmount += total;
    storeSupplyAmount += supply > 0 ? supply : total;
    storeVatAmount += supply > 0 ? vat : 0;
  }

  const abutsCorpAmount =
    abutmentAmount + storeTotalAmount + labDivisionAmount;

  const directLabIds = Array.from(directLabMap.keys()).map(
    (id) => new Types.ObjectId(id),
  );
  const directLabAnchors = directLabIds.length
    ? await BusinessAnchor.find({ _id: { $in: directLabIds } })
        .select({ _id: 1, name: 1, payoutAccount: 1 })
        .lean()
    : [];
  const labAnchorById = new Map(
    directLabAnchors.map((a) => [String(a._id), a]),
  );

  const lines = [];
  for (const [labId, amount] of directLabMap.entries()) {
    if (amount <= 0) continue;
    const labAnchor = labAnchorById.get(labId);
    lines.push({
      payeeKind: "direct_lab",
      payeeAnchorId: new Types.ObjectId(labId),
      payeeName: labAnchor?.name || "협력 기공소",
      bankCode: "004",
      bankName: labAnchor?.payoutAccount?.bankName || "국민은행",
      accountNumber:
        labAnchor?.payoutAccount?.accountNumber || "110-222-333444",
      holderName:
        labAnchor?.payoutAccount?.holderName ||
        labAnchor?.name ||
        "협력기공소",
      amount,
      transferStatus: "PENDING",
    });
  }

  if (abutsCorpAmount > 0) {
    const corpAnchor = adminAnchor || internalLabAnchor;
    lines.push({
      payeeKind: "abuts_corp",
      payeeAnchorId: corpAnchor?._id || null,
      payeeName: corpAnchor?.name || "어벗츠 주식회사",
      bankCode: "088",
      bankName: corpAnchor?.payoutAccount?.bankName || "신한은행",
      accountNumber:
        corpAnchor?.payoutAccount?.accountNumber || "140-012-345678",
      holderName:
        corpAnchor?.payoutAccount?.holderName || "주식회사 어벗츠",
      amount: abutsCorpAmount,
      transferStatus: "PENDING",
    });
  }

  const totalAmount = lines.reduce((sum, l) => sum + l.amount, 0);
  return {
    yearMonth,
    lines,
    totalAmount,
    directLabTotal: lines
      .filter((l) => l.payeeKind === "direct_lab")
      .reduce((s, l) => s + l.amount, 0),
    abutsCorpTotal: abutsCorpAmount,
    storeSupplyAmount,
    storeVatAmount,
    storeTotalAmount,
    abutmentAmount,
    labDivisionAmount,
  };
}

/**
 * 매월 1일(또는 수동) 치과별 월간 정산서 확정 생성.
 */
export async function confirmPracticeMonthlySettlement({
  practiceAnchorId,
  yearMonth,
  overrideLines = null,
  now = new Date(),
}) {
  const existing = await PracticeMonthlySettlement.findOne({
    practiceAnchorId,
    yearMonth,
  });
  if (existing && existing.status !== "DRAFT") {
    return existing;
  }

  const usage = overrideLines
    ? {
        lines: overrideLines,
        totalAmount: overrideLines.reduce(
          (s, l) => s + Math.max(0, Number(l.amount || 0)),
          0,
        ),
      }
    : await aggregatePracticeMonthUsage({ practiceAnchorId, yearMonth });

  const scheduledTransferAt = resolveScheduledTransferDateForYearMonth(yearMonth);

  const invoiceSplit = overrideLines
    ? null
    : {
        storeSupplyAmount: Math.max(0, Math.round(usage.storeSupplyAmount || 0)),
        storeVatAmount: Math.max(0, Math.round(usage.storeVatAmount || 0)),
        storeTotalAmount: Math.max(0, Math.round(usage.storeTotalAmount || 0)),
        abutmentAmount: Math.max(0, Math.round(usage.abutmentAmount || 0)),
        labDivisionAmount: Math.max(0, Math.round(usage.labDivisionAmount || 0)),
      };

  const doc = await PracticeMonthlySettlement.findOneAndUpdate(
    { practiceAnchorId, yearMonth },
    {
      $set: {
        lines: usage.lines,
        totalAmount: usage.totalAmount,
        status: usage.totalAmount > 0 ? "CONFIRMED" : "COMPLETED",
        confirmedAt: now,
        scheduledTransferAt,
        ...(invoiceSplit ? { invoiceSplit } : {}),
      },
    },
    { upsert: true, new: true },
  );
  return doc;
}

/**
 * 정산일(매월 5일 09:00 KST) 자동 일괄 이체 또는 치과 앱 생체인증(Face ID) 1탭 재시도 실행.
 * - 실패(잔액 부족, 부분 실패, 동의 만료) 시 즉시 paymentHold.isHeld = true.
 * - 전액 성공 시 paymentHold 해제.
 */
export async function runPracticeMonthlySettlementTransfer({
  settlementId,
  options = {},
  now = new Date(),
}) {
  const settlement = await PracticeMonthlySettlement.findById(settlementId);
  if (!settlement) {
    throw new Error("월간 정산 내역을 찾을 수 없습니다.");
  }
  if (settlement.status === "COMPLETED") {
    return settlement;
  }

  const anchor = await BusinessAnchor.findById(settlement.practiceAnchorId);
  if (!anchor) {
    throw new Error("치과 사업자 정보를 찾을 수 없습니다.");
  }

  const consent = anchor.openBankingConsent || {};
  const isExpired =
    consent.expiresAt && new Date(consent.expiresAt).getTime() <= now.getTime();

  if (
    consent.status !== "active" ||
    !consent.fintechUseNum ||
    (isExpired && !options.biometricVerified)
  ) {
    const failReason = isExpired
      ? "오픈뱅킹 정기동의 재인증(90일 주기) 미완료"
      : "오픈뱅킹 장기동의 미등록";

    settlement.status = "FAILED";
    settlement.failedAt = settlement.failedAt || now;
    settlement.lines = settlement.lines.map((line) =>
      line.transferStatus === "SUCCESS"
        ? line
        : {
            ...(line.toObject ? line.toObject() : line),
            transferStatus: "FAILED",
            failureReason: failReason,
          },
    );
    await settlement.save();

    await BusinessAnchor.updateOne(
      { _id: anchor._id },
      {
        $set: {
          "openBankingConsent.status": isExpired
            ? "reauth_required"
            : consent.status || "none",
          "openBankingConsent.paymentHold": {
            isHeld: true,
            reason: failReason,
            heldAt: now,
            failedBatchId: settlement._id,
          },
        },
      },
    );
    emitCreditBalanceUpdatedToBusiness({
      businessAnchorId: anchor._id,
      reason: "ob_settlement_failed",
    });
    return settlement;
  }

  // 월 후불 한도 없음: 0 = 무제한(OB 동의 한도 미설정)
  const capAmount = Number(consent.monthlyCapAmount || 0);

  const batchResult = await executeBatchWithdrawal({
    fintechUseNum: consent.fintechUseNum,
    monthlyCapAmount: capAmount,
    lines: settlement.lines,
    options: {
      ...options,
      bypassCapAfterBiometric: options.biometricVerified === true,
    },
    now,
  });

  const resultMap = new Map(
    batchResult.results.map((r) => [String(r.lineId), r]),
  );

  settlement.lines = settlement.lines.map((line) => {
    const matched = resultMap.get(String(line._id));
    if (!matched) return line;
    const raw = line.toObject ? line.toObject() : line;
    return {
      ...raw,
      transferStatus: matched.transferStatus,
      failureReason: matched.failureReason || "",
      obTxId: matched.obTxId || raw.obTxId || "",
      transferredAt: matched.transferredAt || raw.transferredAt || null,
    };
  });

  if (batchResult.allSucceeded) {
    settlement.status = "COMPLETED";
    settlement.failedAt = null;
    await settlement.save();

    await BusinessAnchor.updateOne(
      { _id: anchor._id },
      {
        $set: {
          "openBankingConsent.paymentHold": {
            isHeld: false,
            reason: "",
            heldAt: null,
            failedBatchId: null,
          },
        },
      },
    );

    if (settlement.totalAmount > 0) {
      await postGeneralLedgerJournal({
        idempotencyKey: `gl:ob_monthly_settlement:${String(settlement._id)}`,
        eventType: "OB_MONTHLY_SETTLEMENT",
        businessAnchorId: anchor._id,
        refType: "PRACTICE_MONTHLY_SETTLEMENT",
        refId: settlement._id,
        occurredAt: now,
        meta: {
          yearMonth: settlement.yearMonth,
          totalAmount: settlement.totalAmount,
          lineCount: settlement.lines.length,
        },
        lines: [
          {
            accountCode: "REQ_PAID_CREDIT",
            ownerRole: "requestor",
            ownerId: anchor._id,
            amount: 0,
            amountExcludingVat: 0,
            vatAmount: 0,
            amountIncludingVat: 0,
            creditKind: "PAID",
            meta: {
              displayLabel: `${settlement.yearMonth} 오픈뱅킹 자동 일괄정산 완료`,
              settledAmount: settlement.totalAmount,
            },
          },
        ],
      }).catch((err) => {
        console.error("[ob_monthly_settlement] ledger post error:", err);
      });
    }
  } else {
    settlement.status = batchResult.anySucceeded ? "PARTIAL_FAILED" : "FAILED";
    settlement.failedAt = settlement.failedAt || now;
    await settlement.save();

    const firstFailed = settlement.lines.find(
      (l) => l.transferStatus === "FAILED",
    );
    const holdReason =
      firstFailed?.failureReason ||
      "월말 정산 자동이체 실패 (계좌 잔액 부족 등)";

    await BusinessAnchor.updateOne(
      { _id: anchor._id },
      {
        $set: {
          "openBankingConsent.paymentHold": {
            isHeld: true,
            reason: holdReason,
            heldAt: settlement.failedAt,
            failedBatchId: settlement._id,
          },
        },
      },
    );
  }

  const paidAny = settlement.lines.some(
    (line) => String(line.transferStatus) === "SUCCESS" && Number(line.amount) > 0,
  );
  if (paidAny) {
    try {
      let invoiceSplit = settlement.invoiceSplit;
      const splitReady =
        Number(invoiceSplit?.storeTotalAmount) > 0 ||
        Number(invoiceSplit?.abutmentAmount) > 0 ||
        Number(invoiceSplit?.labDivisionAmount) > 0;
      if (!splitReady) {
        const usage = await aggregatePracticeMonthUsage({
          practiceAnchorId: settlement.practiceAnchorId,
          yearMonth: settlement.yearMonth,
        });
        invoiceSplit = {
          storeSupplyAmount: usage.storeSupplyAmount,
          storeVatAmount: usage.storeVatAmount,
          storeTotalAmount: usage.storeTotalAmount,
          abutmentAmount: usage.abutmentAmount,
          labDivisionAmount: usage.labDivisionAmount,
        };
      }
      await issuePracticeObPaymentInvoices({
        settlement,
        invoiceSplit,
        now,
      });
    } catch (err) {
      console.error("[ob_payment_invoice] failed", err);
    }
  }

  emitCreditBalanceUpdatedToBusiness({
    businessAnchorId: anchor._id,
    reason: batchResult.allSucceeded
      ? "ob_settlement_completed"
      : "ob_settlement_failed",
  });

  return settlement;
}

/**
 * 치과 오픈뱅킹 장기동의 등록 + 패스키 연결.
 */
export async function setupPracticeOpenBankingConsent({
  practiceAnchorId,
  bankCode,
  bankName,
  accountNumber,
  accountHolder,
  passkeyCredentialId,
  passkeyPublicKey,
  now = new Date(),
}) {
  const anchor = await BusinessAnchor.findById(practiceAnchorId);
  if (!anchor) {
    throw new Error("치과 사업자 정보를 찾을 수 없습니다.");
  }

  const obResult = await registerLongTermConsent({
    practiceAnchorId: anchor._id,
    bankCode,
    bankName,
    accountNumber,
    accountHolder,
    passkeyCredentialId,
    passkeyPublicKey,
    now,
  });

  const nextConsent = {
    status: "active",
    bankCode: String(bankCode).trim(),
    bankName: String(bankName).trim(),
    accountNumberMasked: obResult.accountNumberMasked,
    accountHolder: String(accountHolder).trim(),
    fintechUseNum: obResult.fintechUseNum,
    monthlyCapAmount: 0,
    consentedAt: obResult.consentedAt,
    expiresAt: obResult.expiresAt,
    lastVerifiedAt: obResult.lastVerifiedAt,
    passkeyCredentialId: obResult.passkeyCredentialId,
    passkeyPublicKey: obResult.passkeyPublicKey,
    passkeyCounter: 1,
    paymentHold: anchor.openBankingConsent?.paymentHold || {
      isHeld: false,
      reason: "",
      heldAt: null,
      failedBatchId: null,
    },
  };

  await BusinessAnchor.updateOne(
    { _id: anchor._id },
    { $set: { openBankingConsent: nextConsent } },
  );

  return nextConsent;
}

/**
 * 치과 생체인증(Face ID/지문 패스키) 재인증(90일 주기 갱신).
 */
export async function reauthenticatePracticeOpenBanking({
  practiceAnchorId,
  passkeyAssertion = {},
  now = new Date(),
}) {
  const anchor = await BusinessAnchor.findById(practiceAnchorId);
  if (!anchor) {
    throw new Error("치과 사업자 정보를 찾을 수 없습니다.");
  }

  const check = await verifyBiometricReauth({
    consent: anchor.openBankingConsent,
    passkeyAssertion,
    now,
  });
  if (!check.ok) {
    throw new Error(check.reason || "생체인증에 실패했습니다.");
  }

  const setFields = {
    "openBankingConsent.status": "active",
    "openBankingConsent.lastVerifiedAt": check.verifiedAt,
    "openBankingConsent.expiresAt": check.expiresAt,
    "openBankingConsent.passkeyCounter": check.nextCounter,
    "openBankingConsent.monthlyCapAmount": 0,
  };

  if (
    anchor.openBankingConsent?.paymentHold?.isHeld &&
    !anchor.openBankingConsent?.paymentHold?.failedBatchId
  ) {
    setFields["openBankingConsent.paymentHold"] = {
      isHeld: false,
      reason: "",
      heldAt: null,
      failedBatchId: null,
    };
  }

  await BusinessAnchor.updateOne({ _id: anchor._id }, { $set: setFields });

  return {
    status: "active",
    lastVerifiedAt: check.verifiedAt,
    expiresAt: check.expiresAt,
  };
}

/**
 * 치과 오픈뱅킹 자동정산·보증금 안내 종합 현황 조회.
 */
export async function getPracticeObBillingOverview({
  practiceAnchorId,
  now = new Date(),
}) {
  const anchor = await BusinessAnchor.findById(practiceAnchorId)
    .select("+dealerUnitPrice")
    .lean();
  if (!anchor) {
    throw new Error("치과 사업자 정보를 찾을 수 없습니다.");
  }

  const { yearMonth: currentYearMonth } = getKstYearMonth(now);
  const [currentUsage, settlements, monthlyCounts] = await Promise.all([
    aggregatePracticeMonthUsage({
      practiceAnchorId: anchor._id,
      yearMonth: currentYearMonth,
    }),
    PracticeMonthlySettlement.find({ practiceAnchorId: anchor._id })
      .sort({ yearMonth: -1 })
      .limit(12)
      .lean(),
    loadMonthlyRequestCounts([anchor._id]),
  ]);

  const counts = monthlyCounts.get(String(anchor._id)) || {
    thisMonth: 0,
    prevMonth: 0,
  };
  const monthlySpend = Math.max(
    currentUsage.totalAmount,
    ...settlements.slice(0, 3).map((x) => Number(x.totalAmount) || 0),
    Math.max(counts.thisMonth, counts.prevMonth) *
      (anchor.dealerUnitPrice ?? REQUESTOR_UNIT_PRICE_BASE),
  );

  const consent = anchor.openBankingConsent || {};
  const expiresAt = consent.expiresAt ? new Date(consent.expiresAt) : null;
  const daysUntilReauth = expiresAt
    ? Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    : null;
  const needsReauth =
    consent.status === "reauth_required" ||
    (consent.status === "active" &&
      daysUntilReauth !== null &&
      daysUntilReauth <= 14);

  return {
    practiceAnchorId: String(anchor._id),
    practiceName: anchor.name || "",
    depositGuidance: {
      required: isPracticeDepositGuidanceRequired(monthlySpend),
      threshold: PRACTICE_DEPOSIT_GUIDANCE_THRESHOLD,
      monthlySpend,
      labOptions: (() => {
        const seen = new Map();
        const all = [
          ...(currentUsage.lines || []),
          ...settlements.flatMap((x) => x.lines || []),
        ];
        for (const l of all) {
          if (!l.payeeAnchorId) continue;
          const id = String(l.payeeAnchorId);
          if (!seen.has(id)) {
            seen.set(id, {
              labAnchorId: id,
              name: l.payeeName || "어벗츠 주식회사",
            });
          }
        }
        return [...seen.values()];
      })(),
    },
    openBankingConsent: {
      status:
        consent.status === "active" && daysUntilReauth !== null && daysUntilReauth <= 0
          ? "reauth_required"
          : consent.status || "none",
      bankCode: consent.bankCode || "",
      bankName: consent.bankName || "",
      accountNumberMasked: consent.accountNumberMasked || "",
      accountHolder: consent.accountHolder || "",
      monthlyCapAmount: consent.monthlyCapAmount || 0,
      consentedAt: consent.consentedAt || null,
      expiresAt: consent.expiresAt || null,
      lastVerifiedAt: consent.lastVerifiedAt || null,
      daysUntilReauth,
      needsReauth,
      hasPasskey: Boolean(consent.passkeyCredentialId),
      paymentHold: {
        isHeld: Boolean(consent.paymentHold?.isHeld),
        reason: consent.paymentHold?.reason || "",
        heldAt: consent.paymentHold?.heldAt || null,
        failedBatchId: consent.paymentHold?.failedBatchId
          ? String(consent.paymentHold.failedBatchId)
          : null,
      },
    },
    currentMonthEstimate: {
      yearMonth: currentYearMonth,
      totalAmount: currentUsage.totalAmount,
      directLabTotal: currentUsage.directLabTotal,
      abutsCorpTotal: currentUsage.abutsCorpTotal,
      lines: currentUsage.lines,
      nextAutoTransferAt: resolveScheduledTransferDateForYearMonth(currentYearMonth),
    },
    settlements: settlements.map((s) => ({
      id: String(s._id),
      yearMonth: s.yearMonth,
      status: s.status,
      totalAmount: s.totalAmount,
      confirmedAt: s.confirmedAt,
      scheduledTransferAt: s.scheduledTransferAt,
      failedAt: s.failedAt,
      lines: (s.lines || []).map((l) => ({
        id: String(l._id),
        payeeKind: l.payeeKind,
        payeeName: l.payeeName,
        bankName: l.bankName,
        accountNumber: l.accountNumber,
        holderName: l.holderName,
        amount: l.amount,
        transferStatus: l.transferStatus,
        failureReason: l.failureReason || "",
        transferredAt: l.transferredAt || null,
      })),
    })),
  };
}

const DEPOSIT_STEP = 1_000_000;

/**
 * 보증금 이체(치과 → 개별 기공소 직접). 월 이용 1천만원 초과 치과 안내 대상이며,
 * 오픈뱅킹 + 생체인증(Face ID/지문) 1탭으로 이체한다. 플랫폼은 자금을 보관하지 않는다.
 */
export async function transferPracticeLabDeposit({
  practiceAnchorId,
  labAnchorId,
  amount,
  passkeyAssertion = {},
  now = new Date(),
}) {
  const [anchor, lab] = await Promise.all([
    BusinessAnchor.findById(practiceAnchorId),
    BusinessAnchor.findById(labAnchorId)
      .select({ name: 1, businessType: 1, requestorCapabilities: 1 })
      .lean(),
  ]);
  if (!anchor) throw new Error("치과 사업자 정보를 찾을 수 없습니다.");
  const isLab =
    lab &&
    (lab.businessType === "internalLab" ||
      Boolean(lab.requestorCapabilities?.lab));
  if (!isLab) {
    throw new Error("기공소 정보를 찾을 수 없습니다.");
  }
  const won = Number(amount);
  if (!Number.isInteger(won) || won <= 0 || won % DEPOSIT_STEP !== 0) {
    throw new Error("보증금은 100만원 단위로 입력해 주세요.");
  }
  const check = await verifyBiometricReauth({
    consent: anchor.openBankingConsent,
    passkeyAssertion,
    now,
  });
  if (!check.ok) throw new Error(check.reason || "생체인증에 실패했습니다.");

  const result = await executeDirectTransfer({
    fintechUseNum: anchor.openBankingConsent.fintechUseNum,
    amount: won,
    options: {},
    now,
  });
  const deposit = await PracticeLabDeposit.create({
    practiceAnchorId: anchor._id,
    labAnchorId: lab._id,
    labName: lab.name || "",
    amount: won,
    status: result.ok ? "TRANSFERRED" : "FAILED",
    failureReason: result.ok ? "" : result.failureReason || "",
    obTxId: result.obTxId || "",
    transferredAt: result.ok ? result.transferredAt : null,
  });
  if (!result.ok) throw new Error(result.failureReason || "보증금 이체에 실패했습니다.");
  await BusinessAnchor.updateOne(
    { _id: anchor._id },
    {
      $set: {
        "openBankingConsent.lastVerifiedAt": check.verifiedAt,
        "openBankingConsent.expiresAt": check.expiresAt,
        "openBankingConsent.passkeyCounter": check.nextCounter,
      },
    },
  );
  return deposit.toObject();
}

export async function listPracticeLabDeposits({ practiceAnchorId }) {
  const rows = await PracticeLabDeposit.find({ practiceAnchorId })
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();
  return rows.map((d) => ({
    id: String(d._id),
    labAnchorId: String(d.labAnchorId),
    labName: d.labName,
    amount: d.amount,
    status: d.status,
    failureReason: d.failureReason,
    transferredAt: d.transferredAt,
  }));
}
