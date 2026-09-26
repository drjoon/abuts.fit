// related files:
// - web/backend/rules.md
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/utils/labFeeSchedule.js
// - web/backend/utils/abutsAbutmentService.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/utils/labTradingPartner.util.js
// - web/backend/services/generalLedger.service.js
// - web/backend/services/creditRevenuePolicy.service.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/frontend/src/shared/practice/labFeeSchedule.ts
// - web/frontend/src/shared/components/practice/PracticeTransferFeeEstimate.tsx
// - 2026-09-26: 학습 동의 변경 — 미완료 의뢰는 이번 건부터 플랫폼 수수료를 다시 맞춘다.
// - 2026-09-20: lab/remake/follow-up 플랫폼 수수료 pushRevenueLines에 creditSettings 전달(2% 적립 크래시 수정).
// - 2026-09-20: 작업시작 시 hold 저널 생성 실패면 billed 처리 금지(heldAt만 남는 정산 누락 방지).
// - 2026-09-23: 어벗츠 원청 정산 — gross→prime, 하청 매입→assignee. 장부 라벨 치과→어벗츠.
// - 2026-09-20: 리메이크·후속 적립도 subcontracted 반영(하청 %).
// - 2026-09-20: 비거래처 어벗 해제는 제조사 발송 유지. 가공 진입 이동 금지.
// - 2026-09-20: blockedFromSettlement — labSettledAt 있으면 제외 안 함(확정 적립 통계·내역 누락 방지).
// - 2026-09-20: CA 치과→기공소 정산은 디자인 STL + 어벗 생산비 지급 후. 그 전 payout·정산 제외.
// - 2026-09-15: 후속 보철 — labSettledAt 이후 hold는 즉시 기공소 적립(리메이크와 동일).
// - 2026-09-14: remakeFeeQuote — 원본 180일 창 밖이면 정가(리메이크 무료 미적용).
// - 2026-09-12: remakeFeeQuote — 원본 90일 창 밖이면 정가(리메이크 무료 미적용).
// - 2026-08-27: billed 견적 — 레거시 abutmentRetail 스냅샷이면 기공소 CA 수가(live)로 표시 승격.
// - 2026-08-26: labAbutmentPending는 미도입 플래그만(금액>0과 OR 하지 않음).
// - 2026-08-22: 치과 멤버십/일반 청구 이중가 제거. membership* 단일 고시. pricingTier 분기 삭제.
// - 2026-08-22: 기공소→치과 배송 무료(lab_shipping hold 미생성·레거시 hold 해제). 라벨 정정.
// - 2026-08-21: 기공소→치과·치과→기공소 배송 무료(labShippingFee 0). 기공소→어벗츠는 Request 박스키 hold.
// - 2026-08-21: feeQuote.labShippingFee — 기공수가 배송비. 표시 총액은 배송 제외(크레딧 정산만 합산).
// - 2026-08-21: feeQuote.missingFeeNames — 치과 견적에 미설정 수가 항목 안내.
// - 2026-08-21: assertCredit — fees/shipping 재사용 시 견적 DB 재조회 생략(전송 create 핫패스).
// - 2026-08-21: hold — 슬라이스 저널 insertMany 1회 + txn 잔액은 BusinessCreditBalance 우선.
// - 2026-08-21: assert balanceMode=snapshot — 스냅샷 없으면 게이트 스킵(응답 지연 방지).
// - 2026-08-21: resolveHoldShareAmounts — billing 금액 있으면 assert 재호출 금지. devops 캐시.
// - 2026-08-19: 목록 feeQuote에 labFeeConfigured 전달(지정 수가 Off·항목 Off=미설정).
// - 2026-09-08: rollbackPracticeTransferBilling — PTX 전량 GL 물리 삭제(스토어만 REFUND 유지).
// - 2026-09-06: rollbackPracticeTransferBilling — 비제조사 REFUND, 제조사 배송(SHIPPING/abuts) 삭제(폐기).
// - 2026-08-18: rollbackPracticeTransferBilling — 멱등키 조회·저널 삭제를 병렬화.
// - 2026-08-21: rollback — getJournalsByIdempotencyKeys 1회 + syncBalanceCache/emit 지연 옵션.
// - 2026-08-18: 기공소 공급 어벗은 전역 단가. 의뢰자별 특별가는 적용하지 않음.
// - 2026-08-17: adjustPracticeTransferHold — 배송비 보류는 조정 대상에서 제외(fees.total과만 비교).
// - 2026-08-17: 생성 시 배송비도 SPEND_HOLD. 출고 시 에스크로→매출 전환(재차감 없음).
// - 2026-08-17: 신속처리 rushFeeMultiplier — 기공/어벗 배수 스택(기본 1.2·플랫폼 설정).
// - 2026-08-14: 목록 견적 조회(devops/단가/기공소/거래처) parallel + 60s 캐시.
// - 2026-08-14: quote-context에 abutmentPrices 포함. 환봉 단가가 치과 견적에 전달.
// - 2026-08-14: quote-context — 기공소/티어/단가/거래처/수수료율 parallel + 60s 캐시(5회 직렬 RTT 제거).
// - 2026-08-14: 환봉 요청중 판별용 치과 implantFavorites를 견적·청구 계산에 전달.
// - 2026-08-14: 치과별 기공수가 할증(labPracticeFeeMultipliers → labFeeMultiplier).
// - 2026-09-24: 할증·수가표 앵커 — 협력=수행 기공소, 하청·어벗츠 자체=원청. 정산만 어벗츠 경유.
// - 2026-08-29: 치과별 특별공급가(labPracticeSpecialSupplyPrices) 견적·청구 반영.
// - 2026-08-31: 특별공급가 billing 스냅샷·as-of(기존 의뢰 소급 금지). 신규 견적·리메이크는 live.
// - 2026-08-14: 지정 기공소: 생성 시 billing.labFeeMultiplier 스냅샷(할증 소급 금지).
// - 2026-08-14: 자동매칭: 치과별 할증 사용. 할증 updatedAt > 의뢰 createdAt 이면 해당 건 미적용.
// - 2026-08-14: 자동매칭 수락 예산 검증은 공개 수가(할증 제외). 할증은 청구에만.
// - 2026-08-15: 지정·수락된 자동매칭 견적은 billing 스냅샷. 공개풀만 as-of(history).
// - 2026-08-15: 전송 전 잔액검사 — catalog 재사용·어벗 단가 캐시·조회 병렬화.
// - 2026-08-16: mark-complete 경로 — release 저널/수수료 parallel, resolveRevenueOwners parallel.
// - 2026-08-16: chargePracticeTransferLabShipping — 기공소 출발 배송비(지그 면제).
// - 2026-08-15: 청구 완료 목록 견적에 autoMatchBudget 재부착 금지(확정 기공비 유지).
// - 2026-08-16: 자동매칭 수신 견적 — 공개풀·시청 기공소여도 v4 고정수가·autoMatchBudget 유지.
// - 2026-08-16: 자동매칭 수락·기공소 수신 견적 — 유효 별점 배수 확정가(상한 대역 아님).
// - 2026-08-19: 별점 기공비 배수 폐지. 자동매칭도 치과별 labFeeMultiplier 할증(as-of createdAt).
// - 2026-08-16: billed 확정 견적 — labFeeMin/예산 구간 제거·수락 기공소 별점 단일가.
// - 2026-08-20: billed 목록 견적 — 폐지된 별점 확정가 분기(미정의 변수) 제거. 스냅샷 유지.
// - 2026-08-20: 치과 별점은 평가만. 기공비 할인/할증은 기공소 labFeeMultiplier만.
// - 2026-08-16: 기공소 수신 billed — 스냅샷이 구 상한가여도 라인·labFeeTotal을 별점 확정가로 맞춤.
// - 2026-08-17: PTX 디자인비 기공소 라인 refType=PRACTICE_TRANSFER(보철기공비와 동일 의뢰건).
// - 2026-08-17: rollbackPracticeTransferBilling — 배송·디자인비 ADJUST·refId 스윕 포함. 잔액 emit.
// - 2026-08-17: 보류/해제 기공소몫·어벗츠몫 분리. 기공소 발송=lab share, 제조사 발송=abutment. 기공소 수수료 차감.
// - 2026-08-17: 장부 displayLabel을 치과→기공소 / 치과→어벗츠 경로로 통일(기공비 보류·배송비·해제).
// - 2026-08-17: 어벗 보류=생산비만. 디자인비(+지그)는 기공소 경로 보류. PTX 어벗츠 배송=mark-complete.
// - 2026-08-23: 제조사 적립은 어벗 1개당 고정단가(부가세 포함→공급가+VAT). 플랫폼수수료·기공소 배송은 제외.
// - 2026-08-18: 제조사 적립은 어벗 1개당 고정단가. 플랫폼수수료·기공소 배송은 제외.
import mongoose, { Types } from "mongoose";

/** 치과 크레딧 내역 유형 라벨 SSOT */
export const PRACTICE_TRANSFER_LEDGER_LABELS = {
  holdLab: "기공비 보류(치과→어벗츠)",
  holdAbutment: "기공비 보류(치과→어벗츠)",
  holdAdjust: "기공비 보류 조정",
  // 레거시: holdShippingLab / shippingLab(기공소→치과) 라벨 삭제 — 해당 방향 배송 무료.
  holdShippingAbutment: "배송비 보류(기공소→어벗츠)",
  releaseLab: "기공비(치과→어벗츠)",
  releaseAbutment: "기공비(치과→어벗츠)",
  /** 치과 직접 지정 협력 — 플랫폼 사용료 없음, 전액 이관 */
  cooperationPurchase: "협력 기공비(어벗츠→기공소)",
  /** 어벗츠 지정 후 하청 — subcontractFeeRate */
  subcontractPurchase: "하청(매입) 기공비(어벗츠→기공소)",
  shippingAbutment: "배송비(기공소→어벗츠)",
  shippingAbutsToManufacturer: "배송비(어벗츠→제조사)",
};
import CreditBalanceGuard from "../models/creditBalanceGuard.model.js";
import LedgerJournal from "../models/ledgerJournal.model.js";
import LedgerLine from "../models/ledgerLine.model.js";
import {
  allocateSpendFromCreditBuckets,
  computeBusinessCreditBalanceFromLedger,
  spendShippingCreditAtomic,
  upsertBusinessCreditBalanceFromLedger,
} from "./creditBalance.service.js";
import { allowsDemoFreeRequestOverdraft } from "../controllers/businesses/business.demoMode.util.js";
import {
  postGeneralLedgerJournal,
  postGeneralLedgerJournals,
  getJournalByIdempotencyKey,
  getJournalsByIdempotencyKeys,
  deleteGeneralLedgerCommitJournal,
  refundIdempotencyKeyFor,
} from "./generalLedger.service.js";
import BusinessCreditBalance from "../models/businessCreditBalance.model.js";
import {
  resolveRevenueOwnerBaseAllocation,
  splitRevenueByCreditKindProRata,
  resolveConfiguredRevenueRates,
  platformFeeArgsFromBilling,
  resolvePracticeTransferFeeRate,
  resolvePracticeTransferFeeRateForViewer,
  snapshottedPracticeTransferFeeRate,
  resolveManufacturerUnitApply,
  resolveManufacturerUnitQty,
  normalizeAffiliateVatRate,
  MANUFACTURER_PRODUCTION_LEDGER_LABEL,
  allocateAffiliateVatAcrossSupplyParts,
} from "./creditRevenuePolicy.service.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import {
  computePracticeTransferRetailFees,
  LAB_FEE_SCHEDULE_ZEROS,
  LAB_FEE_SHIPPING_ITEM_NAME,
  attachLabFeeMinToLines,
  missingLabFeeItemNames,
  resolveQuoteLabFeeConfigured,
  normalizeLabFeeItems,
  normalizeLabFeeMultiplier,
  normalizeLabFeeRemakeSchedule,
  normalizeLabFeeSchedule,
  resolveLabFeeScheduleSource,
  resolveLabFeeScheduleSourceForPractice,
  resolveLabFeeScheduleSourceForPracticeTransfer,
  applyLabPracticeSpecialSupplyToSchedule,
  captureLabPracticeSpecialSupplySnapshot,
  isLabPracticeSpecialSupplySnapshotCaptured,
  resolveLabPracticeFeeMultiplier,
  resolveLabPracticeFeeMultiplierAsOf,
  splitPracticeTransferSettlement,
  buildLabFeePendingPromotionSet,
  resolveEffectiveLabFeeLabDoc,
  stripCustomAbutmentFromToothWorks,
  countCustomAbutmentWorks,
  readLabFeeFreeRemakeYears,
} from "../utils/labFeeSchedule.js";
import {
  normalizeConfiguredRushFeeMultiplier,
  normalizeRushFeeMultiplier,
  resolveRushFeeMultiplier,
} from "../utils/practiceTransferRush.js";
import {
  applyProsthesisFollowUpTempCredit,
  pickSourceTempRowsForFollowUpCredit,
} from "../utils/practiceTransferProsthesisFollowUp.js";
import {
  loadCreditSettingsDefaults,
} from "../utils/creditSettingsDefaults.js";
import {
  normalizeAbutsAbutmentCreditPrices,
  splitAbutmentRetailForRouteHolds,
} from "../utils/abutsAbutmentService.js";
import LabTradingPartner from "../models/labTradingPartner.model.js";
import { findLabPracticeRelationship } from "../utils/labTradingPartner.util.js";
import {
  getAssigneeLabAnchorId,
  getPrimeLabAnchorId,
  isAutoMatchCompleted,
  isAutoMatchOpenPool,
  isCooperationAssignee,
  isInternalLabBusinessType,
  isPracticeTransferSubcontracted,
  isSubcontractFeeApplicable,
  resolveFeeScheduleLabAnchorId,
  resolveLabFeeMultiplierLabAnchorId,
  resolvePerformingLabAnchorId,
  resolvePracticeTransferSettlementParties,
} from "../utils/practiceTransferAutoMatch.js";
import {
  isLabAiTrainingConsentAllowed,
  resolveUnacceptedAiTrainingConsent,
} from "../utils/practiceTransferAiTraining.js";

const resolveAssigneePurchaseLedgerLabel = (transfer) =>
  isCooperationAssignee(transfer)
    ? PRACTICE_TRANSFER_LEDGER_LABELS.cooperationPurchase
    : PRACTICE_TRANSFER_LEDGER_LABELS.subcontractPurchase;
import {
  assertLabWithinAutoMatchBudget,
  buildScheduleFromAutoMatchBudget,
  buildScheduleFromAutoMatchBudgetAtStars,
  loadAutoMatchBudgetCatalog,
  normalizeAutoMatchBudget,
  resolveAutoMatchBudgetOrDefaults,
} from "../utils/practiceTransferAutoMatchBudget.js";
import {
  DEFAULT_EFFECTIVE_LAB_STARS,
  loadGlobalLabRatingAggregates,
  toLabRatingSummaryApi,
} from "../utils/practiceLabRating.js";
import { shouldChargePracticeTransferLabShipping } from "../utils/practiceTransferLabShipping.js";
import { SHIPPING_LEDGER_LABELS } from "../utils/shippingLedgerLabels.js";
import { isWithinLabFreeRemakeWindow } from "../utils/remakePricingPolicy.js";
import {
  awaitsAbutmentShareRelease,
  requestMachiningSpendGlKey,
  resolvePracticeToLabSettlementBlock,
} from "./practiceTransferLabSettlementGate.js";
import {
  getRequestPerfCacheValue,
  invalidateRequestPerfCacheByPrefix,
  setRequestPerfCacheValue,
  withRequestPerfInFlight,
} from "./requestDashboardCache.service.js";

export { shouldChargePracticeTransferLabShipping };

function computePracticeTransferRetailFeesWithLabShipping(feeArgs, transferLike) {
  // 기공소→치과·치과→기공소 배송 무료 — labShippingFee 항상 0.
  void transferLike;
  return {
    ...computePracticeTransferRetailFees({
      ...feeArgs,
      includeLabShippingFee: false,
    }),
    labShippingFee: 0,
  };
}

const QUOTE_LOOKUP_CACHE_TTL_MS = 60 * 1000;

/** 자동매칭 확정수가용 기공소 유효 별점. */
async function resolveLabEffectiveStarsForFee(labAnchorId) {
  const labId = String(labAnchorId || "").trim();
  if (!labId || !Types.ObjectId.isValid(labId)) {
    return DEFAULT_EFFECTIVE_LAB_STARS;
  }
  const map = await loadGlobalLabRatingAggregates({ labAnchorIds: [labId] });
  return toLabRatingSummaryApi(map.get(labId)).effectiveStars;
}

/** 자동매칭 수신·수락 견적 — 카탈로그 평균 스케줄(별점 배수 없음). */
function buildAutoMatchFeeScheduleForLab({
  budget,
  catalog,
  labEffectiveStars,
}) {
  const normalized =
    normalizeAutoMatchBudget(budget, catalog) || budget || null;
  if (!normalized) return null;
  return buildScheduleFromAutoMatchBudgetAtStars(
    normalized,
    labEffectiveStars ?? DEFAULT_EFFECTIVE_LAB_STARS,
    catalog,
  );
}

