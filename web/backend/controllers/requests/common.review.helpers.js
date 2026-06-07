import { Types } from "mongoose";
import CreditLedger from "../../models/creditLedger.model.js";
import SalesmanLedger from "../../models/salesmanLedger.model.js";
import ManufacturerCreditLedger from "../../models/manufacturerCreditLedger.model.js";
import AdminCreditLedger from "../../models/adminCreditLedger.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
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
      paidCredit: 0,
      bonusRequestCredit: 0,
      bonusShippingCredit: 0,
    };
  }

  const rows = await CreditLedger.find({ businessAnchorId })
    .sort({ createdAt: 1, _id: 1 })
    .select({ type: 1, amount: 1, refType: 1, hasFreeRequest: 1 })
    .session(session || null)
    .lean();

  let paid = 0;
  let bonusRequest = 0;
  let bonusShipping = 0;

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
      if (refType === "FREE_SHIPPING_CREDIT") {
        bonusShipping += absAmount;
      } else {
        bonusRequest += absAmount;
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
        // 무료 의뢰가 포함된 패키지에만 무료배송 크레딧 사용 가능
        const canUseFreeShipping = row?.hasFreeRequest !== false;
        if (canUseFreeShipping) {
          const fromBonusShipping = Math.min(bonusShipping, spend);
          bonusShipping -= fromBonusShipping;
          spend -= fromBonusShipping;
        }
      } else {
        const fromBonusRequest = Math.min(bonusRequest, spend);
        bonusRequest -= fromBonusRequest;
        spend -= fromBonusRequest;
      }
      paid -= spend;
    }
  }

  const paidCredit = Math.max(0, Math.round(paid));
  const bonusRequestCredit = Math.max(0, Math.round(bonusRequest));
  const bonusShippingCredit = Math.max(0, Math.round(bonusShipping));
  return {
    balance: paidCredit + bonusRequestCredit + bonusShippingCredit,
    paidCredit,
    bonusRequestCredit,
    bonusShippingCredit,
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

  const { paidCredit, bonusRequestCredit } = await getBusinessCreditBalance({
    businessAnchorId,
    session,
  });
  const availableForMachining = paidCredit + bonusRequestCredit;
  if (availableForMachining < resolvedAmount) {
    const err = new Error("의뢰자 잔액 부족으로 가공 진입 불가");
    err.statusCode = 402;
    err.payload = {
      reason: "insufficient_credit_for_machining",
      paidCredit,
      bonusRequestCredit,
      availableForMachining,
      required: resolvedAmount,
      requestId: request?._id ? String(request._id) : null,
    };
    throw err;
  }

  // 무료/유료 크레딧 사용 분리 계산
  const fromBonusRequest = Math.min(bonusRequestCredit, resolvedAmount);
  const fromPaid = resolvedAmount - fromBonusRequest;

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
        spentPaidAmount: fromPaid,
        spentBonusAmount: fromBonusRequest,
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
    refId: request._id,
  });

  // 수수료 분배 처리
  // rules.md 6.9.1: 분배 대상은 유료의뢰비(유료 결제분)만 허용.
  // 무료 크레딧 사용분(fromBonusRequest)은 분배 대상에서 제외한다.
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
  let pkg = null;
  let retryCount = 0;
  const maxRetries = 3;

  // 중복 패키지 생성 방지: unique index 위반 시 재시도
  while (retryCount < maxRetries) {
    try {
      pkg = await ShippingPackage.findOneAndUpdate(
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
      break; // 성공 시 루프 종료
    } catch (err) {
      // MongoDB duplicate key error (11000)
      if (err.code === 11000 && retryCount < maxRetries - 1) {
        console.log(
          `[SHIPPING_FEE] Duplicate package detected, retrying... (attempt ${retryCount + 1})`,
        );
        retryCount++;
        // 잠시 대기 후 재시도
        await new Promise((resolve) => setTimeout(resolve, 50 * retryCount));
        // 기존 패키지 조회 시도
        pkg = await ShippingPackage.findOne(
          { businessAnchorId, shipDateYmd, mailboxAddress },
          null,
          { session },
        );
        if (pkg) {
          // 기존 패키지에 현재 의뢰 추가
          await ShippingPackage.updateOne(
            { _id: pkg._id },
            { $addToSet: { requestIds: request._id } },
            { session },
          );
          // 업데이트된 패키지 다시 조회
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

  const fee = Number(pkg.shippingFeeSupply || 0);
  if (!Number.isFinite(fee) || fee <= 0) return;

  // 패키지 내 무료 의뢰(newSystemRequest.free=true) 포함 여부 확인
  // 무료 의뢰가 1건이라도 있어야 무료배송 크레딧 사용 가능
  const Request = (await import("../../models/request.model.js")).default;
  const freeRequestInPkg = await Request.findOne({
    _id: { $in: pkg.requestIds || [] },
    "caseInfos.newSystemRequest.free": true,
  })
    .select({ _id: 1 })
    .session(session || null)
    .lean();
  const hasFreeRequestInPkg = !!freeRequestInPkg;

  const { paidCredit, bonusShippingCredit } = await getBusinessCreditBalance({
    businessAnchorId,
    session,
  });
  const availableForShipping = hasFreeRequestInPkg
    ? paidCredit + bonusShippingCredit
    : paidCredit;
  if (availableForShipping < fee) {
    const err = new Error("의뢰자 잔액 부족으로 포장.발송 진입 불가");
    err.statusCode = 402;
    err.payload = {
      reason: "insufficient_credit_for_shipping",
      paidCredit,
      bonusShippingCredit,
      required: fee,
      requestId: request?._id ? String(request._id) : null,
      shippingPackageId: String(pkg._id),
    };
    throw err;
  }

  // uniqueKey는 패키지 기준 단일 키 (cycle 미포함)
  // 패키지당 배송비는 1회만 청구 - 여러 의뢰가 같은 패키지에 속해도 동일 uniqueKey로 중복 방지
  const uniqueKey = `shippingPackage:${String(pkg._id)}:shipping_fee`;

  // 중복 방지: 동일 패키지의 기존 소비 내역 확인 (레거시 cycle suffix 포함)
  const existingSpendKeys = [
    uniqueKey,
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 18, 24].map(
      (c) => `${uniqueKey}:${c}`,
    ),
  ];
  const existingSpend = await CreditLedger.findOne({
    uniqueKey: { $in: existingSpendKeys },
    type: "SPEND",
    refType: "SHIPPING_PACKAGE",
    refId: pkg._id,
  })
    .select({ _id: 1, uniqueKey: 1, amount: 1 })
    .session(session || null)
    .lean();

  if (existingSpend?._id) {
    console.log(
      `[SHIPPING_FEE] Skip: already charged for package ${pkg._id}, existing: ${existingSpend.uniqueKey}`,
    );
    return;
  }

  // 동일 우편함의 다른 패키지에서 이미 배송비가 청구되었는지 확인 (추가 안전장치)
  const sameMailboxSpend = await CreditLedger.findOne({
    businessAnchorId,
    type: "SPEND",
    refType: "SHIPPING_PACKAGE",
    createdAt: {
      $gte: new Date(Date.now() - 5 * 60 * 1000), // 5분 이내
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

  // 무료/유료 크레딧 사용 분리 계산
  const fromBonusShipping = hasFreeRequestInPkg
    ? Math.min(bonusShippingCredit, fee)
    : 0;
  const fromPaid = fee - fromBonusShipping;

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
        hasFreeRequest: hasFreeRequestInPkg,
        spentPaidAmount: fromPaid,
        spentBonusAmount: fromBonusShipping,
      },
    },
    { upsert: true, session },
  );

  if (!result?.upsertedCount) {
    console.log("[SHIPPING_FEE] skip duplicate shipping fee upsert", {
      requestId: request?.requestId,
      shippingPackageId: String(pkg._id),
      uniqueKey,
    });
    return;
  }

  console.log("[SHIPPING_FEE] shipping fee spend inserted", {
    requestId: request?.requestId,
    shippingPackageId: String(pkg._id),
    amount: fee,
    fromBonusShipping,
    fromPaid,
    businessAnchorId: String(businessAnchorId),
  });

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

  const spendKeys = [
    `shippingPackage:${String(request.shippingPackageId)}:shipping_fee`,
    // 레거시: cycle 포함 키도 조회 (이전 데이터 호환)
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 18, 24].map(
      (c) =>
        `shippingPackage:${String(request.shippingPackageId)}:shipping_fee:${c}`,
    ),
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

  const cycle = Number(request?.caseInfos?.rollbackCounts?.shipping || 0);
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

// 수수료 분배 함수
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
