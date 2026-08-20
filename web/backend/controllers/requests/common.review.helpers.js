// related files:
// - web/backend/rules.md
// - web/backend/services/creditBalance.service.js
// - web/backend/services/creditRevenuePolicy.service.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/controllers/requests/mailbox.utils.js
// - web/backend/controllers/requests/shipping.controller.js
// - web/backend/controllers/requests/shipping.Tracking.helpers.js
// change-log:
// - 2026-08-19: 원장 GET에서 신속비 보정을 백그라운드·쿨다운으로 분리.
// - 2026-08-19: 준비 단계 취소는 uniqueKeysOnly 소비 조회로 레거시 풀스캔을 생략.
// - 2026-08-18: 기공의뢰 CA 생산 견적은 치과 공급 단가(기공소 공급 단가 제외).
// - 2026-08-17: 의뢰·배송 크레딧 보류(제출)→에스크로→CAM/집하 매출 전환.
// - 2026-08-17: 배송비 차감 SSOT를 집하(우편함 비우기)로 옮김. 포장.발송 진입은 우편함만 확인. 기공의뢰 어벗츠 배송도 집하.
// - 2026-08-17: 세척.패킹→가공 롤백 시 우편함 유지, 가공→준비에서만 해제.
// - 2026-08-17: 포장.발송 진입 시 기존 우편함을 유지(다른 박스 합류로 주소를 바꾸지 않음).
// - 2026-08-18: 배송비 고객 라벨(치과/기공소→어벗츠)과 제조사 라벨(어벗츠→제조사, 면세) 분리.
// - 2026-08-17: 제조사 적립은 어벗 1개당 고정단가. 분배비 미사용.
import mongoose, { Types } from "mongoose";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import Request from "../../models/request.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import {
  applyStatusMapping,
  computePriceForRequest,
  getTodayYmdInKst,
} from "./utils.js";
import {
  spendRequestCreditAtomic,
  spendShippingCreditAtomic,
  deleteRequestSpendAtomicOnRollback,
  deleteExpressSurchargeAtomic,
  deleteShippingSpendAtomicOnRollback,
} from "../../services/creditBalance.service.js";
import { resolveEffectiveShippingMode } from "./shippingPriority.utils.js";
import {
  resolveQuotedPriceWithExpressFee,
  toPlainRequestPrice,
} from "./expressPrice.utils.js";
import {
  countDesignAbutmentQty,
  resolveMachiningSpendAmount,
  resolveQuotedPriceWithDesignFee,
} from "./designPrice.utils.js";
import { resolvePackingEnterShipYmds } from "./packingEnterShipYmd.utils.js";
import {
  evaluateShipOnTimeOutcome,
} from "./shippingOnTime.utils.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";
import {
  isShippingSpendRevenueContext,
  MANUFACTURER_PRODUCTION_LEDGER_LABEL,
  resolveConfiguredRevenueRates,
  resolveManufacturerUnitApply,
  resolveManufacturerUnitQty,
  resolveRevenueOwnerBaseAllocation,
  splitRevenueByCreditKindProRata,
} from "../../services/creditRevenuePolicy.service.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";
import {
  isManufacturerSampleRequest,
  normalizeBusinessAnchorId,
  normalizeMailboxReceiverFingerprint,
  resolveShippingMailboxOrgId,
} from "./mailbox.utils.js";
import {
  findMailboxSlotShippingHold,
  readRequestHoldMeta,
  requestExpressHoldKey,
  requestMachiningHoldKey,
  requestShippingHoldKey,
} from "../../services/requestCreditHold.service.js";
import {
  ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE,
  pickAbutsAbutmentCreditPrices,
  resolveAbutsAbutmentPricingTier,
} from "../../utils/abutsAbutmentService.js";
import {
  SHIPPING_LEDGER_LABELS,
  resolveCustomerShippingLabel,
} from "../../utils/shippingLedgerLabels.js";

const SHIPPING_FEE_SUPPLY_FALLBACK = 3500;

async function resolveShippingFeePerBox() {
  try {
    const { loadCreditSettingsDefaults } = await import(
      "../../utils/creditSettingsDefaults.js"
    );
    const creditSettings = await loadCreditSettingsDefaults();
    const fee = Math.max(
      0,
      Math.round(Number(creditSettings?.shippingFee ?? SHIPPING_FEE_SUPPLY_FALLBACK) || 0),
    );
    return fee > 0 ? fee : SHIPPING_FEE_SUPPLY_FALLBACK;
  } catch {
    return SHIPPING_FEE_SUPPLY_FALLBACK;
  }
}

function isPtxLabDesignedAbutmentRequest(request) {
  const pb =
    request?.partnerBilling && typeof request.partnerBilling === "object"
      ? request.partnerBilling
      : {};
  if (!pb.relatedPracticeTransferId) return false;
  if (pb.labDesignedAbutment === false) return false;
  return true;
}

function buildPtxAbutsProductionQuoteLocal({
  creditSettings,
  pricingTier = "regular",
  shippingMode,
  abutmentQty = 1,
  expressFeePerRequest = 2000,
}) {
  const picked = pickAbutsAbutmentCreditPrices(creditSettings || {}, pricingTier);
  const unit = Math.max(
    0,
    Number(picked.productionPrice) ||
      (pricingTier === "membership"
        ? ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE
        : ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE),
  );
  const practiceUnit = Math.max(
    0,
    Number(picked.designAndProductionPrice) || unit,
  );
  const qty = Math.max(1, Math.floor(Number(abutmentQty) || 1));
  const tier = pricingTier === "membership" ? "membership" : "regular";
  return resolveQuotedPriceWithExpressFee({
    price: {
      baseAmount: unit,
      discountAmount: 0,
      amount: unit * qty,
      currency: "KRW",
      rule:
        tier === "membership"
          ? "ptx_abuts_production_membership"
          : "ptx_abuts_production_regular",
      designFee: null,
      abutmentQty: qty,
      quotedAt: new Date(),
      discountMeta: {
        pricingTier: tier,
        practiceDesignAndProductionUnit: practiceUnit,
        abutsProductionUnit: unit,
        labDesignFeeUnit: Math.max(0, practiceUnit - unit),
      },
    },
    shippingMode,
    expressFee: expressFeePerRequest,
    expressQty: qty,
  });
}

async function resolvePtxPracticePricingTier(_request, _session = null) {
  return "membership";
}

async function emitOrQueueCreditBalanceUpdate({
  deferredCreditEvents,
  businessAnchorId,
  balanceDelta,
  reason,
  refId,
}) {
  const eventPayload = {
    businessAnchorId,
    balanceDelta: Number(balanceDelta || 0),
    reason,
    refId,
  };

  // 트랜잭션 내부에서는 즉시 emit하지 않고, 커밋 이후 발행을 위해 큐에 적재한다.
  // 이유: emit 직후 프론트가 balance를 조회하면 커밋 전 스냅샷을 읽는 race가 발생할 수 있음.
  if (Array.isArray(deferredCreditEvents)) {
    deferredCreditEvents.push(eventPayload);
    return;
  }

  await emitCreditBalanceUpdatedToBusiness(eventPayload);
}

async function resolveRoleOwnerAnchors({ request, businessAnchorId, session }) {
  const requestorAnchor = await BusinessAnchor.findById(businessAnchorId)
    .select({ _id: 1, businessType: 1, referredByAnchorId: 1, requestorKind: 1 })
    .session(session || null)
    .lean();

  const devopsAnchor = await BusinessAnchor.findOne({
    businessType: "devops",
    status: { $ne: "merged" },
  })
    .select({ _id: 1, payoutRates: 1, createdAt: 1 })
    .sort({ createdAt: 1, _id: 1 })
    .session(session || null)
    .lean();

  const adminAnchor = await BusinessAnchor.findOne({
    businessType: "admin",
    status: { $ne: "merged" },
  })
    .select({ _id: 1, createdAt: 1 })
    .sort({ createdAt: 1, _id: 1 })
    .session(session || null)
    .lean();

  const manufacturerUserIdRaw = String(request?.caManufacturer || "").trim();
  const manufacturerUser = Types.ObjectId.isValid(manufacturerUserIdRaw)
    ? await User.findById(manufacturerUserIdRaw)
        .select({ _id: 1, businessAnchorId: 1 })
        .session(session || null)
        .lean()
    : null;

  const referredAnchor = requestorAnchor?.referredByAnchorId
    ? await BusinessAnchor.findById(requestorAnchor.referredByAnchorId)
        .select({ _id: 1, businessType: 1 })
        .session(session || null)
        .lean()
    : null;

  const hasSalesmanReferrer = referredAnchor?.businessType === "salesman";

  return {
    requestorAnchorId: requestorAnchor?._id || null,
    manufacturerAnchorId: manufacturerUser?.businessAnchorId || null,
    devopsAnchorId: devopsAnchor?._id || null,
    salesmanAnchorId: hasSalesmanReferrer ? referredAnchor?._id || null : null,
    adminAnchorId: adminAnchor?._id || null,
    hasSalesmanReferrer,
    configuredRates: resolveConfiguredRevenueRates(devopsAnchor?.payoutRates),
    requestorKind: String(requestorAnchor?.requestorKind || ""),
  };
}