async function loadLabAnchorsForFeeComputation({
  feeScheduleLabId,
  performingLabId,
  multiplierLabId = null,
  session = null,
}) {
  const ids = [
    ...new Set(
      [feeScheduleLabId, performingLabId, multiplierLabId]
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!ids.length) {
    return { feeScheduleLab: null, performingLab: null, multiplierLab: null };
  }
  const docs = await BusinessAnchor.find({ _id: { $in: ids } })
    .select({
      labFeeSchedule: 1,
      labPracticeFeeMultipliers: 1,
      labPracticeSpecialSupplyPrices: 1,
      labPracticeSpecialSupplyPendingChange: 1,
    })
    .session(session || null)
    .lean();
  const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
  const feeScheduleLab = byId.get(String(feeScheduleLabId || "")) || null;
  const performingLab = byId.get(String(performingLabId || "")) || null;
  const multiplierKey = String(multiplierLabId || feeScheduleLabId || "");
  return {
    feeScheduleLab,
    performingLab,
    multiplierLab: byId.get(multiplierKey) || feeScheduleLab || performingLab,
  };
}

/** 지정: 생성 스냅샷. 자동매칭: 할증 앵커(하청=원청) as-of(의뢰 생성 이후 변경분 제외). */
function resolveBillingLabFeeMultiplier({
  isAutoMatch,
  lab,
  practiceId,
  createdAt,
  snapshot,
}) {
  if (isAutoMatch) {
    return resolveLabPracticeFeeMultiplierAsOf(lab, practiceId, createdAt);
  }
  return normalizeLabFeeMultiplier(snapshot);
}

async function loadCachedDevopsPayoutRates() {
  const cacheKey = "practice-transfer:devops-payout";
  const cached = getRequestPerfCacheValue(cacheKey);
  if (cached && typeof cached === "object" && "payoutRates" in cached) {
    return cached.payoutRates;
  }
  return withRequestPerfInFlight(cacheKey, async () => {
    const devops = await BusinessAnchor.findOne({ businessType: "devops" })
      .select({ payoutRates: 1 })
      .sort({ createdAt: 1 })
      .lean();
    const payoutRates = devops?.payoutRates || null;
    setRequestPerfCacheValue(
      cacheKey,
      { payoutRates },
      QUOTE_LOOKUP_CACHE_TTL_MS,
    );
    return payoutRates;
  });
}

async function loadCachedAbutmentCreditPrices(practiceAnchorId = null) {
  const practiceId = String(practiceAnchorId || "").trim();
  const cacheKey = practiceId
    ? `practice-transfer:abutment-prices:${practiceId}`
    : "practice-transfer:abutment-prices";
  const cached = getRequestPerfCacheValue(cacheKey);
  if (cached) return cached;
  return withRequestPerfInFlight(cacheKey, async () => {
    const prices = await loadAbutmentCreditPrices(practiceId || null);
    setRequestPerfCacheValue(cacheKey, prices, QUOTE_LOOKUP_CACHE_TTL_MS);
    return prices;
  });
}

async function loadAbutmentCreditPrices(practiceAnchorId = null) {
  try {
    void practiceAnchorId;
    const settings = await loadCreditSettingsDefaults();
    return normalizeAbutsAbutmentCreditPrices(settings);
  } catch {
    return normalizeAbutsAbutmentCreditPrices();
  }
}

async function lockGuard(businessAnchorId, session) {
  const id = new Types.ObjectId(String(businessAnchorId));
  await CreditBalanceGuard.updateOne(
    { businessAnchorId: id },
    {
      $inc: { version: 1 },
      $setOnInsert: { businessAnchorId: id },
    },
    { upsert: true, session },
  );
}

/** 치과 데모 모드면 가상 잔고 freeRequest 마이너스 허용(구강스캔·CA) */
async function practiceAllowsFreeRequestOverdraft(practiceAnchorId) {
  if (!practiceAnchorId) return false;
  return allowsDemoFreeRequestOverdraft(practiceAnchorId);
}

/** 스냅샷/GL 잔액 — freeRequest는 부호 유지(데모 부채) */
function normalizePracticeBalanceBuckets(raw) {
  const paidCredit = Math.max(0, Math.round(Number(raw?.paidCredit || 0)));
  const freeRequestCredit = Math.round(Number(raw?.freeRequestCredit || 0));
  const freeShippingCredit = Math.max(
    0,
    Math.round(Number(raw?.freeShippingCredit || 0)),
  );
  return {
    paidCredit,
    freeRequestCredit,
    freeShippingCredit,
    freeCredit: freeRequestCredit + freeShippingCredit,
  };
}

export function isPracticeTransferRemake(doc) {
  const remake = doc?.remake && typeof doc.remake === "object" ? doc.remake : {};
  return Boolean(
    remake.sourceTransferMongoId ||
      String(remake.sourceTransferId || "").trim() ||
      doc?.billing?.isRemake,
  );
}

export function toRemakeApiFields(doc) {
  const remake = doc?.remake && typeof doc.remake === "object" ? doc.remake : {};
  const sourceTransferId = String(remake.sourceTransferId || "").trim();
  const sourceTransferMongoId = String(remake.sourceTransferMongoId || "").trim();
  const isRemake = Boolean(
    sourceTransferId || sourceTransferMongoId || doc?.billing?.isRemake,
  );
  return {
    isRemake,
    remake: isRemake
      ? {
          sourceTransferId: sourceTransferId || null,
          sourceTransferMongoId: sourceTransferMongoId || null,
          requestedAt: remake.requestedAt || null,
          includeCustomAbutment: Boolean(remake.includeCustomAbutment),
        }
      : null,
  };
}

/** @deprecated 치과 멤버십 폐지. 항상 고시 단일가 — 호출 제거 권장. */
const PLATFORM_ABUTMENT_PRICING_TIER = "membership";

async function resolveRevenueOwners({ practiceAnchorId, session }) {
  // Atlas RTT: BA 조회 4건을 한 파도로 묶는다.
  const [practice, devops, manufacturer, admin] = await Promise.all([
    BusinessAnchor.findById(practiceAnchorId)
      .select({ referredByAnchorId: 1 })
      .session(session || null)
      .lean(),
    BusinessAnchor.findOne({ businessType: "devops" })
      .select({ _id: 1, payoutRates: 1 })
      .sort({ createdAt: 1 })
      .session(session || null)
      .lean(),
    BusinessAnchor.findOne({
      businessType: "manufacturer",
    })
      .select({ _id: 1 })
      .sort({ createdAt: 1 })
      .session(session || null)
      .lean(),
    BusinessAnchor.findOne({ businessType: "admin" })
      .select({ _id: 1 })
      .sort({ createdAt: 1 })
      .session(session || null)
      .lean(),
  ]);

  let salesmanAnchorId = null;
  let hasSalesmanReferrer = false;
  const referredId = String(practice?.referredByAnchorId || "").trim();
  if (referredId && Types.ObjectId.isValid(referredId)) {
    const referred = await BusinessAnchor.findById(referredId)
      .select({ businessType: 1 })
      .session(session || null)
      .lean();
    if (String(referred?.businessType || "") === "salesman") {
      salesmanAnchorId = referredId;
      hasSalesmanReferrer = true;
    }
  }

  return {
    requestorAnchorId: String(practiceAnchorId),
    manufacturerAnchorId: manufacturer?._id ? String(manufacturer._id) : null,
    devopsAnchorId: devops?._id ? String(devops._id) : null,
    salesmanAnchorId,
    adminAnchorId: admin?._id ? String(admin._id) : null,
    hasSalesmanReferrer,
    configuredRates: resolveConfiguredRevenueRates(devops?.payoutRates),
  };
}

function pushRevenueLines({
  lines,
  owners,
  spendAmount,
  freeAmount = 0,
  fromFreeRequest = 0,
  fromFreeShipping = 0,
  refType,
  refId,
  meta,
  creditSettings = null,
  labAnchorId = null,
  isRemake = false,
}) {
  if (spendAmount <= 0) return;
  const freeTotal = Math.max(0, Math.round(Number(freeAmount || 0)));
  const freeReq = Math.max(0, Math.round(Number(fromFreeRequest || 0)));
  const freeShip = Math.max(0, Math.round(Number(fromFreeShipping || 0)));
  const freeSourceTotal = freeReq + freeShip;
  const usageKind = String(meta?.usageKind || "");
  const source = String(meta?.source || "");
  const displayKind = String(meta?.displayKind || "");
  const abutmentQty = Math.max(
    0,
    Math.round(Number(meta?.abutmentQty || 0) || 0),
  );
  const abutmentRetailTotal = Math.max(
    0,
    Math.round(Number(meta?.abutmentRetail || meta?.abutmentRetailTotal || 0) || 0),
  );
  const isPtxLabShipping = usageKind === "practice_transfer_lab_shipping";
  const isPtxAbutsShipping = usageKind === "practice_transfer_abuts_shipping";
  const applyManufacturerUnit = resolveManufacturerUnitApply({
    usageKind,
    source,
    displayKind,
    abutmentQty,
    abutmentRetailTotal,
    isShippingSpend: isPtxAbutsShipping,
    isRemake: Boolean(isRemake) || Boolean(meta?.isRemake),
  });
  const manufacturerQty = resolveManufacturerUnitQty({
    abutmentQty,
    isShippingSpend: isPtxAbutsShipping,
  });

  // 기공소→치과 배송 무료 — 레거시 practice_transfer_lab_shipping 매출 라인 생성 금지.
  if (isPtxLabShipping) {
    return;
  }
  const revenueBaseByOwner = resolveRevenueOwnerBaseAllocation({
    spendAmount,
    hasSalesmanReferrer: owners.hasSalesmanReferrer,
    configuredRates: owners.configuredRates,
    owners,
    isShippingSpend: isPtxAbutsShipping,
    applyManufacturerUnit,
    creditSettings,
    qty: manufacturerQty,
    isRemake: Boolean(isRemake) || Boolean(meta?.isRemake),
    remakeSaleAmount:
      meta?.remakeSaleAmount != null ? meta.remakeSaleAmount : undefined,
  });
  const revenueKindSplit = splitRevenueByCreditKindProRata({
    ownerBaseByRole: revenueBaseByOwner,
    freeAmount: freeTotal,
  });

  const manufacturerVatRate = applyManufacturerUnit
    ? Number(revenueBaseByOwner.manufacturerVatRate || 0)
    : 0;
  const affiliateVatRate = normalizeAffiliateVatRate(
    creditSettings?.affiliateVatRate,
  );
  const manufacturerMeta = isPtxAbutsShipping
    ? {
        ...meta,
        displayLabel: SHIPPING_LEDGER_LABELS.abutsToManufacturer,
        displayKind: "shipping",
      }
    : applyManufacturerUnit
      ? {
          ...meta,
          displayLabel: MANUFACTURER_PRODUCTION_LEDGER_LABEL,
          displayKind: "abutment_production",
          abutmentQty: manufacturerQty,
        }
      : meta;

  const push = (
    accountCode,
    ownerRole,
    ownerId,
    paidBase,
    freeBase,
    { vatRate = 0, lineMeta = meta } = {},
  ) => {
    if (!ownerId) return;
    const paid = Math.max(0, Math.round(Number(paidBase || 0)));
    const free = Math.max(0, Math.round(Number(freeBase || 0)));
    let freeRequestPart = 0;
    let freeShippingPart = 0;
    if (free > 0) {
      if (freeSourceTotal <= 0 || freeReq <= 0) {
        freeShippingPart = freeShip > 0 ? free : 0;
        freeRequestPart = freeShip > 0 ? 0 : free;
      } else if (freeShip <= 0) {
        freeRequestPart = free;
      } else {
        freeRequestPart = Math.round((free * freeReq) / freeSourceTotal);
        freeShippingPart = Math.max(0, free - freeRequestPart);
      }
    }

    const allocated = allocateAffiliateVatAcrossSupplyParts(
      [
        { supply: freeRequestPart, creditKind: "FREE_REQUEST" },
        { supply: freeShippingPart, creditKind: "FREE_SHIPPING" },
        { supply: paid, creditKind: "PAID" },
      ],
      vatRate,
    );

    for (const part of allocated) {
      lines.push({
        accountCode,
        ownerRole,
        ownerId,
        amount: part.total,
        amountExcludingVat: part.supply,
        vatAmount: part.vat,
        amountIncludingVat: part.total,
        creditKind: part.creditKind,
        refType,
        refId,
        meta: lineMeta,
      });
    }
  };

  push(
    "REV_MANUFACTURER",
    "manufacturer",
    owners.manufacturerAnchorId,
    revenueKindSplit.manufacturer?.paid,
    revenueKindSplit.manufacturer?.free,
    { vatRate: manufacturerVatRate, lineMeta: manufacturerMeta },
  );
  push(
    "REV_DEVOPS",
    "devops",
    owners.devopsAnchorId,
    revenueKindSplit.devops?.paid,
    revenueKindSplit.devops?.free,
    { vatRate: affiliateVatRate },
  );
  push(
    "REV_SALESMAN",
    "salesman",
    owners.salesmanAnchorId,
    revenueKindSplit.salesman?.paid,
    revenueKindSplit.salesman?.free,
    { vatRate: affiliateVatRate },
  );
  push(
    "REV_ADMIN",
    "admin",
    owners.adminAnchorId,
    revenueKindSplit.admin?.paid,
    revenueKindSplit.admin?.free,
  );
}

/**
 * 기공의뢰 전송 전 치과 유료크레딧 잔액 검사(차감 없음).
 * 자동매칭: 기공비는 별점 고정수가(평균×배수)+어벗츠 어벗으로 검사. 청구도 동일 고정가.
 */
/**
 * 기공의뢰 생성 시 예상 배송비(플랫폼 크레딧).
 * - lab(기공소→치과): 무료 → 항상 0
 * - abuts(기공소→어벗츠): Request 박스키(BA+출고일) hold로 이전 — PTX 건당 보류 없음 → 항상 0
 */
export async function resolveExpectedPracticeTransferShippingFees({
  transfer = null,
  toothWorks = null,
  fees = null,
}) {
  void transfer;
  void toothWorks;
  void fees;
  const creditSettings = await loadCreditSettingsDefaults();
  const unitFee = Math.max(
    0,
    Math.round(Number(creditSettings?.shippingFee ?? 3500) || 0),
  );
  return { lab: 0, abuts: 0, total: 0, unitFee };
}

export async function assertPracticeTransferPaidCreditSufficient({
  practiceAnchorId,
  labAnchorId = null,
  toothWorks,
  remake = false,
  autoMatchBudget = null,
  catalog: catalogInput = null,
  rushFeeMultiplier = 1,
  skipJig = null,
  /** 이미 계산된 견적(fees) — 전달 시 lab/practice/catalog 재조회 생략 */
  fees: feesInput = null,
  /** 이미 계산된 배송비 — 전달 시 shipping 재계산 생략 */
  shipping: shippingInput = null,
  /**
   * snapshot: BusinessCreditBalance 단건(전송 create 사전검사용).
   * ledger: GL 집계(기본, 확정 검증). hold는 항상 ledger로 재검증.
   */
  balanceMode = "ledger",
}) {
  const practiceId = String(practiceAnchorId || "").trim();
  if (!practiceId || !Types.ObjectId.isValid(practiceId)) {
    const err = new Error("치과 사업자 정보가 필요합니다.");
    err.statusCode = 400;
    throw err;
  }

  let fees = feesInput && typeof feesInput === "object" ? feesInput : null;
  let shipping =
    shippingInput && typeof shippingInput === "object" ? shippingInput : null;
  let budget = null;
  const abutmentPricingTier = PLATFORM_ABUTMENT_PRICING_TIER;
  let abutmentPrices = null;

  if (!fees) {
    const labId = String(labAnchorId || "").trim();
    const needLab = labId && Types.ObjectId.isValid(labId);
    const [catalog, lab, practice, prices] = await Promise.all([
      catalogInput != null
        ? Promise.resolve(catalogInput)
        : loadAutoMatchBudgetCatalog(),
      needLab
        ? BusinessAnchor.findById(labId)
            .select({
              labFeeSchedule: 1,
              labPracticeFeeMultipliers: 1,
              labPracticeSpecialSupplyPrices: 1,
              labPracticeSpecialSupplyPendingChange: 1,
            })
            .lean()
        : Promise.resolve(null),
      BusinessAnchor.findById(practiceId)
        .select({ "practiceTransferSettings.implantFavorites": 1 })
        .lean(),
      loadCachedAbutmentCreditPrices(practiceId),
    ]);
    budget = normalizeAutoMatchBudget(autoMatchBudget, catalog);
    abutmentPrices = prices;

    const noLab = !labId;
    const useRemake = Boolean(remake);
    fees = computePracticeTransferRetailFeesWithLabShipping(
      {
        toothWorks,
        implantFavorites: implantFavoritesFromPractice(practice),
        labFeeSchedule: noLab
          ? LAB_FEE_SCHEDULE_ZEROS
          : resolveLabFeeScheduleSourceForPractice(lab, practiceId),
        abutmentPricingTier,
        abutmentPrices,
        remake: useRemake,
        skipAbutmentFees: useRemake,
        labFeeMultiplier: resolveLabPracticeFeeMultiplier(lab, practiceId),
        rushFeeMultiplier: normalizeRushFeeMultiplier(rushFeeMultiplier),
      },
      {
        toothWorks,
        production: {
          skipJig:
            skipJig === false ||
            skipJig === "false" ||
            skipJig === 0 ||
            skipJig === "0" ||
            skipJig === "N"
              ? false
              : skipJig == null
                ? true
                : Boolean(skipJig),
        },
        billing: {},
      },
    );
  } else if (autoMatchBudget != null || catalogInput != null) {
    budget = normalizeAutoMatchBudget(
      autoMatchBudget,
      catalogInput != null ? catalogInput : undefined,
    );
  }

  if (!shipping) {
    shipping = await resolveExpectedPracticeTransferShippingFees({
      transfer: {
        toothWorks,
        production: {
          skipJig:
            skipJig === false ||
            skipJig === "false" ||
            skipJig === 0 ||
            skipJig === "0" ||
            skipJig === "N"
              ? false
              : skipJig == null
                ? true
                : Boolean(skipJig),
        },
        billing: {
          labFeeTotal: fees.labFeeTotal,
          abutmentQty: fees.abutmentQty,
        },
      },
      toothWorks,
      fees,
    });
  }
  const practiceRequired =
    Math.max(0, Math.round(Number(fees.total || 0))) +
    Math.max(0, Math.round(Number(shipping.lab || 0)));
  const abutsShippingRequired = Math.max(
    0,
    Math.round(Number(shipping.abuts || 0)),
  );
  const required = practiceRequired;

  if (practiceRequired <= 0 && abutsShippingRequired <= 0) {
    return {
      ok: true,
      fees,
      shipping,
      paidCredit: null,
      freeCredit: null,
      required: 0,
      abutmentPricingTier,
      abutmentPrices,
    };
  }

  let balance;
  if (practiceRequired > 0 && String(balanceMode || "").trim() === "snapshot") {
    const snap = await BusinessCreditBalance.findOne({
      businessAnchorId: new Types.ObjectId(practiceId),
    })
      .select({
        paidCredit: 1,
        freeRequestCredit: 1,
        freeShippingCredit: 1,
      })
      .lean();
    if (snap) {
      balance = normalizePracticeBalanceBuckets(snap);
    } else {
      // 스냅샷 없으면 GL로 검사. 스킵하면 create 후 hold 실패→전송 삭제·draft만 남음.
      balance = await computeBusinessCreditBalanceFromLedger({
        businessAnchorId: practiceId,
      });
    }
  } else if (practiceRequired > 0) {
    balance = await computeBusinessCreditBalanceFromLedger({
      businessAnchorId: practiceId,
    });
  }

  if (practiceRequired > 0 && balance) {
    const allowOverdraft =
      await practiceAllowsFreeRequestOverdraft(practiceId);
    const split = allocateSpendFromCreditBuckets({
      amount: practiceRequired,
      paidCredit: Number(balance?.paidCredit || 0),
      freeRequestCredit: Number(balance?.freeRequestCredit || 0),
      freeShippingCredit: Number(balance?.freeShippingCredit || 0),
      freeOrder: ["freeRequest", "freeShipping"],
      allowFreeRequestOverdraft: allowOverdraft,
    });
    if (!split.ok) {
      const err = new Error(
        `크레딧이 부족합니다. (잔액 ${(split.available).toLocaleString("ko-KR")}원 / 필요 ${practiceRequired.toLocaleString("ko-KR")}원)`,
      );
      err.statusCode = 402;
      err.payload = {
        reason: "insufficient_credit_for_practice_transfer",
        paidCredit: split.paidCredit,
        freeCredit: split.freeCredit,
        freeRequestCredit: split.freeRequestCredit,
        freeShippingCredit: split.freeShippingCredit,
        available: split.available,
        required: practiceRequired,
        fees,
        shipping,
        autoMatchBudget: budget,
      };
      throw err;
    }
  } else if (practiceRequired > 0 && !balance) {
    return {
      ok: true,
      fees,
      shipping,
      paidCredit: null,
      freeCredit: null,
      required: practiceRequired,
      skippedBalanceCheck: true,
      abutmentPricingTier,
      abutmentPrices,
    };
  }

  // 제조사→기공소 배송비는 주문 기공소 크레딧(데모 무료의뢰 제외 · 실유료/무료만).
  if (abutsShippingRequired > 0) {
    const labId = String(labAnchorId || "").trim();
    if (labId && Types.ObjectId.isValid(labId)) {
      const labBalance = await computeBusinessCreditBalanceFromLedger({
        businessAnchorId: labId,
      });
      const {
        resolveDemoFreeRequestReserveCap,
        excludeDemoFreeRequestFromBalance,
      } = await import("../controllers/businesses/business.demoMode.util.js");
      const demoCap = await resolveDemoFreeRequestReserveCap(labId);
      const spendable = excludeDemoFreeRequestFromBalance(labBalance, demoCap);
      const labSplit = allocateSpendFromCreditBuckets({
        amount: abutsShippingRequired,
        paidCredit: Number(spendable?.paidCredit || 0),
        freeRequestCredit: Number(spendable?.freeRequestCredit || 0),
        freeShippingCredit: Number(spendable?.freeShippingCredit || 0),
        freeOrder: ["freeShipping", "freeRequest"],
      });
      if (!labSplit.ok) {
        const err = new Error(
          `기공소 배송비 크레딧이 부족합니다. (잔액 ${(labSplit.available).toLocaleString("ko-KR")}원 / 필요 ${abutsShippingRequired.toLocaleString("ko-KR")}원)`,
        );
        err.statusCode = 402;
        err.payload = {
          reason: "insufficient_lab_credit_for_abuts_shipping",
          available: labSplit.available,
          required: abutsShippingRequired,
          fees,
          shipping,
        };
        throw err;
      }
    }
  }

  return {
    ok: true,
    fees,
    shipping,
    paidCredit: balance ? Number(balance.paidCredit || 0) : null,
    freeCredit: balance
      ? Number(balance.freeRequestCredit || 0) +
        Number(balance.freeShippingCredit || 0)
      : null,
    required: practiceRequired,
    autoMatchBudget: budget,
    abutmentPricingTier,
    abutmentPrices,
  };
}

/**
 * 기공의뢰: 치과 유료/무료크레딧 1회 차감 + 기공소 기공정산크레딧(LAB_SETTLEMENT_CREDIT)/REV_* 분배.
 * @deprecated 에스크로 전환 후 신규는 hold→adjust→release. 레거시 문서·롤백용으로 유지.
 * 잔액 검사: 전송 생성(`createPracticeTransfer`). 실제 차감: 기공소 의뢰수락(`mark-accepted`).
 */
export async function commitPracticeTransferBilling({
  transfer,
  toothWorks,
  actorUserId,
  session: outerSession = null,
}) {
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  const performingLabId =
    resolvePerformingLabAnchorId(transfer) || transfer?.targetLabAnchorId;
  const feeScheduleLabId =
    resolveFeeScheduleLabAnchorId(transfer) || performingLabId;
  const multiplierLabId =
    resolveLabFeeMultiplierLabAnchorId(transfer) || feeScheduleLabId;
  if (!transferId || !practiceAnchorId || !performingLabId) {
    return { billed: false, reason: "missing_anchors" };
  }

  const idempotencyKey = `practice_transfer:${String(transferId)}:spend`;
  const isAutoMatch =
    String(transfer?.matchingMode || "").trim() === "auto";

  const [
    existing,
    labAnchors,
    practice,
    abutmentPricingTier,
    abutmentPrices,
    partner,
    devopsAnchorForFeeRate,
    revenueOwners,
  ] = await Promise.all([
    getJournalByIdempotencyKey({
      idempotencyKey,
      session: outerSession,
    }),
    loadLabAnchorsForFeeComputation({
      feeScheduleLabId,
      performingLabId,
      multiplierLabId,
      session: outerSession,
    }),
    BusinessAnchor.findById(practiceAnchorId)
      .select({ "practiceTransferSettings.implantFavorites": 1 })
      .session(outerSession || null)
      .lean(),
    Promise.resolve(PLATFORM_ABUTMENT_PRICING_TIER),
    loadCachedAbutmentCreditPrices(practiceAnchorId),
    findLabPracticeRelationship({
      labAnchorId: feeScheduleLabId,
      practiceAnchorId,
    }),
    BusinessAnchor.findOne({
      businessType: "devops",
    })
      .select({ payoutRates: 1 })
      .sort({ createdAt: 1 })
      .lean(),
    resolveRevenueOwners({
      practiceAnchorId,
      session: outerSession,
    }),
  ]);
  if (existing?.journalId) {
    return { billed: false, reason: "already_billed", journalId: existing.journalId };
  }

  const remake = isPracticeTransferRemake(transfer);
  const feeScheduleLab = labAnchors.feeScheduleLab;
  const multiplierLab = labAnchors.multiplierLab || feeScheduleLab;
  // 지정: 생성 시 스냅샷 유지(할증 소급 금지).
  // 할증 앵커: 협력=수행 기공소, 하청·어벗츠 자체=원청. 수행 기공소는 subcontractFeeRate/협력 정산.
  const labFeeMultiplier = resolveBillingLabFeeMultiplier({
    isAutoMatch,
    lab: multiplierLab,
    practiceId: practiceAnchorId,
    createdAt: transfer?.createdAt,
    snapshot: transfer?.billing?.labFeeMultiplier,
  });
  const rushFeeMultiplier = rushFeeMultiplierFromTransfer(transfer);
  const fees = computePracticeTransferRetailFeesWithLabShipping(
    {
      toothWorks,
      implantFavorites: implantFavoritesFromPractice(practice),
      labFeeSchedule: resolveLabFeeScheduleSourceForPracticeTransfer({
        labDoc: feeScheduleLab,
        practiceAnchorId,
        createdAt: transfer?.createdAt,
        specialSupplySnapshot: transfer?.billing?.labPracticeSpecialSupply,
        liveSpecialSupply:
          isAutoMatch &&
          !isLabPracticeSpecialSupplySnapshotCaptured(
            transfer?.billing?.labPracticeSpecialSupply,
          ),
      }),
      abutmentPricingTier,
      abutmentPrices,
      remake,
      skipAbutmentFees: remake,
      labFeeMultiplier,
      rushFeeMultiplier,
    },
    transfer,
  );

  if (fees.total <= 0) {
    return { billed: false, reason: "zero_fee", fees };
  }

  const relationshipKind =
    partner?.status === "active" || partner?.status === "referred"
      ? partner.status
      : "none";
  const isPartner = relationshipKind === "active";

  const feeRateApplied = resolvePracticeTransferFeeRate({
    matchingMode: isAutoMatch ? "auto" : "direct",
    payoutRates: devopsAnchorForFeeRate?.payoutRates,
    subcontracted: isSubcontractFeeApplicable(transfer),
    ...platformFeeArgsFromBilling(transfer?.billing),
  });

  const { abutsRevenueAmount, labSettlementAmount } =
    splitPracticeTransferSettlement({
      labFeeTotal: fees.labFeeTotal,
      abutmentRetailTotal: fees.abutmentRetailTotal,
      feeRateApplied,
    });

  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  if (ownSession) session.startTransaction();

  try {
    await lockGuard(practiceAnchorId, session);
    const balance = await computeBusinessCreditBalanceFromLedger({
      businessAnchorId: practiceAnchorId,
      session,
    });
    const allowOverdraft =
      await practiceAllowsFreeRequestOverdraft(practiceAnchorId);
    const split = allocateSpendFromCreditBuckets({
      amount: fees.total,
      paidCredit: Number(balance?.paidCredit || 0),
      freeRequestCredit: Number(balance?.freeRequestCredit || 0),
      freeShippingCredit: Number(balance?.freeShippingCredit || 0),
      freeOrder: ["freeRequest", "freeShipping"],
      allowFreeRequestOverdraft: allowOverdraft,
    });
    if (!split.ok) {
      const err = new Error("치과 크레딧이 부족합니다.");
      err.statusCode = 402;
      err.payload = {
        reason: "insufficient_credit_for_practice_transfer",
        paidCredit: split.paidCredit,
        freeCredit: split.freeCredit,
        freeRequestCredit: split.freeRequestCredit,
        freeShippingCredit: split.freeShippingCredit,
        available: split.available,
        required: fees.total,
        fees,
      };
      throw err;
    }

    const owners = revenueOwners;

    const spendMetaBase = {
      labFee: fees.labFeeTotal,
      abutmentRetail: fees.abutmentRetailTotal,
      abutmentQty: fees.abutmentQty,
      isTradingPartner: isPartner,
      relationshipKind,
      feeRateApplied,
      displayKind: "lab_fee",
      displayLabel: "기공비",
      usageKind: "practice_transfer",
      fromPaid: split.fromPaid,
      fromFreeRequest: split.fromFreeRequest,
      fromFreeShipping: split.fromFreeShipping,
    };

    const lines = [];
    if (split.fromFreeRequest > 0) {
      lines.push({
        accountCode: "REQ_FREE_REQUEST_CREDIT",
        ownerRole: "requestor",
        ownerId: String(practiceAnchorId),
        amount: -split.fromFreeRequest,
        amountExcludingVat: -split.fromFreeRequest,
        vatAmount: 0,
        creditKind: "FREE_REQUEST",
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: spendMetaBase,
      });
    }
    if (split.fromFreeShipping > 0) {
      lines.push({
        accountCode: "REQ_FREE_SHIPPING_CREDIT",
        ownerRole: "requestor",
        ownerId: String(practiceAnchorId),
        amount: -split.fromFreeShipping,
        amountExcludingVat: -split.fromFreeShipping,
        vatAmount: 0,
        creditKind: "FREE_SHIPPING",
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: spendMetaBase,
      });
    }
    if (split.fromPaid > 0) {
      lines.push({
        accountCode: "REQ_PAID_CREDIT",
        ownerRole: "requestor",
        ownerId: String(practiceAnchorId),
        amount: -split.fromPaid,
        amountExcludingVat: -split.fromPaid,
        vatAmount: 0,
        creditKind: "PAID",
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: spendMetaBase,
      });
    }

    if (labSettlementAmount > 0) {
      lines.push({
        accountCode: "LAB_SETTLEMENT_CREDIT",
        ownerRole: "requestor",
        ownerId: String(labAnchorId),
        amount: labSettlementAmount,
        amountExcludingVat: labSettlementAmount,
        vatAmount: 0,
        creditKind: "SETTLEMENT",
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source: "practice_transfer_settlement",
          isTradingPartner: isPartner,
          relationshipKind,
          feeRateApplied,
          labFee: fees.labFeeTotal,
          abutmentRetailIncluded: 0,
          displayKind: "lab_credit",
          displayLabel: "기공정산크레딧",
          itemLabel: "기공비",
        },
      });
    }

    if (abutsRevenueAmount > 0) {
      // 플랫폼 수수료분도 치과 유료/무료 소진 비중에 맞춰 creditKind를 분해(무료는 지급 제외).
      const freeShareOfPlatformFee =
        fees.total > 0
          ? Math.round((abutsRevenueAmount * split.fromFree) / fees.total)
          : 0;
      const freeReqShareOfPlatformFee =
        split.fromFree > 0
          ? Math.round(
              (freeShareOfPlatformFee * split.fromFreeRequest) / split.fromFree,
            )
          : 0;
      const freeShipShareOfPlatformFee = Math.max(
        0,
        freeShareOfPlatformFee - freeReqShareOfPlatformFee,
      );
      const creditSettings = await loadCreditSettingsDefaults();
      pushRevenueLines({
      isRemake: isPracticeTransferRemake(transfer),
        lines,
        owners,
        spendAmount: abutsRevenueAmount,
        freeAmount: freeShareOfPlatformFee,
        fromFreeRequest: freeReqShareOfPlatformFee,
        fromFreeShipping: freeShipShareOfPlatformFee,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        creditSettings,
        meta: {
          source:
            relationshipKind === "active" || relationshipKind === "referred"
              ? "partner_platform_fee"
              : "non_partner_platform_fee",
          relationshipKind,
          feeRateApplied,
          feeTotal: fees.total,
          abutmentQty: fees.abutmentQty,
          abutmentRetail: fees.abutmentRetailTotal,
        },
      });
    }

    const journal = await postGeneralLedgerJournal({
      idempotencyKey,
      eventType: "PRACTICE_TRANSFER_SPEND_COMMIT",
      businessAnchorId: practiceAnchorId,
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      createdBy: actorUserId,
      meta: {
        labAnchorId: String(labAnchorId),
        labTradingPartnerId: partner?._id ? String(partner._id) : null,
        isTradingPartner: isPartner,
        relationshipKind,
        feeRateApplied,
        fees,
        labSettlementAmount,
        abutsRevenueAmount,
      },
      lines,
      session,
      skipIdempotencyLookup: true,
    });

    // 기공소 기공크레딧(정산 대기) 충전은 단일 저널로 원자성 유지.
    // LAB_SETTLEMENT_CHARGE는 표시용 alias(meta.eventAlias). 치과 유료크레딧 차감과 동일 저널.
    if (ownSession) await session.commitTransaction();

    return {
      billed: true,
      journalId: journal?.journalId || null,
      fees,
      isPartner,
      relationshipKind,
      feeRateApplied,
      labFeeMultiplier,
      labSettlementAmount,
      abutsRevenueAmount,
      labTradingPartnerId: partner?._id ? String(partner._id) : null,
    };
  } catch (e) {
    if (ownSession) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    throw e;
  } finally {
    if (ownSession) session.endSession();
  }
}

function buildPracticeDebitLines({
  split,
  practiceAnchorId,
  transferId,
  meta,
}) {
  const lines = [];
  if (split.fromFreeRequest > 0) {
    lines.push({
      accountCode: "REQ_FREE_REQUEST_CREDIT",
      ownerRole: "requestor",
      ownerId: String(practiceAnchorId),
      amount: -split.fromFreeRequest,
      amountExcludingVat: -split.fromFreeRequest,
      vatAmount: 0,
      creditKind: "FREE_REQUEST",
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      meta,
    });
  }
  if (split.fromFreeShipping > 0) {
    lines.push({
      accountCode: "REQ_FREE_SHIPPING_CREDIT",
      ownerRole: "requestor",
      ownerId: String(practiceAnchorId),
      amount: -split.fromFreeShipping,
      amountExcludingVat: -split.fromFreeShipping,
      vatAmount: 0,
      creditKind: "FREE_SHIPPING",
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      meta,
    });
  }
  if (split.fromPaid > 0) {
    lines.push({
      accountCode: "REQ_PAID_CREDIT",
      ownerRole: "requestor",
      ownerId: String(practiceAnchorId),
      amount: -split.fromPaid,
      amountExcludingVat: -split.fromPaid,
      vatAmount: 0,
      creditKind: "PAID",
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      meta,
    });
  }
  return lines;
}

function buildPracticeCreditLinesFromReturn({
  fromPaid,
  fromFreeRequest,
  fromFreeShipping,
  practiceAnchorId,
  transferId,
  meta,
}) {
  const lines = [];
  if (fromFreeRequest > 0) {
    lines.push({
      accountCode: "REQ_FREE_REQUEST_CREDIT",
      ownerRole: "requestor",
      ownerId: String(practiceAnchorId),
      amount: fromFreeRequest,
      amountExcludingVat: fromFreeRequest,
      vatAmount: 0,
      creditKind: "FREE_REQUEST",
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      meta,
    });
  }
  if (fromFreeShipping > 0) {
    lines.push({
      accountCode: "REQ_FREE_SHIPPING_CREDIT",
      ownerRole: "requestor",
      ownerId: String(practiceAnchorId),
      amount: fromFreeShipping,
      amountExcludingVat: fromFreeShipping,
      vatAmount: 0,
      creditKind: "FREE_SHIPPING",
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      meta,
    });
  }
  if (fromPaid > 0) {
    lines.push({
      accountCode: "REQ_PAID_CREDIT",
      ownerRole: "requestor",
      ownerId: String(practiceAnchorId),
      amount: fromPaid,
      amountExcludingVat: fromPaid,
      vatAmount: 0,
      creditKind: "PAID",
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      meta,
    });
  }
  return lines;
}

/** 보류 환급 시 유료→배송무료→의뢰무료 순으로 원복 */
function allocateHoldReturn({
  amount,
  fromPaid = 0,
  fromFreeRequest = 0,
  fromFreeShipping = 0,
}) {
  let remaining = Math.max(0, Math.round(Number(amount || 0)));
  const retPaid = Math.min(Math.max(0, Math.round(fromPaid)), remaining);
  remaining -= retPaid;
  const retShip = Math.min(Math.max(0, Math.round(fromFreeShipping)), remaining);
  remaining -= retShip;
  const retReq = Math.min(Math.max(0, Math.round(fromFreeRequest)), remaining);
  remaining -= retReq;
  return {
    fromPaid: retPaid,
    fromFreeShipping: retShip,
    fromFreeRequest: retReq,
    returned: retPaid + retShip + retReq,
    shortfall: Math.max(0, remaining),
  };
}

let _cachedDevopsEscrowOwnerId = null;
async function resolveDevopsEscrowOwnerId(session = null) {
  // devops 앵커는 프로세스 수명 동안 불변. 세션 없는 조회는 메모리 캐시.
  if (!session && _cachedDevopsEscrowOwnerId) {
    return _cachedDevopsEscrowOwnerId;
  }
  const devops = await BusinessAnchor.findOne({ businessType: "devops" })
    .select({ _id: 1 })
    .sort({ createdAt: 1 })
    .session(session || null)
    .lean();
  const id = devops?._id ? String(devops._id) : null;
  if (!session && id) _cachedDevopsEscrowOwnerId = id;
  return id;
}

function practiceTransferHoldKey(transferId) {
  return `practice_transfer:${String(transferId)}:hold`;
}
function practiceTransferHoldLabKey(transferId) {
  return `practice_transfer:${String(transferId)}:hold_lab`;
}
function practiceTransferHoldAbutmentKey(transferId) {
  return `practice_transfer:${String(transferId)}:hold_abutment`;
}
function practiceTransferHoldLabShippingKey(transferId) {
  return `practice_transfer:${String(transferId)}:hold:lab_shipping`;
}
function practiceTransferHoldAbutsShippingKey(transferId) {
  return `practice_transfer:${String(transferId)}:hold:abuts_shipping`;
}
function practiceTransferHoldAdjustKey(transferId) {
  return `practice_transfer:${String(transferId)}:hold_adjust`;
}
function practiceTransferFollowUpHoldKey(transferId, followUpIndex) {
  return `practice_transfer:${String(transferId)}:follow_up_hold:${Math.max(
    0,
    Math.floor(Number(followUpIndex) || 0),
  )}`;
}
function practiceTransferFollowUpReleaseKey(transferId, followUpIndex) {
  return `practice_transfer:${String(transferId)}:follow_up_release:${Math.max(
    0,
    Math.floor(Number(followUpIndex) || 0),
  )}`;
}
function practiceTransferFollowUpPlatformFeeKey(transferId, followUpIndex) {
  return `practice_transfer:${String(transferId)}:follow_up_lab_platform_fee:${Math.max(
    0,
    Math.floor(Number(followUpIndex) || 0),
  )}`;
}
function practiceTransferRemakeChargeHoldKey(transferId, chargeIndex) {
  return `practice_transfer:${String(transferId)}:remake_charge_hold:${Math.max(
    0,
    Math.floor(Number(chargeIndex) || 0),
  )}`;
}
function practiceTransferRemakeChargeReleaseKey(transferId, chargeIndex) {
  return `practice_transfer:${String(transferId)}:remake_charge_release:${Math.max(
    0,
    Math.floor(Number(chargeIndex) || 0),
  )}`;
}
function practiceTransferRemakeChargePlatformFeeKey(transferId, chargeIndex) {
  return `practice_transfer:${String(transferId)}:remake_charge_lab_platform_fee:${Math.max(
    0,
    Math.floor(Number(chargeIndex) || 0),
  )}`;
}
function practiceTransferEscrowReleaseKey(transferId) {
  return `practice_transfer:${String(transferId)}:escrow_release`;
}
function practiceTransferEscrowReleaseLabKey(transferId) {
  return `practice_transfer:${String(transferId)}:escrow_release_lab`;
}
function practiceTransferEscrowReleaseAbutmentKey(transferId) {
  return `practice_transfer:${String(transferId)}:escrow_release_abutment`;
}
function practiceTransferLabPlatformFeeKey(transferId) {
  return `practice_transfer:${String(transferId)}:lab_platform_fee`;
}
function practiceTransferLegacySpendKey(transferId) {
  return `practice_transfer:${String(transferId)}:spend`;
}
function practiceTransferLabShippingKey(transferId) {
  return `gl:practice_transfer:${String(transferId)}:lab_shipping`;
}
function practiceTransferAbutsShippingKey(transferId) {
  return `gl:practice_transfer:${String(transferId)}:abuts_shipping`;
}

/** 취소·롤백 시 물리 삭제 대상 PTX GL eventType(+과거 REFUND 쌍) */
const PRACTICE_TRANSFER_ROLLBACK_EVENT_TYPES = [
  "PRACTICE_TRANSFER_ESCROW_RELEASE",
  "PRACTICE_TRANSFER_LAB_PLATFORM_FEE",
  "PRACTICE_TRANSFER_HOLD_ADJUST",
  "PRACTICE_TRANSFER_SPEND_HOLD",
  "PRACTICE_TRANSFER_SPEND_COMMIT",
  "SHIPPING_SPEND_COMMIT",
  "ADJUST",
  "REFUND",
];

const PRACTICE_TRANSFER_BALANCE_ACCOUNT_CODES = new Set([
  "REQ_PAID_CREDIT",
  "REQ_FREE_REQUEST_CREDIT",
  "REQ_FREE_SHIPPING_CREDIT",
  "LAB_SETTLEMENT_CREDIT",
]);

function abutmentDesignFeeBaseKey(requestId) {
  return `gl:request:${String(requestId)}:abutment_design_fee`;
}

/**
 * 원본 키가 환불(REFUND)됐으면 `:after:<refundJournalId>`로 다음 게시 키를 고른다.
 * 활성(미환불) 저널이 있으면 existing에 담아 already_* 판별에 쓴다.
 */
async function resolveLiveIdempotencyKey(baseKey, session = null) {
  const base = String(baseKey || "").trim();
  if (!base) return { key: "", existing: null };
  let key = base;
  for (let i = 0; i < 20; i += 1) {
    const existing = await getJournalByIdempotencyKey({
      idempotencyKey: key,
      session,
    });
    if (!existing?.journalId) {
      return { key, existing: null };
    }
    const refund = await getJournalByIdempotencyKey({
      idempotencyKey: refundIdempotencyKeyFor(
        String(existing.idempotencyKey || key),
      ),
      session,
    });
    if (!refund?.journalId) {
      return { key, existing };
    }
    key = `${base}:after:${refund.journalId}`;
  }
  return { key: `${base}:after:${Date.now()}`, existing: null };
}

async function resolveAbutmentDesignFeeGrantKey(requestId, session = null) {
  const { key, existing } = await resolveLiveIdempotencyKey(
    abutmentDesignFeeBaseKey(requestId),
    session,
  );
  return { idempotencyKey: key, existing };
}

async function findActiveAbutmentDesignFeeJournal(requestId, session = null) {
  const { existing } = await resolveAbutmentDesignFeeGrantKey(requestId, session);
  return existing;
}

async function isJournalRefunded(journal, session = null) {
  if (!journal?.journalId) return false;
  const refund = await getJournalByIdempotencyKey({
    idempotencyKey: refundIdempotencyKeyFor(
      String(journal.idempotencyKey || ""),
    ),
    session,
  });
  return Boolean(refund?.journalId);
}

async function findAnyPracticeTransferHoldJournal(transferId, session = null) {
  const id = String(transferId || "").trim();
  const [legacyRaw, labRaw, abutRaw] = await Promise.all([
    getJournalByIdempotencyKey({
      idempotencyKey: practiceTransferHoldKey(id),
      session,
    }),
    getJournalByIdempotencyKey({
      idempotencyKey: practiceTransferHoldLabKey(id),
      session,
    }),
    getJournalByIdempotencyKey({
      idempotencyKey: practiceTransferHoldAbutmentKey(id),
      session,
    }),
  ]);
  // 환불된 HOLD는 미존재로 취급(재보류 허용). `:after:` 체인은 resolveLive로 별도.
  const [legacy, lab, abut] = await Promise.all([
    (async () =>
      legacyRaw?.journalId && !(await isJournalRefunded(legacyRaw, session))
        ? legacyRaw
        : null)(),
    (async () =>
      labRaw?.journalId && !(await isJournalRefunded(labRaw, session))
        ? labRaw
        : null)(),
    (async () =>
      abutRaw?.journalId && !(await isJournalRefunded(abutRaw, session))
        ? abutRaw
        : null)(),
  ]);

  // 기본 키 환불 후 재보류된 활성 저널
  if (!legacy && !lab && !abut) {
    const [liveLegacy, liveLab, liveAbut] = await Promise.all([
      resolveLiveIdempotencyKey(practiceTransferHoldKey(id), session),
      resolveLiveIdempotencyKey(practiceTransferHoldLabKey(id), session),
      resolveLiveIdempotencyKey(practiceTransferHoldAbutmentKey(id), session),
    ]);
    const l = liveLegacy.existing;
    const a = liveLab.existing;
    const b = liveAbut.existing;
    return {
      legacy: l,
      lab: a,
      abutment: b,
      any: Boolean(l?.journalId || a?.journalId || b?.journalId),
    };
  }

  return {
    legacy: legacy?.journalId ? legacy : null,
    lab: lab?.journalId ? lab : null,
    abutment: abut?.journalId ? abut : null,
    any: Boolean(legacy?.journalId || lab?.journalId || abut?.journalId),
  };
}

