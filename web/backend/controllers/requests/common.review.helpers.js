import { Types } from "mongoose";
import CreditLedger from "../../models/creditLedger.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import {
  applyStatusMapping,
  computePriceForRequest,
  getTodayYmdInKst,
} from "./utils.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";

async function getBusinessCreditBalance({ businessAnchorId, session }) {
  if (!businessAnchorId) {
    return {
      balance: 0,
      paidBalance: 0,
      bonusBalance: 0,
      freeShippingCreditBalance: 0,
    };
  }

  const rows = await CreditLedger.find({ businessAnchorId })
    .sort({ createdAt: 1, _id: 1 })
    .select({ type: 1, amount: 1, refType: 1 })
    .session(session || null)
    .lean();

  let paid = 0;
  let bonus = 0;
  let freeShippingCredit = 0;

  for (const row of rows || []) {
    const type = String(row?.type || "");
    const amount = Number(row?.amount || 0);
    const refType = String(row?.refType || "");
    if (!Number.isFinite(amount)) continue;

    const absAmount = Math.abs(amount);
    if (type === "CHARGE") {
      paid += absAmount;
      continue;
    }
    if (type === "BONUS") {
      bonus += absAmount;
      if (refType === "FREE_SHIPPING_CREDIT") {
        freeShippingCredit += absAmount;
      }
      continue;
    }
    if (type === "REFUND") {
      paid += absAmount;
      continue;
    }
    if (type === "ADJUST") {
      paid += amount;
      continue;
    }
    if (type === "SPEND") {
      let spend = absAmount;
      if (refType === "SHIPPING_PACKAGE" || refType === "SHIPPING_FEE") {
        const fromFreeShippingCredit = Math.min(freeShippingCredit, spend);
        freeShippingCredit -= fromFreeShippingCredit;
        spend -= fromFreeShippingCredit;
      }
      const fromBonus = Math.min(bonus, spend);
      bonus -= fromBonus;
      spend -= fromBonus;
      paid -= spend;
    }
  }

  const paidBalance = Math.max(0, Math.round(paid));
  const bonusBalance = Math.max(0, Math.round(bonus));
  const freeShippingCreditBalance = Math.max(0, Math.round(freeShippingCredit));
  return {
    balance: paidBalance + bonusBalance,
    paidBalance,
    bonusBalance,
    freeShippingCreditBalance,
  };
}

// Revert manufacturer stage based on review stage
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
  const todayYmd = getTodayYmdInKst();
  if (!todayYmd) return;

  const originalEstimatedShipYmd =
    typeof timeline.originalEstimatedShipYmd === "string" &&
    timeline.originalEstimatedShipYmd.trim()
      ? timeline.originalEstimatedShipYmd.trim()
      : typeof timeline.estimatedShipYmd === "string" &&
          timeline.estimatedShipYmd.trim()
        ? timeline.estimatedShipYmd.trim()
        : todayYmd;

  timeline.originalEstimatedShipYmd = originalEstimatedShipYmd;
  timeline.estimatedShipYmd = todayYmd;
  timeline.nextEstimatedShipYmd = todayYmd;
}

