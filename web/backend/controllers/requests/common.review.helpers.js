// related files:
// - web/backend/rules.md
// - web/backend/models/businessCreditBalance.model.js
// - web/backend/services/creditBalance.service.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/common.requests.controller.js
import { Types } from "mongoose";
import CreditLedger from "../../models/creditLedger.model.js";
import SalesmanLedger from "../../models/salesmanLedger.model.js";
import ManufacturerCreditLedger from "../../models/manufacturerCreditLedger.model.js";
import AdminCreditLedger from "../../models/adminCreditLedger.model.js";
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
  refundRequestCreditAtomic,
  refundShippingCreditAtomic,
} from "../../services/creditBalance.service.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";

const SHIPPING_FEE_SUPPLY = 3500;

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

  await emitCreditBalanceUpdatedToBusiness({
    businessAnchorId,
    balanceDelta: -spentAmount,
    reason: "machining_spend",
    refId: request._id,
  });

  // 수수료는 유료 결제분(fromPaid)에 대해서만 분배한다.
  if (fromPaid > 0) {
    await distributeCommissionOnRequestSpend({
      request,
      spendAmount: fromPaid,
      businessAnchorId,
      actorUserId,
      session,
    });
  }
}

export async function ensureRequestCreditRefundOnRollbackToCam({
  request,
  businessAnchorId,
  actorUserId,
  session,
}) {
  if (!request?._id || !businessAnchorId) return;

  const refundResult = await refundRequestCreditAtomic({
    request,
    businessAnchorId,
    actorUserId,
    session,
  });

  if (!refundResult?.didRefund) return;

  await emitCreditBalanceUpdatedToBusiness({
    businessAnchorId,
    balanceDelta: Number(refundResult.refundAmount || 0),
    reason: "machining_refund",
    refId: request?._id,
  });
}

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

  const sameMailboxSpend = await CreditLedger.findOne({
    businessAnchorId,
    type: "SPEND",
    refType: "SHIPPING_PACKAGE",
    createdAt: {
      $gte: new Date(Date.now() - 5 * 60 * 1000),
    },
  })
    .select({ _id: 1, refId: 1, createdAt: 1 })
    .session(session || null)
    .lean();

  if (
    sameMailboxSpend?._id &&
    String(sameMailboxSpend.refId) !== String(pkg._id)
  ) {
    console.log(
      `[SHIPPING_FEE] Warning: Different package ${sameMailboxSpend.refId} charged recently for same business`,
    );
  }

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

  await emitCreditBalanceUpdatedToBusiness({
    businessAnchorId,
    balanceDelta: -Number(spendResult.amount || SHIPPING_FEE_SUPPLY),
    reason: "shipping_fee_spend",
    refId: pkg._id,
  });
}