async function resolveHoldShareAmounts({
  transfer,
  toothWorks,
  holdAmount = null,
  holdLabAmount = null,
  holdAbutmentAmount = null,
}) {
  let lab =
    holdLabAmount != null
      ? Math.max(0, Math.round(Number(holdLabAmount) || 0))
      : null;
  let abut =
    holdAbutmentAmount != null
      ? Math.max(0, Math.round(Number(holdAbutmentAmount) || 0))
      : null;
  let abutmentQty = Math.max(
    0,
    Math.round(Number(transfer?.billing?.abutmentQty || 0)),
  );
  // 치과 멤버십 폐지 — 청구 분해는 항상 플랫폼 고시(membership*).
  const pricingTier = PLATFORM_ABUTMENT_PRICING_TIER;
  let abutmentPrices = null;
  let designFeePerTooth = null;

  if (lab == null) {
    const fromBilling = transfer?.billing?.labFeeTotal;
    if (fromBilling != null && Number.isFinite(Number(fromBilling))) {
      lab = Math.max(0, Math.round(Number(fromBilling) || 0));
    }
  }
  if (abut == null) {
    const fromBilling = transfer?.billing?.abutmentRetailTotal;
    if (fromBilling != null && Number.isFinite(Number(fromBilling))) {
      abut = Math.max(0, Math.round(Number(fromBilling) || 0));
    }
  }

  // lab/abut이 billing·인자로 있으면 견적/잔액 재조회 금지(전송 create 핫패스).
  // abutmentPrices는 아래 캐시 로드로 충분 — !abutmentPrices로 assert를 타면 안 됨.
  if (lab == null || abut == null) {
    const check = await assertPracticeTransferPaidCreditSufficient({
      practiceAnchorId: transfer?.practiceBusinessAnchorId,
      labAnchorId: transfer?.targetLabAnchorId || null,
      toothWorks: toothWorks || transfer?.toothWorks || [],
      remake: isPracticeTransferRemake(transfer),
      autoMatchBudget: transfer?.billing?.autoMatchBudget || null,
    });
    if (lab == null) {
      lab = Math.max(0, Math.round(Number(check?.fees?.labFeeTotal || 0)));
    }
    if (abut == null) {
      abut = Math.max(
        0,
        Math.round(Number(check?.fees?.abutmentRetailTotal || 0)),
      );
    }
    if (abutmentQty <= 0) {
      abutmentQty = Math.max(
        0,
        Math.round(Number(check?.fees?.abutmentQty || 0)),
      );
    }
    if (check?.abutmentPrices) {
      abutmentPrices = check.abutmentPrices;
    }
  }

  const [cachedPrices, creditSettings] = await Promise.all([
    abutmentPrices
      ? Promise.resolve(abutmentPrices)
      : loadCachedAbutmentCreditPrices(transfer?.practiceBusinessAnchorId),
    loadCreditSettingsDefaults().catch(() => null),
  ]);
  if (!abutmentPrices) abutmentPrices = cachedPrices;
  designFeePerTooth = Math.max(
    0,
    Math.round(
      Number(creditSettings?.abutmentDesignLabFee ?? 10000) || 0,
    ),
  );

  // 디자인+생산가 → 생산(어벗츠 경로) / 디자인(기공소 경로) 분해
  const routeSplit = splitAbutmentRetailForRouteHolds({
    abutmentRetailTotal: abut || 0,
    abutmentQty,
    pricingTier,
    prices: abutmentPrices,
    designFeePerTooth,
    rushFeeMultiplier: rushFeeMultiplierFromTransfer(transfer),
  });
  lab = Math.max(0, Math.round(Number(lab || 0))) + routeSplit.designFeeTotal;
  abut = routeSplit.productionTotal;

  let total = lab + abut;
  const forcedTotal =
    holdAmount != null ? Math.max(0, Math.round(Number(holdAmount) || 0)) : null;
  if (forcedTotal != null && forcedTotal > 0 && total <= 0) {
    lab = forcedTotal;
    abut = 0;
    total = forcedTotal;
  } else if (forcedTotal != null && forcedTotal > 0 && total !== forcedTotal) {
    // billing 분할을 우선. total은 합.
    total = lab + abut;
  }

  return {
    lab,
    abut,
    total,
    designFeeTotal: routeSplit.designFeeTotal,
    productionTotal: routeSplit.productionTotal,
  };
}

/**
 * hold 슬라이스 1건을 메모리에서 준비(DB 없음). bucket 잔액을 갱신한 결과를 반환.
 */
function prepareHoldSliceEntry({
  transferId,
  practiceAnchorId,
  devopsAnchorId,
  amount,
  shareKind,
  displayLabel,
  split,
  actorUserId,
  freeOrder = ["freeRequest", "freeShipping"],
  allowFreeRequestOverdraft = false,
}) {
  const amt = Math.max(0, Math.round(Number(amount) || 0));
  if (amt <= 0) {
    return {
      prepared: false,
      entry: null,
      fromPaid: 0,
      fromFreeRequest: 0,
      fromFreeShipping: 0,
      remainingPaid: Number(split.remainingPaid ?? split.paidCredit ?? 0),
      remainingFreeRequest: Number(
        split.remainingFreeRequest ?? split.freeRequestCredit ?? 0,
      ),
      remainingFreeShipping: Number(
        split.remainingFreeShipping ?? split.freeShippingCredit ?? 0,
      ),
    };
  }

  const sliceSplit = allocateSpendFromCreditBuckets({
    amount: amt,
    paidCredit: Number(split.remainingPaid ?? split.paidCredit ?? 0),
    freeRequestCredit: Number(
      split.remainingFreeRequest ?? split.freeRequestCredit ?? 0,
    ),
    freeShippingCredit: Number(
      split.remainingFreeShipping ?? split.freeShippingCredit ?? 0,
    ),
    freeOrder,
    allowFreeRequestOverdraft,
  });
  if (!sliceSplit.ok) {
    const payerLabel =
      shareKind === "abuts_shipping" ? "기공소" : "치과";
    const err = new Error(`${payerLabel} 크레딧이 부족합니다.`);
    err.statusCode = 402;
    err.payload = {
      reason: "insufficient_credit_for_practice_transfer",
      available: sliceSplit.available,
      required: amt,
      shareKind,
    };
    throw err;
  }

  const isShippingHold =
    shareKind === "lab_shipping" || shareKind === "abuts_shipping";
  const spendMetaBase = {
    displayKind: isShippingHold ? "shipping_hold" : "lab_fee_hold",
    displayLabel,
    usageKind: isShippingHold
      ? shareKind === "lab_shipping"
        ? "practice_transfer_lab_shipping"
        : "practice_transfer_abuts_shipping"
      : "practice_transfer",
    escrow: true,
    holdShare: shareKind,
    fromPaid: sliceSplit.fromPaid,
    fromFreeRequest: sliceSplit.fromFreeRequest,
    fromFreeShipping: sliceSplit.fromFreeShipping,
  };

  const idempotencyKey =
    shareKind === "abutment"
      ? practiceTransferHoldAbutmentKey(transferId)
      : shareKind === "lab_shipping"
        ? practiceTransferHoldLabShippingKey(transferId)
        : shareKind === "abuts_shipping"
          ? practiceTransferHoldAbutsShippingKey(transferId)
          : practiceTransferHoldLabKey(transferId);

  const nextFreeRequest =
    Number(split.remainingFreeRequest ?? split.freeRequestCredit ?? 0) -
    sliceSplit.fromFreeRequest;

  return {
    prepared: true,
    entry: {
      idempotencyKey,
      eventType: "PRACTICE_TRANSFER_SPEND_HOLD",
      businessAnchorId: practiceAnchorId,
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      createdBy: actorUserId,
      meta: {
        heldTotal: amt,
        holdShare: shareKind,
        fromPaid: sliceSplit.fromPaid,
        fromFreeRequest: sliceSplit.fromFreeRequest,
        fromFreeShipping: sliceSplit.fromFreeShipping,
        devopsAnchorId,
      },
      lines: [
        ...buildPracticeDebitLines({
          split: sliceSplit,
          practiceAnchorId,
          transferId,
          meta: spendMetaBase,
        }),
        {
          accountCode: "PLATFORM_ESCROW",
          ownerRole: "devops",
          ownerId: devopsAnchorId,
          amount: amt,
          amountExcludingVat: amt,
          vatAmount: 0,
          creditKind: null,
          refType: "PRACTICE_TRANSFER",
          refId: transferId,
          meta: {
            ...spendMetaBase,
            source: "practice_transfer_escrow_hold",
          },
        },
      ],
    },
    fromPaid: sliceSplit.fromPaid,
    fromFreeRequest: sliceSplit.fromFreeRequest,
    fromFreeShipping: sliceSplit.fromFreeShipping,
    remainingPaid: Math.max(
      0,
      Number(split.remainingPaid ?? split.paidCredit ?? 0) - sliceSplit.fromPaid,
    ),
    remainingFreeRequest: allowFreeRequestOverdraft
      ? nextFreeRequest
      : Math.max(0, nextFreeRequest),
    remainingFreeShipping: Math.max(
      0,
      Number(split.remainingFreeShipping ?? split.freeShippingCredit ?? 0) -
        sliceSplit.fromFreeShipping,
    ),
  };
}

async function postOneHoldSlice(args) {
  const prepared = prepareHoldSliceEntry(args);
  if (!prepared.prepared) {
    return {
      posted: false,
      journalId: null,
      fromPaid: 0,
      fromFreeRequest: 0,
      fromFreeShipping: 0,
      remainingPaid: prepared.remainingPaid,
      remainingFreeRequest: prepared.remainingFreeRequest,
      remainingFreeShipping: prepared.remainingFreeShipping,
    };
  }
  const journal = await postGeneralLedgerJournal({
    ...prepared.entry,
    session: args.session,
    skipIdempotencyLookup: true,
  });
  return {
    posted: true,
    journalId: journal?.journalId || null,
    fromPaid: prepared.fromPaid,
    fromFreeRequest: prepared.fromFreeRequest,
    fromFreeShipping: prepared.fromFreeShipping,
    remainingPaid: prepared.remainingPaid,
    remainingFreeRequest: prepared.remainingFreeRequest,
    remainingFreeShipping: prepared.remainingFreeShipping,
  };
}

/**
 * 전송 생성 시 치과 크레딧을 PLATFORM_ESCROW로 보류(기공 적립 없음).
 * 기공소몫·어벗츠몫을 별도 SPEND_HOLD 저널로 기재.
 */
export async function holdPracticeTransferCredits({
  transfer,
  toothWorks = null,
  holdAmount = null,
  holdLabAmount = null,
  holdAbutmentAmount = null,
  actorUserId = null,
  session: outerSession = null,
  shipping: shippingInput = null,
  /** 방금 create한 전송 등, 기존 hold 저널이 없음이 확실한 경우 조회 스킵 */
  skipExistingHoldCheck = false,
}) {
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  if (!transferId || !practiceAnchorId) {
    return { held: false, reason: "missing_anchors" };
  }

  if (!skipExistingHoldCheck) {
    const existingHolds = await findAnyPracticeTransferHoldJournal(
      transferId,
      outerSession,
    );
    if (existingHolds.any) {
      const heldTotal = Math.max(
        0,
        Math.round(
          Number(
            transfer?.billing?.heldTotal ||
              (Number(existingHolds.lab?.meta?.heldTotal || 0) +
                Number(existingHolds.abutment?.meta?.heldTotal || 0) +
                Number(existingHolds.legacy?.meta?.heldTotal || 0)),
          ),
        ),
      );
      return {
        held: false,
        reason: "already_held",
        journalId:
          existingHolds.lab?.journalId ||
          existingHolds.abutment?.journalId ||
          existingHolds.legacy?.journalId ||
          null,
        heldTotal,
        heldLabTotal: Math.max(
          0,
          Math.round(
            Number(
              transfer?.billing?.heldLabTotal ??
                existingHolds.lab?.meta?.heldTotal ??
                0,
            ),
          ),
        ),
        heldAbutmentTotal: Math.max(
          0,
          Math.round(
            Number(
              transfer?.billing?.heldAbutmentTotal ??
                existingHolds.abutment?.meta?.heldTotal ??
                0,
            ),
          ),
        ),
      };
    }
  }

  const shares = await resolveHoldShareAmounts({
    transfer,
    toothWorks,
    holdAmount,
    holdLabAmount,
    holdAbutmentAmount,
  });
  // 배송 판별은 billing 스냅샷 우선(shares.lab에 디자인비가 합쳐질 수 있음)
  const shippingFeesForGate = {
    labFeeTotal: Math.max(
      0,
      Math.round(Number(transfer?.billing?.labFeeTotal ?? shares.lab ?? 0) || 0),
    ),
    labAbutmentTotal: Math.max(
      0,
      Math.round(Number(transfer?.billing?.labAbutmentTotal ?? 0) || 0),
    ),
    abutmentQty: Math.max(
      0,
      Math.round(Number(transfer?.billing?.abutmentQty ?? 0) || 0),
    ),
  };
  const shippingResolved =
    shippingInput && typeof shippingInput === "object"
      ? {
          lab: Math.max(0, Math.round(Number(shippingInput.lab || 0))),
          abuts: Math.max(0, Math.round(Number(shippingInput.abuts || 0))),
          total: Math.max(
            0,
            Math.round(
              Number(
                shippingInput.total ??
                  Number(shippingInput.lab || 0) + Number(shippingInput.abuts || 0),
              ),
            ),
          ),
        }
      : await resolveExpectedPracticeTransferShippingFees({
          transfer,
          toothWorks,
          fees: shippingFeesForGate,
        });
  const heldShippingLab = 0; // 기공소→치과 배송 무료
  // 기공소→어벗츠는 Request 박스키 hold SSOT. PTX 건당 보류 금지(치과에 떠넘김 방지).
  const heldShippingAbuts = 0;
  void shippingResolved;
  const required = shares.total;
  if (required <= 0 && heldShippingAbuts <= 0) {
    return {
      held: false,
      reason: "zero_fee",
      heldTotal: 0,
      heldLabTotal: 0,
      heldAbutmentTotal: 0,
      heldShippingLabTotal: 0,
      heldShippingAbutsTotal: 0,
    };
  }

  const ownSession = !outerSession;
  // devops 앵커는 불변 — txn 밖 캐시 조회로 세션 findOne 제거.
  const devopsAnchorId = await resolveDevopsEscrowOwnerId(null);
  if (!devopsAnchorId) {
    const err = new Error("에스크로(devops) 사업자를 찾을 수 없습니다.");
    err.statusCode = 500;
    throw err;
  }

  const session = outerSession || (await mongoose.startSession());
  if (ownSession) session.startTransaction();

  try {
    await lockGuard(practiceAnchorId, session);
    // txn 안 LedgerLine aggregate는 Atlas에서 수 초. 스냅샷 단건을 우선하고 없을 때만 GL.
    const practiceOid = new Types.ObjectId(String(practiceAnchorId));
    const snap = await BusinessCreditBalance.findOne({
      businessAnchorId: practiceOid,
    })
      .select({
        paidCredit: 1,
        freeRequestCredit: 1,
        freeShippingCredit: 1,
      })
      .session(session)
      .lean();
    let balance;
    if (snap) {
      balance = normalizePracticeBalanceBuckets(snap);
    } else {
      balance = await computeBusinessCreditBalanceFromLedger({
        businessAnchorId: practiceAnchorId,
        session,
      });
    }

    const allowOverdraft =
      await practiceAllowsFreeRequestOverdraft(practiceAnchorId);
    const totalSplit = allocateSpendFromCreditBuckets({
      amount: required,
      paidCredit: Number(balance?.paidCredit || 0),
      freeRequestCredit: Number(balance?.freeRequestCredit || 0),
      freeShippingCredit: Number(balance?.freeShippingCredit || 0),
      freeOrder: ["freeRequest", "freeShipping"],
      allowFreeRequestOverdraft: allowOverdraft,
    });
    if (!totalSplit.ok) {
      const err = new Error(
        `크레딧이 부족합니다. (잔액 ${(totalSplit.available).toLocaleString("ko-KR")}원 / 필요 ${required.toLocaleString("ko-KR")}원)`,
      );
      err.statusCode = 402;
      err.payload = {
        reason: "insufficient_credit_for_practice_transfer",
        paidCredit: totalSplit.paidCredit,
        freeCredit: totalSplit.freeCredit,
        freeRequestCredit: totalSplit.freeRequestCredit,
        freeShippingCredit: totalSplit.freeShippingCredit,
        available: totalSplit.available,
        required,
      };
      throw err;
    }

    let bucket = {
      remainingPaid: Number(balance?.paidCredit || 0),
      remainingFreeRequest: Number(balance?.freeRequestCredit || 0),
      remainingFreeShipping: Number(balance?.freeShippingCredit || 0),
    };

    let fromPaid = 0;
    let fromFreeRequest = 0;
    let fromFreeShipping = 0;
    const pendingEntries = [];

    const sliceSpecs = [
      {
        amount: shares.lab,
        shareKind: "lab",
        displayLabel: PRACTICE_TRANSFER_LEDGER_LABELS.holdLab,
      },
      {
        amount: shares.abut,
        shareKind: "abutment",
        displayLabel: PRACTICE_TRANSFER_LEDGER_LABELS.holdAbutment,
      },
    ];

    for (const spec of sliceSpecs) {
      const prepared = prepareHoldSliceEntry({
        transferId,
        practiceAnchorId,
        devopsAnchorId,
        amount: spec.amount,
        shareKind: spec.shareKind,
        displayLabel: spec.displayLabel,
        split: bucket,
        actorUserId,
        freeOrder: spec.freeOrder || ["freeRequest", "freeShipping"],
        allowFreeRequestOverdraft: allowOverdraft,
      });
      if (!prepared.prepared) continue;
      pendingEntries.push(prepared.entry);
      fromPaid += prepared.fromPaid;
      fromFreeRequest += prepared.fromFreeRequest;
      fromFreeShipping += prepared.fromFreeShipping;
      bucket = {
        remainingPaid: prepared.remainingPaid,
        remainingFreeRequest: prepared.remainingFreeRequest,
        remainingFreeShipping: prepared.remainingFreeShipping,
      };
    }

    for (const entry of pendingEntries) {
      const base = String(entry?.idempotencyKey || "").trim();
      if (!base) continue;
      const { key } = await resolveLiveIdempotencyKey(base, session);
      entry.idempotencyKey = key;
    }

    // 제조사→기공소 배송비 보류는 주문 기공소 크레딧.
    const labAnchorId = String(
      resolvePerformingLabAnchorId(transfer) ||
        transfer?.targetLabAnchorId ||
        "",
    ).trim();
    let labShippingFromPaid = 0;
    let labShippingFromFreeRequest = 0;
    let labShippingFromFreeShipping = 0;
    if (
      heldShippingAbuts > 0 &&
      labAnchorId &&
      Types.ObjectId.isValid(labAnchorId)
    ) {
      await lockGuard(labAnchorId, session);
      const labOid = new Types.ObjectId(labAnchorId);
      const labSnap = await BusinessCreditBalance.findOne({
        businessAnchorId: labOid,
      })
        .select({
          paidCredit: 1,
          freeRequestCredit: 1,
          freeShippingCredit: 1,
        })
        .session(session)
        .lean();
      let labBalance = labSnap;
      if (!labBalance) {
        labBalance = await computeBusinessCreditBalanceFromLedger({
          businessAnchorId: labAnchorId,
          session,
        });
      }
      const labPrepared = prepareHoldSliceEntry({
        transferId,
        practiceAnchorId: labAnchorId,
        devopsAnchorId,
        amount: heldShippingAbuts,
        shareKind: "abuts_shipping",
        displayLabel: PRACTICE_TRANSFER_LEDGER_LABELS.holdShippingAbutment,
        split: {
          remainingPaid: Number(labBalance?.paidCredit || 0),
          remainingFreeRequest: Number(labBalance?.freeRequestCredit || 0),
          remainingFreeShipping: Number(labBalance?.freeShippingCredit || 0),
        },
        actorUserId,
        freeOrder: ["freeShipping", "freeRequest"],
      });
      if (labPrepared.prepared) {
        const { key: liveLabShipKey } = await resolveLiveIdempotencyKey(
          String(labPrepared.entry?.idempotencyKey || ""),
          session,
        );
        if (labPrepared.entry) labPrepared.entry.idempotencyKey = liveLabShipKey;
        pendingEntries.push(labPrepared.entry);
        labShippingFromPaid = labPrepared.fromPaid;
        labShippingFromFreeRequest = labPrepared.fromFreeRequest;
        labShippingFromFreeShipping = labPrepared.fromFreeShipping;
        if (
          labShippingFromPaid ||
          labShippingFromFreeRequest ||
          labShippingFromFreeShipping
        ) {
          const labInc = await BusinessCreditBalance.updateOne(
            { businessAnchorId: labOid },
            {
              $inc: {
                paidCredit: -labShippingFromPaid,
                freeRequestCredit: -labShippingFromFreeRequest,
                freeShippingCredit: -labShippingFromFreeShipping,
              },
            },
            { session },
          );
          if (!labInc?.matchedCount) {
            await BusinessCreditBalance.updateOne(
              { businessAnchorId: labOid },
              {
                $set: {
                  paidCredit: Math.max(
                    0,
                    Number(labBalance?.paidCredit || 0) - labShippingFromPaid,
                  ),
                  freeRequestCredit: Math.max(
                    0,
                    Number(labBalance?.freeRequestCredit || 0) -
                      labShippingFromFreeRequest,
                  ),
                  freeShippingCredit: Math.max(
                    0,
                    Number(labBalance?.freeShippingCredit || 0) -
                      labShippingFromFreeShipping,
                  ),
                },
                $setOnInsert: {
                  businessAnchorId: labOid,
                  version: 0,
                },
              },
              { upsert: true, session },
            );
          }
        }
      }
    }

    const posted =
      pendingEntries.length > 0
        ? await postGeneralLedgerJournals({
            entries: pendingEntries,
            session,
          })
        : [];
    const journalIds = posted
      .map((row) => row?.journalId)
      .filter(Boolean);

    // 스냅샷을 hold 차감에 맞춰 갱신(다음 hold가 다시 GL aggregate 하지 않게).
    if (fromPaid || fromFreeRequest || fromFreeShipping) {
      const incResult = await BusinessCreditBalance.updateOne(
        { businessAnchorId: practiceOid },
        {
          $inc: {
            paidCredit: -fromPaid,
            freeRequestCredit: -fromFreeRequest,
            freeShippingCredit: -fromFreeShipping,
          },
        },
        { session },
      );
      if (!incResult?.matchedCount) {
        await BusinessCreditBalance.updateOne(
          { businessAnchorId: practiceOid },
          {
            $set: {
              paidCredit: Math.max(
                0,
                Number(balance?.paidCredit || 0) - fromPaid,
              ),
              // 데모 overdraft 시 음수 허용
              freeRequestCredit:
                Number(balance?.freeRequestCredit || 0) - fromFreeRequest,
              freeShippingCredit: Math.max(
                0,
                Number(balance?.freeShippingCredit || 0) - fromFreeShipping,
              ),
            },
            $setOnInsert: {
              businessAnchorId: practiceOid,
              version: 0,
            },
          },
          { upsert: true, session },
        );
      }
    }

    if (ownSession) await session.commitTransaction();

    return {
      held: journalIds.length > 0,
      journalId: journalIds[0] || null,
      journalIds,
      heldTotal: required,
      heldLabTotal: shares.lab,
      heldAbutmentTotal: shares.abut,
      heldDesignFeeTotal: shares.designFeeTotal || 0,
      heldShippingLabTotal: heldShippingLab,
      heldShippingAbutsTotal: heldShippingAbuts,
      fromPaid,
      fromFreeRequest,
      fromFreeShipping,
    };
  } catch (e) {
    if (ownSession) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    throw e;
  } finally {
    if (ownSession) session.endSession();
  }
}

async function computeAcceptedPracticeTransferFees({
  transfer,
  toothWorks,
  session = null,
}) {
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  const performingLabId =
    resolvePerformingLabAnchorId(transfer) || transfer?.targetLabAnchorId;
  const feeScheduleLabId =
    resolveFeeScheduleLabAnchorId(transfer) || performingLabId;
  const multiplierLabId =
    resolveLabFeeMultiplierLabAnchorId(transfer) || feeScheduleLabId;
  const isAutoMatch = String(transfer?.matchingMode || "").trim() === "auto";

  const [labAnchors, practice, abutmentPricingTier, abutmentPrices, partner, devopsAnchorForFeeRate] =
    await Promise.all([
      loadLabAnchorsForFeeComputation({
        feeScheduleLabId,
        performingLabId,
        multiplierLabId,
        session,
      }),
      BusinessAnchor.findById(practiceAnchorId)
        .select({ "practiceTransferSettings.implantFavorites": 1 })
        .session(session || null)
        .lean(),
      Promise.resolve(PLATFORM_ABUTMENT_PRICING_TIER),
      loadCachedAbutmentCreditPrices(practiceAnchorId),
      findLabPracticeRelationship({
        labAnchorId: feeScheduleLabId,
        practiceAnchorId,
      }),
      BusinessAnchor.findOne({ businessType: "devops" })
        .select({ payoutRates: 1 })
        .sort({ createdAt: 1 })
        .lean(),
    ]);

  const feeScheduleLabRaw = labAnchors.feeScheduleLab;
  const asOf = new Date();
  // 작업시작 시점 유효 수가. due pending은 in-memory 승격 후 DB에 fire-and-forget 반영.
  const feeScheduleLab = resolveEffectiveLabFeeLabDoc(feeScheduleLabRaw, asOf);
  if (feeScheduleLabRaw?._id) {
    const promotionSet = buildLabFeePendingPromotionSet(feeScheduleLabRaw, asOf);
    if (promotionSet) {
      void BusinessAnchor.findByIdAndUpdate(feeScheduleLabRaw._id, {
        $set: promotionSet,
      }).catch((err) => {
        console.error(
          "[practiceTransferBilling] promote fee pending on work-start failed",
          err,
        );
      });
    }
  }
  const remake = isPracticeTransferRemake(transfer);
  const labFeeMultiplier = resolveBillingLabFeeMultiplier({
    isAutoMatch,
    lab: labAnchors.multiplierLab || feeScheduleLab,
    practiceId: practiceAnchorId,
    createdAt: transfer?.createdAt,
    snapshot: transfer?.billing?.labFeeMultiplier,
  });
  const rushFeeMultiplier = rushFeeMultiplierFromTransfer(transfer);
  // 작업시작(1B): create 스냅샷 대신 지금 유효 특별공급가·기공비를 사용하고 스냅샷을 갱신.
  const labPracticeSpecialSupply = captureLabPracticeSpecialSupplySnapshot(
    feeScheduleLab,
    practiceAnchorId,
    { at: asOf },
  );

  const fees = computePracticeTransferRetailFeesWithLabShipping(
    {
      toothWorks,
      implantFavorites: implantFavoritesFromPractice(practice),
      labFeeSchedule: resolveLabFeeScheduleSourceForPracticeTransfer({
        labDoc: feeScheduleLab,
        practiceAnchorId,
        asOf,
        liveSpecialSupply: true,
      }),
      abutmentPricingTier,
      abutmentPrices,
      remake,
      skipAbutmentFees: remake,
      labFeeMultiplier,
      rushFeeMultiplier,
    },
    transfer,
  );

  const relationshipKind = relationshipKindFromPartner(partner);
  const isPartner = relationshipKind === "active";
  const feeRateApplied =
    snapshottedPracticeTransferFeeRate(transfer?.billing) ??
    resolvePracticeTransferFeeRate({
      matchingMode: isAutoMatch ? "auto" : "direct",
      payoutRates: devopsAnchorForFeeRate?.payoutRates,
      subcontracted: isSubcontractFeeApplicable(transfer),
      ...platformFeeArgsFromBilling(transfer?.billing),
    });
  const { abutsRevenueAmount, labSettlementAmount } =
    splitPracticeTransferSettlement({
      labFeeTotal: fees.labFeeTotal,
      abutmentRetailTotal: fees.abutmentRetailTotal,
      feeRateApplied,
    });

  return {
    fees,
    partner,
    relationshipKind,
    isPartner,
    feeRateApplied,
    labFeeMultiplier,
    labSettlementAmount,
    abutsRevenueAmount,
    abutmentPricingTier,
    abutmentPrices,
    labPracticeSpecialSupply,
  };
}

/**
 * 수락 시 실수가로 보류액 조정. 기공크레딧 지급 없음.
 * 레거시(보류 없음)면 여기서 hold를 생성한다.
 */