async function postSpendCommitGeneralLedger({
  eventType,
  spendUniqueKey,
  request,
  businessAnchorId,
  actorUserId,
  amount,
  fromPaid,
  fromFree,
  fromFreeRequest,
  fromFreeShipping,
  fromSettlement = 0,
  freeAccountCode,
  refType,
  refId,
  stageFrom,
  stageTo,
  session,
  usageKind = null,
  displayLabel = null,
  displayKind = null,
  fromEscrowHold = false,
  escrowDevopsAnchorId = null,
}) {
  const spendAmount = Math.max(0, Math.round(Number(amount || 0)));
  if (spendAmount <= 0) return { posted: false, reason: "zero_amount" };

  const paidAmount = Math.max(0, Math.round(Number(fromPaid || 0)));
  const settlementAmount = Math.max(0, Math.round(Number(fromSettlement || 0)));
  // 통합 무료: 두 GL 하위계정에서 각각 소진 가능. 하위호환으로 fromFree+freeAccountCode 유지.
  let freeRequestAmount = Math.max(0, Math.round(Number(fromFreeRequest || 0)));
  let freeShippingAmount = Math.max(0, Math.round(Number(fromFreeShipping || 0)));
  if (freeRequestAmount <= 0 && freeShippingAmount <= 0) {
    const legacyFree = Math.max(0, Math.round(Number(fromFree || 0)));
    if (legacyFree > 0) {
      if (freeAccountCode === "REQ_FREE_SHIPPING_CREDIT") {
        freeShippingAmount = legacyFree;
      } else {
        freeRequestAmount = legacyFree;
      }
    }
  }
  const freeAmount = freeRequestAmount + freeShippingAmount;
  if (paidAmount <= 0 && freeAmount <= 0 && settlementAmount <= 0) {
    return { posted: false, reason: "zero_split" };
  }

  const owners = await resolveRoleOwnerAnchors({ request, businessAnchorId, session });
  if (!owners.requestorAnchorId) {
    return { posted: false, reason: "requestor_anchor_not_found" };
  }

  const { loadCreditSettingsDefaults } = await import(
    "../../utils/creditSettingsDefaults.js"
  );
  const creditSettings = await loadCreditSettingsDefaults();
  const isShippingCommit =
    String(eventType || "") === "SHIPPING_SPEND_COMMIT" ||
    String(usageKind || "") === "shipping" ||
    String(usageKind || "") === "practice_transfer_abuts_shipping";
  const abutmentQty = countDesignAbutmentQty(request?.caseInfos);
  const applyManufacturerUnit = resolveManufacturerUnitApply({
    usageKind,
    isShippingSpend: isShippingCommit,
    abutmentQty,
  });
  const manufacturerQty = resolveManufacturerUnitQty({
    abutmentQty,
    isShippingSpend: isShippingCommit,
  });
  const customerShippingLabel = isShippingCommit
    ? resolveCustomerShippingLabel({
        isPracticeTransferAbuts:
          String(usageKind || "") === "practice_transfer_abuts_shipping",
        requestorKind: owners.requestorKind,
      })
    : "";
  const label =
    String(displayLabel || "").trim() || customerShippingLabel || null;
  const kind =
    String(displayKind || "").trim() || (isShippingCommit ? "shipping" : null);
  const spendMeta = {
    spendUniqueKey,
    ...(usageKind ? { usageKind: String(usageKind) } : {}),
    ...(settlementAmount > 0 ? { settlementOffset: true } : {}),
    ...(label ? { displayLabel: label } : {}),
    ...(kind ? { displayKind: kind } : {}),
    ...(!isShippingCommit && manufacturerQty > 0
      ? { abutmentQty: manufacturerQty }
      : {}),
  };
  const manufacturerMeta = isShippingCommit
    ? {
        ...spendMeta,
        displayLabel: SHIPPING_LEDGER_LABELS.abutsToManufacturer,
        displayKind: "shipping",
      }
    : {
        ...spendMeta,
        displayLabel: MANUFACTURER_PRODUCTION_LEDGER_LABEL,
        displayKind: "abutment_production",
      };

  const lines = [];

  const useEscrowHold =
    Boolean(fromEscrowHold) &&
    String(escrowDevopsAnchorId || "").trim() &&
    Types.ObjectId.isValid(String(escrowDevopsAnchorId));

  if (useEscrowHold) {
    lines.push({
      accountCode: "PLATFORM_ESCROW",
      ownerRole: "devops",
      ownerId: new Types.ObjectId(String(escrowDevopsAnchorId)),
      amount: -spendAmount,
      amountExcludingVat: -spendAmount,
      vatAmount: 0,
      creditKind: null,
      refType,
      refId,
      meta: {
        ...spendMeta,
        source: `${String(usageKind || "spend")}_from_hold`,
      },
    });
  } else {
  if (freeRequestAmount > 0) {
    lines.push({
      accountCode: "REQ_FREE_REQUEST_CREDIT",
      ownerRole: "requestor",
      ownerId: owners.requestorAnchorId,
      amount: -freeRequestAmount,
      creditKind: "FREE_REQUEST",
      refType,
      refId,
      meta: spendMeta,
    });
  }

  if (freeShippingAmount > 0) {
    lines.push({
      accountCode: "REQ_FREE_SHIPPING_CREDIT",
      ownerRole: "requestor",
      ownerId: owners.requestorAnchorId,
      amount: -freeShippingAmount,
      creditKind: "FREE_SHIPPING",
      refType,
      refId,
      meta: spendMeta,
    });
  }

  if (settlementAmount > 0) {
    lines.push({
      accountCode: "LAB_SETTLEMENT_CREDIT",
      ownerRole: "requestor",
      ownerId: owners.requestorAnchorId,
      amount: -settlementAmount,
      creditKind: "SETTLEMENT",
      refType,
      refId,
      meta: spendMeta,
    });
  }

  if (paidAmount > 0) {
    lines.push({
      accountCode: "REQ_PAID_CREDIT",
      ownerRole: "requestor",
      ownerId: owners.requestorAnchorId,
      amount: -paidAmount,
      creditKind: "PAID",
      refType,
      refId,
      meta: spendMeta,
    });
  }
  }

  // 수익 라인: 무료만 free, 기공상계·유료는 paid 비중(상계분도 실대금).
  // shipping 수익 배분 컨텍스트는 배송 소비(refType) 또는 배송무료 소진이 있을 때 적용.
  const primaryFreeAccountCode =
    freeShippingAmount > freeRequestAmount
      ? "REQ_FREE_SHIPPING_CREDIT"
      : freeRequestAmount > 0
        ? "REQ_FREE_REQUEST_CREDIT"
        : freeAccountCode;
  const revenueBaseByOwner = resolveRevenueOwnerBaseAllocation({
    spendAmount,
    hasSalesmanReferrer: owners.hasSalesmanReferrer,
    configuredRates: owners.configuredRates,
    owners,
    isShippingSpend: isShippingSpendRevenueContext({
      refType,
      freeAccountCode: primaryFreeAccountCode,
    }),
    creditSettings,
    applyManufacturerUnit,
    qty: manufacturerQty,
  });

  const assignManufacturer = revenueBaseByOwner.manufacturer;
  const assignDevops = revenueBaseByOwner.devops;
  const assignSalesman = revenueBaseByOwner.salesman;
  const adminBase = revenueBaseByOwner.admin;
  const manufacturerVatRate = Number(revenueBaseByOwner.manufacturerVatRate || 0);

  const revenueKindSplit = splitRevenueByCreditKindProRata({
    ownerBaseByRole: {
      manufacturer: assignManufacturer,
      devops: assignDevops,
      salesman: assignSalesman,
      admin: adminBase,
    },
    freeAmount,
  });

  const splitFreeBasesBySource = (freeBase) => {
    const free = Math.max(0, Math.round(Number(freeBase || 0)));
    if (free <= 0 || freeAmount <= 0) {
      return { freeRequest: 0, freeShipping: 0 };
    }
    if (freeRequestAmount <= 0) return { freeRequest: 0, freeShipping: free };
    if (freeShippingAmount <= 0) return { freeRequest: free, freeShipping: 0 };
    const freeRequestShare = Math.round((free * freeRequestAmount) / freeAmount);
    return {
      freeRequest: freeRequestShare,
      freeShipping: Math.max(0, free - freeRequestShare),
    };
  };

  const pushRevenueLinesBySplit = ({
    accountCode,
    ownerRole,
    ownerId,
    paidBase,
    freeBase,
    vatRate = 0,
    lineMeta = spendMeta,
  }) => {
    if (!ownerId) return;

    const paid = Math.max(0, Math.round(Number(paidBase || 0)));
    const freeParts = splitFreeBasesBySource(freeBase);
    const applyVat = Number(vatRate || 0) > 0;

    const pushOne = (supplyAmount, creditKind) => {
      const supply = Math.max(0, Math.round(Number(supplyAmount || 0)));
      if (supply <= 0) return;
      const vat = applyVat ? Math.round(supply * Number(vatRate || 0)) : 0;
      const total = supply + vat;
      lines.push({
        accountCode,
        ownerRole,
        ownerId,
        amount: total,
        amountExcludingVat: supply,
        vatAmount: vat,
        amountIncludingVat: total,
        creditKind,
        refType,
        refId,
        meta: lineMeta,
      });
    };

    pushOne(freeParts.freeRequest, "FREE_REQUEST");
    pushOne(freeParts.freeShipping, "FREE_SHIPPING");
    pushOne(paid, "PAID");
  };

  pushRevenueLinesBySplit({
    accountCode: "REV_MANUFACTURER",
    ownerRole: "manufacturer",
    ownerId: owners.manufacturerAnchorId,
    paidBase: revenueKindSplit.manufacturer.paid,
    freeBase: revenueKindSplit.manufacturer.free,
    vatRate: manufacturerVatRate,
    lineMeta: manufacturerMeta,
  });

  pushRevenueLinesBySplit({
    accountCode: "REV_DEVOPS",
    ownerRole: "devops",
    ownerId: owners.devopsAnchorId,
    paidBase: revenueKindSplit.devops.paid,
    freeBase: revenueKindSplit.devops.free,
  });

  pushRevenueLinesBySplit({
    accountCode: "REV_SALESMAN",
    ownerRole: "salesman",
    ownerId: owners.salesmanAnchorId,
    paidBase: revenueKindSplit.salesman.paid,
    freeBase: revenueKindSplit.salesman.free,
  });

  pushRevenueLinesBySplit({
    accountCode: "REV_ADMIN",
    ownerRole: "admin",
    ownerId: owners.adminAnchorId,
    paidBase: revenueKindSplit.admin.paid,
    freeBase: revenueKindSplit.admin.free,
  });

  if (!lines.length) return { posted: false, reason: "empty_lines" };

  return postGeneralLedgerJournal({
    idempotencyKey: `gl:${String(spendUniqueKey || "").trim()}`,
    eventType,
    businessAnchorId,
    refType,
    refId,
    stageFrom,
    stageTo,
    createdBy: actorUserId || null,
    meta: {
      spendUniqueKey,
      requestId: request?.requestId || null,
      requestMongoId: request?._id ? String(request._id) : null,
      requestCategory: String(request?.requestCategory || "").trim() || null,
      spendAmount,
      paidAmount,
      freeAmount,
      ...(label ? { displayLabel: label } : {}),
      ...(kind ? { displayKind: kind } : {}),
    },
    lines,
    session,
  });
}