// Ensure request credit spend on machining enter
export async function ensureRequestCreditSpendOnMachiningEnter({
  request,
  businessAnchorId,
  actorUserId,
  session,
}) {
  if (!request || !businessAnchorId) return;

  const cycle = Number(request?.caseInfos?.rollbackCounts?.cam || 0);
  const uniqueKey = `request:${String(request._id)}:machining_spend:${cycle}`;
  const existingSpend = await CreditLedger.findOne({
    type: "SPEND",
    refType: "REQUEST",
    refId: request._id,
    uniqueKey: {
      $regex: `^request:${String(request._id)}:machining_spend(?::\\d+)?$`,
    },
  })
    .select({ _id: 1, uniqueKey: 1 })
    .session(session || null)
    .lean();
  if (existingSpend?._id) {
    console.log("[CREDIT_SPEND] skip existing machining spend for request", {
      requestId: request?.requestId,
      requestMongoId: String(request?._id || ""),
      existingUniqueKey: existingSpend.uniqueKey,
      currentUniqueKey: uniqueKey,
    });
    return;
  }

  const storedAmount = Number(request?.price?.amount || 0);
  const spendAmount =
    Number.isFinite(storedAmount) && storedAmount >= 0
      ? storedAmount
      : Number.NaN;

  const resolvedAmount = Number.isFinite(spendAmount)
    ? spendAmount
    : Number(
        (
          await computePriceForRequest({
            requestorId: request?.requestor,
            requestorOrgId: businessAnchorId,
            clinicName: request?.caseInfos?.clinicName || "",
            patientName: request?.caseInfos?.patientName || "",
            tooth: request?.caseInfos?.tooth || "",
          })
        )?.amount || 0,
      );

  if (!Number.isFinite(resolvedAmount) || resolvedAmount <= 0) {
    console.log("[CREDIT_SPEND] skip non-positive machining spend", {
      requestId: request?.requestId,
      requestMongoId: String(request?._id || ""),
      resolvedAmount,
    });
    return;
  }

  const { balance } = await getBusinessCreditBalance({
    businessAnchorId,
    session,
  });
  if (balance < resolvedAmount) {
    const err = new Error("의뢰자 잔액 부족으로 가공 진입 불가");
    err.statusCode = 402;
    err.payload = {
      reason: "insufficient_credit_for_machining",
      balance,
      required: resolvedAmount,
      requestId: request?._id ? String(request._id) : null,
    };
    throw err;
  }

  const result = await CreditLedger.updateOne(
    { uniqueKey },
    {
      $setOnInsert: {
        businessAnchorId,
        userId: actorUserId || null,
        type: "SPEND",
        amount: -resolvedAmount,
        refType: "REQUEST",
        refId: request._id,
        uniqueKey,
      },
    },
    { upsert: true, session },
  );

  if (!result?.upsertedCount) {
    console.log("[CREDIT_SPEND] skip duplicate machining spend upsert", {
      requestId: request?.requestId,
      requestMongoId: String(request?._id || ""),
      uniqueKey,
    });
    return;
  }

  console.log("[CREDIT_SPEND] machining spend inserted", {
    requestId: request?.requestId,
    requestMongoId: String(request?._id || ""),
    amount: resolvedAmount,
    businessAnchorId: String(businessAnchorId),
  });

  await emitCreditBalanceUpdatedToBusiness({
    businessAnchorId,
    balanceDelta: -resolvedAmount,
    reason: "machining_spend",
    refId: request?._id,
  });
}