export async function adjustPracticeTransferHold({
  transfer,
  toothWorks,
  actorUserId = null,
  session: outerSession = null,
}) {
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  const labAnchorId = resolvePerformingLabAnchorId(transfer) || transfer?.targetLabAnchorId;
  if (!transferId || !practiceAnchorId || !labAnchorId) {
    return { adjusted: false, reason: "missing_anchors" };
  }

  // Atlas RTT: legacy/hold/adjust 저널 + 수수료 조회를 한 파도로 묶는다.
  const [legacySpend, holdsPrefetch, adjustExistingPrefetch, computed] =
    await Promise.all([
      getJournalByIdempotencyKey({
        idempotencyKey: practiceTransferLegacySpendKey(transferId),
        session: outerSession,
      }),
      findAnyPracticeTransferHoldJournal(transferId, outerSession),
      getJournalByIdempotencyKey({
        idempotencyKey: practiceTransferHoldAdjustKey(transferId),
        session: outerSession,
      }),
      computeAcceptedPracticeTransferFees({
        transfer,
        toothWorks,
        session: outerSession,
      }),
    ]);
  if (legacySpend?.journalId) {
    return { adjusted: false, reason: "legacy_already_committed" };
  }

  const { fees } = computed;
  if (fees.total <= 0) {
    return {
      adjusted: false,
      reason: "zero_fee",
      billed: true,
      fees,
      isPartner: computed.isPartner,
      relationshipKind: computed.relationshipKind,
      feeRateApplied: computed.feeRateApplied,
      labFeeMultiplier: computed.labFeeMultiplier,
      labPracticeSpecialSupply: computed.labPracticeSpecialSupply,
      labSettlementAmount: 0,
      abutsRevenueAmount: 0,
      labTradingPartnerId: computed.partner?._id
        ? String(computed.partner._id)
        : null,
      heldTotal: 0,
      heldLabTotal: 0,
      heldAbutmentTotal: 0,
    };
  }

  let holdJournal =
    holdsPrefetch.legacy || holdsPrefetch.lab || holdsPrefetch.abutment || null;

  if (!holdsPrefetch.any) {
    const holdResult = await holdPracticeTransferCredits({
      transfer,
      toothWorks,
      holdAmount: fees.total,
      holdLabAmount: fees.labFeeTotal,
      holdAbutmentAmount: fees.abutmentRetailTotal,
      actorUserId,
      session: outerSession,
    });
    const holdOk =
      Boolean(holdResult.held) || holdResult.reason === "already_held";
    if (!holdOk) {
      const err = new Error(
        holdResult.reason === "zero_fee"
          ? "기공비가 없어 보류할 수 없습니다."
          : "기공비 보류 저널을 만들지 못했습니다. 잠시 후 다시 작업시작해 주세요.",
      );
      err.statusCode = holdResult.reason === "zero_fee" ? 409 : 500;
      err.payload = {
        reason: "practice_transfer_hold_missing",
        holdReason: holdResult.reason || null,
      };
      throw err;
    }
    return {
      adjusted: true,
      reason: holdResult.reason || null,
      billed: true,
      fees,
      isPartner: computed.isPartner,
      relationshipKind: computed.relationshipKind,
      feeRateApplied: computed.feeRateApplied,
      labFeeMultiplier: computed.labFeeMultiplier,
      labPracticeSpecialSupply: computed.labPracticeSpecialSupply,
      labSettlementAmount: computed.labSettlementAmount,
      abutsRevenueAmount: computed.abutsRevenueAmount,
      labTradingPartnerId: computed.partner?._id
        ? String(computed.partner._id)
        : null,
      heldTotal: holdResult.heldTotal ?? fees.total,
      heldLabTotal: holdResult.heldLabTotal ?? fees.labFeeTotal,
      heldAbutmentTotal:
        holdResult.heldAbutmentTotal ?? fees.abutmentRetailTotal,
      heldShippingLabTotal: holdResult.heldShippingLabTotal ?? 0,
      heldShippingAbutsTotal: holdResult.heldShippingAbutsTotal ?? 0,
      fromPaid: holdResult.fromPaid,
      fromFreeRequest: holdResult.fromFreeRequest,
      fromFreeShipping: holdResult.fromFreeShipping,
    };
  }

  const heldLabTotal = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.heldLabTotal ??
          holdsPrefetch.lab?.meta?.heldTotal ??
          (holdsPrefetch.legacy ? fees.labFeeTotal : 0),
      ),
    ),
  );
  const heldAbutmentTotal = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.heldAbutmentTotal ??
          holdsPrefetch.abutment?.meta?.heldTotal ??
          (holdsPrefetch.legacy ? fees.abutmentRetailTotal : 0),
      ),
    ),
  );
  const heldShippingLabTotal = Math.max(
    0,
    Math.round(Number(transfer?.billing?.heldShippingLabTotal || 0)),
  );
  const heldShippingAbutsTotal = Math.max(
    0,
    Math.round(Number(transfer?.billing?.heldShippingAbutsTotal || 0)),
  );
  const heldShippingTotal = heldShippingLabTotal + heldShippingAbutsTotal;
  // heldTotal(생성 보류)에는 배송비가 포함됨. 수락 조정은 기공·어벗 수수료만 맞춤.
  const heldFeeTotal = Math.max(
    0,
    Math.round(
      Number(
        heldLabTotal + heldAbutmentTotal ||
          Math.max(
            0,
            Number(transfer?.billing?.heldTotal || 0) - heldShippingTotal,
          ) ||
          Number(holdJournal?.meta?.heldTotal || 0) ||
          0,
      ),
    ),
  );
  const previousHeldTotal = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.heldTotal ||
          heldFeeTotal + heldShippingTotal ||
          0,
      ),
    ),
  );
  const targetFeeTotal = fees.total;
  const targetHeldTotal = targetFeeTotal + heldShippingTotal;
  const delta = targetFeeTotal - heldFeeTotal;

  let fromPaid = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromPaid ?? holdJournal?.meta?.fromPaid ?? 0,
      ),
    ),
  );
  let fromFreeRequest = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromFreeRequest ??
          holdJournal?.meta?.fromFreeRequest ??
          0,
      ),
    ),
  );
  let fromFreeShipping = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromFreeShipping ??
          holdJournal?.meta?.fromFreeShipping ??
          0,
      ),
    ),
  );

  if (delta === 0) {
    return {
      adjusted: false,
      reason: "already_matched",
      billed: true,
      fees,
      isPartner: computed.isPartner,
      relationshipKind: computed.relationshipKind,
      feeRateApplied: computed.feeRateApplied,
      labFeeMultiplier: computed.labFeeMultiplier,
      labPracticeSpecialSupply: computed.labPracticeSpecialSupply,
      labSettlementAmount: computed.labSettlementAmount,
      abutsRevenueAmount: computed.abutsRevenueAmount,
      labTradingPartnerId: computed.partner?._id
        ? String(computed.partner._id)
        : null,
      heldTotal: targetHeldTotal,
      heldLabTotal,
      heldAbutmentTotal,
      heldShippingLabTotal,
      heldShippingAbutsTotal,
      fromPaid,
      fromFreeRequest,
      fromFreeShipping,
    };
  }

  const adjustExisting = adjustExistingPrefetch;
  if (adjustExisting?.journalId) {
    // 이미 조정된 경우 billing 스냅샷을 신뢰
    return {
      adjusted: false,
      reason: "already_adjusted",
      billed: true,
      fees,
      isPartner: computed.isPartner,
      relationshipKind: computed.relationshipKind,
      feeRateApplied: computed.feeRateApplied,
      labFeeMultiplier: computed.labFeeMultiplier,
      labPracticeSpecialSupply: computed.labPracticeSpecialSupply,
      labSettlementAmount: computed.labSettlementAmount,
      abutsRevenueAmount: computed.abutsRevenueAmount,
      labTradingPartnerId: computed.partner?._id
        ? String(computed.partner._id)
        : null,
      heldTotal: Math.max(
        0,
        Math.round(Number(transfer?.billing?.heldTotal || targetHeldTotal)),
      ),
      heldLabTotal: Math.max(
        0,
        Math.round(
          Number(transfer?.billing?.heldLabTotal ?? heldLabTotal),
        ),
      ),
      heldAbutmentTotal: Math.max(
        0,
        Math.round(
          Number(
            transfer?.billing?.heldAbutmentTotal ?? heldAbutmentTotal,
          ),
        ),
      ),
      heldShippingLabTotal,
      heldShippingAbutsTotal,
      fromPaid,
      fromFreeRequest,
      fromFreeShipping,
    };
  }

  // 확정 수수료를 경로 분할(기공소=기공+디자인, 어벗츠=생산)으로 맞춤
  const nextShares = await resolveHoldShareAmounts({
    transfer,
    toothWorks,
    holdAmount: fees.total,
    holdLabAmount: fees.labFeeTotal,
    holdAbutmentAmount: fees.abutmentRetailTotal,
  });
  const nextHeldLabTotal = nextShares.lab;
  const nextHeldAbutmentTotal = nextShares.abut;

  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  if (ownSession) session.startTransaction();

  try {
    await lockGuard(practiceAnchorId, session);
    const devopsAnchorId =
      String(holdJournal?.meta?.devopsAnchorId || "").trim() ||
      (await resolveDevopsEscrowOwnerId(session));
    if (!devopsAnchorId) {
      const err = new Error("에스크로(devops) 사업자를 찾을 수 없습니다.");
      err.statusCode = 500;
      throw err;
    }

    const absDelta = Math.abs(delta);
    const metaBase = {
      displayKind: "lab_fee_hold",
      displayLabel: PRACTICE_TRANSFER_LEDGER_LABELS.holdAdjust,
      usageKind: "practice_transfer",
      escrow: true,
    };
    const lines = [];

    if (delta < 0) {
      const ret = allocateHoldReturn({
        amount: absDelta,
        fromPaid,
        fromFreeRequest,
        fromFreeShipping,
      });
      if (ret.shortfall > 0) {
        const err = new Error("보류 환급 배분에 실패했습니다.");
        err.statusCode = 500;
        throw err;
      }
      lines.push(
        {
          accountCode: "PLATFORM_ESCROW",
          ownerRole: "devops",
          ownerId: devopsAnchorId,
          amount: -absDelta,
          amountExcludingVat: -absDelta,
          vatAmount: 0,
          creditKind: null,
          refType: "PRACTICE_TRANSFER",
          refId: transferId,
          meta: { ...metaBase, source: "practice_transfer_escrow_release_partial" },
        },
        ...buildPracticeCreditLinesFromReturn({
          fromPaid: ret.fromPaid,
          fromFreeRequest: ret.fromFreeRequest,
          fromFreeShipping: ret.fromFreeShipping,
          practiceAnchorId,
          transferId,
          meta: metaBase,
        }),
      );
      fromPaid -= ret.fromPaid;
      fromFreeRequest -= ret.fromFreeRequest;
      fromFreeShipping -= ret.fromFreeShipping;
    } else {
      const balance = await computeBusinessCreditBalanceFromLedger({
        businessAnchorId: practiceAnchorId,
        session,
      });
      const allowOverdraft =
        await practiceAllowsFreeRequestOverdraft(practiceAnchorId);
      const split = allocateSpendFromCreditBuckets({
        amount: absDelta,
        paidCredit: Number(balance?.paidCredit || 0),
        freeRequestCredit: Number(balance?.freeRequestCredit || 0),
        freeShippingCredit: Number(balance?.freeShippingCredit || 0),
        freeOrder: ["freeRequest", "freeShipping"],
        allowFreeRequestOverdraft: allowOverdraft,
      });
      if (!split.ok) {
        const err = new Error("치과 크레딧이 부족합니다.");
        err.statusCode = 402;
        err.payload = {
          reason: "insufficient_credit_for_practice_transfer",
          available: split.available,
          required: absDelta,
        };
        throw err;
      }
      lines.push(
        ...buildPracticeDebitLines({
          split,
          practiceAnchorId,
          transferId,
          meta: {
            ...metaBase,
            fromPaid: split.fromPaid,
            fromFreeRequest: split.fromFreeRequest,
            fromFreeShipping: split.fromFreeShipping,
          },
        }),
        {
          accountCode: "PLATFORM_ESCROW",
          ownerRole: "devops",
          ownerId: devopsAnchorId,
          amount: absDelta,
          amountExcludingVat: absDelta,
          vatAmount: 0,
          creditKind: null,
          refType: "PRACTICE_TRANSFER",
          refId: transferId,
          meta: { ...metaBase, source: "practice_transfer_escrow_topup" },
        },
      );
      fromPaid += split.fromPaid;
      fromFreeRequest += split.fromFreeRequest;
      fromFreeShipping += split.fromFreeShipping;
    }

    await postGeneralLedgerJournal({
      idempotencyKey: practiceTransferHoldAdjustKey(transferId),
      eventType: "PRACTICE_TRANSFER_HOLD_ADJUST",
      businessAnchorId: practiceAnchorId,
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      createdBy: actorUserId,
      meta: {
        previousHeldTotal,
        heldTotal: targetHeldTotal,
        heldLabTotal: nextHeldLabTotal,
        heldAbutmentTotal: nextHeldAbutmentTotal,
        heldShippingLabTotal,
        heldShippingAbutsTotal,
        heldFeeTotal: targetFeeTotal,
        delta,
        fromPaid,
        fromFreeRequest,
        fromFreeShipping,
        devopsAnchorId,
      },
      lines,
      session,
      skipIdempotencyLookup: true,
    });

    if (ownSession) await session.commitTransaction();

    return {
      adjusted: true,
      billed: true,
      fees,
      isPartner: computed.isPartner,
      relationshipKind: computed.relationshipKind,
      feeRateApplied: computed.feeRateApplied,
      labFeeMultiplier: computed.labFeeMultiplier,
      labPracticeSpecialSupply: computed.labPracticeSpecialSupply,
      labSettlementAmount: computed.labSettlementAmount,
      abutsRevenueAmount: computed.abutsRevenueAmount,
      labTradingPartnerId: computed.partner?._id
        ? String(computed.partner._id)
        : null,
      heldTotal: targetHeldTotal,
      heldLabTotal: nextHeldLabTotal,
      heldAbutmentTotal: nextHeldAbutmentTotal,
      heldShippingLabTotal,
      heldShippingAbutsTotal,
      fromPaid,
      fromFreeRequest,
      fromFreeShipping,
    };
  } catch (e) {
    if (ownSession) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    throw e;
  } finally {
    if (ownSession) session.endSession();
  }
}

function machiningSpendGlKey(requestId) {
  return requestMachiningSpendGlKey(requestId);
}

async function readPracticeToLabSettlementBlock(
  transfer,
  { session = null, extraPaidRequestId = null } = {},
) {
  const {
    listCustomAbutmentToothWorks,
    practiceTransferNeedsMoreAbutmentDesigns,
  } = await import("./practiceTransferProduction.service.js");
  const works = Array.isArray(transfer?.toothWorks) ? transfer.toothWorks : [];
  const customAbutmentCount = listCustomAbutmentToothWorks(works).length;
  if (customAbutmentCount <= 0) return null;
  if (practiceTransferNeedsMoreAbutmentDesigns(transfer)) {
    return "awaiting_abutment_design_stl";
  }
  const { isLabProsthesisUploadRequired } = await import(
    "../utils/practiceProsthesisUploadRequirement.js"
  );
  if (!isLabProsthesisUploadRequired(transfer)) return null;

  const awaitShare = awaitsAbutmentShareRelease(transfer);
  if (awaitShare) {
    const journal = await getJournalByIdempotencyKey({
      idempotencyKey: practiceTransferEscrowReleaseAbutmentKey(transfer?._id),
      session,
    });
    return resolvePracticeToLabSettlementBlock({
      customAbutmentCount,
      awaitAbutmentShareRelease: true,
      abutmentProductionReleased: Boolean(journal?.journalId),
    });
  }

  const ids = [
    ...new Set(
      (Array.isArray(transfer?.production?.relatedRequestIds)
        ? transfer.production.relatedRequestIds
        : []
      )
        .map((id) => String(id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id)),
    ),
  ];
  const extra = String(extraPaidRequestId || "").trim();
  if (extra && Types.ObjectId.isValid(extra) && !ids.includes(extra)) {
    ids.push(extra);
  }
  if (!ids.length) {
    return resolvePracticeToLabSettlementBlock({ customAbutmentCount });
  }

  const Request = (await import("../models/request.model.js")).default;
  const rows = await Request.find({
    _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
  })
    .select({ manufacturerStage: 1 })
    .session(session || null)
    .lean();
  const found = new Set((rows || []).map((row) => String(row?._id || "")));
  const cancelled = new Set(
    (rows || [])
      .filter((row) => String(row?.manufacturerStage || "").trim() === "취소")
      .map((row) => String(row?._id || "")),
  );
  const active = ids.filter((id) => found.has(id) && !cancelled.has(id));
  const missing = ids.filter((id) => !found.has(id));
  const productionPaymentWaived =
    ids.length > 0 && active.length === 0 && missing.length === 0;
  let paid = [];
  if (!productionPaymentWaived && active.length) {
    const journals = await getJournalsByIdempotencyKeys({
      idempotencyKeys: active.map((id) => machiningSpendGlKey(id)),
      session,
    });
    paid = active.filter((id) => journals.has(machiningSpendGlKey(id)));
    if (extra && active.includes(extra) && !paid.includes(extra)) {
      paid.push(extra);
    }
  }
  return resolvePracticeToLabSettlementBlock({
    customAbutmentCount,
    productionPaymentWaived,
    activeProductionRequestIds: active,
    paidProductionRequestIds: paid,
  });
}

/**
 * 정산 페이지·payout에서 기공 **확정** 적립을 빼야 하는 PTX id.
 * 커스텀어벗인데 디자인 STL이 없거나 어벗 생산비가 아직 어벗츠에 지급되지 않은 건.
 * 치과 결제 보류(SPEND_HOLD)·기간 소비·기공소 적립 보류 미러는 제외 대상이 아니다.
 * 이미 labSettledAt(기공소 확정 적립)된 건은 빼지 않는다 — 통계·내역에서 확정분이 사라지면 안 됨.
 */
export async function selectPracticeTransferIdsBlockedFromSettlement(
  transfers,
  { session = null } = {},
) {
  const {
    listCustomAbutmentToothWorks,
    practiceTransferNeedsMoreAbutmentDesigns,
  } = await import("./practiceTransferProduction.service.js");
  const blocked = new Set();
  const shareWait = [];
  const labPay = [];
  for (const transfer of Array.isArray(transfers) ? transfers : []) {
    const id = String(transfer?._id || "").trim();
    if (!id) continue;
    // 확정 적립 완료 — STL/생산비 재검사로 통계·내역에서 지우지 않음
    if (transfer?.billing?.labSettledAt) continue;
    const customAbutmentCount = listCustomAbutmentToothWorks(
      transfer?.toothWorks || [],
    ).length;
    if (customAbutmentCount <= 0) continue;
    if (practiceTransferNeedsMoreAbutmentDesigns(transfer)) {
      blocked.add(id);
      continue;
    }
    if (awaitsAbutmentShareRelease(transfer)) shareWait.push(transfer);
    else labPay.push(transfer);
  }

  if (shareWait.length) {
    const journals = await getJournalsByIdempotencyKeys({
      idempotencyKeys: shareWait.map((transfer) =>
        practiceTransferEscrowReleaseAbutmentKey(transfer._id),
      ),
      session,
    });
    for (const transfer of shareWait) {
      const key = practiceTransferEscrowReleaseAbutmentKey(transfer._id);
      if (!journals.has(key)) blocked.add(String(transfer._id));
    }
  }

  if (labPay.length) {
    const idsByTransfer = new Map();
    const allIds = [];
    for (const transfer of labPay) {
      const ids = [
        ...new Set(
          (Array.isArray(transfer?.production?.relatedRequestIds)
            ? transfer.production.relatedRequestIds
            : []
          )
            .map((id) => String(id || "").trim())
            .filter((id) => Types.ObjectId.isValid(id)),
        ),
      ];
      idsByTransfer.set(String(transfer._id), ids);
      allIds.push(...ids);
    }
    const uniqueIds = [...new Set(allIds)];
    const Request = (await import("../models/request.model.js")).default;
    const rows = uniqueIds.length
      ? await Request.find({
          _id: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) },
        })
          .select({ manufacturerStage: 1 })
          .session(session || null)
          .lean()
      : [];
    const found = new Set((rows || []).map((row) => String(row?._id || "")));
    const cancelled = new Set(
      (rows || [])
        .filter((row) => String(row?.manufacturerStage || "").trim() === "취소")
        .map((row) => String(row?._id || "")),
    );
    const activeByTransfer = new Map();
    const payKeys = [];
    for (const transfer of labPay) {
      const id = String(transfer._id);
      const ids = idsByTransfer.get(id) || [];
      const active = ids.filter((reqId) => found.has(reqId) && !cancelled.has(reqId));
      const missing = ids.filter((reqId) => !found.has(reqId));
      if (ids.length > 0 && active.length === 0 && missing.length === 0) {
        continue;
      }
      if (!active.length) {
        blocked.add(id);
        continue;
      }
      activeByTransfer.set(id, active);
      payKeys.push(...active.map((reqId) => requestMachiningSpendGlKey(reqId)));
    }
    const journals = await getJournalsByIdempotencyKeys({
      idempotencyKeys: payKeys,
      session,
    });
    for (const [id, active] of activeByTransfer) {
      const paid = active.every((reqId) =>
        journals.has(requestMachiningSpendGlKey(reqId)),
      );
      if (!paid) blocked.add(id);
    }
  }
  return blocked;
}

export async function listPracticeTransferIdsBlockedFromSettlement({
  practiceAnchorId = null,
  labAnchorId = null,
  session = null,
} = {}) {
  const practiceId = String(practiceAnchorId || "").trim();
  const labId = String(labAnchorId || "").trim();
  if (
    (!practiceId || !Types.ObjectId.isValid(practiceId)) &&
    (!labId || !Types.ObjectId.isValid(labId))
  ) {
    return new Set();
  }
  const PracticeTransfer = (await import("../models/practiceTransfer.model.js"))
    .default;
  const { practiceTransferNotDeletedMongoFilter } = await import(
    "../utils/practiceTransferStage.js"
  );
  const and = [
    practiceTransferNotDeletedMongoFilter(),
    { "billing.heldAt": { $ne: null } },
    {
      $or: [
        { "billing.labSettledAt": null },
        { "billing.labSettledAt": { $exists: false } },
      ],
    },
    {
      $or: [{ workCanceledAt: null }, { workCanceledAt: { $exists: false } }],
    },
  ];
  if (practiceId && Types.ObjectId.isValid(practiceId)) {
    and.push({
      practiceBusinessAnchorId: new Types.ObjectId(practiceId),
    });
  }
  if (labId && Types.ObjectId.isValid(labId)) {
    const labOid = new Types.ObjectId(labId);
    and.push({
      $or: [{ assigneeLabAnchorId: labOid }, { targetLabAnchorId: labOid }],
    });
  }
  const docs = await PracticeTransfer.find({ $and: and })
    .select({
      toothWorks: 1,
      billing: 1,
      "production.designFiles": 1,
      "production.designFileCount": 1,
      "production.relatedRequestIds": 1,
    })
    .limit(1000)
    .session(session || null)
    .lean();
  return selectPracticeTransferIdsBlockedFromSettlement(docs, { session });
}

async function movePracticeTransferHoldLedgerTo(transferId, occurredAt, session) {
  const journals = await LedgerJournal.find({
    refType: "PRACTICE_TRANSFER",
    refId: transferId,
    eventType: {
      $in: ["PRACTICE_TRANSFER_SPEND_HOLD", "PRACTICE_TRANSFER_HOLD_ADJUST"],
    },
  })
    .select({ journalId: 1 })
    .session(session || null)
    .lean();
  const journalIds = (journals || [])
    .map((row) => String(row?.journalId || "").trim())
    .filter(Boolean);
  if (!journalIds.length) return;
  const at = occurredAt instanceof Date ? occurredAt : new Date();
  await LedgerJournal.updateMany(
    { journalId: { $in: journalIds } },
    { $set: { occurredAt: at } },
  ).session(session || null);
  await LedgerLine.updateMany(
    { journalId: { $in: journalIds } },
    { $set: { occurredAt: at } },
  ).session(session || null);
}

function shouldPersistLabShareSettlement(releaseResult) {
  return (
    Boolean(releaseResult?.released) ||
    releaseResult?.reason === "already_released" ||
    releaseResult?.reason === "zero_lab_fee" ||
    releaseResult?.reason === "legacy_already_settled"
  );
}

async function grantLegacyAbutmentDesignFees(transfer, actorUserId) {
  const ids = [
    ...new Set(
      (Array.isArray(transfer?.production?.relatedRequestIds)
        ? transfer.production.relatedRequestIds
        : []
      )
        .map((id) => String(id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id)),
    ),
  ];
  if (!ids.length) return;
  const Request = (await import("../models/request.model.js")).default;
  const docs = await Request.find({
    _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
  });
  const labAnchorId = String(
    transfer?.assigneeLabAnchorId || transfer?.targetLabAnchorId || "",
  ).trim();
  for (const requestDoc of docs || []) {
    if (String(requestDoc?.manufacturerStage || "").trim() === "취소") continue;
    // eslint-disable-next-line no-await-in-loop
    await grantAbutmentDesignLabFee({
      requestDoc,
      transferId: String(transfer?._id || ""),
      labAnchorId,
      actorUserId,
    });
  }
}

/**
 * 디자인 STL이 있고 어벗 생산비가 지급된 뒤에만 치과→기공소 정산.
 * 기간이 지나도 이 호출 시점의 저널로 잡는다.
 */
export async function settlePracticeToLabShareIfReady({
  transfer = null,
  transferId = null,
  actorUserId = null,
  session = null,
  extraPaidRequestId = null,
} = {}) {
  const PracticeTransfer = (await import("../models/practiceTransfer.model.js"))
    .default;
  const id = String(transfer?._id || transferId || "").trim();
  if (!id || !Types.ObjectId.isValid(id)) {
    return { released: false, reason: "missing_transfer" };
  }
  const doc =
    transfer ||
    (await PracticeTransfer.findById(id).session(session || null));
  if (!doc?._id) return { released: false, reason: "missing_transfer" };
  if (doc.billing?.labSettledAt) {
    return { released: false, reason: "already_settled" };
  }

  const releaseResult = await releasePracticeTransferLabShare({
    transfer: doc,
    toothWorks: Array.isArray(doc.toothWorks) ? doc.toothWorks : [],
    actorUserId,
    session,
    extraPaidRequestId,
  });
  if (!shouldPersistLabShareSettlement(releaseResult)) return releaseResult;

  const labSettledAt = new Date();
  const heldAbutment = Math.max(
    0,
    Math.round(
      Number(
        releaseResult.fees?.abutmentRetailTotal ??
          doc.billing?.heldAbutmentTotal ??
          doc.billing?.abutmentRetailTotal ??
          0,
      ),
    ),
  );
  const abutmentAlreadySettled = Boolean(
    doc.billing?.abutmentSettledAt || heldAbutment <= 0,
  );
  const $set = {
    "billing.labFeeTotal":
      releaseResult.fees?.labFeeTotal ??
      releaseResult.labFeeTotal ??
      Number(doc.billing?.labFeeTotal || 0),
    "billing.abutmentRetailTotal":
      releaseResult.fees?.abutmentRetailTotal ??
      Number(doc.billing?.abutmentRetailTotal || 0),
    "billing.abutmentQty":
      releaseResult.fees?.abutmentQty ?? Number(doc.billing?.abutmentQty || 0),
    "billing.total":
      releaseResult.fees?.total ?? Number(doc.billing?.total || 0),
    "billing.labSettlementAmount":
      releaseResult.labSettlementAmount ??
      Number(doc.billing?.labSettlementAmount || 0),
    "billing.abutsRevenueAmount":
      releaseResult.abutsRevenueAmount ??
      Number(doc.billing?.abutsRevenueAmount || 0),
    "billing.labSettledAt": labSettledAt,
  };
  if (abutmentAlreadySettled) {
    $set["billing.abutmentSettledAt"] =
      doc.billing?.abutmentSettledAt || labSettledAt;
    $set["billing.settledAt"] = labSettledAt;
  }
  await PracticeTransfer.updateOne({ _id: doc._id }, { $set }).session(
    session || null,
  );
  doc.billing = {
    ...(doc.billing && typeof doc.billing === "object" ? doc.billing : {}),
    labFeeTotal: $set["billing.labFeeTotal"],
    abutmentRetailTotal: $set["billing.abutmentRetailTotal"],
    abutmentQty: $set["billing.abutmentQty"],
    total: $set["billing.total"],
    labSettlementAmount: $set["billing.labSettlementAmount"],
    abutsRevenueAmount: $set["billing.abutsRevenueAmount"],
    labSettledAt,
    ...(abutmentAlreadySettled
      ? {
          abutmentSettledAt: $set["billing.abutmentSettledAt"],
          settledAt: labSettledAt,
        }
      : {}),
  };

  if (releaseResult?.released) {
    await movePracticeTransferHoldLedgerTo(doc._id, labSettledAt, session);
    try {
      await settleUnreleasedProsthesisFollowUpsForTransfer({
        transfer: doc,
        actorUserId,
        session,
      });
    } catch (followErr) {
      console.error(
        "[practiceTransfer] deferred follow-up lab settlement failed",
        String(doc._id),
        followErr?.message || followErr,
      );
    }
    try {
      await settleUnreleasedRemakeChargesForTransfer({
        transfer: doc,
        actorUserId,
        session,
      });
    } catch (remakeErr) {
      console.error(
        "[practiceTransfer] deferred remake lab settlement failed",
        String(doc._id),
        remakeErr?.message || remakeErr,
      );
    }
    try {
      await grantLegacyAbutmentDesignFees(doc, actorUserId);
    } catch (grantErr) {
      console.error(
        "[practiceTransfer] deferred abutment design fee grant failed",
        String(doc._id),
        grantErr?.message || grantErr,
      );
    }
  }
  return releaseResult;
}

/**
 * 기공소 발송(mark-complete): 기공비 에스크로 해제.
 * 어벗츠 원청: gross→internalLab, 하청 있으면 매입액→assignee, 잔여=플랫폼 수수료.
 * 레거시 외부 직접 지정: performing lab에 전액(수수료 정책 그대로).
 * 커스텀어벗은 디자인 STL + 생산비 지급 전에는 released=false.
 */
export async function releasePracticeTransferLabShare({
  transfer,
  toothWorks = null,
  actorUserId = null,
  session: outerSession = null,
  extraPaidRequestId = null,
}) {
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  const parties = resolvePracticeTransferSettlementParties(transfer);
  const labAnchorId = parties.grossOwnerId;
  if (!transferId || !practiceAnchorId || !labAnchorId) {
    return { released: false, reason: "missing_anchors" };
  }

  const releaseLabKey = practiceTransferEscrowReleaseLabKey(transferId);
  const feeKey = practiceTransferLabPlatformFeeKey(transferId);
  const legacyReleaseKey = practiceTransferEscrowReleaseKey(transferId);
  const works = toothWorks || transfer?.toothWorks || [];

  const [
    existingLabRelease,
    existingFee,
    legacyRelease,
    legacySpend,
    holds,
    computed,
  ] = await Promise.all([
    getJournalByIdempotencyKey({
      idempotencyKey: releaseLabKey,
      session: outerSession,
    }),
    getJournalByIdempotencyKey({
      idempotencyKey: feeKey,
      session: outerSession,
    }),
    getJournalByIdempotencyKey({
      idempotencyKey: legacyReleaseKey,
      session: outerSession,
    }),
    getJournalByIdempotencyKey({
      idempotencyKey: practiceTransferLegacySpendKey(transferId),
      session: outerSession,
    }),
    findAnyPracticeTransferHoldJournal(transferId, outerSession),
    computeAcceptedPracticeTransferFees({
      transfer,
      toothWorks: works,
      session: outerSession,
    }),
  ]);

  if (legacyRelease?.journalId) {
    return {
      released: false,
      reason: "already_released",
      journalId: legacyRelease.journalId,
      legacyFullRelease: true,
    };
  }
  if (existingLabRelease?.journalId) {
    return {
      released: false,
      reason: "already_released",
      journalId: existingLabRelease.journalId,
    };
  }
  if (legacySpend?.journalId) {
    return {
      released: false,
      reason: "legacy_already_settled",
      journalId: legacySpend.journalId,
    };
  }
  if (!holds.any) {
    return { released: false, reason: "no_hold" };
  }

  const { fees, feeRateApplied } = computed;
  const labFeeTotal = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.labFeeTotal ??
          transfer?.billing?.heldLabTotal ??
          fees.labFeeTotal ??
          0,
      ),
    ),
  );
  if (labFeeTotal <= 0) {
    return {
      released: false,
      reason: "zero_lab_fee",
      fees,
      labFeeTotal: 0,
      platformFee: 0,
      labSettlementAmount: 0,
    };
  }

  const settlementBlock = await readPracticeToLabSettlementBlock(transfer, {
    session: outerSession,
    extraPaidRequestId,
  });
  if (settlementBlock) {
    return {
      released: false,
      reason: settlementBlock,
      fees,
      labFeeTotal,
      platformFee: 0,
      labSettlementAmount: 0,
    };
  }

  const platformFee = Math.max(
    0,
    Math.round(labFeeTotal * Number(feeRateApplied || 0)),
  );
  const purchasePayeeId = parties.purchasePayeeId;
  const purchaseAmount = purchasePayeeId
    ? Math.max(0, labFeeTotal - platformFee)
    : 0;
  const labNet = purchasePayeeId
    ? purchaseAmount
    : Math.max(0, labFeeTotal - platformFee);

  const fromPaid = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromPaid ??
          holds.lab?.meta?.fromPaid ??
          holds.legacy?.meta?.fromPaid ??
          0,
      ),
    ),
  );
  const fromFreeRequest = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromFreeRequest ??
          holds.lab?.meta?.fromFreeRequest ??
          holds.legacy?.meta?.fromFreeRequest ??
          0,
      ),
    ),
  );
  const fromFreeShipping = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromFreeShipping ??
          holds.lab?.meta?.fromFreeShipping ??
          holds.legacy?.meta?.fromFreeShipping ??
          0,
      ),
    ),
  );

  const creditSettings = await loadCreditSettingsDefaults();

  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  if (ownSession) session.startTransaction();

  try {
    await lockGuard(practiceAnchorId, session);
    const revenueOwners = await resolveRevenueOwners({
      practiceAnchorId,
      session,
    });
    const devopsAnchorId = revenueOwners?.devopsAnchorId || null;
    if (!devopsAnchorId) {
      const err = new Error("에스크로(devops) 사업자를 찾을 수 없습니다.");
      err.statusCode = 500;
      throw err;
    }

    const releaseLines = [
      {
        accountCode: "PLATFORM_ESCROW",
        ownerRole: "devops",
        ownerId: devopsAnchorId,
        amount: -labFeeTotal,
        amountExcludingVat: -labFeeTotal,
        vatAmount: 0,
        creditKind: null,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source: "practice_transfer_escrow_release_lab",
          displayKind: "lab_share",
          displayLabel: PRACTICE_TRANSFER_LEDGER_LABELS.releaseLab,
          holdShare: "lab",
        },
      },
      {
        accountCode: "LAB_SETTLEMENT_CREDIT",
        ownerRole: "requestor",
        ownerId: String(labAnchorId),
        amount: labFeeTotal,
        amountExcludingVat: labFeeTotal,
        vatAmount: 0,
        creditKind: "SETTLEMENT",
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source: "practice_transfer_lab_share_gross",
          displayKind: "lab_credit",
          displayLabel: "기공크레딧 적립",
          itemLabel: PRACTICE_TRANSFER_LEDGER_LABELS.releaseLab,
          feeRateApplied,
          labFee: labFeeTotal,
          abutsPrime: Boolean(parties.abutsPrime),
        },
      },
    ];

    if (purchasePayeeId && purchaseAmount > 0) {
      releaseLines.push(
        {
          accountCode: "LAB_SETTLEMENT_CREDIT",
          ownerRole: "requestor",
          ownerId: String(labAnchorId),
          amount: -purchaseAmount,
          amountExcludingVat: -purchaseAmount,
          vatAmount: 0,
          creditKind: "SETTLEMENT",
          refType: "PRACTICE_TRANSFER",
          refId: transferId,
          meta: {
            source: "practice_transfer_subcontract_purchase",
            displayKind: "subcontract_purchase",
            displayLabel: resolveAssigneePurchaseLedgerLabel(transfer),
            itemLabel: resolveAssigneePurchaseLedgerLabel(transfer),
            feeRateApplied,
            labFee: labFeeTotal,
            purchaseAmount,
            purchasePayeeId: String(purchasePayeeId),
          },
        },
        {
          accountCode: "LAB_SETTLEMENT_CREDIT",
          ownerRole: "requestor",
          ownerId: String(purchasePayeeId),
          amount: purchaseAmount,
          amountExcludingVat: purchaseAmount,
          vatAmount: 0,
          creditKind: "SETTLEMENT",
          refType: "PRACTICE_TRANSFER",
          refId: transferId,
          meta: {
            source: "practice_transfer_subcontract_purchase",
            displayKind: "lab_credit",
            displayLabel: "기공크레딧 적립",
            itemLabel: resolveAssigneePurchaseLedgerLabel(transfer),
            feeRateApplied,
            labFee: labFeeTotal,
            purchaseAmount,
            primeLabAnchorId: String(labAnchorId),
          },
        },
      );
    }

    const releaseJournal = await postGeneralLedgerJournal({
      idempotencyKey: releaseLabKey,
      eventType: "PRACTICE_TRANSFER_ESCROW_RELEASE",
      businessAnchorId: practiceAnchorId,
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      createdBy: actorUserId,
      meta: {
        holdShare: "lab",
        labAnchorId: String(labAnchorId),
        purchasePayeeId: purchasePayeeId ? String(purchasePayeeId) : null,
        labFeeTotal,
        platformFee,
        purchaseAmount,
        labSettlementAmount: labNet,
        feeRateApplied,
        relationshipKind: computed.relationshipKind,
        abutsPrime: Boolean(parties.abutsPrime),
        fees,
      },
      lines: releaseLines,
      session,
      skipIdempotencyLookup: true,
    });

    let feeJournalId = existingFee?.journalId || null;
    if (platformFee > 0 && !existingFee?.journalId) {
      const feeLines = [
        {
          accountCode: "LAB_SETTLEMENT_CREDIT",
          ownerRole: "requestor",
          ownerId: String(labAnchorId),
          amount: -platformFee,
          amountExcludingVat: -platformFee,
          vatAmount: 0,
          creditKind: "SETTLEMENT",
          refType: "PRACTICE_TRANSFER",
          refId: transferId,
          meta: {
            source: "practice_transfer_lab_platform_fee",
            displayKind: "platform_fee",
            displayLabel: "플랫폼 수수료",
            feeRateApplied,
            labFee: labFeeTotal,
          },
        },
      ];
      const heldTotalForFree =
        Number(transfer?.billing?.heldTotal || labFeeTotal || 0) || labFeeTotal;
      const freeShareOfPlatformFee =
        heldTotalForFree > 0
          ? Math.round(
              (platformFee * (fromFreeRequest + fromFreeShipping)) /
                heldTotalForFree,
            )
          : 0;
      const fromFree = fromFreeRequest + fromFreeShipping;
      const freeReqShareOfPlatformFee =
        fromFree > 0
          ? Math.round((freeShareOfPlatformFee * fromFreeRequest) / fromFree)
          : 0;
      const freeShipShareOfPlatformFee = Math.max(
        0,
        freeShareOfPlatformFee - freeReqShareOfPlatformFee,
      );
      pushRevenueLines({
      isRemake: isPracticeTransferRemake(transfer),
        lines: feeLines,
        owners: revenueOwners,
        spendAmount: platformFee,
        freeAmount: freeShareOfPlatformFee,
        fromFreeRequest: freeReqShareOfPlatformFee,
        fromFreeShipping: freeShipShareOfPlatformFee,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        creditSettings,
        meta: {
          source: "lab_platform_fee",
          displayKind: "platform_fee",
          displayLabel: "플랫폼 수수료",
          relationshipKind: computed.relationshipKind,
          feeRateApplied,
          feeTotal: labFeeTotal,
        },
      });

      const feeJournal = await postGeneralLedgerJournal({
        idempotencyKey: feeKey,
        eventType: "PRACTICE_TRANSFER_LAB_PLATFORM_FEE",
        businessAnchorId: labAnchorId,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        createdBy: actorUserId,
        meta: {
          labAnchorId: String(labAnchorId),
          labFeeTotal,
          platformFee,
          feeRateApplied,
          relationshipKind: computed.relationshipKind,
        },
        lines: feeLines,
        session,
        skipIdempotencyLookup: true,
      });
      feeJournalId = feeJournal?.journalId || null;
    }

    if (ownSession) await session.commitTransaction();

    return {
      released: true,
      journalId: releaseJournal?.journalId || null,
      feeJournalId,
      fees,
      isPartner: computed.isPartner,
      relationshipKind: computed.relationshipKind,
      feeRateApplied,
      labFeeMultiplier: computed.labFeeMultiplier,
      labFeeTotal,
      platformFee,
      purchaseAmount,
      labSettlementAmount: labNet,
      abutsRevenueAmount: platformFee + Number(fees.abutmentRetailTotal || 0),
      labTradingPartnerId: computed.partner?._id
        ? String(computed.partner._id)
        : null,
    };
  } catch (e) {
    if (ownSession) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    throw e;
  } finally {
    if (ownSession) session.endSession();
  }
}