export function revertManufacturerStageByReviewStage(request, stage) {
  const prevStageMap = {
    // machining 롤백의 이전 단계는 request stage(의뢰)다.
    machining: "의뢰",
    packing: "가공",
    shipping: "세척.패킹",
    tracking: "포장.발송",
  };
  const prevStage = prevStageMap[String(stage || "").trim()];
  if (!prevStage) return;
  applyStatusMapping(request, prevStage);

  if (stage === "tracking") {
    request.manufacturerStage = "포장.발송";
  }

  // 포장.발송 → 세척.패킹 롤백: 우편함은 라벨 SSOT이므로 유지한다.
  // packing review만 PENDING으로 되돌려 단계/승인 불일치를 막는다.
  const reviewStage = String(stage || "").trim();
  if (reviewStage === "shipping") {
    request.caseInfos = request.caseInfos || {};
    request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};
    request.caseInfos.reviewByStage.packing = {
      status: "PENDING",
      updatedAt: new Date(),
      updatedBy: null,
      reason: "",
    };
  }
  // 세척.패킹 → 가공 롤백: 우편함은 패킹 라벨 SSOT이므로 유지한다.
  // 가공 → 준비 롤백: 처음부터 다시이므로 우편함을 해제한다.
  if (reviewStage === "machining") {
    request.mailboxAddress = null;
  }
}

/**
 * 포장.발송 진입 시 출고일(timeline) 보정.
 * @see packingEnterShipYmd.utils.js
 */
export async function updateCurrentEstimatedShipYmdOnPackingEnter(request) {
  if (!request) return;

  request.timeline = request.timeline || {};
  const resolved = resolvePackingEnterShipYmds({
    timeline: request.timeline,
    todayYmd: getTodayYmdInKst(),
  });
  request.timeline.originalEstimatedShipYmd =
    resolved.originalEstimatedShipYmd;
  request.timeline.nextEstimatedShipYmd = resolved.nextEstimatedShipYmd;
  request.timeline.estimatedShipYmd = resolved.estimatedShipYmd;
}

/**
 * 신속 출고 실패(약속일 자정까지 당일 집하 없음) 또는 강제 취소 시 신속 추가 크레딧을 취소한다.
 * - forceCancel: 의뢰자가 신속→묶음 전환 등
 * - 그 외: shipOutcome.late 또는 평가 결과 late
 */
export async function cancelExpressSurchargeIfShipDelayed({
  request,
  businessAnchorId,
  session,
  deferredCreditEvents,
  forceCancel = false,
  deliveryInfo = null,
  todayYmd = null,
}) {
  if (!request?._id || !businessAnchorId) return { didCancel: false };

  const mode = resolveEffectiveShippingMode(request);
  if (mode !== "express" && !forceCancel) {
    return { didCancel: false, reason: "not_express" };
  }

  if (String(request?.price?.expressFeeStatus || "") === "cancelled") {
    return { didCancel: false, reason: "already_cancelled" };
  }

  let isDelayed = false;
  if (!forceCancel) {
    const storedStatus = String(
      request?.timeline?.shipOutcome?.status || "",
    ).trim();
    if (storedStatus === "late") {
      isDelayed = true;
    } else if (storedStatus === "on_time") {
      isDelayed = false;
    } else {
      const outcome = evaluateShipOnTimeOutcome({
        request,
        deliveryInfo,
        todayYmd: todayYmd || undefined,
      });
      isDelayed = outcome.status === "late";
    }
  }

  if (!forceCancel && !isDelayed) {
    return { didCancel: false, reason: "not_delayed" };
  }

  const rollbackResult = await deleteExpressSurchargeAtomic({
    request,
    businessAnchorId,
    session,
  });

  if (!rollbackResult?.didRollback) {
    // 레거시 합산 차감(express가 machining_spend에 포함)은 부분 취소 불가 → 상태만 표시
    if (Number(request?.price?.expressFee || 0) > 0) {
      request.price = resolveQuotedPriceWithExpressFee({
        price: {
          ...toPlainRequestPrice(request.price),
          expressFeeStatus: "cancelled",
        },
        shippingMode: resolveEffectiveShippingMode(request),
        expressFee: Number(request?.price?.expressFee || 0),
      });
    }
    return {
      didCancel: false,
      reason: rollbackResult?.reason || "no_express_surcharge",
    };
  }

  request.price = resolveQuotedPriceWithExpressFee({
    price: {
      ...toPlainRequestPrice(request.price),
      expressFeeStatus: "cancelled",
    },
    shippingMode: resolveEffectiveShippingMode(request),
    expressFee: Number(request?.price?.expressFee || 0),
  });

  const restored = Number(rollbackResult.rollbackAmount || 0);
  if (restored > 0) {
    await emitOrQueueCreditBalanceUpdate({
      deferredCreditEvents,
      businessAnchorId,
      balanceDelta: restored,
      reason: "express_surcharge_cancel",
      refId: request._id,
    });
  }

  return {
    didCancel: true,
    reason: forceCancel ? "force_cancel" : "ship_late",
    restoredAmount: restored,
  };
}

