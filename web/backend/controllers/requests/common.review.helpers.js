// related files:
// - web/backend/rules.md
// - web/backend/services/creditBalance.service.js
// - web/backend/services/creditRevenuePolicy.service.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/common.requests.controller.js
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
  resolveConfiguredRevenueRates,
  resolveRevenueOwnerBaseAllocation,
  splitRevenueByCreditKindProRata,
} from "../../services/creditRevenuePolicy.service.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";
import { ensureMailboxAddressForBusiness } from "./mailbox.utils.js";

const SHIPPING_FEE_SUPPLY = 3500;

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
    .select({ _id: 1, businessType: 1, referredByAnchorId: 1 })
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
  freeAccountCode,
  refType,
  refId,
  stageFrom,
  stageTo,
  session,
}) {
  const spendAmount = Math.max(0, Math.round(Number(amount || 0)));
  if (spendAmount <= 0) return { posted: false, reason: "zero_amount" };

  const paidAmount = Math.max(0, Math.round(Number(fromPaid || 0)));
  const freeAmount = Math.max(0, Math.round(Number(fromFree || 0)));
  if (paidAmount <= 0 && freeAmount <= 0) {
    return { posted: false, reason: "zero_split" };
  }

  const owners = await resolveRoleOwnerAnchors({ request, businessAnchorId, session });
  if (!owners.requestorAnchorId) {
    return { posted: false, reason: "requestor_anchor_not_found" };
  }

  const lines = [];

  if (freeAmount > 0) {
    lines.push({
      accountCode: freeAccountCode,
      ownerRole: "requestor",
      ownerId: owners.requestorAnchorId,
      amount: -freeAmount,
      creditKind:
        freeAccountCode === "REQ_FREE_SHIPPING_CREDIT"
          ? "FREE_SHIPPING"
          : "FREE_REQUEST",
      refType,
      refId,
      meta: { spendUniqueKey },
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
      meta: { spendUniqueKey },
    });
  }

  const freeCreditKind =
    freeAccountCode === "REQ_FREE_SHIPPING_CREDIT" ? "FREE_SHIPPING" : "FREE_REQUEST";
  const revenueBaseByOwner = resolveRevenueOwnerBaseAllocation({
    spendAmount,
    hasSalesmanReferrer: owners.hasSalesmanReferrer,
    configuredRates: owners.configuredRates,
    owners,
    isShippingSpend: isShippingSpendRevenueContext({ refType, freeAccountCode }),
  });

  const assignManufacturer = revenueBaseByOwner.manufacturer;
  const assignDevops = revenueBaseByOwner.devops;
  const assignSalesman = revenueBaseByOwner.salesman;
  const adminBase = revenueBaseByOwner.admin;

  const revenueKindSplit = splitRevenueByCreditKindProRata({
    ownerBaseByRole: {
      manufacturer: assignManufacturer,
      devops: assignDevops,
      salesman: assignSalesman,
      admin: adminBase,
    },
    freeAmount,
  });

  const pushRevenueLinesBySplit = ({ accountCode, ownerRole, ownerId, paidBase, freeBase }) => {
    if (!ownerId) return;

    const paid = Math.max(0, Math.round(Number(paidBase || 0)));
    const free = Math.max(0, Math.round(Number(freeBase || 0)));

    // 면세: 수익 라인은 공급가 그대로 기록 (VAT 가산 없음)
    if (free > 0) {
      lines.push({
        accountCode,
        ownerRole,
        ownerId,
        amount: free,
        amountExcludingVat: free,
        vatAmount: 0,
        amountIncludingVat: free,
        creditKind: freeCreditKind,
        refType,
        refId,
        meta: { spendUniqueKey },
      });
    }

    if (paid > 0) {
      lines.push({
        accountCode,
        ownerRole,
        ownerId,
        amount: paid,
        amountExcludingVat: paid,
        vatAmount: 0,
        amountIncludingVat: paid,
        creditKind: "PAID",
        refType,
        refId,
        meta: { spendUniqueKey },
      });
    }
  };

  pushRevenueLinesBySplit({
    accountCode: "REV_MANUFACTURER",
    ownerRole: "manufacturer",
    ownerId: owners.manufacturerAnchorId,
    paidBase: revenueKindSplit.manufacturer.paid,
    freeBase: revenueKindSplit.manufacturer.free,
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

  // 포장.발송 → 세척.패킹 롤백 시 우편함/패킹 승인 상태를 비운다.
  // - mailbox를 남기면 타 업체 재승인 시 동일 박스 혼입·ShippingPackage 유니크 충돌이 난다.
  // - packing review를 APPROVED로 두면 단계는 세척.패킹인데 승인만 남은 불일치 상태가 된다.
  if (String(stage || "").trim() === "shipping") {
    request.mailboxAddress = null;
    request.caseInfos = request.caseInfos || {};
    request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};
    request.caseInfos.reviewByStage.packing = {
      status: "PENDING",
      updatedAt: new Date(),
      updatedBy: null,
      reason: "",
    };
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

  const computedPrice = await computePriceForRequest({
    requestorId: request?.requestor,
    requestorOrgId: businessAnchorId,
    clinicName: request?.caseInfos?.clinicName || "",
    patientName: request?.caseInfos?.patientName || "",
    tooth: request?.caseInfos?.tooth || "",
    currentRequestId: request?._id,
  });

  const shippingMode = resolveEffectiveShippingMode(request);

  let expressFeeUnit = 0;
  let designFeePerTooth = 15000;
  try {
    const { loadCreditSettingsDefaults } =
      await import("../../utils/creditSettingsDefaults.js");
    const creditSettings = await loadCreditSettingsDefaults();
    if (shippingMode === "express") {
      expressFeeUnit = Math.max(
        0,
        Number(creditSettings?.expressFee ?? 1000) || 0,
      );
    }
    designFeePerTooth = Math.max(
      0,
      Number(creditSettings?.designFee ?? 15000) || 15000,
    );
  } catch {
    if (shippingMode === "express") expressFeeUnit = 1000;
    designFeePerTooth = 15000;
  }

  const caseInfos = request?.caseInfos || {};
  const abutmentQty = countDesignAbutmentQty(caseInfos);
  const productMode = String(caseInfos?.productMode || "").trim();
  const expressQty =
    productMode === "design_custom_abutment" ? Math.max(0, abutmentQty) : 1;
  const expressFee = expressFeeUnit * expressQty;

  const machiningAmount = resolveMachiningSpendAmount({
    price: computedPrice,
    caseInfos,
    designFeePerTooth,
  });
  const withDesign = resolveQuotedPriceWithDesignFee({
    price: computedPrice,
    productMode: caseInfos?.productMode,
    toothCount: abutmentQty,
    designFeePerTooth,
  });

  request.price = {
    ...toPlainRequestPrice(request.price),
    ...resolveQuotedPriceWithExpressFee({
      price: withDesign,
      shippingMode,
      expressFee: expressFeeUnit,
      expressQty,
    }),
  };

  const spendResult = await spendRequestCreditAtomic({
    request,
    businessAnchorId,
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
      businessAnchorId: String(businessAnchorId),
    });

    const glPostResult = await postSpendCommitGeneralLedger({
      eventType: "REQUEST_SPEND_COMMIT",
      spendUniqueKey: spendResult.uniqueKey,
      request,
      businessAnchorId,
      actorUserId,
      amount: Number(spendResult.resolvedAmount || 0),
      fromPaid: Number(spendResult.fromPaid || 0),
      fromFree: Number(spendResult.fromBonusRequest || 0),
      freeAccountCode: "REQ_FREE_REQUEST_CREDIT",
      refType: "REQUEST",
      refId: request._id,
      stageFrom: "CAM",
      stageTo: "가공",
      session,
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
            $in: ["REQ_PAID_CREDIT", "REQ_FREE_REQUEST_CREDIT"],
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

  const expressSpendResult = await spendRequestCreditAtomic({
    request,
    businessAnchorId,
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
    businessAnchorId,
    actorUserId,
    amount: Number(expressSpendResult.resolvedAmount || 0),
    fromPaid: Number(expressSpendResult.fromPaid || 0),
    fromFree: Number(expressSpendResult.fromBonusRequest || 0),
    freeAccountCode: "REQ_FREE_REQUEST_CREDIT",
    refType: "REQUEST",
    refId: request._id,
    stageFrom: "CAM",
    stageTo: "가공",
    session,
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

// 타이밍 SSOT: 가공 단계 롤백(CAM 복귀)에서만 호출되어야 한다.
export async function ensureRequestCreditRollbackDeleteOnRollbackToCam({
  request,
  businessAnchorId,
  actorUserId,
  session,
  deferredCreditEvents,
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

    // 일반 의뢰에서 no_spend가 나왔더라도, 실제 소비 라인이 이미 없다면
    // (이전 시도에서 저널 삭제 완료된 경우 등) idempotent success로 허용한다.
    if (rollbackResult?.reason === "no_spend") {
      const requestorSpendLineExists = await LedgerLine.exists({
        ownerRole: "requestor",
        ownerId: businessAnchorId,
        refType: "REQUEST",
        refId: request._id,
        accountCode: { $in: ["REQ_PAID_CREDIT", "REQ_FREE_REQUEST_CREDIT"] },
        amount: { $lt: 0 },
      }).session(session || null);

      if (!requestorSpendLineExists) {
        console.log("[CREDIT_ROLLBACK][REQUEST] no_spend but no requestor spend lines; treat as idempotent", {
          requestMongoId: String(request._id),
          requestId: request?.requestId || null,
          businessAnchorId: String(businessAnchorId),
        });
        return;
      }

      console.warn("[CREDIT_ROLLBACK][REQUEST] no_spend but requestor spend lines still exist", {
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

// 타이밍 SSOT: 세척.패킹 승인으로 포장.발송 진입할 때만 호출되어야 한다.
export async function ensureShippingFeeSpendOnPackingApprove({
  request,
  businessAnchorId,
  actorUserId,
  session,
  deferredCreditEvents,
}) {
  if (!request?._id || !businessAnchorId) return;

  const mailboxAddress = String(request?.mailboxAddress || "").trim();
  if (!mailboxAddress) {
    const err = new Error(
      "우편함 정보가 없어 포장.발송 단계로 이동할 수 없습니다.",
    );
    err.statusCode = 400;
    throw err;
  }

  const shipDateYmd = getTodayYmdInKst();
  let pkg = null;
  let retryCount = 0;
  const maxRetries = 3;

  // 다른 발송 대기 의뢰가 점유한 패키지만 재사용한다(자기 과거 패키지는 제외).
  const pendingPackageCarrier = await Request.findOne(
    {
      businessAnchorId,
      manufacturerStage: { $in: ["세척.패킹", "포장.발송"] },
      shippingPackageId: { $ne: null },
      requestCategory: "order",
      _id: { $ne: request._id },
    },
    { shippingPackageId: 1, mailboxAddress: 1 },
    { session },
  )
    .sort({ createdAt: 1 })
    .lean();

  const pendingPackageId = String(
    pendingPackageCarrier?.shippingPackageId || "",
  ).trim();

  if (pendingPackageId) {
    await ShippingPackage.updateOne(
      { _id: pendingPackageId },
      { $addToSet: { requestIds: request._id } },
      { session },
    );
    pkg = await ShippingPackage.findById(pendingPackageId, null, {
      session,
    });

    const canonicalMailbox = String(
      pkg?.mailboxAddress || pendingPackageCarrier?.mailboxAddress || "",
    ).trim();
    if (canonicalMailbox && canonicalMailbox !== mailboxAddress) {
      request.mailboxAddress = canonicalMailbox;
    }
  }

  // 다른 활성 패키지가 없으면 자기 과거 패키지를 현재 mailbox로 동기화해 재사용한다.
  if (!pkg?._id) {
    const selfPackageId = String(request?.shippingPackageId || "").trim();
    if (selfPackageId) {
      await ShippingPackage.updateOne(
        { _id: selfPackageId },
        {
          $set: { mailboxAddress },
          $addToSet: { requestIds: request._id },
        },
        { session },
      );
      pkg = await ShippingPackage.findById(selfPackageId, null, { session });
    }
  }

  // 트랜잭션 안에서는 upsert 11000이 트랜잭션 전체를 abort 시킨다.
  // 레거시 unique(businessId+shipDate+mailbox)는 businessId가 비어 있으면
  // 서로 다른 businessAnchor도 같은 우편함/일자에서 충돌한다.
  // → find 후 insert로 바꾸고, 타 업체 박스가 같은 우편함을 쓰면 새 우편함으로 재할당한다.
  if (!pkg?._id) {
    const currentMailbox = String(request?.mailboxAddress || mailboxAddress || "").trim();
    let resolvedMailbox = currentMailbox;

    const foreignPackage = await ShippingPackage.findOne(
      {
        shipDateYmd,
        mailboxAddress: resolvedMailbox,
        businessAnchorId: { $ne: businessAnchorId },
      },
      { _id: 1, businessAnchorId: 1, mailboxAddress: 1 },
      { session },
    ).lean();

    if (foreignPackage?._id) {
      console.warn("[SHIPPING_FEE] mailbox already used by another business today; reallocating", {
        requestId: request?.requestId || null,
        mailboxAddress: resolvedMailbox,
        foreignBusinessAnchorId: String(foreignPackage.businessAnchorId || ""),
      });
      try {
        const nextMailboxAddress = await ensureMailboxAddressForBusiness({
          requestMongoId: request._id,
          requestorOrgId: businessAnchorId,
          currentMailboxAddress: null,
          session,
        });
        if (nextMailboxAddress && nextMailboxAddress !== resolvedMailbox) {
          resolvedMailbox = String(nextMailboxAddress).trim();
          request.mailboxAddress = resolvedMailbox;
        }
      } catch (reallocErr) {
        console.error("[SHIPPING_FEE] mailbox reallocation failed", reallocErr);
      }
    }

    pkg = await ShippingPackage.findOne(
      { businessAnchorId, shipDateYmd, mailboxAddress: resolvedMailbox },
      null,
      { session },
    );

    if (pkg?._id) {
      await ShippingPackage.updateOne(
        { _id: pkg._id },
        { $addToSet: { requestIds: request._id } },
        { session },
      );
      pkg = await ShippingPackage.findById(pkg._id, null, { session });
    } else {
      while (!pkg?._id && retryCount < maxRetries) {
        try {
          const created = await ShippingPackage.create(
            [
              {
                businessAnchorId,
                shipDateYmd,
                mailboxAddress: resolvedMailbox,
                shippingFeeSupply: SHIPPING_FEE_SUPPLY,
                shippingFeeVat: 0,
                createdBy: actorUserId || null,
                requestIds: [request._id],
              },
            ],
            { session },
          );
          pkg = created?.[0] || null;
          break;
        } catch (err) {
          if (err.code === 11000 && retryCount < maxRetries - 1) {
            // 트랜잭션이 abort됐을 수 있으므로 호출부 withTransaction 재시도에 맡긴다.
            console.log(
              `[SHIPPING_FEE] Duplicate package detected, retrying... (attempt ${retryCount + 1})`,
            );
            retryCount++;
            pkg = await ShippingPackage.findOne(
              { businessAnchorId, shipDateYmd, mailboxAddress: resolvedMailbox },
              null,
              { session },
            );
            if (pkg?._id) {
              await ShippingPackage.updateOne(
                { _id: pkg._id },
                { $addToSet: { requestIds: request._id } },
                { session },
              );
              pkg = await ShippingPackage.findById(pkg._id, null, { session });
              break;
            }
            // 같은 우편함에서 레거시 인덱스 충돌이면 새 우편함으로 한 번 더 시도
            try {
              const nextMailboxAddress = await ensureMailboxAddressForBusiness({
                requestMongoId: request._id,
                requestorOrgId: businessAnchorId,
                currentMailboxAddress: null,
                session,
              });
              if (nextMailboxAddress && nextMailboxAddress !== resolvedMailbox) {
                resolvedMailbox = String(nextMailboxAddress).trim();
                request.mailboxAddress = resolvedMailbox;
              }
            } catch {
              // ignore and throw original below if still failing
            }
            continue;
          }
          throw err;
        }
      }
    }
  }

  if (!pkg?._id) {
    throw new Error("발송 박스 생성에 실패했습니다.");
  }

  request.shippingPackageId = pkg._id;

  const requestCategory = String(request?.requestCategory || "").trim();
  const isSampleRequest =
    requestCategory === "rnd_sample" || requestCategory === "copied_sample";
  if (isSampleRequest) {
    // SSOT 정책: 샘플(rnd/copied)은 무자료/무상 처리(배송 크레딧 차감/정산 기록 없음)
    return;
  }

  // LEGACY_REMOVED: 과거 분리 원장 기반 중복 경고 체크 제거
  // - 실제 중복 방지는 spendShippingCreditAtomic의 uniqueKey/idempotency로 보장
  // - 장부 SSOT는 General Ledger로 통합되며 레거시 원장 조회에 의존하지 않음

  const spendResult = await spendShippingCreditAtomic({
    businessAnchorId,
    shippingPackageId: pkg._id,
    actorUserId,
    fee: SHIPPING_FEE_SUPPLY,
    session,
  });

  if (!spendResult?.didSpend) {
    if (spendResult?.reason === "already_spent") {
      console.log("[SHIPPING_FEE] skip duplicate shipping fee upsert", {
        requestId: request?.requestId,
        shippingPackageId: String(pkg._id),
        uniqueKey: spendResult?.uniqueKey || null,
      });
    }
    return;
  }

  console.log("[SHIPPING_FEE] shipping fee spend inserted", {
    requestId: request?.requestId,
    shippingPackageId: String(pkg._id),
    amount: Number(spendResult.amount || SHIPPING_FEE_SUPPLY),
    fromBonusShipping: Number(spendResult.fromBonusShipping || 0),
    fromPaid: Number(spendResult.fromPaid || 0),
    businessAnchorId: String(businessAnchorId),
  });

  const glPostResult = await postSpendCommitGeneralLedger({
    eventType: "SHIPPING_SPEND_COMMIT",
    spendUniqueKey: spendResult.uniqueKey,
    request,
    businessAnchorId,
    actorUserId,
    amount: Number(spendResult.amount || 0),
    fromPaid: Number(spendResult.fromPaid || 0),
    fromFree: Number(spendResult.fromBonusShipping || 0),
    freeAccountCode: "REQ_FREE_SHIPPING_CREDIT",
    refType: "SHIPPING_PACKAGE",
    refId: pkg._id,
    stageFrom: "세척.패킹",
    stageTo: "포장.발송",
    session,
  });

  if (!glPostResult?.posted) {
    if (glPostResult?.idempotent) {
      // GL 직집계 모드에서는 선차감 스냅샷이 없으므로 보정 복원은 필요 없다.
      console.log("[SHIPPING_FEE] duplicate shipping spend detected (no compensation needed)", {
        requestId: request?.requestId,
        shippingPackageId: String(pkg._id),
        uniqueKey: spendResult.uniqueKey,
      });
      return;
    }
    throw new Error("SHIPPING_SPEND_COMMIT ledger posting failed");
  }

  await emitOrQueueCreditBalanceUpdate({
    deferredCreditEvents,
    businessAnchorId,
    balanceDelta: -Number(spendResult.amount || SHIPPING_FEE_SUPPLY),
    reason: "shipping_fee_spend",
    refId: pkg._id,
  });
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