/**
 * 제조사 발송(포장.발송)에서만 어벗츠몫 에스크로 해제 → 생산 매출·제조사 단가.
 * 가공 진입으로 옮기지 말 것. 비거래처 선불은 여기에 또 차감하지 않는다
 * (생성 보류에 소매가 있음). 키는 의뢰 1건 전체. 배송비 저널은 만들지 않는다.
 */
export async function releasePracticeTransferAbutmentShare({
  transfer,
  toothWorks = null,
  actorUserId = null,
  session: outerSession = null,
}) {
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  if (!transferId || !practiceAnchorId) {
    return { released: false, reason: "missing_anchors" };
  }

  const releaseAbutKey = practiceTransferEscrowReleaseAbutmentKey(transferId);
  const legacyReleaseKey = practiceTransferEscrowReleaseKey(transferId);
  const works = toothWorks || transfer?.toothWorks || [];

  const [existingAbutRelease, legacyRelease, holds, computed] =
    await Promise.all([
      getJournalByIdempotencyKey({
        idempotencyKey: releaseAbutKey,
        session: outerSession,
      }),
      getJournalByIdempotencyKey({
        idempotencyKey: legacyReleaseKey,
        session: outerSession,
      }),
      findAnyPracticeTransferHoldJournal(transferId, outerSession),
      computeAcceptedPracticeTransferFees({
        transfer,
        toothWorks: works,
        session: outerSession,
      }),
    ]);

  if (legacyRelease?.journalId) {
    return {
      released: false,
      reason: "already_released",
      journalId: legacyRelease.journalId,
      legacyFullRelease: true,
    };
  }
  if (existingAbutRelease?.journalId) {
    return {
      released: false,
      reason: "already_released",
      journalId: existingAbutRelease.journalId,
    };
  }
  if (!holds.any) {
    return { released: false, reason: "no_hold" };
  }

  const retailTotal = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.abutmentRetailTotal ??
          computed.fees?.abutmentRetailTotal ??
          0,
      ),
    ),
  );
  const creditSettingsForAbut = await loadCreditSettingsDefaults();
  const routeSplit = splitAbutmentRetailForRouteHolds({
    abutmentRetailTotal: retailTotal,
    abutmentQty: Math.max(
      0,
      Math.round(
        Number(
          transfer?.billing?.abutmentQty ?? computed.fees?.abutmentQty ?? 0,
        ),
      ),
    ),
    pricingTier: PLATFORM_ABUTMENT_PRICING_TIER,
    prices: computed.abutmentPrices || null,
    designFeePerTooth: Math.max(
      0,
      Math.round(
        Number(creditSettingsForAbut?.abutmentDesignLabFee ?? 10000) || 0,
      ),
    ),
    rushFeeMultiplier: rushFeeMultiplierFromTransfer(transfer),
  });
  const heldAbutmentOnly = Math.max(
    0,
    Math.round(Number(transfer?.billing?.heldAbutmentTotal ?? 0)),
  );
  // 어벗츠 해제는 생산비만. heldAbutmentTotal이 생산가로 저장된 경우 우선.
  let abutmentRetailTotal =
    heldAbutmentOnly > 0 &&
    (routeSplit.designFeeTotal <= 0 ||
      heldAbutmentOnly <= routeSplit.productionTotal)
      ? heldAbutmentOnly
      : routeSplit.productionTotal || retailTotal;
  if (abutmentRetailTotal <= 0) {
    return {
      released: false,
      reason: "zero_abutment",
      fees: computed.fees,
      abutmentRetailTotal: 0,
    };
  }

  const fromPaid = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromPaid ??
          holds.abutment?.meta?.fromPaid ??
          holds.legacy?.meta?.fromPaid ??
          0,
      ),
    ),
  );
  const fromFreeRequest = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromFreeRequest ??
          holds.abutment?.meta?.fromFreeRequest ??
          holds.legacy?.meta?.fromFreeRequest ??
          0,
      ),
    ),
  );
  const fromFreeShipping = Math.max(
    0,
    Math.round(
      Number(
        transfer?.billing?.holdFromFreeShipping ??
          holds.abutment?.meta?.fromFreeShipping ??
          holds.legacy?.meta?.fromFreeShipping ??
          0,
      ),
    ),
  );
  const fromFree = fromFreeRequest + fromFreeShipping;
  const heldTotalForFree =
    Number(transfer?.billing?.heldTotal || abutmentRetailTotal) ||
    abutmentRetailTotal;

  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  if (ownSession) session.startTransaction();

  try {
    await lockGuard(practiceAnchorId, session);
    const revenueOwners = await resolveRevenueOwners({
      practiceAnchorId,
      session,
    });
    const devopsAnchorId = revenueOwners?.devopsAnchorId || null;
    if (!devopsAnchorId) {
      const err = new Error("에스크로(devops) 사업자를 찾을 수 없습니다.");
      err.statusCode = 500;
      throw err;
    }

    const lines = [
      {
        accountCode: "PLATFORM_ESCROW",
        ownerRole: "devops",
        ownerId: devopsAnchorId,
        amount: -abutmentRetailTotal,
        amountExcludingVat: -abutmentRetailTotal,
        vatAmount: 0,
        creditKind: null,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source: "practice_transfer_escrow_release_abutment",
          displayKind: "abuts_share",
          displayLabel: PRACTICE_TRANSFER_LEDGER_LABELS.releaseAbutment,
          holdShare: "abutment",
        },
      },
    ];

    const freeShare =
      heldTotalForFree > 0
        ? Math.round((abutmentRetailTotal * fromFree) / heldTotalForFree)
        : 0;
    const freeReqShare =
      fromFree > 0 ? Math.round((freeShare * fromFreeRequest) / fromFree) : 0;
    const freeShipShare = Math.max(0, freeShare - freeReqShare);
    pushRevenueLines({
      isRemake: isPracticeTransferRemake(transfer),
      lines,
      owners: revenueOwners,
      spendAmount: abutmentRetailTotal,
      freeAmount: freeShare,
      fromFreeRequest: freeReqShare,
      fromFreeShipping: freeShipShare,
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      creditSettings: creditSettingsForAbut,
      meta: {
        source: "abutment_retail",
        displayKind: "abuts_share",
        displayLabel: PRACTICE_TRANSFER_LEDGER_LABELS.releaseAbutment,
        relationshipKind: computed.relationshipKind,
        feeRateApplied: computed.feeRateApplied,
        abutmentQty: Math.max(
          0,
          Math.round(
            Number(
              transfer?.billing?.abutmentQty ?? computed.fees?.abutmentQty ?? 0,
            ) || 0,
          ),
        ),
        abutmentRetail: abutmentRetailTotal,
      },
    });

    const journal = await postGeneralLedgerJournal({
      idempotencyKey: releaseAbutKey,
      eventType: "PRACTICE_TRANSFER_ESCROW_RELEASE",
      businessAnchorId: practiceAnchorId,
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      createdBy: actorUserId,
      meta: {
        holdShare: "abutment",
        abutmentRetailTotal,
        fees: computed.fees,
        feeRateApplied: computed.feeRateApplied,
        relationshipKind: computed.relationshipKind,
      },
      lines,
      session,
      skipIdempotencyLookup: true,
    });

    if (ownSession) await session.commitTransaction();

    return {
      released: true,
      journalId: journal?.journalId || null,
      fees: computed.fees,
      abutmentRetailTotal,
      feeRateApplied: computed.feeRateApplied,
      relationshipKind: computed.relationshipKind,
    };
  } catch (e) {
    if (ownSession) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    throw e;
  } finally {
    if (ownSession) session.endSession();
  }
}

/**
 * @deprecated 신규는 lab/abutment 분리 해제. 레거시·일괄 호환용 래퍼.
 */
export async function releasePracticeTransferEscrow({
  transfer,
  toothWorks = null,
  actorUserId = null,
  session: outerSession = null,
}) {
  const lab = await releasePracticeTransferLabShare({
    transfer,
    toothWorks,
    actorUserId,
    session: outerSession,
  });
  const abut = await releasePracticeTransferAbutmentShare({
    transfer,
    toothWorks,
    actorUserId,
    session: outerSession,
  });
  const released = Boolean(lab?.released || abut?.released);
  const already =
    lab?.reason === "already_released" || abut?.reason === "already_released";
  return {
    released,
    reason: released
      ? null
      : already
        ? "already_released"
        : lab?.reason || abut?.reason || "no_hold",
    journalId: lab?.journalId || abut?.journalId || null,
    fees: lab?.fees || abut?.fees,
    isPartner: lab?.isPartner,
    relationshipKind: lab?.relationshipKind || abut?.relationshipKind,
    feeRateApplied: lab?.feeRateApplied ?? abut?.feeRateApplied,
    labFeeMultiplier: lab?.labFeeMultiplier,
    labSettlementAmount: lab?.labSettlementAmount ?? 0,
    abutsRevenueAmount:
      Number(lab?.platformFee || 0) + Number(abut?.abutmentRetailTotal || 0),
    labTradingPartnerId: lab?.labTradingPartnerId || null,
    labRelease: lab,
    abutmentRelease: abut,
  };
}

/**
 * PTX 과금 롤백 — 원본 저널/라인 물리 삭제(제조사 REQUEST/SHIPPING과 동일).
 * 과거 REFUND 쌍이 있으면 원본+REFUND 모두 삭제(잔액 순변화 0).
 * 스토어 제품 판매 취소는 storeSale.service의 REFUND 경로를 유지한다.
 * ADJUST(어벗 디자인비 등) — refType+refId 스윕으로 누락 방지.
 * 치과 cancel-batch·휴지통 비우기·기공소 작업취소/거부·생성 실패 정리에서 공통 사용.
 */
export async function rollbackPracticeTransferBilling({
  transferId,
  session: outerSession = null,
  emitRealtime = true,
  /** false면 잔액 캐시 upsert·소켓 emit을 호출자가 응답 후 처리(mark-release 핫패스) */
  syncBalanceCache = true,
}) {
  const id = String(transferId || "").trim();
  if (!id || !Types.ObjectId.isValid(id)) {
    return {
      didRollback: false,
      reason: "invalid_id",
      deletedJournalIds: [],
      refundJournalIds: [],
      balanceRestoreByAnchor: {},
    };
  }

  const transferOid = new Types.ObjectId(id);
  const keys = [
    {
      key: practiceTransferEscrowReleaseAbutmentKey(id),
      events: ["PRACTICE_TRANSFER_ESCROW_RELEASE"],
    },
    {
      key: practiceTransferLabPlatformFeeKey(id),
      events: ["PRACTICE_TRANSFER_LAB_PLATFORM_FEE"],
    },
    {
      key: practiceTransferEscrowReleaseLabKey(id),
      events: ["PRACTICE_TRANSFER_ESCROW_RELEASE"],
    },
    {
      key: practiceTransferEscrowReleaseKey(id),
      events: ["PRACTICE_TRANSFER_ESCROW_RELEASE"],
    },
    {
      key: practiceTransferHoldAdjustKey(id),
      events: ["PRACTICE_TRANSFER_HOLD_ADJUST"],
    },
    {
      key: practiceTransferHoldAbutmentKey(id),
      events: ["PRACTICE_TRANSFER_SPEND_HOLD"],
    },
    {
      key: practiceTransferHoldLabKey(id),
      events: ["PRACTICE_TRANSFER_SPEND_HOLD"],
    },
    {
      key: practiceTransferHoldLabShippingKey(id),
      events: ["PRACTICE_TRANSFER_SPEND_HOLD"],
    },
    {
      key: practiceTransferHoldAbutsShippingKey(id),
      events: ["PRACTICE_TRANSFER_SPEND_HOLD"],
    },
    {
      key: practiceTransferHoldKey(id),
      events: ["PRACTICE_TRANSFER_SPEND_HOLD"],
    },
    {
      key: practiceTransferLegacySpendKey(id),
      events: ["PRACTICE_TRANSFER_SPEND_COMMIT"],
    },
    {
      key: practiceTransferLabShippingKey(id),
      events: ["SHIPPING_SPEND_COMMIT"],
    },
    {
      key: practiceTransferAbutsShippingKey(id),
      events: ["SHIPPING_SPEND_COMMIT"],
    },
  ];

  /** @type {Map<string, { events: string[] }>} */
  const journalPlanById = new Map();
  const eventsByKey = new Map(keys.map(({ key, events }) => [key, events]));

  // 기본 키 + 과거 환불 후 재게시(`:after:`) 활성 키
  const liveKeyResults = await Promise.all(
    keys.map(({ key }) => resolveLiveIdempotencyKey(key, outerSession)),
  );
  const allLookupKeys = [
    ...new Set([
      ...keys.map(({ key }) => key),
      ...liveKeyResults.map((r) => r.key).filter(Boolean),
      ...liveKeyResults
        .map((r) => String(r.existing?.idempotencyKey || "").trim())
        .filter(Boolean),
    ]),
  ];
  const journalsByKey = await getJournalsByIdempotencyKeys({
    idempotencyKeys: allLookupKeys,
    session: outerSession,
  });

  const considerJournal = async (key, existing) => {
    const jid = String(existing?.journalId || "").trim();
    if (!jid || journalPlanById.has(jid)) return;
    const et = String(existing?.eventType || "");
    const baseKey = String(key || "").split(":after:")[0];
    const events =
      et === "REFUND"
        ? ["REFUND"]
        : eventsByKey.get(baseKey) ||
          eventsByKey.get(key) ||
          PRACTICE_TRANSFER_ROLLBACK_EVENT_TYPES;
    journalPlanById.set(jid, { events });

    // 과거 비제조사 REFUND 정책 잔여분 — 원본 삭제 시 쌍도 함께 제거
    if (et !== "REFUND") {
      const refund = await getJournalByIdempotencyKey({
        idempotencyKey: refundIdempotencyKeyFor(
          String(existing?.idempotencyKey || key || ""),
        ),
        session: outerSession,
      });
      const rid = String(refund?.journalId || "").trim();
      if (rid && !journalPlanById.has(rid)) {
        journalPlanById.set(rid, { events: ["REFUND"] });
      }
    }
  };

  for (const [key, existing] of journalsByKey.entries()) {
    await considerJournal(key, existing);
  }

  // 키 누락·과거 포맷·디자인비 ADJUST·REFUND 스윕
  const byRef = await LedgerJournal.find({
    refType: "PRACTICE_TRANSFER",
    refId: { $in: [transferOid, id] },
    eventType: { $in: PRACTICE_TRANSFER_ROLLBACK_EVENT_TYPES },
  })
    .select({ journalId: 1, eventType: 1, idempotencyKey: 1 })
    .session(outerSession || null)
    .lean();

  for (const row of byRef || []) {
    await considerJournal(String(row?.idempotencyKey || ""), row);
  }

  if (journalPlanById.size === 0) {
    return {
      didRollback: false,
      reason: "no_spend",
      deletedJournalIds: [],
      refundJournalIds: [],
      balanceRestoreByAnchor: {},
    };
  }

  const journalIds = [...journalPlanById.keys()];
  const lines = await LedgerLine.find({ journalId: { $in: journalIds } })
    .select({ journalId: 1, accountCode: 1, ownerId: 1, amount: 1 })
    .session(outerSession || null)
    .lean();

  const balanceRestoreByAnchor = {};
  for (const line of lines || []) {
    const code = String(line?.accountCode || "").trim();
    if (!PRACTICE_TRANSFER_BALANCE_ACCOUNT_CODES.has(code)) continue;
    const ownerId = String(line?.ownerId || "").trim();
    if (!ownerId || !Types.ObjectId.isValid(ownerId)) continue;
    const amount = Number(line?.amount || 0);
    if (!Number.isFinite(amount) || amount === 0) continue;
    // 소비(-) 삭제 → 잔액 복원(+). 적립(+) 삭제 → 잔액 차감(-).
    // 원본+REFUND를 같이 지우면 순변화 0.
    balanceRestoreByAnchor[ownerId] =
      Number(balanceRestoreByAnchor[ownerId] || 0) - amount;
  }

  let didRollback = false;
  let lastReason = "no_spend";
  const deletedJournalIds = [];
  const refundJournalIds = [];

  const applyDeleteResults = (results) => {
    for (const { journalId, deleteResult } of results) {
      if (deleteResult?.deleted) {
        didRollback = true;
        lastReason = null;
        deletedJournalIds.push(journalId);
      } else {
        lastReason = deleteResult?.reason || lastReason;
      }
    }
  };

  const deleteEntries = [...journalPlanById.entries()];
  if (outerSession) {
    const deleteResults = [];
    for (const [journalId, plan] of deleteEntries) {
      const deleteResult = await deleteGeneralLedgerCommitJournal({
        journalId,
        expectedEventTypes: plan.events,
        session: outerSession,
      });
      deleteResults.push({ journalId, deleteResult });
    }
    applyDeleteResults(deleteResults);
  } else {
    const deleteResults = await Promise.all(
      deleteEntries.map(([journalId, plan]) =>
        deleteGeneralLedgerCommitJournal({
          journalId,
          expectedEventTypes: plan.events,
          session: null,
        }).then((deleteResult) => ({ journalId, deleteResult })),
      ),
    );
    applyDeleteResults(deleteResults);
  }

  if (didRollback) {
    const affectedAnchorIds = Object.keys(balanceRestoreByAnchor);
    if (syncBalanceCache) {
      await Promise.all(
        affectedAnchorIds.map(async (anchorId) => {
          try {
            await upsertBusinessCreditBalanceFromLedger({
              businessAnchorId: anchorId,
              session: outerSession,
            });
          } catch {
            // best-effort cache; ledger lines are SSOT
          }
        }),
      );
    }

    if (emitRealtime) {
      try {
        const { emitCreditBalanceUpdatedToBusiness } = await import(
          "../utils/creditRealtime.js"
        );
        await Promise.all(
          affectedAnchorIds.map((anchorId) =>
            emitCreditBalanceUpdatedToBusiness({
              businessAnchorId: anchorId,
              balanceDelta: Number(balanceRestoreByAnchor[anchorId] || 0),
              reason: "practice_transfer_billing_rollback",
              refId: id,
              forceEmit: true,
            }),
          ),
        );
      } catch {
        // best-effort
      }
    }
  }

  return {
    didRollback,
    reason: didRollback ? null : lastReason,
    deletedJournalIds,
    refundJournalIds,
    balanceRestoreByAnchor,
  };
}

/**
 * rollbackPracticeTransferBilling({ syncBalanceCache:false, emitRealtime:false }) 이후
 * 응답 밖에서 잔액 캐시·소켓을 맞춘다.
 */
export async function applyPracticeTransferBillingRollbackSideEffects({
  transferId,
  balanceRestoreByAnchor = {},
}) {
  const id = String(transferId || "").trim();
  const affectedAnchorIds = Object.keys(balanceRestoreByAnchor || {}).filter(
    Boolean,
  );
  if (!affectedAnchorIds.length) return { applied: false };

  await Promise.all(
    affectedAnchorIds.map(async (anchorId) => {
      try {
        await upsertBusinessCreditBalanceFromLedger({
          businessAnchorId: anchorId,
        });
      } catch {
        // best-effort cache; ledger lines are SSOT
      }
    }),
  );

  try {
    const { emitCreditBalanceUpdatedToBusiness } = await import(
      "../utils/creditRealtime.js"
    );
    await Promise.all(
      affectedAnchorIds.map((anchorId) =>
        emitCreditBalanceUpdatedToBusiness({
          businessAnchorId: anchorId,
          balanceDelta: Number(balanceRestoreByAnchor[anchorId] || 0),
          reason: "practice_transfer_billing_rollback",
          refId: id,
          forceEmit: true,
        }),
      ),
    );
  } catch {
    // best-effort
  }

  return { applied: true, affectedAnchorIds };
}

function relationshipKindFromPartner(partner) {
  return partner?.status === "active" || partner?.status === "referred"
    ? partner.status
    : "none";
}

function implantFavoritesFromPractice(practice) {
  const raw = practice?.practiceTransferSettings?.implantFavorites;
  return Array.isArray(raw) ? raw : [];
}

function rushFeeMultiplierFromTransfer(transfer, override) {
  if (override !== undefined) {
    return normalizeRushFeeMultiplier(override);
  }
  return resolveRushFeeMultiplier({
    rushProcessing: Boolean(transfer?.production?.rushProcessing),
    rushFeeMultiplier: transfer?.billing?.rushFeeMultiplier,
  });
}

function isFeeQuoteShippingLine(line) {
  const type = String(line?.prosthesisType || line?.type || "").trim();
  const compact = type.replace(/\s+/g, "");
  return (
    compact === LAB_FEE_SHIPPING_ITEM_NAME ||
    compact === "배송비" ||
    /^shipping$/i.test(type)
  );
}

/** 견적 라인 기공비 합(배송 제외). */
function sumFeeQuoteWorkFromLines(lines) {
  let total = 0;
  for (const line of Array.isArray(lines) ? lines : []) {
    if (isFeeQuoteShippingLine(line)) continue;
    total += Math.max(0, Math.round(Number(line?.labFee || 0)));
    total += Math.max(0, Math.round(Number(line?.labAbutmentFee || 0)));
    total += Math.max(0, Math.round(Number(line?.abutmentRetail || 0)));
  }
  return total;
}

function resolveLabShippingFeeForQuote({ fees, billing = null }) {
  const fromFees = Math.max(0, Math.round(Number(fees?.labShippingFee || 0)));
  if (fromFees > 0) return fromFees;
  const fromBilling = Math.max(
    0,
    Math.round(Number(billing?.labShippingFee || 0)),
  );
  if (fromBilling > 0) return fromBilling;
  const workFromLines = sumFeeQuoteWorkFromLines(fees?.lines);
  const totalRaw = Math.max(
    0,
    Math.round(Number(billing?.total ?? fees?.total ?? 0)),
  );
  if (workFromLines > 0 && totalRaw > workFromLines) {
    return totalRaw - workFromLines;
  }
  return 0;
}

export function toFeeQuoteApi(quote) {
  const fees = quote?.fees || {};
  const billed = Boolean(quote?.billed);
  const labAbutmentTotal = Math.max(
    0,
    Math.round(Number(fees.labAbutmentTotal || 0)),
  );
  const rawLines = Array.isArray(fees.lines) ? fees.lines : [];
  const labShippingFee = resolveLabShippingFeeForQuote({
    fees,
    billing: quote?.billing || null,
  });
  return {
    labFeeTotal: Math.max(0, Math.round(Number(fees.labFeeTotal || 0))),
    labAbutmentTotal,
    labAbutmentPending: Boolean(fees.labAbutmentPending),
    abutmentRetailTotal: Math.max(
      0,
      Math.round(Number(fees.abutmentRetailTotal || 0)),
    ),
    abutmentQuotePending: Boolean(fees.abutmentQuotePending),
    abutmentQty: Math.max(0, Math.round(Number(fees.abutmentQty || 0))),
    total: Math.max(0, Math.round(Number(fees.total || 0))),
    /** 기공수가 배송비. 견적 툴팁 미사용·크레딧 정산 분리용. total에 포함돼 있을 수 있음. */
    labShippingFee,
    lines: billed ? stripLabFeeMinFromFeeLines(rawLines) : rawLines,
    relationshipKind:
      quote?.relationshipKind === "active" || quote?.relationshipKind === "referred"
        ? quote.relationshipKind
        : "none",
    feeRateApplied: Number(quote?.feeRateApplied || 0),
    labFeeMultiplier: normalizeLabFeeMultiplier(
      quote?.labFeeMultiplier ?? quote?.fees?.labFeeMultiplier,
    ),
    rushFeeMultiplier: normalizeRushFeeMultiplier(
      quote?.rushFeeMultiplier ?? quote?.fees?.rushFeeMultiplier,
    ),
    labSettlementAmount: Math.max(
      0,
      Math.round(Number(quote?.labSettlementAmount || 0)),
    ),
    abutsRevenueAmount: Math.max(
      0,
      Math.round(Number(quote?.abutsRevenueAmount || 0)),
    ),
    labTradingPartnerId: quote?.labTradingPartnerId || null,
    billed,
    usedDefaultSchedule: Boolean(quote?.usedDefaultSchedule),
    labFeeConfigured: Boolean(quote?.usedDefaultSchedule)
      ? true
      : quote?.labFeeConfigured !== false,
    missingFeeNames: Array.isArray(quote?.missingFeeNames)
      ? quote.missingFeeNames
          .map((name) => String(name || "").trim())
          .filter(Boolean)
      : [],
    isRemake: Boolean(quote?.isRemake || quote?.remake),
    autoMatchBudget: billed
      ? null
      : normalizeAutoMatchBudget(quote?.autoMatchBudget),
  };
}

export function toBillingPreviewFields(quote) {
  const api = toFeeQuoteApi(quote);
  const specialSupply = isLabPracticeSpecialSupplySnapshotCaptured(
    quote?.labPracticeSpecialSupply,
  )
    ? quote.labPracticeSpecialSupply
    : undefined;
  return {
    labFeeTotal: api.labFeeTotal,
    labAbutmentTotal: api.labAbutmentTotal,
    labAbutmentPending: api.labAbutmentPending,
    abutmentRetailTotal: api.abutmentRetailTotal,
    abutmentQty: api.abutmentQty,
    total: api.total,
    labShippingFee: api.labShippingFee,
    isTradingPartner: api.relationshipKind === "active",
    relationshipKind: api.relationshipKind,
    feeRateApplied: api.feeRateApplied,
    ...(quote?.aiTrainingConsent === true || quote?.aiTrainingConsent === false
      ? { aiTrainingConsent: quote.aiTrainingConsent }
      : {}),
    ...(quote?.internalPerformer === true ? { internalPerformer: true } : {}),
    labFeeMultiplier: api.labFeeMultiplier,
    ...(specialSupply ? { labPracticeSpecialSupply: specialSupply } : {}),
    rushFeeMultiplier: api.rushFeeMultiplier,
    labTradingPartnerId: api.labTradingPartnerId,
    labSettlementAmount: api.labSettlementAmount,
    abutsRevenueAmount: api.abutsRevenueAmount,
    billedAt: null,
    isRemake: Boolean(api.isRemake),
    autoMatchBudget: api.autoMatchBudget || undefined,
  };
}

/** 청구 완료 견적 라인에서 예산 하한(labFeeMin) 제거. */
function stripLabFeeMinFromFeeLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return [];
  return lines.map((line) => {
    if (!line || typeof line !== "object" || line.labFeeMin == null) {
      return line;
    }
    const { labFeeMin: _omit, ...rest } = line;
    return rest;
  });
}

export function feeQuoteFromBillingDoc(billing, { lines = [], billed = false } = {}) {
  const total = Math.max(0, Math.round(Number(billing?.total || 0)));
  const feeRateApplied = Number(billing?.feeRateApplied || 0);
  const labSettlementAmount = Math.max(
    0,
    Math.round(Number(billing?.labSettlementAmount || 0)),
  );
  const abutsRevenueAmount = Math.max(
    0,
    Math.round(Number(billing?.abutsRevenueAmount || total - labSettlementAmount)),
  );
  return toFeeQuoteApi({
    fees: {
      labFeeTotal: billing?.labFeeTotal || 0,
      labAbutmentTotal: billing?.labAbutmentTotal || 0,
      labAbutmentPending: Boolean(billing?.labAbutmentPending),
      abutmentRetailTotal: billing?.abutmentRetailTotal || 0,
      abutmentQuotePending: Boolean(billing?.abutmentQuotePending),
      abutmentQty: billing?.abutmentQty || 0,
      total,
      lines: billed ? stripLabFeeMinFromFeeLines(lines) : lines,
      labFeeMultiplier: billing?.labFeeMultiplier,
      rushFeeMultiplier: billing?.rushFeeMultiplier,
      labShippingFee: billing?.labShippingFee || 0,
    },
    billing,
    relationshipKind: billing?.relationshipKind || "none",
    feeRateApplied,
    labFeeMultiplier: billing?.labFeeMultiplier,
    rushFeeMultiplier: billing?.rushFeeMultiplier,
    labSettlementAmount,
    abutsRevenueAmount,
    labTradingPartnerId: billing?.labTradingPartnerId
      ? String(billing.labTradingPartnerId)
      : null,
    billed,
    usedDefaultSchedule: false,
    isRemake: Boolean(billing?.isRemake),
    // 청구 완료 후에는 예산 구간 대신 확정 금액만 노출
    autoMatchBudget: billed
      ? null
      : normalizeAutoMatchBudget(billing?.autoMatchBudget),
  });
}

/** remakeCharges billingDelta 합 — 원본 기공비 견적과 리메이크 증분을 분리할 때 사용 */
export function sumRemakeChargeLabFeeTotals(remakeCharges) {
  const rows = Array.isArray(remakeCharges) ? remakeCharges : [];
  return rows.reduce((sum, row) => {
    const n = Math.max(
      0,
      Math.round(
        Number(row?.billingDelta?.labFeeTotal ?? row?.billingDelta?.total ?? 0),
      ),
    );
    return sum + n;
  }, 0);
}

/** 기공비·크레딧 단가 저장 시 quote-context 캐시 무효화. */
export function invalidatePracticeTransferQuoteCaches(labAnchorId = null) {
  invalidateRequestPerfCacheByPrefix("practice-transfer:abutment-prices");
  const labId = String(labAnchorId || "").trim();
  if (labId) {
    invalidateRequestPerfCacheByPrefix(
      `practice-transfer:quote-context:${labId}:`,
    );
    return;
  }
  invalidateRequestPerfCacheByPrefix("practice-transfer:quote-context:");
}

/**
 * 기공의뢰 견적(치과 크레딧 소비액 + 기공소 수령액).
 * labAnchorId 없으면 기본수가 없음(0원).
 * labFeeMultiplierLabAnchorId: 할증 앵커(미지정 시 labAnchorId). 협력=수행, 하청=원청.
 */
function frozenPracticeTransferFeeSnapshot(billing) {
  if (!billing || typeof billing !== "object") return undefined;
  return {
    frozen: true,
    aiTrainingConsent: billing.aiTrainingConsent,
    internalPerformer: billing.internalPerformer === true,
  };
}