// 타이밍 SSOT: CAM 승인으로 가공 진입할 때만 호출되어야 한다.
export async function ensureRequestCreditSpendOnMachiningEnter({
  request,
  businessAnchorId,
  actorUserId,
  session,
  deferredCreditEvents,
}) {
  if (!request || !businessAnchorId) return;

  const requestCategory = String(request?.requestCategory || "").trim();
  const isSampleRequest =
    requestCategory === "rnd_sample" || requestCategory === "copied_sample";

  if (isSampleRequest) {
    request.price = {
      ...toPlainRequestPrice(request.price),
      amount: 0,
    };

    // SSOT 정책: 샘플(rnd/copied)은 무자료/무상 처리한다.
    // 어떤 크레딧 장부/정산 장부에도 기록하지 않는다.
    return;
  }

  const partnerBilling =
    request?.partnerBilling && typeof request.partnerBilling === "object"
      ? request.partnerBilling
      : {};
  const practicePrepaid = Boolean(partnerBilling.practicePrepaidAbutment);
  const isTradingPartner = Boolean(partnerBilling.isTradingPartner);
  const isPtxLabDesigned = isPtxLabDesignedAbutmentRequest(request);

  // 비거래처: 기공의뢰에서 어벗 소매가가 이미 REV_*로 반영됨 → 생산 차감 스킵
  // PTX 기공소 디자인: 표시 의뢰비는 생산만(멤버십/일반 + 신속)으로 스탬프.
  if (practicePrepaid && !isTradingPartner) {
    if (isPtxLabDesigned) {
      const shippingMode = resolveEffectiveShippingMode(request);
      let expressFeePerRequest = 2000;
      let creditSettingsForQuote = {};
      try {
        const { loadCreditSettingsDefaults } =
          await import("../../utils/creditSettingsDefaults.js");
        creditSettingsForQuote = await loadCreditSettingsDefaults({
          requestorOrgId: businessAnchorId,
          applyLabSupplyPrices: false,
        });
        expressFeePerRequest = Math.max(
          0,
          Number(creditSettingsForQuote?.expressFee ?? 2000) || 2000,
        );
      } catch {
        // defaults
      }
      const pricingTier = await resolvePtxPracticePricingTier(request, session);
      const abutmentQty = Math.max(
        1,
        countDesignAbutmentQty(request?.caseInfos) || 1,
      );
      request.price = buildPtxAbutsProductionQuoteLocal({
        creditSettings: creditSettingsForQuote,
        pricingTier,
        shippingMode,
        abutmentQty,
        expressFeePerRequest,
      });
    } else {
      request.price = {
        ...toPlainRequestPrice(request.price),
        rule:
          String(request?.price?.rule || "") ||
          "practice_transfer_prepaid_non_partner",
      };
    }
    return;
  }

  // 거래처: 기공소 의뢰크레딧에서 생산단가 강제 차감
  let spendAnchorId = businessAnchorId;
  if (practicePrepaid && isTradingPartner) {
    const forcedLabAnchor = String(
      partnerBilling.billingOwnerAnchorId || businessAnchorId || "",
    ).trim();
    if (forcedLabAnchor) spendAnchorId = forcedLabAnchor;
  }

  const shippingMode = resolveEffectiveShippingMode(request);

  let expressFeeUnit = 0;
  let designFeePerTooth = 5000;
  let creditSettingsForQuote = {};
  try {
    const { loadCreditSettingsDefaults } =
      await import("../../utils/creditSettingsDefaults.js");
    creditSettingsForQuote = await loadCreditSettingsDefaults({
      requestorOrgId: spendAnchorId,
      applyLabSupplyPrices: !practicePrepaid,
    });
    if (shippingMode === "express") {
      expressFeeUnit = Math.max(
        0,
        Number(creditSettingsForQuote?.expressFee ?? 2000) || 0,
      );
    }
    designFeePerTooth = Math.max(
      0,
      Number(creditSettingsForQuote?.designFee ?? 5000) || 5000,
    );
  } catch {
    if (shippingMode === "express") expressFeeUnit = 2000;
    designFeePerTooth = 5000;
  }

  const caseInfos = request?.caseInfos || {};
  const abutmentQty = countDesignAbutmentQty(caseInfos);
  const productMode = String(caseInfos?.productMode || "").trim();

  // PTX 기공소 디자인: 생산만(디자인비 0). 플랫폼 고시 단가.
  let computedPrice;
  let machiningAmount;
  let withDesign;
  let expressQty;
  if (isPtxLabDesigned) {
    designFeePerTooth = 0;
    const pricingTier = await resolvePtxPracticePricingTier(request, session);
    const picked = pickAbutsAbutmentCreditPrices(
      creditSettingsForQuote,
      pricingTier,
    );
    const unit = Math.max(
      0,
      Number(picked.productionPrice) ||
        (pricingTier === "membership"
          ? ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE
          : ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE),
    );
    const qty = Math.max(1, abutmentQty || 1);
    expressQty = qty;
    const tier = pricingTier === "membership" ? "membership" : "regular";
    computedPrice = {
      baseAmount: unit,
      discountAmount: 0,
      amount: unit * qty,
      currency: "KRW",
      rule:
        tier === "membership"
          ? "ptx_abuts_production_membership"
          : "ptx_abuts_production_regular",
      designFee: null,
      abutmentQty: qty,
      quotedAt: new Date(),
      discountMeta: { pricingTier: tier },
    };
    withDesign = {
      ...computedPrice,
      designFee: null,
    };
    machiningAmount = unit * qty;
  } else {
    computedPrice = await computePriceForRequest({
      requestorId: request?.requestor,
      requestorOrgId: spendAnchorId,
      clinicName: request?.caseInfos?.clinicName || "",
      patientName: request?.caseInfos?.patientName || "",
      tooth: request?.caseInfos?.tooth || "",
      currentRequestId: request?._id,
    });
    expressQty =
      productMode === "design_custom_abutment" ? Math.max(0, abutmentQty) : 1;
    machiningAmount = resolveMachiningSpendAmount({
      price: computedPrice,
      caseInfos,
      designFeePerTooth,
    });
    withDesign = resolveQuotedPriceWithDesignFee({
      price: computedPrice,
      productMode: caseInfos?.productMode,
      toothCount: abutmentQty,
      designFeePerTooth,
    });
  }
  const expressFee = expressFeeUnit * expressQty;

  request.price = {
    ...toPlainRequestPrice(request.price),
    ...resolveQuotedPriceWithExpressFee({
      price: withDesign,
      shippingMode,
      expressFee: expressFeeUnit,
      expressQty,
    }),
  };

  const machiningHoldMeta = await readRequestHoldMeta({
    idempotencyKey: requestMachiningHoldKey(request._id),
    session,
  });

  let spendResult;
  if (machiningHoldMeta?.journalId) {
    const spentAmount = Number(
      machiningHoldMeta.heldTotal || machiningAmount || 0,
    );
    const glPostResult = await postSpendCommitGeneralLedger({
      eventType: "REQUEST_SPEND_COMMIT",
      spendUniqueKey: `request:${String(request._id)}:machining_spend`,
      request,
      businessAnchorId: spendAnchorId,
      actorUserId,
      amount: spentAmount,
      fromPaid: machiningHoldMeta.fromPaid,
      fromFreeRequest: machiningHoldMeta.fromFreeRequest,
      fromFreeShipping: machiningHoldMeta.fromFreeShipping,
      fromSettlement: machiningHoldMeta.fromSettlement,
      freeAccountCode: "REQ_FREE_REQUEST_CREDIT",
      refType: "REQUEST",
      refId: request._id,
      stageFrom: "CAM",
      stageTo: "가공",
      session,
      usageKind: "abutment_production",
      fromEscrowHold: true,
      escrowDevopsAnchorId: machiningHoldMeta.devopsAnchorId,
    });
    if (!glPostResult?.posted && !glPostResult?.idempotent) {
      throw new Error("REQUEST_SPEND_COMMIT machining hold convert failed");
    }
    console.log("[CREDIT_SPEND] machining hold converted", {
      requestId: request?.requestId,
      amount: spentAmount,
    });
  } else {
  spendResult = await spendRequestCreditAtomic({
    request,
    businessAnchorId: spendAnchorId,
    actorUserId,
    session,
    spendKeySuffix: "machining_spend",
    computedPrice: {
      ...(computedPrice && typeof computedPrice === "object" ? computedPrice : {}),
      amount: machiningAmount,
    },
  });

  if (spendResult?.didSpend) {
    const spentAmount = Number(spendResult.resolvedAmount || 0);

    console.log("[CREDIT_SPEND] machining spend inserted", {
      requestId: request?.requestId,
      requestMongoId: String(request?._id || ""),
      amount: spentAmount,
      businessAnchorId: String(spendAnchorId),
      practicePrepaid: Boolean(practicePrepaid),
      isTradingPartner: Boolean(isTradingPartner),
    });

    const glPostResult = await postSpendCommitGeneralLedger({
      eventType: "REQUEST_SPEND_COMMIT",
      spendUniqueKey: spendResult.uniqueKey,
      request,
      businessAnchorId: spendAnchorId,
      actorUserId,
      amount: Number(spendResult.resolvedAmount || 0),
      fromPaid: Number(spendResult.fromPaid || 0),
      fromFreeRequest: Number(
        spendResult.fromFreeRequest ?? spendResult.fromBonusRequest ?? 0,
      ),
      fromFreeShipping: Number(
        spendResult.fromFreeShipping ?? spendResult.fromBonusShipping ?? 0,
      ),
      fromSettlement: Number(spendResult.fromSettlement || 0),
      freeAccountCode: "REQ_FREE_REQUEST_CREDIT",
      refType: "REQUEST",
      refId: request._id,
      stageFrom: "CAM",
      stageTo: "가공",
      session,
      usageKind: "abutment_production",
    });

    if (!glPostResult?.posted) {
      if (glPostResult?.idempotent) {
        console.log(
          "[CREDIT_SPEND] duplicate machining spend detected (no compensation needed)",
          {
            requestId: request?.requestId,
            requestMongoId: String(request?._id || ""),
            uniqueKey: spendResult.uniqueKey,
          },
        );
      } else {
        throw new Error("REQUEST_SPEND_COMMIT ledger posting failed");
      }
    } else {
      await emitOrQueueCreditBalanceUpdate({
        deferredCreditEvents,
        businessAnchorId,
        balanceDelta: -spentAmount,
        reason: "machining_spend",
        refId: request._id,
      });
    }
  } else if (spendResult?.reason === "already_spent") {
    console.log("[CREDIT_SPEND] skip existing machining spend for request", {
      requestId: request?.requestId,
      requestMongoId: String(request?._id || ""),
      existingUniqueKey: spendResult?.existingUniqueKey || null,
      currentUniqueKey: spendResult?.uniqueKey || null,
    });
  }
  }

  if (expressFee <= 0) return;

  if (String(request?.price?.expressFeeStatus || "") === "cancelled") return;

  // charged 표시만으로 스킵하지 않는다. 실제 express_surcharge 저널이 있을 때만 완료로 본다.
  if (String(request?.price?.expressFeeStatus || "") === "charged") {
    const expressKey = `gl:request:${String(request?._id || "")}:express_surcharge`;
    const existingExpress = await LedgerJournal.findOne({
      idempotencyKey: expressKey,
      eventType: "REQUEST_SPEND_COMMIT",
    })
      .session(session || null)
      .select({ journalId: 1 })
      .lean();
    if (existingExpress?.journalId) return;
    console.warn(
      "[CREDIT_SPEND] expressFeeStatus=charged but express_surcharge journal missing; will recharge",
      {
        requestId: request?.requestId,
        requestMongoId: String(request?._id || ""),
      },
    );
  }

  // 레거시 합산 차감(생산비+신속비가 machining_spend 한 건) 재진입 시 이중 차감 방지
  if (spendResult?.reason === "already_spent") {
    const expressKey = `gl:request:${String(request?._id || "")}:express_surcharge`;
    const existingExpress = await LedgerJournal.findOne({
      idempotencyKey: expressKey,
      eventType: "REQUEST_SPEND_COMMIT",
    })
      .session(session || null)
      .select({ journalId: 1 })
      .lean();
    if (existingExpress?.journalId) {
      if (request.price) {
        request.price.expressFeeStatus = "charged";
      } else {
        request.price = { expressFeeStatus: "charged" };
      }
      return;
    }

    const spendLines = await LedgerLine.aggregate([
      {
        $match: {
          refType: "REQUEST",
          refId: request._id,
          ownerRole: "requestor",
          accountCode: {
            $in: [
              "REQ_PAID_CREDIT",
              "REQ_FREE_REQUEST_CREDIT",
              "REQ_FREE_SHIPPING_CREDIT",
              "LAB_SETTLEMENT_CREDIT",
            ],
          },
          amount: { $lt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          spent: { $sum: { $abs: "$amount" } },
        },
      },
    ]).session(session || null);

    const spentTotal = Number(spendLines?.[0]?.spent || 0);
    const baseOnly =
      Number.isFinite(baseAmount) && baseAmount > 0 ? baseAmount : 0;
    // baseOnly가 0/누락이면 오탐하므로, 실제 추가비만큼 더 쓰인 경우만 레거시 합산으로 본다.
    if (baseOnly > 0 && spentTotal >= baseOnly + expressFee - 1) {
      if (request.price) {
        request.price.expressFeeStatus = "charged";
      } else {
        request.price = { expressFeeStatus: "charged" };
      }
      console.log(
        "[CREDIT_SPEND] skip express surcharge; legacy combined spend detected",
        {
          requestId: request?.requestId,
          spentTotal,
          baseOnly,
          expressFee,
        },
      );
      return;
    }
  }

  const expressHoldMeta = await readRequestHoldMeta({
    idempotencyKey: requestExpressHoldKey(request._id),
    session,
  });

  if (expressHoldMeta?.journalId) {
    const expressGl = await postSpendCommitGeneralLedger({
      eventType: "REQUEST_SPEND_COMMIT",
      spendUniqueKey: `request:${String(request._id)}:express_surcharge`,
      request,
      businessAnchorId: spendAnchorId,
      actorUserId,
      amount: Number(expressHoldMeta.heldTotal || expressFee || 0),
      fromPaid: expressHoldMeta.fromPaid,
      fromFreeRequest: expressHoldMeta.fromFreeRequest,
      fromFreeShipping: expressHoldMeta.fromFreeShipping,
      fromSettlement: expressHoldMeta.fromSettlement,
      freeAccountCode: "REQ_FREE_REQUEST_CREDIT",
      refType: "REQUEST",
      refId: request._id,
      stageFrom: "CAM",
      stageTo: "가공",
      session,
      usageKind: "express_surcharge",
      fromEscrowHold: true,
      escrowDevopsAnchorId: expressHoldMeta.devopsAnchorId,
    });
    if (!expressGl?.posted && !expressGl?.idempotent) {
      throw new Error(
        "REQUEST_SPEND_COMMIT express surcharge hold convert failed",
      );
    }
    if (request.price) {
      request.price.expressFeeStatus = "charged";
    } else {
      request.price = { expressFeeStatus: "charged" };
    }
    console.log("[CREDIT_SPEND] express hold converted", {
      requestId: request?.requestId,
      amount: expressFee,
    });
    return;
  }

  const expressSpendResult = await spendRequestCreditAtomic({
    request,
    businessAnchorId: spendAnchorId,
    actorUserId,
    session,
    spendKeySuffix: "express_surcharge",
    computedPrice: { amount: expressFee },
  });

  if (!expressSpendResult?.didSpend) {
    if (expressSpendResult?.reason === "already_spent") {
      if (request.price) {
        request.price.expressFeeStatus = "charged";
      } else {
        request.price = { expressFeeStatus: "charged" };
      }
      console.log("[CREDIT_SPEND] skip existing express surcharge", {
        requestId: request?.requestId,
        uniqueKey: expressSpendResult.uniqueKey,
      });
    } else {
      console.warn("[CREDIT_SPEND] express surcharge not spent", {
        requestId: request?.requestId,
        reason: expressSpendResult?.reason || null,
        expressFee,
      });
    }
    return;
  }

  const expressGl = await postSpendCommitGeneralLedger({
    eventType: "REQUEST_SPEND_COMMIT",
    spendUniqueKey: expressSpendResult.uniqueKey,
    request,
    businessAnchorId: spendAnchorId,
    actorUserId,
    amount: Number(expressSpendResult.resolvedAmount || 0),
    fromPaid: Number(expressSpendResult.fromPaid || 0),
    fromFreeRequest: Number(
      expressSpendResult.fromFreeRequest ??
        expressSpendResult.fromBonusRequest ??
        0,
    ),
    fromFreeShipping: Number(
      expressSpendResult.fromFreeShipping ??
        expressSpendResult.fromBonusShipping ??
        0,
    ),
    fromSettlement: Number(expressSpendResult.fromSettlement || 0),
    freeAccountCode: "REQ_FREE_REQUEST_CREDIT",
    refType: "REQUEST",
    refId: request._id,
    stageFrom: "CAM",
    stageTo: "가공",
    session,
    usageKind: "express_surcharge",
  });

  if (!expressGl?.posted) {
    if (expressGl?.idempotent) {
      if (request.price) {
        request.price.expressFeeStatus = "charged";
      } else {
        request.price = { expressFeeStatus: "charged" };
      }
      return;
    }
    throw new Error("REQUEST_SPEND_COMMIT express surcharge ledger posting failed");
  }

  if (request.price) {
    request.price.expressFeeStatus = "charged";
  } else {
    request.price = { expressFeeStatus: "charged" };
  }

  await emitOrQueueCreditBalanceUpdate({
    deferredCreditEvents,
    businessAnchorId,
    balanceDelta: -Number(expressSpendResult.resolvedAmount || 0),
    reason: "express_surcharge",
    refId: request._id,
  });

  console.log("[CREDIT_SPEND] express surcharge inserted", {
    requestId: request?.requestId,
    amount: Number(expressSpendResult.resolvedAmount || 0),
    uniqueKey: expressSpendResult.uniqueKey,
  });
}

/**
 * 가공 진입 후 신속추가비(express_surcharge)만 누락된 건을 보정한다.
 * - machining_spend 저널이 있고 express_surcharge 저널이 없으면 강제 차감
 * - expressFeeStatus=charged 오표시여도 저널이 없으면 보정한다 (cancelled만 제외)
 */
export async function healMissingExpressSurchargesForBusiness({
  businessAnchorId,
  actorUserId = null,
  limit = 30,
}) {
  const anchorObjectId =
    businessAnchorId instanceof Types.ObjectId
      ? businessAnchorId
      : Types.ObjectId.isValid(String(businessAnchorId || ""))
        ? new Types.ObjectId(String(businessAnchorId))
        : null;
  if (!anchorObjectId) return { healed: 0, checked: 0 };

  const max = Math.min(50, Math.max(1, Number(limit) || 30));

  // status 필드는 오탐이 있어 후보 필터에 쓰지 않는다. 저널 존재로만 판단.
  const candidates = await Request.find({
    businessAnchorId: anchorObjectId,
    $or: [
      { shippingMode: "express" },
      { "finalShipping.mode": "express" },
      { "originalShipping.mode": "express" },
    ],
    manufacturerStage: {
      $nin: ["준비", "의뢰", "취소", "cancelled", "canceled"],
    },
    "price.expressFeeStatus": { $ne: "cancelled" },
  })
    .sort({ updatedAt: -1 })
    .limit(max)
    .exec();

  console.log("[CREDIT_SPEND] heal express surcharge scan", {
    businessAnchorId: String(anchorObjectId),
    candidates: (candidates || []).length,
  });

  let healed = 0;
  let skippedNoMachining = 0;
  let skippedHasExpress = 0;

  for (const request of candidates || []) {
    if (resolveEffectiveShippingMode(request) !== "express") continue;

    const requestMongoId = String(request?._id || "");
    const machiningKey = `gl:request:${requestMongoId}:machining_spend`;
    const expressKey = `gl:request:${requestMongoId}:express_surcharge`;

    const [machiningJournal, expressJournal] = await Promise.all([
      LedgerJournal.findOne({
        idempotencyKey: machiningKey,
        eventType: "REQUEST_SPEND_COMMIT",
      })
        .select({ journalId: 1 })
        .lean(),
      LedgerJournal.findOne({
        idempotencyKey: expressKey,
        eventType: "REQUEST_SPEND_COMMIT",
      })
        .select({ journalId: 1 })
        .lean(),
    ]);

    if (!machiningJournal?.journalId) {
      skippedNoMachining += 1;
      continue;
    }
    if (expressJournal?.journalId) {
      skippedHasExpress += 1;
      if (String(request?.price?.expressFeeStatus || "") !== "charged") {
        if (request.price) {
          request.price.expressFeeStatus = "charged";
        } else {
          request.price = { expressFeeStatus: "charged" };
        }
        try {
          await request.save();
        } catch (saveErr) {
          console.warn("[CREDIT_SPEND] heal mark charged failed", {
            requestId: request?.requestId,
            message: saveErr?.message || String(saveErr || ""),
          });
        }
      }
      continue;
    }

    // charged 오표시를 지우고 재차감 경로로 진입
    if (String(request?.price?.expressFeeStatus || "") === "charged") {
      request.price = {
        ...toPlainRequestPrice(request.price),
      };
      delete request.price.expressFeeStatus;
    }

    const deferredCreditEvents = [];
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await ensureRequestCreditSpendOnMachiningEnter({
          request,
          businessAnchorId: anchorObjectId,
          actorUserId,
          session,
          deferredCreditEvents,
        });
        await request.save({ session });
      });

      for (const evt of deferredCreditEvents) {
        try {
          await emitCreditBalanceUpdatedToBusiness(evt);
        } catch (emitErr) {
          console.error("[CREDIT_SPEND] heal express emit failed", {
            requestId: request?.requestId,
            message: emitErr?.message || String(emitErr || ""),
          });
        }
      }

      const chargedNow = await LedgerJournal.findOne({
        idempotencyKey: expressKey,
        eventType: "REQUEST_SPEND_COMMIT",
      })
        .select({ journalId: 1 })
        .lean();

      if (chargedNow?.journalId) {
        healed += 1;
        console.log("[CREDIT_SPEND] healed missing express surcharge", {
          requestId: request?.requestId,
          requestMongoId,
          patientName: request?.caseInfos?.patientName || null,
          tooth: request?.caseInfos?.tooth || null,
        });
      } else {
        console.warn("[CREDIT_SPEND] heal attempted but express journal still missing", {
          requestId: request?.requestId,
          requestMongoId,
          expressFeeStatus: request?.price?.expressFeeStatus || null,
        });
      }
    } catch (err) {
      console.error("[CREDIT_SPEND] heal express surcharge failed", {
        requestId: request?.requestId,
        requestMongoId,
        message: err?.message || String(err || ""),
      });
    } finally {
      await session.endSession().catch(() => null);
    }
  }

  console.log("[CREDIT_SPEND] heal express surcharge done", {
    businessAnchorId: String(anchorObjectId),
    healed,
    checked: (candidates || []).length,
    skippedNoMachining,
    skippedHasExpress,
  });

  return { healed, checked: (candidates || []).length };
}

