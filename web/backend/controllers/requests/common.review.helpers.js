// related files:
// - web/backend/rules.md
// - web/backend/models/businessCreditBalance.model.js
// - web/backend/services/creditBalance.service.js
// - web/backend/services/creditRevenuePolicy.service.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/common.requests.controller.js
import { Types } from "mongoose";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import Request from "../../models/request.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import {
  applyStatusMapping,
  computePriceForRequest,
  getTodayYmdInKst,
} from "./utils.js";
import {
  spendRequestCreditAtomic,
  spendShippingCreditAtomic,
  deleteRequestSpendAtomicOnRollback,
  deleteShippingSpendAtomicOnRollback,
  restoreRequestSpendDeductionAtomic,
  restoreShippingSpendDeductionAtomic,
} from "../../services/creditBalance.service.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";
import {
  isShippingSpendRevenueContext,
  resolveConfiguredRevenueRates,
  resolveRevenueOwnerBaseAllocation,
  splitRevenueByCreditKindProRata,
} from "../../services/creditRevenuePolicy.service.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";

const SHIPPING_FEE_SUPPLY = 3500;
const VAT_RATE = 0.1;

function withVat(amount) {
  return Math.round(Number(amount || 0) * (1 + VAT_RATE));
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

    if (free > 0) {
      const amountIncludingVat = withVat(free);
      lines.push({
        accountCode,
        ownerRole,
        ownerId,
        amount: amountIncludingVat,
        amountExcludingVat: free,
        vatAmount: amountIncludingVat - free,
        amountIncludingVat,
        creditKind: freeCreditKind,
        refType,
        refId,
        meta: { spendUniqueKey },
      });
    }

    if (paid > 0) {
      const amountIncludingVat = withVat(paid);
      lines.push({
        accountCode,
        ownerRole,
        ownerId,
        amount: amountIncludingVat,
        amountExcludingVat: paid,
        vatAmount: amountIncludingVat - paid,
        amountIncludingVat,
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
    machining: "CAM",
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
}

export function updateCurrentEstimatedShipYmdOnPackingEnter(request) {
  if (!request) return;

  request.timeline = request.timeline || {};
  const timeline = request.timeline;
  const originalEstimatedShipYmd =
    typeof timeline.originalEstimatedShipYmd === "string" &&
    timeline.originalEstimatedShipYmd.trim()
      ? timeline.originalEstimatedShipYmd.trim()
      : typeof timeline.estimatedShipYmd === "string" &&
          timeline.estimatedShipYmd.trim()
        ? timeline.estimatedShipYmd.trim()
        : getTodayYmdInKst();

  const nextEstimatedShipYmd =
    typeof timeline.nextEstimatedShipYmd === "string" &&
    timeline.nextEstimatedShipYmd.trim()
      ? timeline.nextEstimatedShipYmd.trim()
      : typeof timeline.estimatedShipYmd === "string" &&
          timeline.estimatedShipYmd.trim()
        ? timeline.estimatedShipYmd.trim()
        : originalEstimatedShipYmd;

  timeline.originalEstimatedShipYmd = originalEstimatedShipYmd;
  timeline.nextEstimatedShipYmd = nextEstimatedShipYmd;
  timeline.estimatedShipYmd = nextEstimatedShipYmd;
}

// 타이밍 SSOT: CAM 승인으로 가공 진입할 때만 호출되어야 한다.
export async function ensureRequestCreditSpendOnMachiningEnter({
  request,
  businessAnchorId,
  actorUserId,
  session,
}) {
  if (!request || !businessAnchorId) return;

  const requestCategory = String(request?.requestCategory || "").trim();
  const isSampleRequest =
    requestCategory === "rnd_sample" || requestCategory === "copied_sample";

  if (isSampleRequest) {
    request.price = {
      ...(request.price || {}),
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

  const resolvedAmount = Number(computedPrice?.amount || 0);
  request.price = {
    ...(request.price || {}),
    ...(computedPrice && typeof computedPrice === "object" ? computedPrice : {}),
    amount: Number.isFinite(resolvedAmount) && resolvedAmount > 0 ? resolvedAmount : 0,
  };

  const spendResult = await spendRequestCreditAtomic({
    request,
    businessAnchorId,
    actorUserId,
    session,
    computedPrice,
  });

  if (!spendResult?.didSpend) {
    if (spendResult?.reason === "already_spent") {
      console.log("[CREDIT_SPEND] skip existing machining spend for request", {
        requestId: request?.requestId,
        requestMongoId: String(request?._id || ""),
        existingUniqueKey: spendResult?.existingUniqueKey || null,
        currentUniqueKey: spendResult?.uniqueKey || null,
      });
    }
    return;
  }

  const spentAmount = Number(spendResult.resolvedAmount || 0);
  const fromPaid = Number(spendResult.fromPaid || 0);

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
      await restoreRequestSpendDeductionAtomic({
        businessAnchorId,
        fromPaid: Number(spendResult.fromPaid || 0),
        fromBonusRequest: Number(spendResult.fromBonusRequest || 0),
        session,
      });
      console.log("[CREDIT_SPEND] compensated duplicate machining spend", {
        requestId: request?.requestId,
        requestMongoId: String(request?._id || ""),
        uniqueKey: spendResult.uniqueKey,
      });
      return;
    }
    throw new Error("REQUEST_SPEND_COMMIT ledger posting failed");
  }

  await emitCreditBalanceUpdatedToBusiness({
    businessAnchorId,
    balanceDelta: -spentAmount,
    reason: "machining_spend",
    refId: request._id,
  });
}

// 타이밍 SSOT: 가공 단계 롤백(CAM 복귀)에서만 호출되어야 한다.
export async function ensureRequestCreditRollbackDeleteOnRollbackToCam({
  request,
  businessAnchorId,
  actorUserId,
  session,
}) {
  if (!request?._id || !businessAnchorId) return;

  const rollbackResult = await deleteRequestSpendAtomicOnRollback({
    request,
    businessAnchorId,
    session,
  });

  if (!rollbackResult?.didRollback) {
    if (rollbackResult?.reason && rollbackResult.reason !== "no_spend") {
      const err = new Error(
        `machining rollback-delete failed: ${String(rollbackResult.reason)}`,
      );
      err.statusCode = 409;
      throw err;
    }
    return;
  }

  await emitCreditBalanceUpdatedToBusiness({
    businessAnchorId,
    balanceDelta: Number(rollbackResult.rollbackAmount || 0),
    reason: "machining_spend_rollback_delete",
    refId: request?._id,
  });
}

// 타이밍 SSOT: 세척.패킹 승인으로 포장.발송 진입할 때만 호출되어야 한다.
export async function ensureShippingFeeSpendOnPackingApprove({
  request,
  businessAnchorId,
  actorUserId,
  session,
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

  while (!pkg?._id && retryCount < maxRetries) {
    try {
      pkg = await ShippingPackage.findOneAndUpdate(
        { businessAnchorId, shipDateYmd, mailboxAddress },
        {
          $setOnInsert: {
            businessAnchorId,
            shipDateYmd,
            mailboxAddress,
            shippingFeeSupply: SHIPPING_FEE_SUPPLY,
            shippingFeeVat: 0,
            createdBy: actorUserId || null,
          },
          $addToSet: {
            requestIds: request._id,
          },
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
          session,
        },
      );
      break;
    } catch (err) {
      if (err.code === 11000 && retryCount < maxRetries - 1) {
        console.log(
          `[SHIPPING_FEE] Duplicate package detected, retrying... (attempt ${retryCount + 1})`,
        );
        retryCount++;
        await new Promise((resolve) => setTimeout(resolve, 50 * retryCount));
        pkg = await ShippingPackage.findOne(
          { businessAnchorId, shipDateYmd, mailboxAddress },
          null,
          { session },
        );
        if (pkg) {
          await ShippingPackage.updateOne(
            { _id: pkg._id },
            { $addToSet: { requestIds: request._id } },
            { session },
          );
          pkg = await ShippingPackage.findById(pkg._id, null, { session });
          break;
        }
      } else {
        throw err;
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
      await restoreShippingSpendDeductionAtomic({
        businessAnchorId,
        fromPaid: Number(spendResult.fromPaid || 0),
        fromBonusShipping: Number(spendResult.fromBonusShipping || 0),
        session,
      });
      console.log("[SHIPPING_FEE] compensated duplicate shipping spend", {
        requestId: request?.requestId,
        shippingPackageId: String(pkg._id),
        uniqueKey: spendResult.uniqueKey,
      });
      return;
    }
    throw new Error("SHIPPING_SPEND_COMMIT ledger posting failed");
  }

  await emitCreditBalanceUpdatedToBusiness({
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

  await emitCreditBalanceUpdatedToBusiness({
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