export async function buildPracticeTransferQuote({
  practiceAnchorId = null,
  labAnchorId = null,
  labFeeMultiplierLabAnchorId = null,
  toothWorks,
  labFeeSchedule = undefined,
  abutmentRetailPrice: _abutmentRetailPrice = undefined,
  payoutRates = undefined,
  relationshipKind = undefined,
  labTradingPartnerId = undefined,
  remake = false,
  skipAbutmentFees: skipAbutmentFeesInput = undefined,
  matchingMode = undefined,
  autoMatchBudget = undefined,
  catalog: catalogInput = undefined,
  rushFeeMultiplier: rushFeeMultiplierInput = 1,
  skipJig = null,
  subcontracted = false,
  feeSnapshot = null,
  consentLabAnchorId = null,
}) {
  let schedule = labFeeSchedule;
  const labId = String(labAnchorId || "").trim();
  const multiplierLabId = String(
    labFeeMultiplierLabAnchorId || labAnchorId || "",
  ).trim();
  const usedDefaultSchedule = !labId;
  const loadedFromDb = schedule == null;
  const needLab = loadedFromDb && labId && Types.ObjectId.isValid(labId);
  const needMultiplierLab =
    multiplierLabId &&
    Types.ObjectId.isValid(multiplierLabId) &&
    multiplierLabId !== labId;
  const needPartner = relationshipKind == null;
  const needRates = payoutRates == null;

  const practiceId = String(practiceAnchorId || "").trim();
  const needFavorites = practiceId && Types.ObjectId.isValid(practiceId);
  const needBudget =
    autoMatchBudget === undefined &&
    needFavorites &&
    (!labId || String(matchingMode || "").trim() === "auto");
  const needCatalog =
    catalogInput === undefined && (usedDefaultSchedule || needBudget);
  const consentLabId = String(consentLabAnchorId || "").trim();
  const needConsentLab =
    Boolean(subcontracted) &&
    consentLabId &&
    Types.ObjectId.isValid(consentLabId) &&
    consentLabId !== labId;
  const [lab, multiplierLabDoc, practice, abutmentPricingTier, abutmentPrices, partner, cachedRates, catalog, consentLab] =
    await Promise.all([
      needLab
        ? BusinessAnchor.findById(labId)
            .select({
              businessType: 1,
              aiTrainingConsent: 1,
              labFeeSchedule: 1,
              labPracticeFeeMultipliers: 1,
              labPracticeSpecialSupplyPrices: 1,
              labPracticeSpecialSupplyPendingChange: 1,
            })
            .lean()
        : Promise.resolve(null),
      needMultiplierLab
        ? BusinessAnchor.findById(multiplierLabId)
            .select({
              labPracticeFeeMultipliers: 1,
            })
            .lean()
        : Promise.resolve(null),
      needFavorites
        ? BusinessAnchor.findById(practiceId)
            .select({
              "practiceTransferSettings.implantFavorites": 1,
              "practiceTransferSettings.autoMatchBudget": 1,
            })
            .lean()
        : Promise.resolve(null),
      Promise.resolve(PLATFORM_ABUTMENT_PRICING_TIER),
      loadCachedAbutmentCreditPrices(practiceAnchorId),
      needPartner
        ? findLabPracticeRelationship({ labAnchorId, practiceAnchorId })
        : Promise.resolve(null),
      needRates ? loadCachedDevopsPayoutRates() : Promise.resolve(payoutRates),
      catalogInput !== undefined
        ? Promise.resolve(catalogInput)
        : needCatalog
          ? loadAutoMatchBudgetCatalog()
          : Promise.resolve(null),
      needConsentLab
        ? BusinessAnchor.findById(consentLabId)
            .select({ businessType: 1, aiTrainingConsent: 1 })
            .lean()
        : Promise.resolve(null),
    ]);

  const multiplierLab = multiplierLabDoc || lab;

  const resolvedBudgetRaw =
    autoMatchBudget !== undefined
      ? autoMatchBudget
      : needBudget
        ? practice?.practiceTransferSettings?.autoMatchBudget
        : autoMatchBudget;
  const resolvedBudget = usedDefaultSchedule
    ? resolveAutoMatchBudgetOrDefaults(resolvedBudgetRaw, catalog)
    : normalizeAutoMatchBudget(resolvedBudgetRaw, catalog);

  if (schedule == null) {
    schedule = lab?.labFeeSchedule || null;
  }
  const sourceSchedule = schedule;

  if (usedDefaultSchedule) {
    schedule = LAB_FEE_SCHEDULE_ZEROS;
  } else if (loadedFromDb) {
    schedule = resolveLabFeeScheduleSourceForPractice(lab, practiceId);
  } else {
    schedule = applyLabPracticeSpecialSupplyToSchedule(
      schedule,
      lab,
      practiceId,
    );
  }

  const useRemake = Boolean(remake);
  const skipAbutmentFees =
    skipAbutmentFeesInput != null ? Boolean(skipAbutmentFeesInput) : useRemake;
  // 기공소 없음(자동매칭 작성): 할증 없음. 지정·수신: 할증 앵커(협력=수행, 하청=원청).
  const labFeeMultiplier = usedDefaultSchedule
    ? 1
    : resolveLabPracticeFeeMultiplier(multiplierLab, practiceId);
  // 지정 기공소: 생성 시 스냅샷. 자동매칭(기공소 미정): 수락 시 live 후 billed 고정.
  const labPracticeSpecialSupply = usedDefaultSchedule
    ? null
    : captureLabPracticeSpecialSupplySnapshot(lab, practiceId);
  const rushFeeMultiplier = normalizeRushFeeMultiplier(rushFeeMultiplierInput);
  const fees = computePracticeTransferRetailFeesWithLabShipping(
    {
      toothWorks,
      implantFavorites: implantFavoritesFromPractice(practice),
      labFeeSchedule: schedule,
      abutmentPricingTier,
      abutmentPrices,
      remake: useRemake,
      skipAbutmentFees,
      labFeeMultiplier,
      rushFeeMultiplier,
    },
    {
      toothWorks,
      production: {
        skipJig:
          skipJig === false ||
          skipJig === "false" ||
          skipJig === 0 ||
          skipJig === "0" ||
          skipJig === "N"
            ? false
            : skipJig == null
              ? true
              : Boolean(skipJig),
      },
      billing: {},
    },
  );

  let autoMatchBudgetOut = null;

  const labFeeConfigured = resolveQuoteLabFeeConfigured({
    usedDefaultSchedule,
    schedule: sourceSchedule,
    toothWorks,
    remake: useRemake,
    labFeeTotal: fees.labFeeTotal,
  });
  const missingFeeNames = usedDefaultSchedule
    ? []
    : missingLabFeeItemNames(sourceSchedule, toothWorks);

  let kind = relationshipKind;
  let partnerId =
    labTradingPartnerId != null ? labTradingPartnerId : null;
  if (kind == null) {
    kind = relationshipKindFromPartner(partner);
    partnerId = partner?._id ? String(partner._id) : null;
  }

  const rates = cachedRates;

  const resolvedMatchingMode =
    String(matchingMode || "").trim() === "auto"
      ? "auto"
      : matchingMode == null && !labId
        ? "auto"
        : "direct";
  const frozenFee =
    feeSnapshot && feeSnapshot.frozen === true ? feeSnapshot : null;
  // 하청 수가 앵커는 원청(본부)이다. 동의는 보철을 올리는 수행 기공소 것.
  const consentSubject = Boolean(subcontracted)
    ? needConsentLab
      ? consentLab
      : consentLabId && consentLabId === labId
        ? lab
        : null
    : lab;
  const performerIsInternal = frozenFee
    ? frozenFee.internalPerformer === true
    : isInternalLabBusinessType(consentSubject);
  const knowsPerformer = Boolean(subcontracted)
    ? Boolean(consentSubject)
    : resolvedMatchingMode === "direct" && Boolean(labId);
  const snapConsent = frozenFee?.aiTrainingConsent;
  const aiTrainingConsent = frozenFee
    ? performerIsInternal
      ? true
      : snapConsent === true || snapConsent === false
        ? snapConsent
        : undefined
    : performerIsInternal
      ? true
      : knowsPerformer
        ? isLabAiTrainingConsentAllowed(consentSubject?.aiTrainingConsent)
        : undefined;
  const feeRateApplied = resolvePracticeTransferFeeRate({
    matchingMode: resolvedMatchingMode,
    payoutRates: rates,
    subcontracted: Boolean(subcontracted),
    performerIsInternal,
    aiTrainingConsent,
  });
  const { abutsRevenueAmount, labSettlementAmount } =
    splitPracticeTransferSettlement({
      labFeeTotal: fees.labFeeTotal,
      abutmentRetailTotal: fees.abutmentRetailTotal,
      feeRateApplied,
    });

  return {
    fees,
    relationshipKind: kind === "active" || kind === "referred" ? kind : "none",
    feeRateApplied,
    aiTrainingConsent,
    internalPerformer: performerIsInternal,
    labFeeMultiplier,
    labPracticeSpecialSupply,
    rushFeeMultiplier,
    labSettlementAmount,
    abutsRevenueAmount,
    labTradingPartnerId: partnerId,
    usedDefaultSchedule,
    labFeeConfigured,
    missingFeeNames,
    billed: false,
    isRemake: useRemake,
    remake: useRemake,
    abutmentPricingTier,
    abutmentPrices,
    abutmentRetailPrice: 0,
    autoMatchBudget: autoMatchBudgetOut,
    abutsLabFeeCatalog: catalog || undefined,
    schedule: usedDefaultSchedule
      ? LAB_FEE_SCHEDULE_ZEROS
      : normalizeLabFeeSchedule(schedule),
    remakeSchedule: usedDefaultSchedule
      ? LAB_FEE_SCHEDULE_ZEROS
      : normalizeLabFeeRemakeSchedule(schedule),
    items: usedDefaultSchedule
      ? normalizeLabFeeItems(LAB_FEE_SCHEDULE_ZEROS)
      : normalizeLabFeeItems(schedule),
  };
}

export async function quotePracticeTransferFees({
  labAnchorId,
  toothWorks,
  practiceAnchorId = null,
}) {
  return buildPracticeTransferQuote({
    labAnchorId,
    practiceAnchorId,
    toothWorks,
  });
}

/**
 * 임시치아 후속 크라운/브리지 — 어벗 비용 제외, 증분 lab hold.
 */
export async function holdPracticeTransferProsthesisFollowUpCredits({
  transfer,
  followUpIndex = 0,
  deltaFees,
  actorUserId = null,
  session: outerSession = null,
}) {
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  if (!transferId || !practiceAnchorId) {
    return { held: false, reason: "missing_anchors" };
  }

  const holdLabAmount = Math.max(
    0,
    Math.round(Number(deltaFees?.labFeeTotal ?? deltaFees?.total ?? 0) || 0),
  );
  if (holdLabAmount <= 0) {
    return {
      held: false,
      reason: "zero_fee",
      heldTotal: 0,
      heldLabTotal: 0,
      heldAbutmentTotal: 0,
    };
  }

  const baseFollowUpKey = practiceTransferFollowUpHoldKey(
    transferId,
    followUpIndex,
  );
  const { key: idempotencyKey, existing } = await resolveLiveIdempotencyKey(
    baseFollowUpKey,
    outerSession,
  );
  if (existing?.journalId) {
    return {
      held: false,
      reason: "already_held",
      journalId: existing.journalId,
      heldTotal: holdLabAmount,
      heldLabTotal: holdLabAmount,
      heldAbutmentTotal: 0,
    };
  }

  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  if (ownSession) session.startTransaction();

  try {
    await lockGuard(practiceAnchorId, session);
    const devopsAnchorId = await resolveDevopsEscrowOwnerId(session);
    if (!devopsAnchorId) {
      const err = new Error("에스크로(devops) 사업자를 찾을 수 없습니다.");
      err.statusCode = 500;
      throw err;
    }

    const balance = await computeBusinessCreditBalanceFromLedger({
      businessAnchorId: practiceAnchorId,
      session,
    });
    const allowOverdraft =
      await practiceAllowsFreeRequestOverdraft(practiceAnchorId);
    const prepared = prepareHoldSliceEntry({
      transferId,
      practiceAnchorId,
      devopsAnchorId,
      amount: holdLabAmount,
      shareKind: "lab",
      displayLabel: "후속 보철 추가",
      actorUserId,
      split: {
        remainingPaid: Number(balance?.paidCredit || 0),
        remainingFreeRequest: Number(balance?.freeRequestCredit || 0),
        remainingFreeShipping: Number(balance?.freeShippingCredit || 0),
      },
      allowFreeRequestOverdraft: allowOverdraft,
    });
    if (!prepared.prepared) {
      const err = new Error("크레딧이 부족합니다.");
      err.statusCode = 402;
      throw err;
    }

    const journal = await postGeneralLedgerJournal({
      ...prepared.entry,
      idempotencyKey,
      session,
      skipIdempotencyLookup: true,
      meta: {
        ...(prepared.entry.meta || {}),
        followUpIndex,
        displayLabel: "후속 보철 추가",
      },
    });

    if (ownSession) await session.commitTransaction();

    return {
      held: true,
      journalId: journal?.journalId || null,
      heldTotal: holdLabAmount,
      heldLabTotal: holdLabAmount,
      heldAbutmentTotal: 0,
      fromPaid: prepared.fromPaid,
      fromFreeRequest: prepared.fromFreeRequest,
      fromFreeShipping: prepared.fromFreeShipping,
      idempotencyKey,
    };
  } catch (error) {
    if (ownSession) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    throw error;
  } finally {
    if (ownSession) session.endSession();
  }
}

/**
 * 기공소 리메이크 청구 — 동일 PTX에 리메이크 수가 증분 hold.
 * (후속 보철 hold와 동일 패턴, 멱등키만 remake_charge_hold)
 */
export async function holdPracticeTransferRemakeChargeCredits({
  transfer,
  chargeIndex = 0,
  deltaFees,
  actorUserId = null,
  session: outerSession = null,
  displayLabel = "리메이크 청구",
}) {
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  if (!transferId || !practiceAnchorId) {
    return { held: false, reason: "missing_anchors" };
  }

  const holdLabAmount = Math.max(
    0,
    Math.round(Number(deltaFees?.labFeeTotal ?? deltaFees?.total ?? 0) || 0),
  );
  if (holdLabAmount <= 0) {
    return {
      held: false,
      reason: "zero_fee",
      heldTotal: 0,
      heldLabTotal: 0,
      heldAbutmentTotal: 0,
    };
  }

  const baseKey = practiceTransferRemakeChargeHoldKey(transferId, chargeIndex);
  const { key: idempotencyKey, existing } = await resolveLiveIdempotencyKey(
    baseKey,
    outerSession,
  );
  if (existing?.journalId) {
    return {
      held: false,
      reason: "already_held",
      journalId: existing.journalId,
      heldTotal: holdLabAmount,
      heldLabTotal: holdLabAmount,
      heldAbutmentTotal: 0,
    };
  }

  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  if (ownSession) session.startTransaction();

  try {
    await lockGuard(practiceAnchorId, session);
    const devopsAnchorId = await resolveDevopsEscrowOwnerId(session);
    if (!devopsAnchorId) {
      const err = new Error("에스크로(devops) 사업자를 찾을 수 없습니다.");
      err.statusCode = 500;
      throw err;
    }

    const balance = await computeBusinessCreditBalanceFromLedger({
      businessAnchorId: practiceAnchorId,
      session,
    });
    const allowOverdraft =
      await practiceAllowsFreeRequestOverdraft(practiceAnchorId);
    const prepared = prepareHoldSliceEntry({
      transferId,
      practiceAnchorId,
      devopsAnchorId,
      amount: holdLabAmount,
      shareKind: "lab",
      displayLabel,
      actorUserId,
      split: {
        remainingPaid: Number(balance?.paidCredit || 0),
        remainingFreeRequest: Number(balance?.freeRequestCredit || 0),
        remainingFreeShipping: Number(balance?.freeShippingCredit || 0),
      },
      allowFreeRequestOverdraft: allowOverdraft,
    });
    if (!prepared.prepared) {
      const err = new Error("크레딧이 부족합니다.");
      err.statusCode = 402;
      throw err;
    }

    const journal = await postGeneralLedgerJournal({
      ...prepared.entry,
      idempotencyKey,
      session,
      skipIdempotencyLookup: true,
      meta: {
        ...(prepared.entry.meta || {}),
        remakeChargeIndex: chargeIndex,
        displayLabel,
      },
    });

    if (ownSession) await session.commitTransaction();

    return {
      held: true,
      journalId: journal?.journalId || null,
      heldTotal: holdLabAmount,
      heldLabTotal: holdLabAmount,
      heldAbutmentTotal: 0,
      fromPaid: prepared.fromPaid,
      fromFreeRequest: prepared.fromFreeRequest,
      fromFreeShipping: prepared.fromFreeShipping,
      idempotencyKey,
    };
  } catch (error) {
    if (ownSession) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    throw error;
  } finally {
    if (ownSession) session.endSession();
  }
}

/**
 * 리메이크 청구 hold → 기공소 정산 적립(작업시작 후 청구는 즉시 해제).
 * 원본 lab release와 별도 멱등키(증분).
 */
export async function releasePracticeTransferRemakeChargeCredits({
  transfer,
  chargeIndex = 0,
  deltaFees,
  holdMeta = null,
  actorUserId = null,
  session: outerSession = null,
  displayLabel = "리메이크 청구",
}) {
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  const parties = resolvePracticeTransferSettlementParties(transfer);
  const labAnchorId = parties.grossOwnerId;
  if (!transferId || !practiceAnchorId || !labAnchorId) {
    return { released: false, reason: "missing_anchors" };
  }

  const releaseAmount = Math.max(
    0,
    Math.round(Number(deltaFees?.labFeeTotal ?? deltaFees?.total ?? 0) || 0),
  );
  if (releaseAmount <= 0) {
    return {
      released: false,
      reason: "zero_fee",
      labFeeTotal: 0,
      platformFee: 0,
      labSettlementAmount: 0,
    };
  }

  const releaseKey = practiceTransferRemakeChargeReleaseKey(
    transferId,
    chargeIndex,
  );
  const feeKey = practiceTransferRemakeChargePlatformFeeKey(
    transferId,
    chargeIndex,
  );
  const holdBaseKey = practiceTransferRemakeChargeHoldKey(
    transferId,
    chargeIndex,
  );

  const [existingRelease, existingFee, holdLive, payoutRates] =
    await Promise.all([
      getJournalByIdempotencyKey({
        idempotencyKey: releaseKey,
        session: outerSession,
      }),
      getJournalByIdempotencyKey({
        idempotencyKey: feeKey,
        session: outerSession,
      }),
      resolveLiveIdempotencyKey(holdBaseKey, outerSession),
      loadCachedDevopsPayoutRates(),
    ]);

  if (existingRelease?.journalId) {
    return {
      released: false,
      reason: "already_released",
      journalId: existingRelease.journalId,
      labFeeTotal: releaseAmount,
      platformFee: 0,
      labSettlementAmount: 0,
    };
  }
  if (!holdLive?.existing?.journalId) {
    return { released: false, reason: "no_hold" };
  }

  const settlementBlock = await readPracticeToLabSettlementBlock(transfer, {
    session: outerSession,
  });
  if (settlementBlock) {
    return {
      released: false,
      reason: settlementBlock,
      labFeeTotal: releaseAmount,
      platformFee: 0,
      labSettlementAmount: 0,
    };
  }

  const feeRateApplied =
    snapshottedPracticeTransferFeeRate(transfer?.billing) ??
    resolvePracticeTransferFeeRate({
      matchingMode:
        String(transfer?.matchingMode || "").trim() === "auto"
          ? "auto"
          : "direct",
      payoutRates,
      subcontracted: isSubcontractFeeApplicable(transfer),
      ...platformFeeArgsFromBilling(transfer?.billing),
    });
  const platformFee = Math.max(
    0,
    Math.round(releaseAmount * Number(feeRateApplied || 0)),
  );
  const purchasePayeeId = parties.purchasePayeeId;
  const purchaseAmount = purchasePayeeId
    ? Math.max(0, releaseAmount - platformFee)
    : 0;
  const labNet = purchasePayeeId
    ? purchaseAmount
    : Math.max(0, releaseAmount - platformFee);

  const fromPaid = Math.max(
    0,
    Math.round(
      Number(
        holdMeta?.fromPaid ??
          holdLive.existing?.meta?.fromPaid ??
          0,
      ),
    ),
  );
  const fromFreeRequest = Math.max(
    0,
    Math.round(
      Number(
        holdMeta?.fromFreeRequest ??
          holdLive.existing?.meta?.fromFreeRequest ??
          0,
      ),
    ),
  );
  const fromFreeShipping = Math.max(
    0,
    Math.round(
      Number(
        holdMeta?.fromFreeShipping ??
          holdLive.existing?.meta?.fromFreeShipping ??
          0,
      ),
    ),
  );

  const creditSettings = await loadCreditSettingsDefaults();

  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  if (ownSession) session.startTransaction();

  try {
    await lockGuard(practiceAnchorId, session);
    const revenueOwners = await resolveRevenueOwners({
      practiceAnchorId,
      session,
    });
    const devopsAnchorId = revenueOwners?.devopsAnchorId || null;
    if (!devopsAnchorId) {
      const err = new Error("에스크로(devops) 사업자를 찾을 수 없습니다.");
      err.statusCode = 500;
      throw err;
    }

    const itemLabel = String(displayLabel || "").trim() || "리메이크 청구";
    const releaseLines = [
      {
        accountCode: "PLATFORM_ESCROW",
        ownerRole: "devops",
        ownerId: devopsAnchorId,
        amount: -releaseAmount,
        amountExcludingVat: -releaseAmount,
        vatAmount: 0,
        creditKind: null,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source: "practice_transfer_remake_charge_release",
          displayKind: "lab_share",
          displayLabel: "리메이크 청구",
          itemLabel,
          holdShare: "lab",
          remakeChargeIndex: chargeIndex,
        },
      },
      {
        accountCode: "LAB_SETTLEMENT_CREDIT",
        ownerRole: "requestor",
        ownerId: String(labAnchorId),
        amount: releaseAmount,
        amountExcludingVat: releaseAmount,
        vatAmount: 0,
        creditKind: "SETTLEMENT",
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source: "practice_transfer_remake_charge_lab_share",
          displayKind: "lab_credit",
          displayLabel: "리메이크 청구",
          itemLabel,
          feeRateApplied,
          labFee: releaseAmount,
          remakeChargeIndex: chargeIndex,
          abutsPrime: Boolean(parties.abutsPrime),
        },
      },
    ];

    if (purchasePayeeId && purchaseAmount > 0) {
      releaseLines.push(
        {
          accountCode: "LAB_SETTLEMENT_CREDIT",
          ownerRole: "requestor",
          ownerId: String(labAnchorId),
          amount: -purchaseAmount,
          amountExcludingVat: -purchaseAmount,
          vatAmount: 0,
          creditKind: "SETTLEMENT",
          refType: "PRACTICE_TRANSFER",
          refId: transferId,
          meta: {
            source: "practice_transfer_subcontract_purchase",
            displayKind: "subcontract_purchase",
            displayLabel: resolveAssigneePurchaseLedgerLabel(transfer),
            itemLabel: resolveAssigneePurchaseLedgerLabel(transfer),
            remakeChargeIndex: chargeIndex,
            purchaseAmount,
            purchasePayeeId: String(purchasePayeeId),
          },
        },
        {
          accountCode: "LAB_SETTLEMENT_CREDIT",
          ownerRole: "requestor",
          ownerId: String(purchasePayeeId),
          amount: purchaseAmount,
          amountExcludingVat: purchaseAmount,
          vatAmount: 0,
          creditKind: "SETTLEMENT",
          refType: "PRACTICE_TRANSFER",
          refId: transferId,
          meta: {
            source: "practice_transfer_subcontract_purchase",
            displayKind: "lab_credit",
            displayLabel: "리메이크 청구",
            itemLabel: resolveAssigneePurchaseLedgerLabel(transfer),
            remakeChargeIndex: chargeIndex,
            purchaseAmount,
            primeLabAnchorId: String(labAnchorId),
          },
        },
      );
    }

    const releaseJournal = await postGeneralLedgerJournal({
      idempotencyKey: releaseKey,
      eventType: "PRACTICE_TRANSFER_ESCROW_RELEASE",
      businessAnchorId: practiceAnchorId,
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      createdBy: actorUserId,
      meta: {
        holdShare: "lab",
        labAnchorId: String(labAnchorId),
        purchasePayeeId: purchasePayeeId ? String(purchasePayeeId) : null,
        labFeeTotal: releaseAmount,
        platformFee,
        purchaseAmount,
        labSettlementAmount: labNet,
        feeRateApplied,
        remakeChargeIndex: chargeIndex,
        abutsPrime: Boolean(parties.abutsPrime),
      },
      lines: releaseLines,
      session,
      skipIdempotencyLookup: true,
    });

    let feeJournalId = existingFee?.journalId || null;
    if (platformFee > 0 && !existingFee?.journalId) {
      const feeLines = [
        {
          accountCode: "LAB_SETTLEMENT_CREDIT",
          ownerRole: "requestor",
          ownerId: String(labAnchorId),
          amount: -platformFee,
          amountExcludingVat: -platformFee,
          vatAmount: 0,
          creditKind: "SETTLEMENT",
          refType: "PRACTICE_TRANSFER",
          refId: transferId,
          meta: {
            source: "practice_transfer_remake_charge_lab_platform_fee",
            displayKind: "platform_fee",
            displayLabel: "플랫폼 수수료",
            feeRateApplied,
            labFee: releaseAmount,
            remakeChargeIndex: chargeIndex,
          },
        },
      ];
      const heldTotalForFree = releaseAmount;
      const freeShareOfPlatformFee =
        heldTotalForFree > 0
          ? Math.round(
              (platformFee * (fromFreeRequest + fromFreeShipping)) /
                heldTotalForFree,
            )
          : 0;
      const fromFree = fromFreeRequest + fromFreeShipping;
      const freeReqShareOfPlatformFee =
        fromFree > 0
          ? Math.round((freeShareOfPlatformFee * fromFreeRequest) / fromFree)
          : 0;
      const freeShipShareOfPlatformFee = Math.max(
        0,
        freeShareOfPlatformFee - freeReqShareOfPlatformFee,
      );
      pushRevenueLines({
        isRemake: true,
        lines: feeLines,
        owners: revenueOwners,
        spendAmount: platformFee,
        freeAmount: freeShareOfPlatformFee,
        fromFreeRequest: freeReqShareOfPlatformFee,
        fromFreeShipping: freeShipShareOfPlatformFee,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        creditSettings,
        meta: {
          source: "remake_charge_lab_platform_fee",
          displayKind: "platform_fee",
          displayLabel: "플랫폼 수수료",
          feeRateApplied,
          feeTotal: releaseAmount,
          remakeChargeIndex: chargeIndex,
        },
      });

      const feeJournal = await postGeneralLedgerJournal({
        idempotencyKey: feeKey,
        eventType: "PRACTICE_TRANSFER_LAB_PLATFORM_FEE",
        businessAnchorId: labAnchorId,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        createdBy: actorUserId,
        meta: {
          labAnchorId: String(labAnchorId),
          labFeeTotal: releaseAmount,
          platformFee,
          feeRateApplied,
          remakeChargeIndex: chargeIndex,
        },
        lines: feeLines,
        session,
        skipIdempotencyLookup: true,
      });
      feeJournalId = feeJournal?.journalId || null;
    }

    if (ownSession) await session.commitTransaction();

    try {
      await upsertBusinessCreditBalanceFromLedger({
        businessAnchorId: labAnchorId,
        session: null,
      });
    } catch {
      // best-effort
    }

    return {
      released: true,
      journalId: releaseJournal?.journalId || null,
      feeJournalId,
      labFeeTotal: releaseAmount,
      platformFee,
      labSettlementAmount: labNet,
      feeRateApplied,
    };
  } catch (error) {
    if (ownSession) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    throw error;
  } finally {
    if (ownSession) session.endSession();
  }
}

/**
 * remakeCharges 이력 중 hold만 있고 release 없는 건을 기공소 정산으로 해제.
 */
export async function settleUnreleasedRemakeChargesForTransfer({
  transfer,
  actorUserId = null,
  session = null,
}) {
  const doc = transfer;
  if (!doc?._id) return [];
  const charges = Array.isArray(doc.remakeCharges) ? doc.remakeCharges : [];
  const out = [];
  let extraNet = 0;
  for (let i = 0; i < charges.length; i += 1) {
    const row = charges[i];
    const chargeIndex = Number.isFinite(Math.trunc(Number(row?.chargeIndex)))
      ? Math.trunc(Number(row.chargeIndex))
      : i;
    const deltaLab = Math.max(
      0,
      Math.round(
        Number(row?.billingDelta?.labFeeTotal ?? row?.billingDelta?.total ?? 0),
      ),
    );
    if (deltaLab <= 0) continue;
    const label =
      String(row?.summaryLabel || "").trim() ||
      (row?.source === "ca_reupload" ? "커스텀어벗 리메이크" : "리메이크 청구");
    // eslint-disable-next-line no-await-in-loop
    const result = await releasePracticeTransferRemakeChargeCredits({
      transfer: doc,
      chargeIndex,
      deltaFees: { labFeeTotal: deltaLab, total: deltaLab },
      actorUserId,
      session,
      displayLabel: label,
    });
    if (result?.released) {
      extraNet += Math.max(
        0,
        Math.round(Number(result.labSettlementAmount || 0)),
      );
    }
    out.push({ chargeIndex, ...result });
  }
  if (extraNet > 0) {
    const PracticeTransfer = (
      await import("../models/practiceTransfer.model.js")
    ).default;
    await PracticeTransfer.updateOne(
      { _id: doc._id },
      { $inc: { "billing.labSettlementAmount": extraNet } },
    ).session(session || null);
  }
  return out;
}

/**
 * 리메이크 청구 취소 — release(+fee)·hold 저널 물리 삭제, 치과·기공소 잔액 복원.
 */
export async function cancelPracticeTransferRemakeChargeCredits({
  transfer,
  chargeIndex = 0,
  session: outerSession = null,
}) {
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  const labAnchorId =
    resolvePerformingLabAnchorId(transfer) || transfer?.targetLabAnchorId;
  if (!transferId || !practiceAnchorId) {
    return { canceled: false, reason: "missing_anchors" };
  }

  const holdBase = practiceTransferRemakeChargeHoldKey(transferId, chargeIndex);
  const releaseBase = practiceTransferRemakeChargeReleaseKey(
    transferId,
    chargeIndex,
  );
  const feeBase = practiceTransferRemakeChargePlatformFeeKey(
    transferId,
    chargeIndex,
  );

  const [holdLive, releaseLive, feeLive] = await Promise.all([
    resolveLiveIdempotencyKey(holdBase, outerSession),
    resolveLiveIdempotencyKey(releaseBase, outerSession),
    resolveLiveIdempotencyKey(feeBase, outerSession),
  ]);

  const toDelete = [];
  if (feeLive?.existing?.journalId) {
    toDelete.push({
      journalId: feeLive.existing.journalId,
      events: ["PRACTICE_TRANSFER_LAB_PLATFORM_FEE"],
    });
  }
  if (releaseLive?.existing?.journalId) {
    toDelete.push({
      journalId: releaseLive.existing.journalId,
      events: ["PRACTICE_TRANSFER_ESCROW_RELEASE"],
    });
  }
  if (holdLive?.existing?.journalId) {
    toDelete.push({
      journalId: holdLive.existing.journalId,
      events: ["PRACTICE_TRANSFER_SPEND_HOLD"],
    });
  }

  if (!toDelete.length) {
    return { canceled: false, reason: "no_journals" };
  }

  const balanceTouch = new Set(
    [String(practiceAnchorId), String(labAnchorId || "")]
      .map((id) => id.trim())
      .filter(Boolean),
  );

  for (const row of toDelete) {
    // eslint-disable-next-line no-await-in-loop
    const deleted = await deleteGeneralLedgerCommitJournal({
      journalId: row.journalId,
      expectedEventTypes: row.events,
      session: outerSession,
    });
    if (!deleted?.deleted) {
      return {
        canceled: false,
        reason: deleted?.reason || "delete_failed",
        journalId: row.journalId,
      };
    }
  }

  for (const ownerId of balanceTouch) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await upsertBusinessCreditBalanceFromLedger({
        businessAnchorId: ownerId,
        session: outerSession,
      });
    } catch {
      // best-effort
    }
  }

  return {
    canceled: true,
    deletedCount: toDelete.length,
    hadRelease: Boolean(releaseLive?.existing?.journalId),
    hadHold: Boolean(holdLive?.existing?.journalId),
  };
}

/**
 * 후속 보철 hold → 기공소 정산 적립.
 * 원본은 작업시작 시 이미 labSettledAt — hold만 두면 기공소 적립이 원금액에 멈춤.
 * 리메이크 청구와 동일하게 증분 멱등키로 즉시 해제.
 */
