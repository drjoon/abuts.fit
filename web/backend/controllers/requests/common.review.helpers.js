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
  await distributeCommissionOnRequestSpend({
    request,
    spendAmount: resolvedAmount,
    businessAnchorId,
    actorUserId,
    session,
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
  const existingSpend = await CreditLedger.findOne({ uniqueKey })
    .select({ _id: 1 })
    .session(session || null)
    .lean();
  if (existingSpend?._id) return;

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

  try {
    // 의뢰자의 BusinessAnchor 정보 조회
    const requestorAnchor = await BusinessAnchor.findById(businessAnchorId)
      .select({ referredByAnchorId: 1, businessType: 1 })
      .session(session || null)
      .lean();

    if (!requestorAnchor || requestorAnchor.businessType !== "requestor") {
      console.log("[COMMISSION] skip non-requestor business", {
        businessAnchorId,
        businessType: requestorAnchor?.businessType,
      });
      return;
    }

    // 기본 분배율 (첨1 이미지 기준)
    const MANUFACTURER_RATE = 0.65; // 제조사 65% 고정
    const SALESMAN_DIRECT_RATE = 0.05; // 영업자 직접 소개 5%
    const SALESMAN_INDIRECT_RATE = 0.025; // 영업자 간접 소개 2.5%
    const DEVOPS_BASE_RATE = 0.05; // 개발운영사 기본 5%

    let devopsCommissionAmount = 0;
    let salesmanCommissionAmount = 0;
    let referrerInfo = null;

    // 소개자 정보 조회 및 수수료 계산
    if (requestorAnchor.referredByAnchorId) {
      referrerInfo = await BusinessAnchor.findById(
        requestorAnchor.referredByAnchorId,
      )
        .select({
          businessType: 1,
          primaryContactUserId: 1,
          referredByAnchorId: 1,
        })
        .session(session || null)
        .lean();

      if (referrerInfo) {
        if (referrerInfo.businessType === "devops") {
          // 개발운영사가 직접 소개한 경우
          devopsCommissionAmount = Math.round(spendAmount * DEVOPS_BASE_RATE);
        } else if (referrerInfo.businessType === "salesman") {
          // 영업자가 직접 소개한 경우: 영업자 5% + 개발운영사 5%
          salesmanCommissionAmount = Math.round(
            spendAmount * SALESMAN_DIRECT_RATE,
          );
          devopsCommissionAmount = Math.round(spendAmount * DEVOPS_BASE_RATE);
        }
      }
    } else {
      // 소개자 없는 경우: 개발운영사가 직접 소개했다고 간주하여 추가 5%
      devopsCommissionAmount = Math.round(
        spendAmount * (DEVOPS_BASE_RATE + SALESMAN_DIRECT_RATE),
      );
    }

    // 영업자 간접 소개 체크 (2단계 이상)
    let indirectSalesmanCommissionAmount = 0;
    if (
      referrerInfo?.businessType === "salesman" &&
      referrerInfo.referredByAnchorId
    ) {
      const indirectReferrer = await BusinessAnchor.findById(
        referrerInfo.referredByAnchorId,
      )
        .select({
          businessType: 1,
          primaryContactUserId: 1,
        })
        .session(session || null)
        .lean();

      if (
        indirectReferrer?.businessType === "salesman" &&
        indirectReferrer.primaryContactUserId
      ) {
        indirectSalesmanCommissionAmount = Math.round(
          spendAmount * SALESMAN_INDIRECT_RATE,
        );
        // 영업자 간접 소개 시에도 개발운영사 5% 추가
        devopsCommissionAmount = Math.round(spendAmount * DEVOPS_BASE_RATE);
      }
    }

    // 관리자 분배율 동적 계산: 나머지 전체
    const totalDistributed =
      devopsCommissionAmount +
      salesmanCommissionAmount +
      indirectSalesmanCommissionAmount;
    const adminCommissionAmount =
      spendAmount -
      Math.round(spendAmount * MANUFACTURER_RATE) -
      totalDistributed;

    // 관리자 수수료 분배
    if (adminCommissionAmount > 0) {
      const adminUser = await User.findOne({
        role: "admin",
        active: true,
      })
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
              amount: adminCommissionAmount,
              refType: "REQUEST",
              refId: request._id,
              uniqueKey: adminUniqueKey,
              occurredAt: new Date(),
            },
          },
          { upsert: true, session },
        );

        console.log("[COMMISSION] admin commission distributed", {
          requestId: request?.requestId,
          amount: adminCommissionAmount,
          adminUserId: adminUser._id,
        });
      }
    }

    // 개발운영사 수수료 분배
    if (
      devopsCommissionAmount > 0 &&
      referrerInfo?.businessType === "devops" &&
      referrerInfo.primaryContactUserId
    ) {
      const devopsUniqueKey = `request:${String(request._id)}:devops_commission`;
      await SalesmanLedger.updateOne(
        { uniqueKey: devopsUniqueKey },
        {
          $setOnInsert: {
            salesmanId: referrerInfo.primaryContactUserId,
            type: "EARN",
            amount: devopsCommissionAmount,
            refType: "REQUEST",
            refId: request._id,
            uniqueKey: devopsUniqueKey,
          },
        },
        { upsert: true, session },
      );

      console.log("[COMMISSION] devops commission distributed", {
        requestId: request?.requestId,
        amount: devopsCommissionAmount,
        devopsUserId: referrerInfo.primaryContactUserId,
      });
    }

    // 영업자 직접 소개 수수료 분배
    if (
      salesmanCommissionAmount > 0 &&
      referrerInfo?.businessType === "salesman" &&
      referrerInfo.primaryContactUserId
    ) {
      const salesmanUniqueKey = `request:${String(request._id)}:salesman_commission`;
      await SalesmanLedger.updateOne(
        { uniqueKey: salesmanUniqueKey },
        {
          $setOnInsert: {
            salesmanId: referrerInfo.primaryContactUserId,
            type: "EARN",
            amount: salesmanCommissionAmount,
            refType: "REQUEST",
            refId: request._id,
            uniqueKey: salesmanUniqueKey,
          },
        },
        { upsert: true, session },
      );

      console.log("[COMMISSION] salesman direct commission distributed", {
        requestId: request?.requestId,
        amount: salesmanCommissionAmount,
        salesmanUserId: referrerInfo.primaryContactUserId,
      });
    }

    // 영업자 간접 소개 수수료 분배
    if (indirectSalesmanCommissionAmount > 0) {
      const indirectReferrer = await BusinessAnchor.findById(
        referrerInfo.referredByAnchorId,
      )
        .select({
          businessType: 1,
          primaryContactUserId: 1,
        })
        .session(session || null)
        .lean();

      if (
        indirectReferrer?.businessType === "salesman" &&
        indirectReferrer.primaryContactUserId
      ) {
        const indirectSalesmanUniqueKey = `request:${String(request._id)}:salesman_indirect_commission`;
        await SalesmanLedger.updateOne(
          { uniqueKey: indirectSalesmanUniqueKey },
          {
            $setOnInsert: {
              salesmanId: indirectReferrer.primaryContactUserId,
              type: "EARN",
              amount: indirectSalesmanCommissionAmount,
              refType: "REQUEST",
              refId: request._id,
              uniqueKey: indirectSalesmanUniqueKey,
            },
          },
          { upsert: true, session },
        );

        console.log("[COMMISSION] salesman indirect commission distributed", {
          requestId: request?.requestId,
          amount: indirectSalesmanCommissionAmount,
          salesmanUserId: indirectReferrer.primaryContactUserId,
        });
      }
    }

    // 제조사 수수료 분배 (의뢰 할당 시 처리)
    const manufacturerCommissionAmount = Math.round(
      spendAmount * MANUFACTURER_RATE,
    );
    console.log("[COMMISSION] manufacturer commission to be allocated", {
      requestId: request?.requestId,
      amount: manufacturerCommissionAmount,
    });

    console.log("[COMMISSION] commission distribution summary", {
      requestId: request?.requestId,
      spendAmount,
      manufacturer: manufacturerCommissionAmount,
      devops: devopsCommissionAmount,
      salesmanDirect: salesmanCommissionAmount,
      salesmanIndirect: indirectSalesmanCommissionAmount,
      admin: adminCommissionAmount,
      total:
        manufacturerCommissionAmount +
        devopsCommissionAmount +
        salesmanCommissionAmount +
        indirectSalesmanCommissionAmount +
        adminCommissionAmount,
    });
  } catch (error) {
    console.error("[COMMISSION] distribute commission error:", error);
    // 수수료 분배 실패해도 의뢰 처리는 계속 진행
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
