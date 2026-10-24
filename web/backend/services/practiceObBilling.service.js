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
import User from "../models/user.model.js";
import SystemSettings from "../models/systemSettings.model.js";
import {
  isPracticeObLaunchBetaActive,
  refreshPracticeLaunchMode,
} from "../utils/practiceObBeta.util.js";
import { sendPopbillXMS } from "../utils/popbill.util.js";
import { issuePracticeObPaymentInvoices } from "./practiceObPaymentInvoice.service.js";
import {
  formatSettlementMonthDay,
  kstYmdFromDate,
  resolveLabPayoutYmd,
  resolvePracticeSettlementCalendar,
} from "../utils/practiceSettlementCalendar.js";
import {
  PREPAID_CONVERSION_PLAN_LINES,
  assertPartialAmount,
  classifyPracticeDelinquency,
} from "../utils/practiceSettlementDelinquency.js";

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
  return resolvePracticeSettlementCalendar(yearMonth).suspendAt;
}

const PRACTICE_DEPOSIT_ACCOUNT_DEFAULTS = {
  bankName: "하나은행",
  accountNumber: "806-910009-00004",
  holderName: "어벗츠 주식회사",
};

export async function getPracticeDepositAccount() {
  const doc = await SystemSettings.findOne({ key: "global" })
    .select({ bPlanDepositAccount: 1 })
    .lean();
  const info = doc?.bPlanDepositAccount || {};
  return {
    bankName: String(
      info.bankName || PRACTICE_DEPOSIT_ACCOUNT_DEFAULTS.bankName,
    ).trim(),
    accountNumber: String(
      info.accountNumber ||
        process.env.B_PLAN_DEPOSIT_ACCOUNT_NO ||
        PRACTICE_DEPOSIT_ACCOUNT_DEFAULTS.accountNumber,
    ).trim(),
    holderName: String(
      info.holderName || PRACTICE_DEPOSIT_ACCOUNT_DEFAULTS.holderName,
    ).trim(),
  };
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
    if (
      existing.status === "CONFIRMED" &&
      !existing.paymentReceivedAt &&
      Number(existing.totalAmount) > 0
    ) {
      const calendar = resolvePracticeSettlementCalendar(yearMonth);
      const nextSuspend = calendar.suspendAt?.getTime?.() || 0;
      const prevSuspend = existing.scheduledTransferAt
        ? new Date(existing.scheduledTransferAt).getTime()
        : 0;
      const scheduleChanged =
        existing.firstDueYmd !== calendar.firstDueYmd ||
        existing.secondDueYmd !== calendar.secondDueYmd ||
        prevSuspend !== nextSuspend;
      if (scheduleChanged) {
        existing.noticeAt = calendar.noticeAt;
        existing.reminderAt = calendar.reminderAt;
        existing.firstDueYmd = calendar.firstDueYmd;
        existing.secondDueYmd = calendar.secondDueYmd;
        existing.labPayoutOnYmd = calendar.labPayoutOnYmd;
        existing.scheduledTransferAt = calendar.suspendAt;
        await existing.save();
      }
    }
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

  const calendar = resolvePracticeSettlementCalendar(yearMonth);
  const scheduledTransferAt = calendar.suspendAt;

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
        noticeAt: calendar.noticeAt,
        reminderAt: calendar.reminderAt,
        firstDueYmd: calendar.firstDueYmd,
        secondDueYmd: calendar.secondDueYmd,
        labPayoutOnYmd: calendar.labPayoutOnYmd,
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

  const upcoming = resolvePracticeSettlementCalendar(currentYearMonth);
  await refreshPracticeLaunchMode({ force: true });
  const depositAccount = await getPracticeDepositAccount();
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
      nextAutoTransferAt: upcoming.noticeAt,
      noticeAt: upcoming.noticeAt,
      reminderAt: upcoming.reminderAt,
      firstDueYmd: upcoming.firstDueYmd,
      secondDueYmd: upcoming.secondDueYmd,
      suspendAt: upcoming.suspendAt,
      labPayoutOnYmd: upcoming.labPayoutOnYmd,
    },
    depositAccount,
    /** 실사용 전환 뒤에만 미납으로 신규 기공의뢰를 막는다. 베타 중에는 false. */
    unpaidOrderPause: !isPracticeObLaunchBetaActive(),
    settlements: settlements.map((s) => ({
      id: String(s._id),
      yearMonth: s.yearMonth,
      status: s.status,
      totalAmount: s.totalAmount,
      confirmedAt: s.confirmedAt,
      scheduledTransferAt: s.scheduledTransferAt,
      noticeAt: s.noticeAt || null,
      reminderAt: s.reminderAt || null,
      firstDueYmd: s.firstDueYmd || "",
      secondDueYmd: s.secondDueYmd || "",
      labPayoutOnYmd: s.labPayoutOnYmd || "",
      labPayoutDueYmd: s.labPayoutDueYmd || "",
      paymentReceivedAt: s.paymentReceivedAt || null,
      labPayoutMarkedAt: s.labPayoutMarkedAt || null,
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

function digitsPhone(raw) {
  return String(raw || "").replace(/\D/g, "");
}

async function listPracticeNoticePhones(anchor) {
  const phones = new Set();
  const add = (raw) => {
    const digits = digitsPhone(raw);
    if (digits.length >= 10 && digits.length <= 12) phones.add(digits);
  };
  add(anchor?.metadata?.phoneNumber);
  if (anchor?.primaryContactUserId) {
    const contact = await User.findById(anchor.primaryContactUserId)
      .select({ phoneNumber: 1 })
      .lean();
    add(contact?.phoneNumber);
  }
  if (phones.size === 0 && anchor?._id) {
    const users = await User.find({ businessAnchorId: anchor._id })
      .select({ phoneNumber: 1 })
      .limit(5)
      .lean();
    for (const user of users) add(user.phoneNumber);
  }
  return [...phones].slice(0, 3);
}

function wonLabel(amount) {
  return `${Math.round(Number(amount) || 0).toLocaleString("ko-KR")}원`;
}

function buildSettlementSms({ kind, name, yearMonth, amount, account, calendar }) {
  const who = name || "고객";
  const month = String(yearMonth || "");
  const money = wonLabel(amount);
  const bankLine = [account?.bankName, account?.accountNumber, account?.holderName]
    .filter(Boolean)
    .join(" ");
  if (kind === "reminder") {
    return [
      `${who}님, ${month} 기공료 ${money}이 아직 확인되지 않았습니다.`,
      `${formatSettlementMonthDay(calendar.secondDueYmd)}까지 입금해 주시면 됩니다.`,
      "이미 보내신 경우 이 안내는 지나치셔도 됩니다.",
      bankLine,
      "입금자명은 치과명으로 적어 주세요.",
      "어벗츠",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (kind === "reopen") {
    return [
      `${who}님, ${month} 기공료 입금이 확인되었습니다.`,
      "기공의뢰를 다시 보내실 수 있습니다.",
      "어벗츠",
    ].join("\n");
  }
  return [
    `${who}님, ${month} 기공료 ${money}입니다.`,
    `${formatSettlementMonthDay(calendar.firstDueYmd)}까지 입금해 주시면 됩니다.`,
    bankLine,
    "입금자명은 치과명으로 적어 주세요.",
    "내역은 어벗츠.핏 정산에서 보실 수 있습니다.",
    "어벗츠",
  ]
    .filter(Boolean)
    .join("\n");
}

async function deliverSettlementSms({ anchor, content }) {
  const phones = await listPracticeNoticePhones(anchor);
  if (!phones.length) return { ok: false, skipped: "no_phone" };
  await sendPopbillXMS({
    items: phones.map((phone) => ({
      phone,
      content,
      name: anchor?.name || "",
    })),
    subject: "기공료 안내",
  });
  return { ok: true };
}

async function sendSettlementNoticeForRow(row, now, account) {
  const reminderDue =
    row.reminderAt &&
    new Date(row.reminderAt).getTime() <= now.getTime() &&
    !row.reminderSentAt;
  const firstDue =
    row.noticeAt &&
    new Date(row.noticeAt).getTime() <= now.getTime() &&
    !row.noticeSentAt;
  if (!reminderDue && !firstDue) return null;

  const anchor = await BusinessAnchor.findById(row.practiceAnchorId)
    .select({ name: 1, metadata: 1, primaryContactUserId: 1 })
    .lean();
  const kind = reminderDue ? "reminder" : "first";
  const content = buildSettlementSms({
    kind,
    name: anchor?.name,
    yearMonth: row.yearMonth,
    amount: row.totalAmount,
    account,
    calendar: {
      firstDueYmd: row.firstDueYmd,
      secondDueYmd: row.secondDueYmd,
    },
  });
  try {
    await deliverSettlementSms({ anchor, content });
  } catch (error) {
    console.error("[practiceSettlementNotice] sms failed", row.yearMonth, error?.message || error);
    return null;
  }
  if (kind === "reminder") {
    row.reminderSentAt = now;
    if (!row.noticeSentAt) row.noticeSentAt = now;
  } else {
    row.noticeSentAt = now;
  }
  await row.save();
  return kind;
}

async function sendReopenNoticeIfNeeded(row, now) {
  await refreshPracticeLaunchMode({ force: true });
  if (isPracticeObLaunchBetaActive()) return false;
  const suspendAt = row?.scheduledTransferAt
    ? new Date(row.scheduledTransferAt).getTime()
    : NaN;
  const receivedAt = row?.paymentReceivedAt
    ? new Date(row.paymentReceivedAt).getTime()
    : NaN;
  if (!Number.isFinite(suspendAt) || !Number.isFinite(receivedAt)) return false;
  if (suspendAt > receivedAt || row.reopenNoticeSentAt) return false;

  const claimed = await PracticeMonthlySettlement.findOneAndUpdate(
    {
      _id: row._id,
      reopenNoticeSentAt: null,
      paymentReceivedAt: { $ne: null },
    },
    { $set: { reopenNoticeSentAt: now } },
  );
  if (!claimed) return false;
  const suspendMs = claimed?.scheduledTransferAt
    ? new Date(claimed.scheduledTransferAt).getTime()
    : NaN;
  const receivedMs = claimed?.paymentReceivedAt
    ? new Date(claimed.paymentReceivedAt).getTime()
    : NaN;
  if (!Number.isFinite(suspendMs) || !Number.isFinite(receivedMs) || suspendMs > receivedMs) {
    await PracticeMonthlySettlement.updateOne(
      { _id: row._id, reopenNoticeSentAt: now },
      { $set: { reopenNoticeSentAt: null } },
    );
    return false;
  }

  const anchor = await BusinessAnchor.findById(claimed.practiceAnchorId)
    .select({ name: 1, metadata: 1, primaryContactUserId: 1 })
    .lean();
  const content = buildSettlementSms({
    kind: "reopen",
    name: anchor?.name,
    yearMonth: claimed.yearMonth,
    amount: claimed.totalAmount,
    account: null,
    calendar: claimed,
  });
  try {
    await deliverSettlementSms({ anchor, content });
    return true;
  } catch (error) {
    console.error(
      "[practiceSettlementNotice] reopen sms failed",
      claimed.yearMonth,
      error?.message || error,
    );
    await PracticeMonthlySettlement.updateOne(
      { _id: row._id },
      { $set: { reopenNoticeSentAt: null } },
    );
    return false;
  }
}

/** 안내·재안내 문자를 보낸다. 실패하면 다음 주기에 다시 시도한다. */
export async function dispatchPracticeSettlementNotices({ now = new Date() } = {}) {
  const rows = await PracticeMonthlySettlement.find({
    status: "CONFIRMED",
    totalAmount: { $gt: 0 },
    paymentReceivedAt: null,
    $or: [
      { noticeSentAt: null, noticeAt: { $lte: now } },
      { reminderSentAt: null, reminderAt: { $lte: now } },
    ],
  });
  const account = rows.length ? await getPracticeDepositAccount() : null;
  let noticed = 0;
  let reminded = 0;
  for (const row of rows) {
    const kind = await sendSettlementNoticeForRow(row, now, account);
    if (kind === "first") noticed += 1;
    if (kind === "reminder") reminded += 1;
  }

  const reopenRows = await PracticeMonthlySettlement.find({
    totalAmount: { $gt: 0 },
    paymentReceivedAt: { $ne: null },
    reopenNoticeSentAt: null,
    $expr: { $lte: ["$scheduledTransferAt", "$paymentReceivedAt"] },
  }).limit(50);
  for (const row of reopenRows) {
    await sendReopenNoticeIfNeeded(row, now);
  }
  return { noticed, reminded };
}

async function issueSettlementInvoicesLater(settlement, now) {
  try {
    await issuePracticeObPaymentInvoices({
      settlement,
      invoiceSplit: settlement.invoiceSplit,
      now,
    });
  } catch (error) {
    console.error("[practiceSettlementInvoice] failed", error?.message || error);
  }
}

/**
 * 담당자가 치과 입금을 전액 확인한다. 일부 입금은 확인하지 않는다.
 * 입금 전에는 기공소로 보내지 않는다.
 */
export async function markPracticeSettlementPaymentReceived({
  settlementId,
  now = new Date(),
}) {
  const settlement = await PracticeMonthlySettlement.findById(settlementId);
  if (!settlement) throw new Error("월간 정산 내역을 찾을 수 없습니다.");
  if (settlement.paymentReceivedAt) return settlement;
  if (!(Number(settlement.totalAmount) > 0)) {
    throw new Error("입금할 금액이 없습니다.");
  }

  const wasPaused =
    settlement.scheduledTransferAt &&
    new Date(settlement.scheduledTransferAt).getTime() <= now.getTime();

  settlement.paymentReceivedAt = now;
  settlement.amountReceived = Math.round(Number(settlement.totalAmount) || 0);
  settlement.status = "COMPLETED";
  settlement.failedAt = null;
  settlement.labPayoutDueYmd = resolveLabPayoutYmd({
    receivedAt: now,
    firstDueYmd: settlement.firstDueYmd,
    labPayoutOnYmd: settlement.labPayoutOnYmd,
  });
  const hasLabLine = (settlement.lines || []).some(
    (line) => line.payeeKind === "direct_lab" && Number(line.amount) > 0,
  );
  settlement.lines = settlement.lines.map((line) => {
    const raw = line.toObject ? line.toObject() : line;
    if (raw.payeeKind !== "abuts_corp") return raw;
    return {
      ...raw,
      transferStatus: "SUCCESS",
      failureReason: "",
      transferredAt: now,
    };
  });
  if (!hasLabLine) settlement.labPayoutMarkedAt = now;
  await settlement.save();

  await BusinessAnchor.updateOne(
    { _id: settlement.practiceAnchorId },
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

  if (wasPaused) {
    void sendReopenNoticeIfNeeded(settlement, now).catch((error) => {
      console.error("[practiceSettlementNotice] reopen sms failed", error?.message || error);
    });
  }

  void issueSettlementInvoicesLater(settlement, now);
  emitCreditBalanceUpdatedToBusiness({
    businessAnchorId: settlement.practiceAnchorId,
    reason: "practice_settlement_received",
  });
  return settlement;
}

/** 담당자가 거래 기공소 계좌로 송금을 마친 뒤 표시한다. */
export async function markPracticeSettlementLabPayout({
  settlementId,
  now = new Date(),
}) {
  const settlement = await PracticeMonthlySettlement.findById(settlementId);
  if (!settlement) throw new Error("월간 정산 내역을 찾을 수 없습니다.");
  if (!settlement.paymentReceivedAt) {
    throw new Error("치과 입금을 확인한 뒤에 기공소로 보내 주세요.");
  }
  settlement.lines = settlement.lines.map((line) => {
    const raw = line.toObject ? line.toObject() : line;
    if (raw.payeeKind !== "direct_lab") return raw;
    if (raw.transferStatus === "SUCCESS") return raw;
    return {
      ...raw,
      transferStatus: "SUCCESS",
      failureReason: "",
      transferredAt: now,
    };
  });
  settlement.labPayoutMarkedAt = now;
  if (!settlement.labPayoutDueYmd) {
    settlement.labPayoutDueYmd = kstYmdFromDate(now);
  }
  await settlement.save();
  void issueSettlementInvoicesLater(settlement, now);
  return settlement;
}

export async function listPracticeLabFeeWorklist({ now = new Date() } = {}) {
  const rows = await PracticeMonthlySettlement.find({
    totalAmount: { $gt: 0 },
    $or: [
      { paymentReceivedAt: null, status: { $ne: "COMPLETED" } },
      {
        paymentReceivedAt: { $ne: null },
        labPayoutMarkedAt: null,
      },
    ],
  })
    .sort({ yearMonth: 1, createdAt: 1 })
    .limit(200)
    .lean();

  const anchorIds = rows.map((row) => row.practiceAnchorId).filter(Boolean);
  const anchors = anchorIds.length
    ? await BusinessAnchor.find({ _id: { $in: anchorIds } })
        .select({ name: 1 })
        .lean()
    : [];
  const nameById = new Map(anchors.map((a) => [String(a._id), a.name || ""]));

  const items = rows.map((row) => {
    const received = Boolean(row.paymentReceivedAt);
    const suspendAt = row.scheduledTransferAt ? new Date(row.scheduledTransferAt) : null;
    const reminderAt = row.reminderAt ? new Date(row.reminderAt) : null;
    let phase = "awaiting_first";
    if (received) phase = "payout";
    else if (suspendAt && suspendAt.getTime() <= now.getTime()) phase = "paused";
    else if (reminderAt && reminderAt.getTime() <= now.getTime()) phase = "awaiting_second";
    const labLines = (row.lines || []).filter((line) => line.payeeKind === "direct_lab");
    return {
      id: String(row._id),
      practiceAnchorId: String(row.practiceAnchorId || ""),
      practiceName: nameById.get(String(row.practiceAnchorId)) || "치과",
      yearMonth: row.yearMonth,
      totalAmount: row.totalAmount,
      amountReceived: Math.max(0, Math.round(Number(row.amountReceived) || 0)),
      phase,
      firstDueYmd: row.firstDueYmd || "",
      secondDueYmd: row.secondDueYmd || "",
      labPayoutOnYmd: row.labPayoutOnYmd || "",
      labPayoutDueYmd: row.labPayoutDueYmd || "",
      paymentReceivedAt: row.paymentReceivedAt || null,
      labPayoutMarkedAt: row.labPayoutMarkedAt || null,
      noticeSentAt: row.noticeSentAt || null,
      reminderSentAt: row.reminderSentAt || null,
      lines: labLines.map((line) => ({
        id: String(line._id),
        payeeName: line.payeeName,
        bankName: line.bankName,
        accountNumber: line.accountNumber,
        holderName: line.holderName,
        amount: line.amount,
        transferStatus: line.transferStatus,
      })),
    };
  });

  const summary = await summarizePracticeLabFeeDelinquency({ now });
  const clinicById = new Map(
    (summary.clinics || []).map((clinic) => [clinic.practiceAnchorId, clinic]),
  );
  return items.map((item) => {
    const clinic = clinicById.get(item.practiceAnchorId);
    const kinds = new Set((clinic?.months || []).map((month) => month.kind));
    return {
      ...item,
      watch: {
        ongoing: kinds.has("ongoing") || kinds.has("ongoing_partial"),
        repeat: (clinic?.unpaidRecordCount || 0) >= 2,
        partial: kinds.has("partial") || kinds.has("ongoing_partial"),
        prepaidCandidate: Boolean(clinic?.prepaidCandidate),
        unpaidRecordCount: clinic?.unpaidRecordCount || 0,
      },
    };
  });
}

export async function summarizePracticeLabFeeDelinquency({ now = new Date() } = {}) {
  const rows = await PracticeMonthlySettlement.find({
    totalAmount: { $gt: 0 },
    $or: [
      { paymentReceivedAt: null, status: { $ne: "COMPLETED" } },
      {
        $expr: {
          $and: [
            { $ne: ["$scheduledTransferAt", null] },
            { $gt: ["$paymentReceivedAt", "$scheduledTransferAt"] },
          ],
        },
      },
    ],
  })
    .select({
      practiceAnchorId: 1,
      yearMonth: 1,
      totalAmount: 1,
      amountReceived: 1,
      paymentReceivedAt: 1,
      scheduledTransferAt: 1,
    })
    .limit(2000)
    .lean();

  const anchorIds = [...new Set(rows.map((row) => String(row.practiceAnchorId || "")).filter(Boolean))];
  const anchors = anchorIds.length
    ? await BusinessAnchor.find({ _id: { $in: anchorIds } }).select({ name: 1 }).lean()
    : [];
  const nameById = new Map(anchors.map((anchor) => [String(anchor._id), anchor.name || ""]));
  const grouped = classifyPracticeDelinquency(rows, nameById, now);
  return {
    ...grouped,
    planLines: PREPAID_CONVERSION_PLAN_LINES,
  };
}

export async function markPracticeSettlementPartialPayment({
  settlementId,
  amountReceived,
  now = new Date(),
}) {
  const settlement = await PracticeMonthlySettlement.findById(settlementId);
  if (!settlement) throw new Error("월간 정산 내역을 찾을 수 없습니다.");
  if (settlement.paymentReceivedAt) {
    throw new Error("이미 전액이 확인된 달입니다.");
  }
  const amount = assertPartialAmount(settlement.totalAmount, amountReceived);
  settlement.amountReceived = amount;
  settlement.partialReceivedAt = amount > 0 ? now : null;
  await settlement.save();
  return settlement;
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