export async function releasePracticeTransferProsthesisFollowUpLabShare({
  transfer,
  followUpIndex = 0,
  deltaFees,
  holdMeta = null,
  actorUserId = null,
  session: outerSession = null,
  displayLabel = "후속 보철 추가",
}) {
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  const parties = resolvePracticeTransferSettlementParties(transfer);
  const labAnchorId = parties.grossOwnerId;
  if (!transferId || !practiceAnchorId || !labAnchorId) {
    return { released: false, reason: "missing_anchors" };
  }

  const releaseAmount = Math.max(
    0,
    Math.round(Number(deltaFees?.labFeeTotal ?? deltaFees?.total ?? 0) || 0),
  );
  if (releaseAmount <= 0) {
    return {
      released: false,
      reason: "zero_fee",
      labFeeTotal: 0,
      platformFee: 0,
      labSettlementAmount: 0,
    };
  }

  const releaseKey = practiceTransferFollowUpReleaseKey(
    transferId,
    followUpIndex,
  );
  const feeKey = practiceTransferFollowUpPlatformFeeKey(
    transferId,
    followUpIndex,
  );
  const holdBaseKey = practiceTransferFollowUpHoldKey(
    transferId,
    followUpIndex,
  );

  const [existingRelease, existingFee, holdLive, payoutRates] =
    await Promise.all([
      getJournalByIdempotencyKey({
        idempotencyKey: releaseKey,
        session: outerSession,
      }),
      getJournalByIdempotencyKey({
        idempotencyKey: feeKey,
        session: outerSession,
      }),
      resolveLiveIdempotencyKey(holdBaseKey, outerSession),
      loadCachedDevopsPayoutRates(),
    ]);

  if (existingRelease?.journalId) {
    return {
      released: false,
      reason: "already_released",
      journalId: existingRelease.journalId,
      labFeeTotal: releaseAmount,
      platformFee: 0,
      labSettlementAmount: 0,
    };
  }
  if (!holdLive?.existing?.journalId) {
    return { released: false, reason: "no_hold" };
  }

  const settlementBlock = await readPracticeToLabSettlementBlock(transfer, {
    session: outerSession,
  });
  if (settlementBlock) {
    return {
      released: false,
      reason: settlementBlock,
      labFeeTotal: releaseAmount,
      platformFee: 0,
      labSettlementAmount: 0,
    };
  }

  const feeRateApplied =
    snapshottedPracticeTransferFeeRate(transfer?.billing) ??
    resolvePracticeTransferFeeRate({
      matchingMode:
        String(transfer?.matchingMode || "").trim() === "auto"
          ? "auto"
          : "direct",
      payoutRates,
      subcontracted: isSubcontractFeeApplicable(transfer),
      ...platformFeeArgsFromBilling(transfer?.billing),
    });
  const platformFee = Math.max(
    0,
    Math.round(releaseAmount * Number(feeRateApplied || 0)),
  );
  const purchasePayeeId = parties.purchasePayeeId;
  const purchaseAmount = purchasePayeeId
    ? Math.max(0, releaseAmount - platformFee)
    : 0;
  const labNet = purchasePayeeId
    ? purchaseAmount
    : Math.max(0, releaseAmount - platformFee);

  const fromPaid = Math.max(
    0,
    Math.round(
      Number(
        holdMeta?.fromPaid ?? holdLive.existing?.meta?.fromPaid ?? 0,
      ),
    ),
  );
  const fromFreeRequest = Math.max(
    0,
    Math.round(
      Number(
        holdMeta?.fromFreeRequest ??
          holdLive.existing?.meta?.fromFreeRequest ??
          0,
      ),
    ),
  );
  const fromFreeShipping = Math.max(
    0,
    Math.round(
      Number(
        holdMeta?.fromFreeShipping ??
          holdLive.existing?.meta?.fromFreeShipping ??
          0,
      ),
    ),
  );

  const creditSettings = await loadCreditSettingsDefaults();

  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  if (ownSession) session.startTransaction();

  try {
    await lockGuard(practiceAnchorId, session);
    const revenueOwners = await resolveRevenueOwners({
      practiceAnchorId,
      session,
    });
    const devopsAnchorId = revenueOwners?.devopsAnchorId || null;
    if (!devopsAnchorId) {
      const err = new Error("에스크로(devops) 사업자를 찾을 수 없습니다.");
      err.statusCode = 500;
      throw err;
    }

    const itemLabel = String(displayLabel || "").trim() || "후속 보철 추가";
    const releaseLines = [
      {
        accountCode: "PLATFORM_ESCROW",
        ownerRole: "devops",
        ownerId: devopsAnchorId,
        amount: -releaseAmount,
        amountExcludingVat: -releaseAmount,
        vatAmount: 0,
        creditKind: null,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source: "practice_transfer_follow_up_release",
          displayKind: "lab_share",
          displayLabel: itemLabel,
          itemLabel,
          holdShare: "lab",
          followUpIndex,
        },
      },
      {
        accountCode: "LAB_SETTLEMENT_CREDIT",
        ownerRole: "requestor",
        ownerId: String(labAnchorId),
        amount: releaseAmount,
        amountExcludingVat: releaseAmount,
        vatAmount: 0,
        creditKind: "SETTLEMENT",
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source: "practice_transfer_follow_up_lab_share",
          displayKind: "lab_credit",
          displayLabel: itemLabel,
          itemLabel,
          feeRateApplied,
          labFee: releaseAmount,
          followUpIndex,
          abutsPrime: Boolean(parties.abutsPrime),
        },
      },
    ];

    if (purchasePayeeId && purchaseAmount > 0) {
      releaseLines.push(
        {
          accountCode: "LAB_SETTLEMENT_CREDIT",
          ownerRole: "requestor",
          ownerId: String(labAnchorId),
          amount: -purchaseAmount,
          amountExcludingVat: -purchaseAmount,
          vatAmount: 0,
          creditKind: "SETTLEMENT",
          refType: "PRACTICE_TRANSFER",
          refId: transferId,
          meta: {
            source: "practice_transfer_subcontract_purchase",
            displayKind: "subcontract_purchase",
            displayLabel: resolveAssigneePurchaseLedgerLabel(transfer),
            itemLabel: resolveAssigneePurchaseLedgerLabel(transfer),
            followUpIndex,
            purchaseAmount,
            purchasePayeeId: String(purchasePayeeId),
          },
        },
        {
          accountCode: "LAB_SETTLEMENT_CREDIT",
          ownerRole: "requestor",
          ownerId: String(purchasePayeeId),
          amount: purchaseAmount,
          amountExcludingVat: purchaseAmount,
          vatAmount: 0,
          creditKind: "SETTLEMENT",
          refType: "PRACTICE_TRANSFER",
          refId: transferId,
          meta: {
            source: "practice_transfer_subcontract_purchase",
            displayKind: "lab_credit",
            displayLabel: itemLabel,
            itemLabel: resolveAssigneePurchaseLedgerLabel(transfer),
            followUpIndex,
            purchaseAmount,
            primeLabAnchorId: String(labAnchorId),
          },
        },
      );
    }

    const releaseJournal = await postGeneralLedgerJournal({
      idempotencyKey: releaseKey,
      eventType: "PRACTICE_TRANSFER_ESCROW_RELEASE",
      businessAnchorId: practiceAnchorId,
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      createdBy: actorUserId,
      meta: {
        holdShare: "lab",
        labAnchorId: String(labAnchorId),
        purchasePayeeId: purchasePayeeId ? String(purchasePayeeId) : null,
        labFeeTotal: releaseAmount,
        platformFee,
        purchaseAmount,
        labSettlementAmount: labNet,
        feeRateApplied,
        followUpIndex,
        abutsPrime: Boolean(parties.abutsPrime),
        displayLabel: itemLabel,
        itemLabel,
      },
      lines: releaseLines,
      session,
      skipIdempotencyLookup: true,
    });

    let feeJournalId = existingFee?.journalId || null;
    if (platformFee > 0 && !existingFee?.journalId) {
      const feeLines = [
        {
          accountCode: "LAB_SETTLEMENT_CREDIT",
          ownerRole: "requestor",
          ownerId: String(labAnchorId),
          amount: -platformFee,
          amountExcludingVat: -platformFee,
          vatAmount: 0,
          creditKind: "SETTLEMENT",
          refType: "PRACTICE_TRANSFER",
          refId: transferId,
          meta: {
            source: "practice_transfer_follow_up_lab_platform_fee",
            displayKind: "platform_fee",
            displayLabel: "플랫폼 수수료",
            feeRateApplied,
            labFee: releaseAmount,
            followUpIndex,
          },
        },
      ];
      const heldTotalForFree = releaseAmount;
      const freeShareOfPlatformFee =
        heldTotalForFree > 0
          ? Math.round(
              (platformFee * (fromFreeRequest + fromFreeShipping)) /
                heldTotalForFree,
            )
          : 0;
      const fromFree = fromFreeRequest + fromFreeShipping;
      const freeReqShareOfPlatformFee =
        fromFree > 0
          ? Math.round((freeShareOfPlatformFee * fromFreeRequest) / fromFree)
          : 0;
      const freeShipShareOfPlatformFee = Math.max(
        0,
        freeShareOfPlatformFee - freeReqShareOfPlatformFee,
      );
      pushRevenueLines({
        isRemake: true,
        lines: feeLines,
        owners: revenueOwners,
        spendAmount: platformFee,
        freeAmount: freeShareOfPlatformFee,
        fromFreeRequest: freeReqShareOfPlatformFee,
        fromFreeShipping: freeShipShareOfPlatformFee,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        creditSettings,
        meta: {
          source: "follow_up_lab_platform_fee",
          displayKind: "platform_fee",
          displayLabel: "플랫폼 수수료",
          feeRateApplied,
          feeTotal: releaseAmount,
          followUpIndex,
        },
      });

      const feeJournal = await postGeneralLedgerJournal({
        idempotencyKey: feeKey,
        eventType: "PRACTICE_TRANSFER_LAB_PLATFORM_FEE",
        businessAnchorId: labAnchorId,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        createdBy: actorUserId,
        meta: {
          labAnchorId: String(labAnchorId),
          labFeeTotal: releaseAmount,
          platformFee,
          feeRateApplied,
          followUpIndex,
        },
        lines: feeLines,
        session,
        skipIdempotencyLookup: true,
      });
      feeJournalId = feeJournal?.journalId || null;
    }

    if (ownSession) await session.commitTransaction();

    try {
      await upsertBusinessCreditBalanceFromLedger({
        businessAnchorId: labAnchorId,
        session: null,
      });
    } catch {
      // best-effort
    }

    return {
      released: true,
      journalId: releaseJournal?.journalId || null,
      feeJournalId,
      labFeeTotal: releaseAmount,
      platformFee,
      labSettlementAmount: labNet,
      feeRateApplied,
    };
  } catch (error) {
    if (ownSession) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    throw error;
  } finally {
    if (ownSession) session.endSession();
  }
}

/**
 * prosthesisFollowUps 중 hold만 있고 release 없는 건을 기공소 정산으로 해제.
 */
export async function settleUnreleasedProsthesisFollowUpsForTransfer({
  transfer,
  actorUserId = null,
  session = null,
}) {
  const doc = transfer;
  if (!doc?._id) return [];
  const followUps = Array.isArray(doc.prosthesisFollowUps)
    ? doc.prosthesisFollowUps
    : [];
  const out = [];
  for (const row of followUps) {
    if (String(row?.canceledAt || "").trim()) continue;
    const followUpIndex = Math.max(
      0,
      Math.floor(Number(row?.followUpIndex || 0)),
    );
    const deltaLab = Math.max(
      0,
      Math.round(
        Number(row?.billingDelta?.labFeeTotal ?? row?.billingDelta?.total ?? 0),
      ),
    );
    if (deltaLab <= 0) continue;
    // eslint-disable-next-line no-await-in-loop
    const result = await releasePracticeTransferProsthesisFollowUpLabShare({
      transfer: doc,
      followUpIndex,
      deltaFees: { labFeeTotal: deltaLab, total: deltaLab },
      actorUserId,
      displayLabel: "후속 보철 추가",
      session,
    });
    out.push({ followUpIndex, ...result });
  }
  return out;
}

/** 후속 보철 취소 — release(+fee)·hold 저널 물리 삭제·잔액 복원 */
export async function releasePracticeTransferProsthesisFollowUpCredits({
  transfer,
  followUpIndex = 0,
  session: outerSession = null,
}) {
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  const labAnchorId =
    resolvePerformingLabAnchorId(transfer) || transfer?.targetLabAnchorId;
  if (!transferId || !practiceAnchorId) {
    return { released: false, reason: "missing_anchors" };
  }

  const holdBase = practiceTransferFollowUpHoldKey(transferId, followUpIndex);
  const releaseBase = practiceTransferFollowUpReleaseKey(
    transferId,
    followUpIndex,
  );
  const feeBase = practiceTransferFollowUpPlatformFeeKey(
    transferId,
    followUpIndex,
  );

  const [holdLive, releaseLive, feeLive] = await Promise.all([
    resolveLiveIdempotencyKey(holdBase, outerSession),
    resolveLiveIdempotencyKey(releaseBase, outerSession),
    resolveLiveIdempotencyKey(feeBase, outerSession),
  ]);

  if (
    !holdLive?.existing?.journalId &&
    !releaseLive?.existing?.journalId &&
    !feeLive?.existing?.journalId
  ) {
    return { released: false, reason: "no_hold" };
  }

  const toDelete = [];
  if (feeLive?.existing?.journalId) {
    toDelete.push({
      journalId: feeLive.existing.journalId,
      events: ["PRACTICE_TRANSFER_LAB_PLATFORM_FEE"],
    });
  }
  if (releaseLive?.existing?.journalId) {
    toDelete.push({
      journalId: releaseLive.existing.journalId,
      events: ["PRACTICE_TRANSFER_ESCROW_RELEASE"],
    });
  }
  if (holdLive?.existing?.journalId) {
    toDelete.push({
      journalId: holdLive.existing.journalId,
      events: ["PRACTICE_TRANSFER_SPEND_HOLD"],
    });
  }

  const balanceTouch = new Set(
    [practiceAnchorId, labAnchorId].map((id) => String(id || "").trim()).filter(Boolean),
  );

  for (const row of toDelete) {
    // eslint-disable-next-line no-await-in-loop
    const deleted = await deleteGeneralLedgerCommitJournal({
      journalId: row.journalId,
      expectedEventTypes: row.events,
      session: outerSession,
    });
    if (!deleted?.deleted) {
      return {
        released: false,
        reason: deleted?.reason || "delete_failed",
        journalId: row.journalId,
      };
    }
  }

  for (const ownerId of balanceTouch) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await upsertBusinessCreditBalanceFromLedger({
        businessAnchorId: ownerId,
        session: outerSession,
      });
    } catch {
      // best-effort
    }
  }

  try {
    const { emitCreditBalanceUpdatedToBusiness } = await import(
      "../utils/creditRealtime.js"
    );
    await emitCreditBalanceUpdatedToBusiness({
      businessAnchorId: practiceAnchorId,
      reason: "practice_transfer_prosthesis_follow_up_cancel",
      refId: transferId,
      forceEmit: true,
    });
    if (labAnchorId && String(labAnchorId) !== String(practiceAnchorId)) {
      await emitCreditBalanceUpdatedToBusiness({
        businessAnchorId: labAnchorId,
        reason: "practice_transfer_prosthesis_follow_up_cancel",
        refId: transferId,
        forceEmit: true,
      });
    }
  } catch {
    // best-effort
  }

  return {
    released: true,
    journalId: holdLive?.existing?.journalId || releaseLive?.existing?.journalId || null,
    refundJournalId: null,
    hadRelease: Boolean(releaseLive?.existing?.journalId),
    hadHold: Boolean(holdLive?.existing?.journalId),
  };
}

export async function quoteProsthesisFollowUpFees({
  practiceAnchorId,
  labAnchorId,
  toothWorks,
  sourceToothWorks = null,
  transferDoc = null,
}) {
  const feeScheduleLabId = transferDoc
    ? resolveFeeScheduleLabAnchorId(transferDoc) || labAnchorId
    : labAnchorId;
  const multiplierLabId = transferDoc
    ? resolveLabFeeMultiplierLabAnchorId(transferDoc) || feeScheduleLabId
    : labAnchorId;
  const quote = await buildPracticeTransferQuote({
    practiceAnchorId,
    labAnchorId: feeScheduleLabId,
    labFeeMultiplierLabAnchorId: multiplierLabId,
    toothWorks,
    skipAbutmentFees: true,
    remake: false,
    matchingMode: "direct",
    rushFeeMultiplier: rushFeeMultiplierFromTransfer(transferDoc),
    feeSnapshot: frozenPracticeTransferFeeSnapshot(transferDoc?.billing),
  });

  const tempRows = pickSourceTempRowsForFollowUpCredit(
    sourceToothWorks != null
      ? sourceToothWorks
      : Array.isArray(transferDoc?.toothWorks)
        ? transferDoc.toothWorks
        : [],
    toothWorks,
  );

  let tempCreditLabFeeTotal = 0;
  if (tempRows.length > 0) {
    const tempQuote = await buildPracticeTransferQuote({
      practiceAnchorId,
      labAnchorId: feeScheduleLabId,
      labFeeMultiplierLabAnchorId: multiplierLabId,
      toothWorks: tempRows,
      skipAbutmentFees: true,
      remake: false,
      matchingMode: "direct",
      rushFeeMultiplier: rushFeeMultiplierFromTransfer(transferDoc),
      feeSnapshot: frozenPracticeTransferFeeSnapshot(transferDoc?.billing),
    });
    tempCreditLabFeeTotal = Math.max(
      0,
      Math.round(Number(tempQuote?.fees?.labFeeTotal || 0)),
    );
  }

  const grossFees = quote?.fees || {};
  const credited = applyProsthesisFollowUpTempCredit({
    finalLabFeeTotal: grossFees.labFeeTotal,
    finalTotal: grossFees.total,
    tempCreditLabFeeTotal,
  });

  const netFees = {
    ...grossFees,
    labFeeTotal: credited.labFeeTotal,
    total: credited.total,
  };

  return {
    ...quote,
    fees: netFees,
    grossFees,
    tempCredit: {
      labFeeTotal: credited.tempCreditLabFeeTotal,
      toothWorks: tempRows,
    },
    billingDelta: {
      labFeeTotal: credited.labFeeTotal,
      total: credited.total,
      finalLabFeeTotal: credited.finalLabFeeTotal,
      finalTotal: credited.finalTotal,
      tempCreditLabFeeTotal: credited.tempCreditLabFeeTotal,
      /** 지르 단계 표시용 — 차감 전 라인(최종 합산 feeQuote와 분리) */
      lines: Array.isArray(grossFees.lines) ? grossFees.lines : [],
    },
  };
}

export async function loadPracticeTransferQuoteContext({
  labAnchorId = null,
  practiceAnchorId = null,
}) {
  // 협력 픽커: selectedLab=수행 기공소 → 수가·할증 모두 그 기공소(치과↔지정과 동일).
  // 어벗츠/하청: labAnchorId=어벗츠.
  const cacheKey = `practice-transfer:quote-context:${String(labAnchorId || "none")}:${String(practiceAnchorId || "none")}`;
  const cached = getRequestPerfCacheValue(cacheKey);
  if (cached && typeof cached === "object") return cached;

  return withRequestPerfInFlight(cacheKey, async () => {
    const [quote, creditSettings] = await Promise.all([
      buildPracticeTransferQuote({
        labAnchorId,
        practiceAnchorId,
        toothWorks: [],
        matchingMode: "direct",
      }),
      loadCreditSettingsDefaults(),
    ]);
    const context = {
      schedule: quote.schedule,
      remakeSchedule: quote.remakeSchedule || LAB_FEE_SCHEDULE_ZEROS,
      items: quote.items || normalizeLabFeeItems(quote.schedule),
      abutmentRetailPrice: quote.abutmentRetailPrice,
      abutmentPricingTier: PLATFORM_ABUTMENT_PRICING_TIER,
      abutmentPrices: quote.abutmentPrices,
      relationshipKind: quote.relationshipKind,
      feeRateApplied: quote.feeRateApplied,
      labFeeMultiplier: normalizeLabFeeMultiplier(quote.labFeeMultiplier),
      practiceRushFeeMultiplier: normalizeConfiguredRushFeeMultiplier(
        creditSettings?.practiceRushFeeMultiplier,
      ),
      usedDefaultSchedule: quote.usedDefaultSchedule,
      labFeeConfigured: quote.labFeeConfigured !== false,
      autoMatchBudget: quote.autoMatchBudget || null,
      abutsLabFeeCatalog: quote.abutsLabFeeCatalog || null,
    };
    setRequestPerfCacheValue(cacheKey, context, QUOTE_LOOKUP_CACHE_TTL_MS);
    return context;
  });
}

/**
 * 목록/상세용 견적. 과금 완료 건은 스냅샷 금액 유지.
 * 미청구·지정·작업시작된 자동매칭: billing.labFeeMultiplier 스냅샷(할증 소급 금지).
 * 미청구: 지금(asOf=now) 유효 기공비·특별공급가(작업시작 전까지 live; pending due 포함).
 * 미청구·자동매칭 공개풀: 의뢰 createdAt 기준 as-of(history) — 할증만.
 * 하청 후 원청(어벗츠 기공사업부) 화면은 전액 수주(수수료 0). 하청은 subcontractFeeRate.
 */
function isViewerPrimeContractor(doc, viewingLabAnchorId) {
  const viewerId = String(viewingLabAnchorId || "").trim();
  if (!viewerId) return false;
  if (!isPracticeTransferSubcontracted(doc)) return false;
  const primeId = getPrimeLabAnchorId(doc);
  const assigneeId = getAssigneeLabAnchorId(doc);
  return Boolean(primeId && viewerId === primeId && viewerId !== assigneeId);
}

export async function buildFeeQuotesForTransferDocs({
  docs,
  viewingLabAnchorId = null,
}) {
  const list = Array.isArray(docs) ? docs : [];
  if (list.length === 0) return new Map();

  const labIds = new Set();
  const practiceIds = new Set();
  const viewerLabId = String(viewingLabAnchorId || "").trim();
  if (viewerLabId && Types.ObjectId.isValid(viewerLabId)) labIds.add(viewerLabId);
  for (const doc of list) {
    const labId = String(
      doc?.targetLabAnchorId?._id || doc?.targetLabAnchorId || "",
    ).trim();
    if (labId && Types.ObjectId.isValid(labId)) labIds.add(labId);
    const feeScheduleLabId = resolveFeeScheduleLabAnchorId(doc);
    if (feeScheduleLabId && Types.ObjectId.isValid(feeScheduleLabId)) {
      labIds.add(feeScheduleLabId);
    }
    const multiplierLabId = resolveLabFeeMultiplierLabAnchorId(doc);
    if (multiplierLabId && Types.ObjectId.isValid(multiplierLabId)) {
      labIds.add(multiplierLabId);
    }
    const performerLabId = resolvePerformingLabAnchorId(doc);
    if (performerLabId && Types.ObjectId.isValid(performerLabId)) {
      labIds.add(performerLabId);
    }
    const practiceId = String(
      doc?.practiceBusinessAnchorId?._id || doc?.practiceBusinessAnchorId || "",
    ).trim();
    if (practiceId && Types.ObjectId.isValid(practiceId)) practiceIds.add(practiceId);
  }

  const labIdList = [...labIds];
  const practiceIdList = [...practiceIds];
  const [payoutRates, abutmentPricesBase, labs, practices, partners, creditSettings] =
    await Promise.all([
      loadCachedDevopsPayoutRates(),
      loadCachedAbutmentCreditPrices(),
      labIdList.length
        ? BusinessAnchor.find({ _id: { $in: labIdList } })
            .select({
              businessType: 1,
              aiTrainingConsent: 1,
              labFeeSchedule: 1,
              labPracticeFeeMultipliers: 1,
              labPracticeSpecialSupplyPrices: 1,
              labPracticeSpecialSupplyPendingChange: 1,
            })
            .lean()
        : Promise.resolve([]),
      practiceIdList.length
        ? BusinessAnchor.find({ _id: { $in: practiceIdList } })
            .select({
              "practiceTransferSettings.implantFavorites": 1,
            })
            .lean()
        : Promise.resolve([]),
      labIdList.length && practiceIdList.length
        ? LabTradingPartner.find({
            labAnchorId: { $in: labIdList.map((id) => new Types.ObjectId(id)) },
            practiceAnchorId: {
              $in: practiceIdList.map((id) => new Types.ObjectId(id)),
            },
            status: { $in: ["active", "referred"] },
          })
            .select({ labAnchorId: 1, practiceAnchorId: 1, status: 1 })
            .lean()
        : Promise.resolve([]),
      loadCreditSettingsDefaults(),
    ]);

  const abutmentPrices = normalizeAbutsAbutmentCreditPrices({
    ...creditSettings,
    ...abutmentPricesBase,
  });

  const scheduleByLab = new Map(
    labs.map((lab) => [String(lab._id), lab.labFeeSchedule || null]),
  );
  const labDocById = new Map(labs.map((lab) => [String(lab._id), lab]));
  const multiplierByLab = new Map(
    labs.map((lab) => [String(lab._id), lab]),
  );

  const pairKey = (labId, practiceId) => `${labId}:${practiceId}`;
  const favoritesByPractice = new Map(
    practices.map((practice) => [
      String(practice._id),
      implantFavoritesFromPractice(practice),
    ]),
  );
  const partnerByPair = new Map();
  for (const partner of partners) {
    partnerByPair.set(
      pairKey(String(partner.labAnchorId), String(partner.practiceAnchorId)),
      partner,
    );
  }

  const out = new Map();
  for (const doc of list) {
    const docId = String(doc?._id || "");
    const toothWorks = Array.isArray(doc?.toothWorks) ? doc.toothWorks : [];
    const targetLabId = String(
      doc?.targetLabAnchorId?._id || doc?.targetLabAnchorId || "",
    ).trim();
    const practiceId = String(
      doc?.practiceBusinessAnchorId?._id || doc?.practiceBusinessAnchorId || "",
    ).trim();
    const openPool = isAutoMatchOpenPool(doc);
    // 공개풀: 뷰어 기공소 수가 미리보기. 그 외: 수가표 앵커(협력=수행, 하청=원청).
    const quoteLabId =
      viewerLabId && (openPool || !targetLabId)
        ? viewerLabId
        : resolveFeeScheduleLabAnchorId(doc) || targetLabId;
    const billing = doc?.billing && typeof doc.billing === "object" ? doc.billing : null;
    const billed = Boolean(billing?.billedAt);
    // 과금 완료만 금액 스냅샷 고정. 미청구는 현재 수가로 재계산.
    const useStored = billed;

    const schedule = quoteLabId ? scheduleByLab.get(quoteLabId) : null;
    const noLab = !quoteLabId;
    const remake = isPracticeTransferRemake(doc);
    const abutmentPricingTier = PLATFORM_ABUTMENT_PRICING_TIER;
    const implantFavorites = favoritesByPractice.get(practiceId) || [];
    // 지정·수락됨: billing 스냅샷(있으면). 공개풀·스냅 없는 자동매칭: as-of(history).
    // 할증 앵커: 협력=수행 기공소, 하청·어벗츠 자체=원청.
    const snapLabFeeMultiplier = normalizeLabFeeMultiplier(
      billing?.labFeeMultiplier,
    );
    const multiplierLabId =
      resolveLabFeeMultiplierLabAnchorId(doc) || quoteLabId;
    const liveLabFeeMultiplier = resolveLabPracticeFeeMultiplier(
      multiplierLabId ? multiplierByLab.get(multiplierLabId) : null,
      practiceId,
    );
    const asOfLabFeeMultiplier = resolveLabPracticeFeeMultiplierAsOf(
      multiplierLabId ? multiplierByLab.get(multiplierLabId) : null,
      practiceId,
      doc?.createdAt,
    );
    const matchingMode =
      String(doc?.matchingMode || "").trim() === "auto" ? "auto" : "direct";
    const feeLabFeeMultiplier = billed
      ? snapLabFeeMultiplier
      : openPool
        ? asOfLabFeeMultiplier
        : snapLabFeeMultiplier > 1 || matchingMode === "direct"
          ? snapLabFeeMultiplier
          : asOfLabFeeMultiplier;
    const remakeLabFeeMultiplier = liveLabFeeMultiplier;
    const feeSchedule = noLab
      ? LAB_FEE_SCHEDULE_ZEROS
      : resolveLabFeeScheduleSourceForPracticeTransfer({
          labDoc: labDocById.get(quoteLabId) || { labFeeSchedule: schedule },
          practiceAnchorId: practiceId,
          asOf: new Date(),
          // 미청구: 작업시작 전 live(유효) 수가. 청구 완료는 위 useStored.
          liveSpecialSupply: true,
        });
    const remakeFeeSchedule = noLab
      ? LAB_FEE_SCHEDULE_ZEROS
      : resolveLabFeeScheduleSourceForPractice(
          labDocById.get(quoteLabId) || { labFeeSchedule: schedule },
          practiceId,
        );
    // 기본 리메이크 견적=보철만(CA 제외). CA 포함 견적은 별도 필드.
    // 기공소 freeRemakeYears 창 밖·미설정(null)·0이면 정가(비-리메이크) 견적.
    const remakePricingEligible = isWithinLabFreeRemakeWindow(
      doc?.createdAt,
      readLabFeeFreeRemakeYears(
        labDocById.get(quoteLabId)?.labFeeSchedule,
      ),
    );
    const remakeToothWorksProsthesisOnly =
      stripCustomAbutmentFromToothWorks(toothWorks);
    const remakeFees = computePracticeTransferRetailFees({
      toothWorks: remakeToothWorksProsthesisOnly,
      implantFavorites,
      labFeeSchedule: remakeFeeSchedule,
      abutmentPricingTier,
      abutmentPrices,
      remake: remakePricingEligible,
      labFeeMultiplier: remakeLabFeeMultiplier,
      rushFeeMultiplier: rushFeeMultiplierFromTransfer(doc),
    });
    const remakeFeesWithCustomAbutment =
      countCustomAbutmentWorks(toothWorks) > 0
        ? computePracticeTransferRetailFees({
            toothWorks,
            implantFavorites,
            labFeeSchedule: remakeFeeSchedule,
            abutmentPricingTier,
            abutmentPrices,
            remake: remakePricingEligible,
            labFeeMultiplier: remakeLabFeeMultiplier,
            rushFeeMultiplier: rushFeeMultiplierFromTransfer(doc),
          })
        : null;
    const fees = computePracticeTransferRetailFees({
      toothWorks,
      implantFavorites,
      labFeeSchedule: feeSchedule,
      abutmentPricingTier,
      abutmentPrices,
      remake,
      skipAbutmentFees: remake,
      labFeeMultiplier: feeLabFeeMultiplier,
      rushFeeMultiplier: rushFeeMultiplierFromTransfer(doc),
    });
    const feesWithLabShipping = computePracticeTransferRetailFeesWithLabShipping(
      {
        toothWorks,
        implantFavorites,
        labFeeSchedule: feeSchedule,
        abutmentPricingTier,
        abutmentPrices,
        remake,
        skipAbutmentFees: remake,
        labFeeMultiplier: feeLabFeeMultiplier,
        rushFeeMultiplier: rushFeeMultiplierFromTransfer(doc),
      },
      doc,
    );
    const labShippingFee = Math.max(
      0,
      Math.round(
        Number(
          billing?.labShippingFee ?? feesWithLabShipping?.labShippingFee ?? 0,
        ),
      ),
    );

    let autoMatchBudgetOut = null;

    const partner = quoteLabId && practiceId
      ? partnerByPair.get(pairKey(quoteLabId, practiceId))
      : null;
    const kind = relationshipKindFromPartner(partner);
    const performerId = resolvePerformingLabAnchorId(doc);
    const previewConsent = resolveUnacceptedAiTrainingConsent(
      doc,
      labDocById.get(performerId) || null,
    );
    const previewConsentArg =
      previewConsent === true || previewConsent === false
        ? { aiTrainingConsent: previewConsent }
        : {};
    const feeRateApplied = resolvePracticeTransferFeeRateForViewer({
      matchingMode,
      payoutRates,
      subcontracted: isSubcontractFeeApplicable(doc),
      viewerIsPrimeContractor: isViewerPrimeContractor(doc, viewerLabId),
      billing: doc?.billing,
      ...previewConsentArg,
    });
    const remakeFeeRateApplied = resolvePracticeTransferFeeRate({
      matchingMode:
        String(matchingMode || "").trim() === "auto" ? "auto" : "direct",
      payoutRates,
      subcontracted: isSubcontractFeeApplicable(doc),
      ...platformFeeArgsFromBilling(doc?.billing),
      ...previewConsentArg,
    });
    const remakeSplit = splitPracticeTransferSettlement({
      labFeeTotal: remakeFees.labFeeTotal,
      abutmentRetailTotal: remakeFees.abutmentRetailTotal,
      feeRateApplied: remakeFeeRateApplied,
    });
    const remakeFeeQuote = toFeeQuoteApi({
      fees: remakeFees,
      relationshipKind: kind,
      feeRateApplied: remakeFeeRateApplied,
      labFeeMultiplier: remakeLabFeeMultiplier,
      labSettlementAmount: remakeSplit.labSettlementAmount,
      abutsRevenueAmount: remakeSplit.abutsRevenueAmount,
      labTradingPartnerId: partner?._id ? String(partner._id) : null,
      billed: false,
      usedDefaultSchedule: !quoteLabId,
      labFeeConfigured: resolveQuoteLabFeeConfigured({
        usedDefaultSchedule: !quoteLabId,
        schedule,
        toothWorks: remakeToothWorksProsthesisOnly,
        remake: true,
        labFeeTotal: remakeFees.labFeeTotal,
      }),
      isRemake: true,
      autoMatchBudget: autoMatchBudgetOut,
    });
    const remakeFeeQuoteWithCustomAbutment = remakeFeesWithCustomAbutment
      ? (() => {
          const split = splitPracticeTransferSettlement({
            labFeeTotal: remakeFeesWithCustomAbutment.labFeeTotal,
            abutmentRetailTotal: remakeFeesWithCustomAbutment.abutmentRetailTotal,
            feeRateApplied: remakeFeeRateApplied,
          });
          return toFeeQuoteApi({
            fees: remakeFeesWithCustomAbutment,
            relationshipKind: kind,
            feeRateApplied: remakeFeeRateApplied,
            labFeeMultiplier: remakeLabFeeMultiplier,
            labSettlementAmount: split.labSettlementAmount,
            abutsRevenueAmount: split.abutsRevenueAmount,
            labTradingPartnerId: partner?._id ? String(partner._id) : null,
            billed: false,
            usedDefaultSchedule: !quoteLabId,
            labFeeConfigured: resolveQuoteLabFeeConfigured({
              usedDefaultSchedule: !quoteLabId,
              schedule,
              toothWorks,
              remake: true,
              labFeeTotal: remakeFeesWithCustomAbutment.labFeeTotal,
            }),
            isRemake: true,
            includeCustomAbutment: true,
            autoMatchBudget: autoMatchBudgetOut,
          });
        })()
      : null;

    if (useStored) {
      const storedRetail = Math.max(
        0,
        Math.round(Number(billing?.abutmentRetailTotal || 0)),
      );
      const liveRetail = Math.max(
        0,
        Math.round(Number(fees.abutmentRetailTotal || 0)),
      );
      const liveLabAbut = Math.max(
        0,
        Math.round(Number(fees.labAbutmentTotal || 0)),
      );
      // 레거시: PTX CA를 어벗츠 몫(retail)으로 스냅샷. 신규 SSOT는 기공소 커스텀어벗 수가.
      // 스냅샷 total(예: 8.5만) + live 라인(6+4=10만) 불일치 방지 → live 견적 사용.
      const promoteLegacyRetailToLabCa =
        storedRetail > 0 && liveRetail === 0 && liveLabAbut > 0;

      if (!promoteLegacyRetailToLabCa) {
        // billing.labFeeTotal 은 remakeCharges 증분을 포함. 견적 라인(원본 toothWorks)과
        // 맞추고, 리메이크 적립은 정산 내역에서 별도 행으로 본다.
        const remakeLabFee = sumRemakeChargeLabFeeTotals(doc?.remakeCharges);
        const billingForQuote =
          remakeLabFee > 0
            ? {
                ...billing,
                labFeeTotal: Math.max(
                  0,
                  Math.round(Number(billing.labFeeTotal || 0)) - remakeLabFee,
                ),
                total: Math.max(
                  0,
                  Math.round(Number(billing.total || 0)) - remakeLabFee,
                ),
                labSettlementAmount: Math.max(
                  0,
                  Math.round(Number(billing.labSettlementAmount || 0)) -
                    remakeLabFee,
                ),
                heldTotal: Math.max(
                  0,
                  Math.round(Number(billing.heldTotal || 0)) - remakeLabFee,
                ),
                heldLabTotal: Math.max(
                  0,
                  Math.round(Number(billing.heldLabTotal || 0)) - remakeLabFee,
                ),
              }
            : billing;
        const storedQuote = feeQuoteFromBillingDoc(billingForQuote, {
          lines: fees.lines,
          billed,
        });
        // 청구 완료(billed): 예산 구간·별점 확정가 재부착 없이 billing 스냅샷 유지.
        // feeRateApplied만 뷰어(원청/하청)에 맞게 덮어쓴다.
        const split = splitPracticeTransferSettlement({
          labFeeTotal: storedQuote.labFeeTotal,
          abutmentRetailTotal: storedQuote.abutmentRetailTotal,
          feeRateApplied,
        });
        out.set(docId, {
          ...storedQuote,
          labShippingFee:
            Math.max(0, Math.round(Number(storedQuote.labShippingFee || 0))) ||
            labShippingFee,
          feeRateApplied,
          labSettlementAmount: split.labSettlementAmount,
          abutsRevenueAmount: split.abutsRevenueAmount,
          remakeFeeQuote,
          remakeFeeQuoteWithCustomAbutment,
        });
        continue;
      }
      // fall through: live fees (lab CA SSOT) + billed 플래그
    }

    const { abutsRevenueAmount, labSettlementAmount } =
      splitPracticeTransferSettlement({
        labFeeTotal: fees.labFeeTotal,
        abutmentRetailTotal: fees.abutmentRetailTotal,
        feeRateApplied,
      });
    out.set(
      docId,
      {
        ...toFeeQuoteApi({
          fees: { ...fees, labShippingFee },
          billing,
          relationshipKind: kind,
          feeRateApplied,
          labFeeMultiplier: feeLabFeeMultiplier,
          labSettlementAmount,
          abutsRevenueAmount,
          labTradingPartnerId: partner?._id ? String(partner._id) : null,
          // 레거시 retail→lab CA 승격 fall-through도 billed 유지
          billed,
          usedDefaultSchedule: !quoteLabId,
          labFeeConfigured: resolveQuoteLabFeeConfigured({
            usedDefaultSchedule: !quoteLabId,
            schedule,
            toothWorks,
            remake,
            labFeeTotal: fees.labFeeTotal,
          }),
          isRemake: remake,
          autoMatchBudget: autoMatchBudgetOut,
        }),
        remakeFeeQuote,
        remakeFeeQuoteWithCustomAbutment,
      },
    );
  }
  return out;
}