export async function ensureRequestCreditRefundOnRollbackToCam({
  request,
  businessAnchorId,
  actorUserId,
  session,
}) {
  if (!request?._id || !businessAnchorId) return;

  const cycle = Number(request?.caseInfos?.rollbackCounts?.cam || 0);
  const spendKeys = [
    `request:${String(request._id)}:machining_spend:${cycle}`,
    `request:${String(request._id)}:machining_spend`,
  ];
  const spendRow = await CreditLedger.findOne({
    uniqueKey: { $in: spendKeys },
    type: "SPEND",
    refType: "REQUEST",
    refId: request._id,
  })
    .select({ amount: 1, uniqueKey: 1 })
    .session(session || null)
    .lean();
  if (!spendRow?.uniqueKey) return;

  const refundAmount = Math.abs(Number(spendRow.amount || 0));
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) return;

  const refundKey = `request:${String(request._id)}:machining_refund:${cycle}`;
  const result = await CreditLedger.updateOne(
    { uniqueKey: refundKey },
    {
      $setOnInsert: {
        businessAnchorId,
        userId: actorUserId || null,
        type: "REFUND",
        amount: refundAmount,
        refType: "REQUEST",
        refId: request._id,
        uniqueKey: refundKey,
      },
    },
    { upsert: true, session },
  );

  if (!result?.upsertedCount) return;

  await emitCreditBalanceUpdatedToBusiness({
    businessAnchorId,
    balanceDelta: refundAmount,
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
  const pkg = await ShippingPackage.findOneAndUpdate(
    { businessAnchorId, shipDateYmd, mailboxAddress },
    {
      $setOnInsert: {
        businessAnchorId,
        shipDateYmd,
        mailboxAddress,
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

  if (!pkg?._id) {
    throw new Error("발송 박스 생성에 실패했습니다.");
  }

  request.shippingPackageId = pkg._id;

  const fee = Number(pkg.shippingFeeSupply || 0);
  if (!Number.isFinite(fee) || fee <= 0) return;

  const { paidBalance, freeShippingCreditBalance } =
    await getBusinessCreditBalance({
      businessAnchorId,
      session,
    });
  if (paidBalance + freeShippingCreditBalance < fee) {
    const err = new Error("의뢰자 잔액 부족으로 포장.발송 진입 불가");
    err.statusCode = 402;
    err.payload = {
      reason: "insufficient_credit_for_shipping",
      paidBalance,
      freeShippingCreditBalance,
      required: fee,
      requestId: request?._id ? String(request._id) : null,
      shippingPackageId: String(pkg._id),
    };
    throw err;
  }

  const cycle = Number(request?.caseInfos?.rollbackCounts?.shipping || 0);
  const uniqueKey = `shippingPackage:${String(pkg._id)}:shipping_fee:${cycle}`;
  const existingSpend = await CreditLedger.findOne({ uniqueKey })
    .select({ _id: 1 })
    .session(session || null)
    .lean();
  if (existingSpend?._id) return;

  const result = await CreditLedger.updateOne(
    { uniqueKey },
    {
      $setOnInsert: {
        businessAnchorId,
        userId: actorUserId || null,
        type: "SPEND",
        amount: -fee,
        refType: "SHIPPING_PACKAGE",
        refId: pkg._id,
        uniqueKey,
      },
    },
    { upsert: true, session },
  );

  if (!result?.upsertedCount) return;

  await emitCreditBalanceUpdatedToBusiness({
    businessAnchorId,
    balanceDelta: -fee,
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

  const cycle = Number(request?.caseInfos?.rollbackCounts?.shipping || 0);
  const spendKeys = [
    `shippingPackage:${String(request.shippingPackageId)}:shipping_fee:${cycle}`,
    `shippingPackage:${String(request.shippingPackageId)}:shipping_fee`,
  ];
  const spendRow = await CreditLedger.findOne({
    uniqueKey: { $in: spendKeys },
    type: "SPEND",
    refType: "SHIPPING_PACKAGE",
    refId: shippingPackageId,
  })
    .select({ amount: 1, uniqueKey: 1 })
    .session(session || null)
    .lean();

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

  if (!spendRow?.uniqueKey) return;

  const refundAmount = Math.abs(Number(spendRow.amount || 0));
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) return;

  const refundKey = `shippingPackage:${String(shippingPackageId)}:shipping_fee_refund:${cycle}`;
  const result = await CreditLedger.updateOne(
    { uniqueKey: refundKey },
    {
      $setOnInsert: {
        businessAnchorId,
        userId: actorUserId || null,
        type: "REFUND",
        amount: refundAmount,
        refType: "SHIPPING_PACKAGE",
        refId: shippingPackageId,
        uniqueKey: refundKey,
      },
    },
    { upsert: true, session },
  );

  if (!result?.upsertedCount) return;

  await emitCreditBalanceUpdatedToBusiness({
    businessAnchorId,
    balanceDelta: refundAmount,
    reason: "shipping_fee_refund",
    refId: shippingPackageId,
  });
}

// Ensure delivery info shippedAt timestamp
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

// Build auth headers for Bridge server
export function withBridgeHeaders(extra = {}) {
  const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET;
  const base = {};
  if (BRIDGE_SHARED_SECRET) {
    base["X-Bridge-Secret"] = BRIDGE_SHARED_SECRET;
  }
  return { ...base, ...extra };
}

// Build auth headers for Esprit server
export function withEspritHeaders(extra = {}) {
  const ESPRIT_SHARED_SECRET = process.env.ESPRIT_SHARED_SECRET;
  const base = {};
  if (ESPRIT_SHARED_SECRET) {
    base["X-Esprit-Secret"] = ESPRIT_SHARED_SECRET;
  }
  return { ...base, ...extra };
}