const EXPRESS_SURCHARGE_HEAL_COOLDOWN_MS = 60 * 1000;
const lastExpressSurchargeHealAtByAnchor = new Map();

/**
 * 원장 GET을 막지 않는다. 보정은 백그라운드·앵커당 쿨다운.
 * 실제 차감이 생기면 credit:balance-updated로 목록이 다시 로드된다.
 */
export function scheduleHealMissingExpressSurchargesForBusiness(args) {
  const key = String(args?.businessAnchorId || "").trim();
  if (!key) return;
  const now = Date.now();
  const last = lastExpressSurchargeHealAtByAnchor.get(key) || 0;
  if (now - last < EXPRESS_SURCHARGE_HEAL_COOLDOWN_MS) return;
  lastExpressSurchargeHealAtByAnchor.set(key, now);
  setTimeout(() => {
    void healMissingExpressSurchargesForBusiness(args).catch((err) => {
      console.error("[CREDIT_SPEND] scheduled heal failed", {
        businessAnchorId: key,
        message: err?.message || String(err || ""),
      });
    });
  }, 2500);
}

async function requestorCommitSpendLineExists({
  request,
  businessAnchorId,
  session,
}) {
  const lines = await LedgerLine.find({
    ownerRole: "requestor",
    ownerId: businessAnchorId,
    refType: "REQUEST",
    refId: request._id,
    accountCode: {
      $in: [
        "REQ_PAID_CREDIT",
        "REQ_FREE_REQUEST_CREDIT",
        "REQ_FREE_SHIPPING_CREDIT",
        "LAB_SETTLEMENT_CREDIT",
      ],
    },
    amount: { $lt: 0 },
  })
    .select({ journalId: 1 })
    .session(session || null)
    .lean();

  const journalIds = [
    ...new Set(
      (lines || [])
        .map((row) => String(row?.journalId || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!journalIds.length) return false;

  return Boolean(
    await LedgerJournal.exists({
      journalId: { $in: journalIds },
      eventType: "REQUEST_SPEND_COMMIT",
    }).session(session || null),
  );
}

// 타이밍 SSOT: 가공 단계 롤백(CAM 복귀)에서만 호출되어야 한다.
export async function ensureRequestCreditRollbackDeleteOnRollbackToCam({
  request,
  businessAnchorId,
  actorUserId,
  session,
  deferredCreditEvents,
  uniqueKeysOnly = false,
}) {
  if (!request?._id || !businessAnchorId) {
    console.warn("[CREDIT_ROLLBACK][REQUEST] skipped invalid input", {
      requestMongoId: request?._id ? String(request._id) : null,
      requestId: request?.requestId || null,
      businessAnchorId: businessAnchorId ? String(businessAnchorId) : null,
      actorUserId: actorUserId ? String(actorUserId) : null,
      hasSession: !!session,
    });
    return;
  }

  console.log("[CREDIT_ROLLBACK][REQUEST] start", {
    requestMongoId: String(request._id),
    requestId: request?.requestId || null,
    manufacturerStage: String(request?.manufacturerStage || "").trim() || null,
    businessAnchorId: String(businessAnchorId),
    actorUserId: actorUserId ? String(actorUserId) : null,
    hasSession: !!session,
  });

  const rollbackResult = await deleteRequestSpendAtomicOnRollback({
    request,
    businessAnchorId,
    session,
    uniqueKeysOnly: Boolean(uniqueKeysOnly),
  });

  if (!rollbackResult?.didRollback) {
    const requestCategory = String(request?.requestCategory || "").trim();
    const isSampleRequest =
      requestCategory === "rnd_sample" || requestCategory === "copied_sample";

    console.warn("[CREDIT_ROLLBACK][REQUEST] not rolled back", {
      requestMongoId: String(request._id),
      requestId: request?.requestId || null,
      requestCategory: requestCategory || null,
      businessAnchorId: String(businessAnchorId),
      reason: rollbackResult?.reason || null,
      deletedJournalIds: rollbackResult?.deletedJournalIds || [],
      rollbackAmount: Number(rollbackResult?.rollbackAmount || 0),
    });

    // 샘플은 정책상 장부 무기록이므로 no_spend를 정상으로 허용한다.
    if (rollbackResult?.reason === "no_spend" && isSampleRequest) {
      return;
    }

    // 일반 의뢰에서 no_spend가 나왔더라도, COMMIT 소비 라인이 이미 없다면
    // (이전 시도에서 저널 삭제 완료, 또는 제출 HOLD만 있는 준비 단계) idempotent success.
    if (rollbackResult?.reason === "no_spend") {
      if (uniqueKeysOnly) {
        console.log("[CREDIT_ROLLBACK][REQUEST] no_spend uniqueKeysOnly; treat as idempotent", {
          requestMongoId: String(request._id),
          requestId: request?.requestId || null,
          businessAnchorId: String(businessAnchorId),
        });
        return;
      }

      const requestorSpendLineExists = await requestorCommitSpendLineExists({
        request,
        businessAnchorId,
        session,
      });

      if (!requestorSpendLineExists) {
        console.log("[CREDIT_ROLLBACK][REQUEST] no_spend but no requestor commit spend lines; treat as idempotent", {
          requestMongoId: String(request._id),
          requestId: request?.requestId || null,
          businessAnchorId: String(businessAnchorId),
        });
        return;
      }

      console.warn("[CREDIT_ROLLBACK][REQUEST] no_spend but requestor commit spend lines still exist", {
        requestMongoId: String(request._id),
        requestId: request?.requestId || null,
        businessAnchorId: String(businessAnchorId),
      });
    }

    const err = new Error(
      `machining rollback-delete failed: ${String(
        rollbackResult?.reason || "unknown_reason",
      )}`,
    );
    err.statusCode = 409;
    throw err;
  }

  console.log("[CREDIT_ROLLBACK][REQUEST] success", {
    requestMongoId: String(request._id),
    requestId: request?.requestId || null,
    businessAnchorId: String(businessAnchorId),
    deletedJournalIds: rollbackResult?.deletedJournalIds || [],
    rollbackAmount: Number(rollbackResult?.rollbackAmount || 0),
  });

  await emitOrQueueCreditBalanceUpdate({
    deferredCreditEvents,
    businessAnchorId,
    balanceDelta: Number(rollbackResult.rollbackAmount || 0),
    reason: "machining_spend_rollback_delete",
    refId: request?._id,
  });

  console.log("[CREDIT_ROLLBACK][REQUEST] balance event emitted", {
    requestMongoId: String(request._id),
    requestId: request?.requestId || null,
    businessAnchorId: String(businessAnchorId),
    balanceDelta: Number(rollbackResult.rollbackAmount || 0),
  });
}

// 포장.발송 진입: 우편함만 확인한다. 배송비 차감은 집하 SSOT.
export async function ensureShippingFeeSpendOnPackingApprove({
  request,
}) {
  if (!request?._id) return;

  const mailboxAddress = String(request?.mailboxAddress || "").trim();
  if (!mailboxAddress) {
    const err = new Error(
      "우편함 정보가 없어 포장.발송 단계로 이동할 수 없습니다.",
    );
    err.statusCode = 400;
    throw err;
  }
}

const collectRelatedPtxIds = (requests = []) => {
  const ids = [];
  const seen = new Set();
  for (const request of requests) {
    const relatedPtxId = String(
      request?.partnerBilling?.relatedPracticeTransferId || "",
    ).trim();
    if (!relatedPtxId || !Types.ObjectId.isValid(relatedPtxId)) continue;
    if (seen.has(relatedPtxId)) continue;
    seen.add(relatedPtxId);
    ids.push(relatedPtxId);
  }
  return ids;
};

async function maybeConvertPtxAbutsShippingHolds({
  requests = [],
  actorUserId = null,
  session = null,
}) {
  const relatedPtxIds = collectRelatedPtxIds(requests);
  if (!relatedPtxIds.length) return { handled: false };

  const { getJournalByIdempotencyKey } = await import(
    "../../services/generalLedger.service.js"
  );
  const PracticeTransfer = (
    await import("../../models/practiceTransfer.model.js")
  ).default;
  const { chargePracticeTransferAbutsShipping } = await import(
    "../../services/practiceTransferBilling.service.js"
  );

  let handled = false;
  for (const relatedPtxId of relatedPtxIds) {
    try {
      const [already, hold] = await Promise.all([
        getJournalByIdempotencyKey({
          idempotencyKey: `gl:practice_transfer:${relatedPtxId}:abuts_shipping`,
          session,
        }),
        getJournalByIdempotencyKey({
          idempotencyKey: `practice_transfer:${relatedPtxId}:hold:abuts_shipping`,
          session,
        }),
      ]);
      if (already?.journalId) {
        handled = true;
        continue;
      }
      if (!hold?.journalId) continue;
      const transfer = await PracticeTransfer.findById(relatedPtxId)
        .session(session || null)
        .lean();
      if (!transfer?._id) continue;
      await chargePracticeTransferAbutsShipping({
        transfer,
        toothWorks: Array.isArray(transfer.toothWorks)
          ? transfer.toothWorks
          : [],
        actorUserId,
        session,
      });
      handled = true;
    } catch (err) {
      console.error("[SHIPPING_FEE] PTX abuts shipping convert failed", {
        relatedPtxId,
        message: err?.message || String(err),
      });
    }
  }
  return { handled };
}

function resolveMailboxPickupPayerAnchorId(requests = []) {
  for (const request of requests) {
    const practiceFromBilling = normalizeBusinessAnchorId(
      request?.partnerBilling?.practiceBusinessAnchorId,
    );
    if (practiceFromBilling) return practiceFromBilling;
    const fromReceiver = normalizeBusinessAnchorId(
      request?.shippingReceiver?.sourceAnchorId,
    );
    if (fromReceiver) return fromReceiver;
    const shippingOrg = normalizeBusinessAnchorId(
      resolveShippingMailboxOrgId(request),
    );
    if (shippingOrg) return shippingOrg;
    const direct = normalizeBusinessAnchorId(request?.businessAnchorId);
    if (direct) return direct;
  }
  return "";
}

// 타이밍 SSOT: 우편함 집하(비우기) 1회에 배송비 1회.
export async function ensureShippingFeeSpendOnMailboxPickup({
  mailboxAddress,
  requests = [],
  actorUserId = null,
  session = null,
  deferredCreditEvents,
  throwOnInsufficient = true,
}) {
  const mailbox = String(mailboxAddress || "").trim();
  const list = (Array.isArray(requests) ? requests : []).filter(Boolean);
  if (!mailbox || !list.length) return null;

  const chargeable = list.filter(
    (request) => !isManufacturerSampleRequest(request),
  );
  if (!chargeable.length) return null;

  const ptxHandled = await maybeConvertPtxAbutsShippingHolds({
    requests: chargeable,
    actorUserId,
    session,
  });
  if (ptxHandled.handled) {
    console.log("[SHIPPING_FEE] skip package spend (PTX abuts shipping)", {
      mailboxAddress: mailbox,
      requestIds: chargeable.map((row) => row?.requestId).filter(Boolean),
    });
    return { didSpend: false, reason: "ptx_abuts_shipping" };
  }

  const payerAnchorId = resolveMailboxPickupPayerAnchorId(chargeable);
  const packageAnchorId =
    normalizeBusinessAnchorId(resolveShippingMailboxOrgId(chargeable[0])) ||
    payerAnchorId;
  if (!payerAnchorId || !Types.ObjectId.isValid(payerAnchorId)) {
    console.warn("[SHIPPING_FEE] pickup spend skipped (no payer)", {
      mailboxAddress: mailbox,
    });
    return null;
  }

  const shippingFeeSupply = await resolveShippingFeePerBox();
  const shipDateYmd = getTodayYmdInKst();
  const requestObjectIds = chargeable.map((row) => row?._id).filter(Boolean);

  let pkg = null;
  const existingPkgIds = [];
  const seenPkg = new Set();
  for (const row of chargeable) {
    const raw = String(
      row?.shippingPackageId?._id || row?.shippingPackageId || "",
    ).trim();
    if (!raw || !Types.ObjectId.isValid(raw) || seenPkg.has(raw)) continue;
    seenPkg.add(raw);
    existingPkgIds.push(raw);
  }
  if (existingPkgIds.length) {
    pkg = await ShippingPackage.findById(existingPkgIds[0], null, { session });
  }
  if (!pkg?._id) {
    const created = await ShippingPackage.create(
      [
        {
          businessAnchorId: packageAnchorId || payerAnchorId,
          shipDateYmd,
          mailboxAddress: mailbox,
          shippingFeeSupply,
          shippingFeeVat: 0,
          createdBy: actorUserId || null,
          requestIds: requestObjectIds,
        },
      ],
      { session: session || undefined },
    );
    pkg = created?.[0] || null;
  } else if (requestObjectIds.length) {
    await ShippingPackage.updateOne(
      { _id: pkg._id },
      { $addToSet: { requestIds: { $each: requestObjectIds } } },
      { session: session || undefined },
    );
  }
  if (!pkg?._id) {
    throw new Error("발송 박스 생성에 실패했습니다.");
  }

  await Request.updateMany(
    { _id: { $in: requestObjectIds } },
    { $set: { shippingPackageId: pkg._id } },
    { session: session || undefined },
  );
  for (const row of chargeable) {
    row.shippingPackageId = pkg._id;
  }

  const spendUniqueKey = `shippingPackage:${String(pkg._id)}:shipping_fee`;
  const representative = chargeable[0];
  const relatedPtxId = String(
    representative?.partnerBilling?.relatedPracticeTransferId || "",
  ).trim();
  const isPtxAbutsShipping = Boolean(relatedPtxId);

  const slotHold = await findMailboxSlotShippingHold({
    mailboxAddress: mailbox,
    payerAnchorId,
    receiverFingerprint: normalizeMailboxReceiverFingerprint(representative),
    session,
    requestIds: requestObjectIds,
  });

  if (slotHold?.journal) {
    const holdMeta = await readRequestHoldMeta({
      idempotencyKey: slotHold.idempotencyKey,
      session,
    });
    const convertAmount = Math.max(
      0,
      Math.round(Number(holdMeta?.heldTotal || shippingFeeSupply) || 0),
    );
    if (convertAmount > 0 && holdMeta?.devopsAnchorId) {
      const glPostResult = await postSpendCommitGeneralLedger({
        eventType: "SHIPPING_SPEND_COMMIT",
        spendUniqueKey,
        request: representative,
        businessAnchorId: payerAnchorId,
        actorUserId,
        amount: convertAmount,
        fromPaid: holdMeta.fromPaid,
        fromFreeRequest: holdMeta.fromFreeRequest,
        fromFreeShipping: holdMeta.fromFreeShipping,
        fromSettlement: holdMeta.fromSettlement,
        freeAccountCode: "REQ_FREE_SHIPPING_CREDIT",
        refType: "SHIPPING_PACKAGE",
        refId: pkg._id,
        stageFrom: "포장.발송",
        stageTo: "추적관리",
        session,
        usageKind: isPtxAbutsShipping
          ? "practice_transfer_abuts_shipping"
          : "shipping",
        displayLabel: isPtxAbutsShipping ? "배송비(치과→어벗츠)" : null,
        displayKind: isPtxAbutsShipping ? "shipping" : null,
        fromEscrowHold: true,
        escrowDevopsAnchorId: holdMeta.devopsAnchorId,
      });

      if (!glPostResult?.posted && !glPostResult?.idempotent) {
        throw new Error("SHIPPING_SPEND_COMMIT hold convert failed");
      }

      console.log("[SHIPPING_FEE] shipping hold converted at pickup", {
        mailboxAddress: mailbox,
        shippingPackageId: String(pkg._id),
        holdRequestId: slotHold.requestId || null,
        amount: convertAmount,
      });

      return {
        didSpend: true,
        reason: "from_hold",
        amount: convertAmount,
        uniqueKey: spendUniqueKey,
        shippingPackageId: String(pkg._id),
      };
    }
  }

  let spendResult;
  try {
    spendResult = await spendShippingCreditAtomic({
      businessAnchorId: payerAnchorId,
      shippingPackageId: pkg._id,
      actorUserId,
      fee: shippingFeeSupply,
      session,
    });
  } catch (err) {
    if (Number(err?.statusCode) === 402) {
      err.message = "의뢰자 잔액 부족으로 집하할 수 없습니다.";
      if (!throwOnInsufficient) {
        console.error("[SHIPPING_FEE] pickup spend insufficient credit", {
          mailboxAddress: mailbox,
          payerAnchorId,
          required: err?.payload?.required || shippingFeeSupply,
        });
        return { didSpend: false, reason: "insufficient_credit" };
      }
    }
    throw err;
  }

  if (!spendResult?.didSpend) {
    if (spendResult?.reason === "already_spent") {
      console.log("[SHIPPING_FEE] skip duplicate mailbox pickup spend", {
        mailboxAddress: mailbox,
        shippingPackageId: String(pkg._id),
        uniqueKey: spendResult?.uniqueKey || null,
      });
    }
    return spendResult;
  }

  const glPostResult = await postSpendCommitGeneralLedger({
    eventType: "SHIPPING_SPEND_COMMIT",
    spendUniqueKey: spendResult.uniqueKey,
    request: representative,
    businessAnchorId: payerAnchorId,
    actorUserId,
    amount: Number(spendResult.amount || 0),
    fromPaid: Number(spendResult.fromPaid || 0),
    fromFreeRequest: Number(
      spendResult.fromFreeRequest ?? spendResult.fromBonusRequest ?? 0,
    ),
    fromFreeShipping: Number(
      spendResult.fromFreeShipping ?? spendResult.fromBonusShipping ?? 0,
    ),
    fromSettlement: Number(spendResult.fromSettlement || 0),
    freeAccountCode: "REQ_FREE_SHIPPING_CREDIT",
    refType: "SHIPPING_PACKAGE",
    refId: pkg._id,
    stageFrom: "포장.발송",
    stageTo: "추적관리",
    session,
    usageKind: isPtxAbutsShipping
      ? "practice_transfer_abuts_shipping"
      : "shipping",
    displayLabel: isPtxAbutsShipping ? "배송비(치과→어벗츠)" : null,
    displayKind: isPtxAbutsShipping ? "shipping" : null,
  });

  if (!glPostResult?.posted) {
    if (glPostResult?.idempotent) {
      console.log(
        "[SHIPPING_FEE] duplicate shipping spend detected (no compensation needed)",
        {
          mailboxAddress: mailbox,
          shippingPackageId: String(pkg._id),
          uniqueKey: spendResult.uniqueKey,
        },
      );
      return spendResult;
    }
    throw new Error("SHIPPING_SPEND_COMMIT ledger posting failed");
  }

  await emitOrQueueCreditBalanceUpdate({
    deferredCreditEvents,
    businessAnchorId: payerAnchorId,
    balanceDelta: -Number(spendResult.amount || shippingFeeSupply),
    reason: "shipping_fee_spend",
    refId: pkg._id,
  });

  console.log("[SHIPPING_FEE] mailbox pickup spend inserted", {
    mailboxAddress: mailbox,
    shippingPackageId: String(pkg._id),
    amount: Number(spendResult.amount || shippingFeeSupply),
    payerAnchorId,
    requestCount: chargeable.length,
  });

  return spendResult;
}

// 타이밍 SSOT: 포장.발송 롤백(세척.패킹 복귀)에서만 호출되어야 한다.
export async function ensureShippingFeeRollbackDeleteOnShippingRollback({
  request,
  actorUserId,
  session,
  deferredCreditEvents,
}) {
  if (!request?._id || !request?.shippingPackageId) return;

  const shippingPackageId = request.shippingPackageId;
  const businessAnchorId =
    request.businessAnchorId || request.requestor?.businessAnchorId;
  if (!businessAnchorId) return;

  const updatedPackage = await ShippingPackage.findOneAndUpdate(
    { _id: shippingPackageId },
    {
      $pull: {
        requestIds: request._id,
      },
    },
    {
      new: true,
      session,
      projection: { _id: 1, requestIds: 1 },
    },
  ).lean();

  if (
    updatedPackage?._id &&
    (!Array.isArray(updatedPackage.requestIds) ||
      !updatedPackage.requestIds.length)
  ) {
    await ShippingPackage.deleteOne({ _id: updatedPackage._id }).session(
      session || null,
    );
  }

  request.shippingPackageId = null;

  const rollbackResult = await deleteShippingSpendAtomicOnRollback({
    businessAnchorId,
    shippingPackageId,
    session,
  });

  if (!rollbackResult?.didRollback) {
    if (rollbackResult?.reason && rollbackResult.reason !== "no_spend") {
      const err = new Error(
        `shipping rollback-delete failed: ${String(rollbackResult.reason)}`,
      );
      err.statusCode = 409;
      throw err;
    }
    return;
  }

  await emitOrQueueCreditBalanceUpdate({
    deferredCreditEvents,
    businessAnchorId,
    balanceDelta: Number(rollbackResult.rollbackAmount || 0),
    reason: "shipping_fee_spend_rollback_delete",
    refId: shippingPackageId,
  });
}

export async function hasRequestShippingOrCompletionHistory({
  request,
  session,
}) {
  if (!request) return false;

  const workflowCode = String(request?.shippingWorkflow?.code || "")
    .trim()
    .toLowerCase();
  const hasWorkflowHistory =
    workflowCode === "picked_up" ||
    workflowCode === "completed" ||
    Boolean(
      request?.shippingWorkflow?.pickedUpAt ||
      request?.shippingWorkflow?.completedAt,
    );

  const hasCompletionHistory = Boolean(request?.timeline?.actualCompletion);
  if (hasWorkflowHistory || hasCompletionHistory) {
    return true;
  }

  if (!request?.deliveryInfoRef) {
    return false;
  }

  const deliveryInfo = await DeliveryInfo.findById(request.deliveryInfoRef)
    .select({
      trackingNumber: 1,
      shippedAt: 1,
      pickedUpAt: 1,
      deliveredAt: 1,
      "events.0": 1,
    })
    .session(session || null)
    .lean()
    .catch(() => null);

  if (!deliveryInfo) {
    return false;
  }

  const hasTrackingNumber = Boolean(
    String(deliveryInfo?.trackingNumber || "").trim(),
  );
  const hasDeliveryTimestamps = Boolean(
    deliveryInfo?.shippedAt ||
    deliveryInfo?.pickedUpAt ||
    deliveryInfo?.deliveredAt,
  );
  const hasTrackingEvents =
    Array.isArray(deliveryInfo?.events) && deliveryInfo.events.length > 0;

  return hasTrackingNumber || hasDeliveryTimestamps || hasTrackingEvents;
}

export async function ensureDeliveryInfoShippedAtNow({ request, session }) {
  if (!request) return;

  const existingRef = request.deliveryInfoRef;
  const now = new Date();

  if (existingRef) {
    const di = await DeliveryInfo.findById(existingRef)
      .session(session || null)
      .catch(() => null);
    if (di && !di.shippedAt) {
      di.shippedAt = now;
      await di.save({ session });
    }
    return;
  }

  const created = await DeliveryInfo.create(
    [
      {
        request: request._id,
        shippedAt: now,
      },
    ],
    { session },
  ).catch(() => null);

  const doc = Array.isArray(created) ? created[0] : null;
  if (doc?._id) {
    request.deliveryInfoRef = doc._id;
  }
}

// LEGACY_REMOVED: 역할별 개별 수익 원장 기록 로직
// 기록 로직은 단일 SSOT General Ledger로 통합되었다.

export function withBridgeHeaders(extra = {}) {
  const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET;
  const base = {};
  if (BRIDGE_SHARED_SECRET) {
    base["X-Bridge-Secret"] = BRIDGE_SHARED_SECRET;
  }
  return { ...base, ...extra };
}

export function withEspritHeaders(extra = {}) {
  const ESPRIT_SHARED_SECRET = process.env.ESPRIT_SHARED_SECRET;
  const base = {};
  if (ESPRIT_SHARED_SECRET) {
    base["X-Esprit-Secret"] = ESPRIT_SHARED_SECRET;
  }
  return { ...base, ...extra };
}