/**
 * 기공의뢰 CA: 레거시(치과가 어벗츠 단가 선납 + heldDesignFee)일 때만 어벗디자인비 지급.
 * 신규 SSOT: 치과→기공소는 labFeeSchedule 커스텀어벗 수가(기공비 정산).
 *   기공소→어벗츠는 Request 생산비(1.5만). abutmentDesignLabFee 외주 지급 없음.
 * 레거시 크레딧 흐름:
 *   치과 →(디자인+생산가)→ 어벗츠 →(abutmentDesignLabFee)→ 기공소
 * REV_DEVOPS/PLATFORM_ESCROW → LAB_SETTLEMENT_CREDIT (idempotent per Request).
 * 기공소 장부 라인은 PRACTICE_TRANSFER — 보철기공비와 같은 의뢰건으로 묶음.
 */
export async function grantAbutmentDesignLabFee({
  requestDoc,
  transferId = null,
  labAnchorId = null,
  actorUserId = null,
}) {
  const requestId = requestDoc?._id ? String(requestDoc._id) : "";
  if (!requestId || !Types.ObjectId.isValid(requestId)) {
    return { granted: false, reason: "missing_request" };
  }

  const resolvedLabAnchorId = String(
    labAnchorId || requestDoc?.businessAnchorId || "",
  ).trim();
  if (!resolvedLabAnchorId || !Types.ObjectId.isValid(resolvedLabAnchorId)) {
    return { granted: false, reason: "missing_lab" };
  }

  const creditSettings = await loadCreditSettingsDefaults();
  const unitFeeBase = Math.max(
    0,
    Math.round(Number(creditSettings?.abutmentDesignLabFee ?? 10000) || 0),
  );
  const { countDesignAbutmentQty } = await import(
    "../controllers/requests/designPrice.utils.js"
  );
  const qty = Math.max(1, countDesignAbutmentQty(requestDoc?.caseInfos) || 1);

  const relatedTransferId = String(
    transferId ||
      requestDoc?.partnerBilling?.relatedPracticeTransferId ||
      "",
  ).trim();
  let skipJig = false;
  let useEscrow = false;
  let unitFee = unitFeeBase;
  let amount = unitFeeBase * qty;
  if (relatedTransferId && Types.ObjectId.isValid(relatedTransferId)) {
    try {
      const PracticeTransfer = (
        await import("../models/practiceTransfer.model.js")
      ).default;
      const ptx = await PracticeTransfer.findById(relatedTransferId)
        .select({
          "production.skipJig": 1,
          "production.rushProcessing": 1,
          "billing.heldDesignFeeTotal": 1,
          "billing.heldLabTotal": 1,
          "billing.labFeeTotal": 1,
          "billing.abutmentRetailTotal": 1,
          "billing.rushFeeMultiplier": 1,
          "billing.abutmentQty": 1,
        })
        .lean();
      skipJig = Boolean(ptx?.production?.skipJig);
      const heldDesign = Math.max(
        0,
        Math.round(Number(ptx?.billing?.heldDesignFeeTotal || 0)),
      );
      const heldLab = Math.max(
        0,
        Math.round(Number(ptx?.billing?.heldLabTotal || 0)),
      );
      const labFee = Math.max(
        0,
        Math.round(Number(ptx?.billing?.labFeeTotal || 0)),
      );
      const abutmentRetail = Math.max(
        0,
        Math.round(Number(ptx?.billing?.abutmentRetailTotal || 0)),
      );
      // 신규: 기공소 수가로 CA 청구(어벗츠 선납 없음) → 디자인비 외주 지급 생략
      if (heldDesign <= 0 && abutmentRetail <= 0) {
        return {
          granted: false,
          reason: "lab_schedule_priced",
          unitFee: 0,
          qty,
        };
      }
      useEscrow = heldDesign > 0 || heldLab > labFee;
      // 보류에 잡힌 디자인비를 우선(신속처리 배수 반영). 없으면 rush 배수로 재계산.
      if (heldDesign > 0) {
        amount = heldDesign;
        const heldQty = Math.max(
          1,
          Math.round(Number(ptx?.billing?.abutmentQty || qty) || qty),
        );
        unitFee = Math.max(0, Math.round(amount / heldQty));
      } else {
        const rush = resolveRushFeeMultiplier({
          rushProcessing: Boolean(ptx?.production?.rushProcessing),
          rushFeeMultiplier: ptx?.billing?.rushFeeMultiplier,
        });
        if (rush > 1) {
          unitFee = Math.max(0, Math.round(unitFeeBase * rush));
          amount = unitFee * qty;
        }
      }
    } catch {
      skipJig = false;
    }
  }
  if (amount <= 0) {
    return { granted: false, reason: "zero_amount", unitFee, qty };
  }
  const designFeeLabel = skipJig ? "디자인비" : "디자인비+지그제작비";

  const { idempotencyKey, existing } = await resolveAbutmentDesignFeeGrantKey(
    requestId,
  );
  if (existing) {
    return {
      granted: false,
      reason: "already_granted",
      journalId: existing.journalId,
      amount,
      unitFee,
      qty,
    };
  }

  const devopsAnchorId = await resolveDevopsEscrowOwnerId();
  if (!devopsAnchorId) {
    return { granted: false, reason: "missing_devops" };
  }

  const debitAccount = useEscrow ? "PLATFORM_ESCROW" : "REV_DEVOPS";
  const journal = await postGeneralLedgerJournal({
    idempotencyKey,
    eventType: "ADJUST",
    businessAnchorId: resolvedLabAnchorId,
    refType: relatedTransferId ? "PRACTICE_TRANSFER" : "REQUEST",
    refId: relatedTransferId || requestId,
    createdBy: actorUserId || null,
    meta: {
      source: "abutment_design_lab_fee",
      displayKind: "lab_credit",
      displayLabel: designFeeLabel,
      requestId,
      relatedPracticeTransferId: relatedTransferId || null,
      unitFee,
      qty,
      amount,
      skipJig,
      fromEscrow: useEscrow,
    },
    lines: [
      {
        accountCode: debitAccount,
        ownerRole: "devops",
        ownerId: devopsAnchorId,
        amount: -amount,
        amountExcludingVat: -amount,
        vatAmount: 0,
        creditKind: null,
        refType: "REQUEST",
        refId: requestId,
        meta: {
          source: "abutment_design_lab_fee",
          displayLabel: designFeeLabel,
          fromEscrow: useEscrow,
        },
      },
      {
        accountCode: "LAB_SETTLEMENT_CREDIT",
        ownerRole: "requestor",
        ownerId: resolvedLabAnchorId,
        amount,
        amountExcludingVat: amount,
        vatAmount: 0,
        creditKind: "SETTLEMENT",
        refType: relatedTransferId ? "PRACTICE_TRANSFER" : "REQUEST",
        refId: relatedTransferId || requestId,
        meta: {
          source: "abutment_design_lab_fee",
          displayKind: "lab_credit",
          displayLabel: designFeeLabel,
          itemLabel: designFeeLabel,
          holdShare: "lab",
          relatedPracticeTransferId: relatedTransferId || null,
          requestId,
          unitFee,
          qty,
        },
      },
    ],
  });

  if (journal?.posted) {
    try {
      const { emitCreditBalanceUpdatedToBusiness } = await import(
        "../utils/creditRealtime.js"
      );
      await emitCreditBalanceUpdatedToBusiness({
        businessAnchorId: resolvedLabAnchorId,
        balanceDelta: amount,
        reason: "abutment_design_lab_fee",
        refId: journal.journalId || requestId,
      });
    } catch {
      // best-effort realtime
    }
  }

  return {
    granted: Boolean(journal?.posted),
    reason: journal?.posted ? "posted" : "not_posted",
    journalId: journal?.journalId || null,
    amount,
    unitFee,
    qty,
  };
}

/**
 * 폐기된 PTX 배송 hold 1건 해제 → 잔액 복원(원본 물리 삭제).
 */
async function releasePracticeTransferShippingHoldJournal({
  transferId,
  holdKey,
  billingZeroFields = [],
  session = null,
  emitRealtime = true,
  reason = "practice_transfer_shipping_hold_release",
}) {
  const id = String(transferId || "").trim();
  const key = String(holdKey || "").trim();
  if (!id || !key) {
    return { released: false, reason: "missing_args" };
  }

  const holdJournal = await getJournalByIdempotencyKey({
    idempotencyKey: key,
    session,
  });
  if (!holdJournal?.journalId) {
    return { released: false, reason: "no_hold" };
  }

  const journalId = String(holdJournal.journalId);
  const lines = await LedgerLine.find({ journalId })
    .select({ accountCode: 1, ownerId: 1, amount: 1 })
    .session(session || null)
    .lean();

  const balanceRestoreByAnchor = {};
  for (const line of lines || []) {
    const code = String(line?.accountCode || "").trim();
    if (!PRACTICE_TRANSFER_BALANCE_ACCOUNT_CODES.has(code)) continue;
    const ownerId = String(line?.ownerId || "").trim();
    if (!ownerId || !Types.ObjectId.isValid(ownerId)) continue;
    const amount = Number(line?.amount || 0);
    if (!Number.isFinite(amount) || amount === 0) continue;
    // 소비(-) 삭제 → 잔액 복원(+)
    balanceRestoreByAnchor[ownerId] =
      Number(balanceRestoreByAnchor[ownerId] || 0) - amount;
  }

  const deleted = await deleteGeneralLedgerCommitJournal({
    journalId,
    expectedEventTypes: ["PRACTICE_TRANSFER_SPEND_HOLD", "SHIPPING_SPEND_HOLD"],
    session,
  });
  if (!deleted?.deleted) {
    return {
      released: false,
      reason: deleted?.reason || "delete_failed",
      journalId,
    };
  }

  if (billingZeroFields.length) {
    const $set = {};
    for (const field of billingZeroFields) {
      $set[`billing.${field}`] = 0;
    }
    try {
      await mongoose.connection.collection("practicetransfers").updateOne(
        { _id: new Types.ObjectId(id) },
        { $set },
        { session: session || undefined },
      );
    } catch {
      // best-effort billing snapshot
    }
  }

  const affectedAnchorIds = Object.keys(balanceRestoreByAnchor);
  await Promise.all(
    affectedAnchorIds.map(async (anchorId) => {
      try {
        await upsertBusinessCreditBalanceFromLedger({
          businessAnchorId: anchorId,
          session,
        });
      } catch {
        // best-effort cache
      }
    }),
  );

  if (emitRealtime && affectedAnchorIds.length) {
    try {
      const { emitCreditBalanceUpdatedToBusiness } = await import(
        "../utils/creditRealtime.js"
      );
      await Promise.all(
        affectedAnchorIds.map((anchorId) =>
          emitCreditBalanceUpdatedToBusiness({
            businessAnchorId: anchorId,
            balanceDelta: Number(balanceRestoreByAnchor[anchorId] || 0),
            reason,
            refId: id,
            forceEmit: true,
          }),
        ),
      );
    } catch {
      // best-effort
    }
  }

  return {
    released: true,
    journalId,
    refundJournalId: null,
    balanceRestoreByAnchor,
    heldTotal: Math.max(
      0,
      Math.round(Number(holdJournal?.meta?.heldTotal || 0)),
    ),
  };
}

/**
 * 기공소→치과 배송 hold + (레거시) PTX 건당 어벗츠 배송 hold 해제.
 * 신규 생성은 hold 0. 레거시 보류만 정리.
 */
export async function releasePracticeTransferObsoleteShippingHolds({
  transfer,
  transferId = null,
  session = null,
  emitRealtime = true,
}) {
  const id = String(transferId || transfer?._id || "").trim();
  if (!id || !Types.ObjectId.isValid(id)) {
    return { released: false, reason: "invalid_id", results: [] };
  }

  const lab = await releasePracticeTransferShippingHoldJournal({
    transferId: id,
    holdKey: practiceTransferHoldLabShippingKey(id),
    billingZeroFields: ["heldShippingLabTotal", "labShippingFee"],
    session,
    emitRealtime,
    reason: "practice_transfer_lab_shipping_free_release",
  });
  // PTX 건당 abuts_shipping은 Request 박스키로 이전 — 치과/기공소 PTX hold 잔존 시 해제.
  const abuts = await releasePracticeTransferShippingHoldJournal({
    transferId: id,
    holdKey: practiceTransferHoldAbutsShippingKey(id),
    billingZeroFields: ["heldShippingAbutsTotal"],
    session,
    emitRealtime,
    reason: "practice_transfer_abuts_shipping_box_ssot_release",
  });

  return {
    released: Boolean(lab.released || abuts.released),
    reason: lab.released || abuts.released ? null : "no_hold",
    lab,
    abuts,
  };
}

/**
 * 기공소→치과 배송비.
 * 정책: 무료 — 플랫폼 크레딧 차감 없음. 레거시 lab_shipping hold는 해제(매출 전환 금지).
 */
export async function chargePracticeTransferLabShipping({
  transfer,
  toothWorks = null,
  actorUserId = null,
  session: outerSession = null,
}) {
  void toothWorks;
  void actorUserId;
  const transferId = transfer?._id;
  const practiceAnchorId = transfer?.practiceBusinessAnchorId;
  if (!transferId || !practiceAnchorId) {
    return { charged: false, reason: "missing_anchors" };
  }

  // 기공소→치과 배송 무료(+레거시 PTX abuts hold 정리). 매출 전환하지 않음.
  const released = await releasePracticeTransferObsoleteShippingHolds({
    transfer,
    transferId,
    session: outerSession,
    emitRealtime: true,
  });
  if (released.released) {
    return {
      charged: false,
      reason: "lab_to_practice_shipping_free",
      released,
    };
  }
  return { charged: false, reason: "lab_to_practice_shipping_free" };
}

/**
 * 어벗츠 출발 배송비(기공소→어벗츠). CA 집하 시 1회.
 * 결제자 = 주문 기공소(targetLabAnchorId).
 */
export async function chargePracticeTransferAbutsShipping({
  transfer,
  toothWorks = null,
  actorUserId = null,
  session: outerSession = null,
}) {
  const transferId = transfer?._id;
  const labAnchorId =
    resolvePerformingLabAnchorId(transfer) || transfer?.targetLabAnchorId;
  if (!transferId || !labAnchorId) {
    return { charged: false, reason: "missing_anchors" };
  }

  const works = toothWorks || transfer?.toothWorks || [];
  const hasCa = (Array.isArray(works) ? works : []).some((row) =>
    Boolean(row?.customAbutment),
  );
  const abutmentQty = Math.max(
    0,
    Math.round(Number(transfer?.billing?.abutmentQty || 0)),
  );
  if (!hasCa && abutmentQty <= 0) {
    return { charged: false, reason: "no_abuts_origin" };
  }

  return commitPracticeTransferShippingSpend({
    transfer,
    transferId,
    practiceAnchorId: labAnchorId,
    actorUserId,
    outerSession,
    route: "abuts",
  });
}

async function commitPracticeTransferShippingSpend({
  transfer,
  transferId,
  practiceAnchorId,
  actorUserId,
  outerSession,
  route,
}) {
  const isLab = route === "lab";
  // 기공소→치과 배송 무료 — lab route는 매출 전환하지 않음(hold 해제만).
  if (isLab) {
    return { charged: false, reason: "lab_to_practice_shipping_free" };
  }
  const spendUniqueKey = `practice_transfer:${String(transferId)}:abuts_shipping`;
  const idempotencyKey = `gl:${spendUniqueKey}`;
  const holdKey = practiceTransferHoldAbutsShippingKey(transferId);
  const displayLabel = PRACTICE_TRANSFER_LEDGER_LABELS.shippingAbutment;
  const usageKind = "practice_transfer_abuts_shipping";
  const source = usageKind;

  const [creditSettings, existing, holdJournal] = await Promise.all([
    loadCreditSettingsDefaults(),
    getJournalByIdempotencyKey({
      idempotencyKey,
      session: outerSession,
    }),
    getJournalByIdempotencyKey({
      idempotencyKey: holdKey,
      session: outerSession,
    }),
  ]);
  const feeFromSettings = Math.max(
    0,
    Math.round(Number(creditSettings?.shippingFee ?? 3500) || 0),
  );
  const heldAmount = Math.max(
    0,
    Math.round(
      Number(
        holdJournal?.meta?.heldTotal ??
          transfer?.billing?.heldShippingAbutsTotal ??
          0,
      ) || 0,
    ),
  );
  const fee =
    holdJournal?.journalId && heldAmount > 0 ? heldAmount : feeFromSettings;
  if (fee <= 0) {
    return { charged: false, reason: "zero_fee" };
  }
  if (existing?.journalId) {
    return {
      charged: false,
      reason: "already_charged",
      journalId: existing.journalId,
      amount: fee,
    };
  }

  const ownSession = !outerSession;
  const session = outerSession || (await mongoose.startSession());
  if (ownSession) session.startTransaction();

  try {
    await lockGuard(practiceAnchorId, session);

    const owners = await resolveRevenueOwners({
      practiceAnchorId,
      session,
    });
    const devopsAnchorId =
      owners?.devopsAnchorId ||
      String(holdJournal?.meta?.devopsAnchorId || "") ||
      (await resolveDevopsEscrowOwnerId(session));

    let fromPaid = 0;
    let fromFreeRequest = 0;
    let fromFreeShipping = 0;
    let lines = [];
    let fromHold = false;

    if (holdJournal?.journalId && devopsAnchorId) {
      fromHold = true;
      fromPaid = Math.max(0, Math.round(Number(holdJournal.meta?.fromPaid || 0)));
      fromFreeRequest = Math.max(
        0,
        Math.round(Number(holdJournal.meta?.fromFreeRequest || 0)),
      );
      fromFreeShipping = Math.max(
        0,
        Math.round(Number(holdJournal.meta?.fromFreeShipping || 0)),
      );
      const splitSum = fromPaid + fromFreeRequest + fromFreeShipping;
      if (splitSum !== fee && splitSum > 0) {
        // 메타 합이 fee와 어긋나면 유료로 맞춤
        fromPaid = fee;
        fromFreeRequest = 0;
        fromFreeShipping = 0;
      } else if (splitSum <= 0) {
        fromPaid = fee;
      }
      lines.push({
        accountCode: "PLATFORM_ESCROW",
        ownerRole: "devops",
        ownerId: devopsAnchorId,
        amount: -fee,
        amountExcludingVat: -fee,
        vatAmount: 0,
        creditKind: null,
        refType: "PRACTICE_TRANSFER",
        refId: transferId,
        meta: {
          source: `${source}_from_hold`,
          displayKind: "shipping",
          displayLabel,
          holdShare: isLab ? "lab_shipping" : "abuts_shipping",
        },
      });
    } else {
      const spendResult = await spendShippingCreditAtomic({
        businessAnchorId: practiceAnchorId,
        spendUniqueKey,
        actorUserId,
        fee,
        session,
      });

      if (!spendResult?.didSpend) {
        if (ownSession) await session.abortTransaction();
        return {
          charged: false,
          reason: spendResult?.reason || "not_spent",
          amount: fee,
        };
      }
      fromPaid = Number(spendResult.fromPaid || 0);
      fromFreeRequest = Number(spendResult.fromFreeRequest || 0);
      fromFreeShipping = Number(spendResult.fromFreeShipping || 0);
      const spendMetaDraft = {
        spendUniqueKey,
        usageKind,
        displayKind: "shipping",
        displayLabel,
        fromPaid,
        fromFreeRequest,
        fromFreeShipping,
      };
      lines.push(
        ...buildPracticeDebitLines({
          split: {
            fromPaid,
            fromFreeRequest,
            fromFreeShipping,
          },
          practiceAnchorId,
          transferId,
          meta: spendMetaDraft,
        }),
      );
    }

    const spendMeta = {
      spendUniqueKey,
      usageKind,
      displayKind: "shipping",
      displayLabel,
      fromPaid,
      fromFreeRequest,
      fromFreeShipping,
      fromHold,
    };
    pushRevenueLines({
      isRemake: false,
      lines,
      owners,
      spendAmount: fee,
      freeAmount: fromFreeRequest + fromFreeShipping,
      fromFreeRequest,
      fromFreeShipping,
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      meta: spendMeta,
      creditSettings,
      labAnchorId: transfer?.targetLabAnchorId,
    });

    const journal = await postGeneralLedgerJournal({
      idempotencyKey,
      eventType: "SHIPPING_SPEND_COMMIT",
      businessAnchorId: practiceAnchorId,
      refType: "PRACTICE_TRANSFER",
      refId: transferId,
      createdBy: actorUserId || null,
      meta: {
        ...spendMeta,
        amount: fee,
        source,
      },
      lines,
      session,
      skipIdempotencyLookup: true,
    });

    if (ownSession) await session.commitTransaction();

    if (journal?.posted && !fromHold) {
      try {
        const { emitCreditBalanceUpdatedToBusiness } = await import(
          "../utils/creditRealtime.js"
        );
        await emitCreditBalanceUpdatedToBusiness({
          businessAnchorId: practiceAnchorId,
          balanceDelta: -fee,
          reason: source,
          refId: journal.journalId || String(transferId),
        });
        if (isLab && transfer?.targetLabAnchorId) {
          await emitCreditBalanceUpdatedToBusiness({
            businessAnchorId: transfer.targetLabAnchorId,
            balanceDelta: fee,
            reason: source,
            refId: journal.journalId || String(transferId),
          });
        }
      } catch {
        // best-effort
      }
    }

    return {
      charged: Boolean(journal?.posted),
      reason: journal?.posted
        ? fromHold
          ? "from_hold"
          : "posted"
        : "not_posted",
      journalId: journal?.journalId || null,
      amount: fee,
      fromHold,
    };
  } catch (e) {
    if (ownSession) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    throw e;
  } finally {
    if (ownSession) session.endSession();
  }
}

/**
 * 어벗디자인비 지급 회수(디자인 업로드 취소 시). ADJUST 원본 물리 삭제.
 */
export async function revokeAbutmentDesignLabFee({
  requestDoc,
  transferId = null,
  labAnchorId = null,
  actorUserId = null,
}) {
  const requestId = requestDoc?._id ? String(requestDoc._id) : "";
  if (!requestId || !Types.ObjectId.isValid(requestId)) {
    return { revoked: false, reason: "missing_request" };
  }

  const existing = await findActiveAbutmentDesignFeeJournal(requestId);
  if (!existing?.journalId) {
    return { revoked: false, reason: "not_found" };
  }

  const amount = Math.max(
    0,
    Math.round(Number(existing?.meta?.amount || 0)) || 0,
  );
  const resolvedLabAnchorId = String(
    labAnchorId ||
      existing?.businessAnchorId ||
      requestDoc?.businessAnchorId ||
      "",
  ).trim();

  // 과거 REFUND 쌍이 있으면 함께 삭제(순잔액 0) — emit은 활성(미환불) 삭제만
  const refundSibling = await getJournalByIdempotencyKey({
    idempotencyKey: refundIdempotencyKeyFor(
      String(existing?.idempotencyKey || ""),
    ),
  });
  const hadRefundSibling = Boolean(refundSibling?.journalId);
  const deleteIds = [
    existing.journalId,
    ...(hadRefundSibling ? [refundSibling.journalId] : []),
  ];
  for (const journalId of deleteIds) {
    const deleted = await deleteGeneralLedgerCommitJournal({
      journalId,
      expectedEventTypes:
        journalId === existing.journalId ? ["ADJUST"] : ["REFUND"],
    });
    if (!deleted?.deleted && journalId === existing.journalId) {
      return {
        revoked: false,
        reason: deleted?.reason || "delete_failed",
        journalId: existing.journalId,
      };
    }
  }

  if (resolvedLabAnchorId && amount > 0 && !hadRefundSibling) {
    try {
      const { emitCreditBalanceUpdatedToBusiness } = await import(
        "../utils/creditRealtime.js"
      );
      await emitCreditBalanceUpdatedToBusiness({
        businessAnchorId: resolvedLabAnchorId,
        balanceDelta: -amount,
        reason: "abutment_design_lab_fee_revoke",
        refId: existing.journalId || requestId,
      });
    } catch {
      // best-effort
    }
  }

  return {
    revoked: true,
    journalId: existing.journalId,
    refundJournalId: null,
    amount,
    actorUserId: actorUserId || null,
    transferId: transferId || null,
  };
}

/**
 * 학습 동의 변경 뒤, 아직 끝나지 않은 수행 의뢰의 학습 포함 스냅샷만 맞춘다.
 * 요율(feeRateApplied)은 바꾸지 않는다. 완료·취소 건은 그대로 둔다.
 */
export async function repriceOpenTransfersForAiTrainingConsent({
  labAnchorId,
  allowed,
  transferId = null,
} = {}) {
  const labId = String(labAnchorId || "").trim();
  if (!labId || !Types.ObjectId.isValid(labId)) return { updated: 0 };
  const consentAllowed = allowed === true;
  const focusId = String(transferId || "").trim();
  const labOid = new Types.ObjectId(labId);

  const docs = await PracticeTransfer.find({
    workCanceledAt: null,
    "autoMatch.completedAt": null,
    status: { $nin: ["deleted", "canceled", "cancelled"] },
    requestorDownloadedAt: { $ne: null },
    $or: [{ assigneeLabAnchorId: labOid }, { targetLabAnchorId: labOid }],
  })
    .select({
      billing: 1,
      matchingMode: 1,
      assigneeLabAnchorId: 1,
      assigneeKind: 1,
      targetLabAnchorId: 1,
      autoMatch: 1,
      requestorDownloadedAt: 1,
      workCanceledAt: 1,
      status: 1,
      practiceBusinessAnchorId: 1,
      remake: 1,
    })
    .lean();

  let openDocs = (Array.isArray(docs) ? docs : []).filter((doc) => {
    if (isAutoMatchCompleted(doc)) return false;
    if (doc?.billing?.internalPerformer === true) return false;
    return resolvePerformingLabAnchorId(doc) === labId;
  });

  if (focusId) {
    const focus = openDocs.find((doc) => String(doc._id) === focusId);
    if (!focus?.requestorDownloadedAt) {
      openDocs = [];
    } else {
      const cutoff = new Date(focus.requestorDownloadedAt).getTime();
      openDocs = openDocs.filter((doc) => {
        if (String(doc._id) === focusId) return true;
        const started = doc.requestorDownloadedAt
          ? new Date(doc.requestorDownloadedAt).getTime()
          : 0;
        return started >= cutoff;
      });
    }
  }

  let updated = 0;
  for (const doc of openDocs) {
    try {
      const changed = await repriceOneTransferPlatformFeeForConsent({
        doc,
        consentAllowed,
      });
      if (changed) updated += 1;
    } catch (error) {
      console.error(
        "[repriceOpenTransfersForAiTrainingConsent]",
        String(doc?._id || ""),
        error?.message || error,
      );
    }
  }
  return { updated };
}

async function repriceOneTransferPlatformFeeForConsent({
  doc,
  consentAllowed,
}) {
  if (doc?.billing?.aiTrainingConsent === consentAllowed) return false;
  await PracticeTransfer.updateOne(
    { _id: doc._id },
    { $set: { "billing.aiTrainingConsent": consentAllowed } },
  );
  return true;
}