export async function ensureShippingFeeRefundOnShippingRollback({
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

  const cycle = Number(request?.caseInfos?.rollbackCounts?.shipping || 0);
  const refundResult = await refundShippingCreditAtomic({
    businessAnchorId,
    shippingPackageId,
    actorUserId,
    cycle,
    session,
  });

  if (!refundResult?.didRefund) return;

  await emitCreditBalanceUpdatedToBusiness({
    businessAnchorId,
    balanceDelta: Number(refundResult.refundAmount || 0),
    reason: "shipping_fee_refund",
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

export async function distributeCommissionOnRequestSpend({
  request,
  spendAmount,
  businessAnchorId,
  actorUserId,
  session,
}) {
  if (!request?._id || !businessAnchorId || spendAmount <= 0) return;

  const VAT_RATE = 0.1;
  const WITH_SALESMAN_DEFAULT_RATES = {
    manufacturerRate: 0.6,
    devopsRate: 0.1,
    salesmanRate: 0.1,
    adminRate: 0.2,
  };
  const WITHOUT_SALESMAN_RATES = {
    manufacturerRate: 0.65,
    devopsRate: 0.1,
    salesmanRate: 0,
    adminRate: 0.25,
  };

  const withVat = (amount) => Math.round(Number(amount || 0) * (1 + VAT_RATE));

  try {
    const requestorAnchor = await BusinessAnchor.findById(businessAnchorId)
      .select({ referredByAnchorId: 1, businessType: 1 })
      .session(session || null)
      .lean();

    if (!requestorAnchor || requestorAnchor.businessType !== "requestor") {
      return;
    }

    const referrerInfo = requestorAnchor.referredByAnchorId
      ? await BusinessAnchor.findById(requestorAnchor.referredByAnchorId)
          .select({ businessType: 1, primaryContactUserId: 1 })
          .session(session || null)
          .lean()
      : null;

    const hasSalesmanReferrer = referrerInfo?.businessType === "salesman";

    const defaultDevopsAnchor = await BusinessAnchor.findOne({
      businessType: "devops",
      status: { $ne: "merged" },
    })
      .select({ _id: 1, primaryContactUserId: 1, payoutRates: 1, createdAt: 1 })
      .sort({ createdAt: 1, _id: 1 })
      .session(session || null)
      .lean();

    let devopsRecipientUserId =
      defaultDevopsAnchor?.primaryContactUserId || null;
    if (!devopsRecipientUserId && defaultDevopsAnchor?._id) {
      const defaultDevopsUser = await User.findOne({
        role: "devops",
        active: true,
        businessAnchorId: defaultDevopsAnchor._id,
      })
        .select({ _id: 1 })
        .session(session || null)
        .lean();
      devopsRecipientUserId = defaultDevopsUser?._id || null;
    }

    const configuredRates = {
      manufacturerRate: Number(
        defaultDevopsAnchor?.payoutRates?.manufacturerRate ??
          WITH_SALESMAN_DEFAULT_RATES.manufacturerRate,
      ),
      devopsRate: Number(
        defaultDevopsAnchor?.payoutRates?.devopsRate ??
          WITH_SALESMAN_DEFAULT_RATES.devopsRate,
      ),
      salesmanRate: Number(
        defaultDevopsAnchor?.payoutRates?.salesmanRate ??
          WITH_SALESMAN_DEFAULT_RATES.salesmanRate,
      ),
      adminRate: Number(
        defaultDevopsAnchor?.payoutRates?.adminRate ??
          WITH_SALESMAN_DEFAULT_RATES.adminRate,
      ),
    };

    const effectiveRates = hasSalesmanReferrer
      ? configuredRates
      : WITHOUT_SALESMAN_RATES;

    const manufacturerBaseAmount = Math.round(
      spendAmount * Number(effectiveRates.manufacturerRate || 0),
    );
    const devopsBaseAmount = Math.round(
      spendAmount * Number(effectiveRates.devopsRate || 0),
    );
    const salesmanBaseAmount = hasSalesmanReferrer
      ? Math.round(spendAmount * Number(effectiveRates.salesmanRate || 0))
      : 0;
    const adminBaseAmount = Math.max(
      spendAmount -
        manufacturerBaseAmount -
        devopsBaseAmount -
        salesmanBaseAmount,
      0,
    );

    const manufacturerPayoutAmount = withVat(manufacturerBaseAmount);
    const devopsPayoutAmount = withVat(devopsBaseAmount);
    const salesmanPayoutAmount = withVat(salesmanBaseAmount);
    const adminPayoutAmount = withVat(adminBaseAmount);

    const manufacturerVatAmount =
      manufacturerPayoutAmount - manufacturerBaseAmount;
    const devopsVatAmount = devopsPayoutAmount - devopsBaseAmount;
    const salesmanVatAmount = salesmanPayoutAmount - salesmanBaseAmount;
    const adminVatAmount = adminPayoutAmount - adminBaseAmount;

    const caManufacturerRaw = request?.caManufacturer
      ? String(request.caManufacturer)
      : "";
    const caManufacturerId = Types.ObjectId.isValid(caManufacturerRaw)
      ? new Types.ObjectId(caManufacturerRaw)
      : null;

    if (caManufacturerId) {
      const manufacturerUser = await User.findById(caManufacturerId)
        .select({ _id: 1, business: 1, name: 1 })
        .session(session || null)
        .lean();

      if (manufacturerUser && manufacturerPayoutAmount > 0) {
        const manufacturerUniqueKey = `request:${String(request._id)}:manufacturer_commission`;
        await ManufacturerCreditLedger.updateOne(
          { uniqueKey: manufacturerUniqueKey },
          {
            $setOnInsert: {
              manufacturerOrganization: String(
                manufacturerUser.business || manufacturerUser.name || "",
              ).trim(),
              manufacturerId: manufacturerUser._id,
              type: "EARN",
              amount: manufacturerPayoutAmount,
              amountExcludingVat: manufacturerBaseAmount,
              vatAmount: manufacturerVatAmount,
              amountIncludingVat: manufacturerPayoutAmount,
              refType: "REQUEST",
              refId: request._id,
              uniqueKey: manufacturerUniqueKey,
              occurredAt: new Date(),
            },
          },
          { upsert: true, session },
        );
      }
    }

    if (devopsRecipientUserId && devopsPayoutAmount > 0) {
      const devopsUniqueKey = `request:${String(request._id)}:devops_commission`;
      await SalesmanLedger.updateOne(
        { uniqueKey: devopsUniqueKey },
        {
          $setOnInsert: {
            salesmanId: devopsRecipientUserId,
            type: "EARN",
            amount: devopsPayoutAmount,
            amountExcludingVat: devopsBaseAmount,
            vatAmount: devopsVatAmount,
            amountIncludingVat: devopsPayoutAmount,
            refType: "REQUEST",
            refId: request._id,
            uniqueKey: devopsUniqueKey,
          },
        },
        { upsert: true, session },
      );
    }

    if (
      hasSalesmanReferrer &&
      referrerInfo?.primaryContactUserId &&
      salesmanPayoutAmount > 0
    ) {
      const salesmanUniqueKey = `request:${String(request._id)}:salesman_commission`;
      await SalesmanLedger.updateOne(
        { uniqueKey: salesmanUniqueKey },
        {
          $setOnInsert: {
            salesmanId: referrerInfo.primaryContactUserId,
            type: "EARN",
            amount: salesmanPayoutAmount,
            amountExcludingVat: salesmanBaseAmount,
            vatAmount: salesmanVatAmount,
            amountIncludingVat: salesmanPayoutAmount,
            refType: "REQUEST",
            refId: request._id,
            uniqueKey: salesmanUniqueKey,
          },
        },
        { upsert: true, session },
      );
    }

    if (adminPayoutAmount > 0) {
      const adminUser = await User.findOne({ role: "admin", active: true })
        .select({ _id: 1 })
        .session(session || null)
        .lean();
      if (adminUser?._id) {
        const adminUniqueKey = `request:${String(request._id)}:admin_commission`;
        await AdminCreditLedger.updateOne(
          { uniqueKey: adminUniqueKey },
          {
            $setOnInsert: {
              adminUserId: adminUser._id,
              type: "EARN",
              amount: adminPayoutAmount,
              amountExcludingVat: adminBaseAmount,
              vatAmount: adminVatAmount,
              amountIncludingVat: adminPayoutAmount,
              refType: "REQUEST",
              refId: request._id,
              uniqueKey: adminUniqueKey,
              occurredAt: new Date(),
            },
          },
          { upsert: true, session },
        );
      }
    }

    console.log("[COMMISSION] commission distribution summary", {
      requestId: request?.requestId,
      spendAmount,
      hasSalesmanReferrer,
      base: {
        manufacturer: manufacturerBaseAmount,
        devops: devopsBaseAmount,
        salesman: salesmanBaseAmount,
        admin: adminBaseAmount,
      },
      payoutWithVat: {
        manufacturer: manufacturerPayoutAmount,
        devops: devopsPayoutAmount,
        salesman: salesmanPayoutAmount,
        admin: adminPayoutAmount,
      },
    });
  } catch (error) {
    console.error("[COMMISSION] distribute commission error:", error);
  }
}

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
