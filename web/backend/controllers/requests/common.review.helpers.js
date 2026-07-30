// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
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
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";

const SHIPPING_FEE_SUPPLY = 3500;
const CREDIT_SPEND_LOCK_COLLECTION = "creditspendlocks";
const CREDIT_SPEND_LOCK_TTL_MS = 15_000;
const CREDIT_SPEND_LOCK_WAIT_MS = 4_000;
const CREDIT_SPEND_LOCK_RETRY_MS = 120;

let creditSpendLockIndexReadyPromise = null;

function isShippingRefType(refType) {
  return refType === "SHIPPING_PACKAGE" || refType === "SHIPPING_FEE";
}

function resolveLedgerSplit(absAmount, spentPaidAmount, spentBonusAmount) {
  const abs = Math.max(0, Number(absAmount) || 0);
  const paidRaw = Number(spentPaidAmount);
  const bonusRaw = Number(spentBonusAmount);

  const hasPaid = Number.isFinite(paidRaw);
  const hasBonus = Number.isFinite(bonusRaw);
  if (!hasPaid && !hasBonus) return null;

  let paid = Math.max(0, hasPaid ? paidRaw : 0);
  let bonus = Math.max(0, hasBonus ? bonusRaw : 0);

  const splitSum = paid + bonus;
  if (splitSum <= 0) return null;

  if (splitSum > abs) {
    let overflow = splitSum - abs;
    const reducePaid = Math.min(paid, overflow);
    paid -= reducePaid;
    overflow -= reducePaid;
    if (overflow > 0) {
      bonus = Math.max(0, bonus - overflow);
    }
  } else if (splitSum < abs) {
    paid += abs - splitSum;
  }

  return { paid, bonus };
}

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
    .select({
      type: 1,
      amount: 1,
      refType: 1,
      spentPaidAmount: 1,
      spentBonusAmount: 1,
    })
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
    if (type === "ADJUST") {
      paid += amount;
      continue;
    }

    if (type === "SPEND") {
      const split = resolveLedgerSplit(
        absAmount,
        row?.spentPaidAmount,
        row?.spentBonusAmount,
      );

      if (split) {
        if (isShippingRefType(refType)) {
          const fromBonusShipping = Math.min(bonusShipping, split.bonus);
          bonusShipping -= fromBonusShipping;
          paid -= split.paid + Math.max(0, split.bonus - fromBonusShipping);
        } else {
          const fromBonusRequest = Math.min(bonusRequest, split.bonus);
          bonusRequest -= fromBonusRequest;
          paid -= split.paid + Math.max(0, split.bonus - fromBonusRequest);
        }
        continue;
      }

      let spend = absAmount;
      if (isShippingRefType(refType)) {
        const fromBonusShipping = Math.min(bonusShipping, spend);
        bonusShipping -= fromBonusShipping;
        spend -= fromBonusShipping;
      } else {
        const fromBonusRequest = Math.min(bonusRequest, spend);
        bonusRequest -= fromBonusRequest;
        spend -= fromBonusRequest;
      }
      paid -= spend;
      continue;
    }

    if (type === "REFUND") {
      const split = resolveLedgerSplit(
        absAmount,
        row?.spentPaidAmount,
        row?.spentBonusAmount,
      );

      if (split) {
        if (isShippingRefType(refType)) {
          bonusShipping += split.bonus;
        } else {
          bonusRequest += split.bonus;
        }
        paid += split.paid;
      } else {
        paid += absAmount;
      }
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

function getCreditSpendLockCollection() {
  return CreditLedger.collection.conn.db.collection(CREDIT_SPEND_LOCK_COLLECTION);
}

async function ensureCreditSpendLockIndexes() {
  if (creditSpendLockIndexReadyPromise) {
    await creditSpendLockIndexReadyPromise;
    return;
  }

  const collection = getCreditSpendLockCollection();
  creditSpendLockIndexReadyPromise = Promise.all([
    collection.createIndex({ businessAnchorId: 1 }, { unique: true }),
    collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);

  try {
    await creditSpendLockIndexReadyPromise;
  } catch (error) {
    creditSpendLockIndexReadyPromise = null;
    throw error;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withBusinessCreditSpendLock({ businessAnchorId, runner }) {
  const normalizedBusinessAnchorId = String(businessAnchorId || "").trim();
  if (!normalizedBusinessAnchorId || !Types.ObjectId.isValid(normalizedBusinessAnchorId)) {
    return runner();
  }

  await ensureCreditSpendLockIndexes();

  const collection = getCreditSpendLockCollection();
  const anchorObjectId = new Types.ObjectId(normalizedBusinessAnchorId);
  const ownerToken = `${normalizedBusinessAnchorId}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const deadlineAt = Date.now() + CREDIT_SPEND_LOCK_WAIT_MS;
  let acquired = false;

  while (!acquired) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CREDIT_SPEND_LOCK_TTL_MS);

    try {
      const result = await collection.findOneAndUpdate(
        {
          businessAnchorId: anchorObjectId,
          $or: [{ expiresAt: { $lte: now } }, { ownerToken }],
        },
        {
          $setOnInsert: {
            businessAnchorId: anchorObjectId,
            createdAt: now,
          },
          $set: {
            ownerToken,
            expiresAt,
            updatedAt: now,
          },
        },
        {
          upsert: true,
          returnDocument: "after",
        },
      );

      const lockDoc = result?.value || null;
      if (lockDoc?.ownerToken === ownerToken) {
        acquired = true;
        break;
      }
    } catch (error) {
      if (Number(error?.code || 0) !== 11000) {
        throw error;
      }
    }

    if (Date.now() >= deadlineAt) {
      const lockError = new Error(
        "동일 사업자의 크레딧 처리 중입니다. 잠시 후 다시 시도해주세요.",
      );
      lockError.statusCode = 409;
      lockError.payload = {
        reason: "credit_spend_lock_timeout",
        businessAnchorId: normalizedBusinessAnchorId,
      };
      throw lockError;
    }

    await sleep(CREDIT_SPEND_LOCK_RETRY_MS);
  }

  try {
    return await runner();
  } finally {
    if (!acquired) return;
    await collection
      .deleteOne({ businessAnchorId: anchorObjectId, ownerToken })
      .catch(() => {});
  }
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

  await withBusinessCreditSpendLock({
    businessAnchorId,
    runner: async () => {
      const requestIdStr = String(request?._id || "").trim();
      const uniqueKey = `request:${requestIdStr}:machining_spend`;

      const computedPrice = await computePriceForRequest({
    requestorId: request?.requestor,
    requestorOrgId: businessAnchorId,
    clinicName: request?.caseInfos?.clinicName || "",
    patientName: request?.caseInfos?.patientName || "",
    tooth: request?.caseInfos?.tooth || "",
    currentRequestId: request?._id,
  });

      const spendRows = await CreditLedger.find({
        type: "SPEND",
        refType: "REQUEST",
        refId: request._id,
      })
        .select({
          _id: 1,
          uniqueKey: 1,
          amount: 1,
          hasFreeRequest: 1,
          spentPaidAmount: 1,
          spentBonusAmount: 1,
          createdAt: 1,
        })
        .sort({ createdAt: 1, _id: 1 })
        .session(session || null)
        .lean();

      const existingNegativeSpend = spendRows.find(
        (row) => Number(row?.amount || 0) < 0,
      );
      const existingFreeMarker = spendRows.find(
        (row) =>
          Number(row?.amount || 0) === 0 && row?.hasFreeRequest === true,
      );

      const resolvedAmount = Number(computedPrice?.amount || 0);

      if (!Number.isFinite(resolvedAmount) || resolvedAmount <= 0) {
        request.price = {
          ...(request.price || {}),
          ...(computedPrice && typeof computedPrice === "object"
            ? computedPrice
            : {}),
          amount: 0,
        };

        const freeMarkerResult = await CreditLedger.updateOne(
          { uniqueKey },
          {
            $setOnInsert: {
              businessAnchorId,
              userId: actorUserId || null,
              type: "SPEND",
              amount: 0,
              refType: "REQUEST",
              refId: request._id,
              uniqueKey,
              spentPaidAmount: 0,
              spentBonusAmount: 0,
              hasFreeRequest: true,
            },
          },
          { upsert: true, session },
        );

        if (freeMarkerResult?.upsertedCount) {
          console.log("[CREDIT_SPEND] free request marker inserted", {
            requestId: request?.requestId,
            requestMongoId: String(request?._id || ""),
            uniqueKey,
          });
        } else {
          console.log("[CREDIT_SPEND] skip existing free request marker", {
            requestId: request?.requestId,
            requestMongoId: String(request?._id || ""),
            uniqueKey,
          });
        }

        return;
      }

      const { paidCredit, bonusRequestCredit } = await getBusinessCreditBalance({
        businessAnchorId,
        session,
      });

      // 요청 단위 과금 SSOT: 동일 요청은 SPEND 1회만 유지한다.
      // (cycle 증가/중복 승인으로 인한 중복 차감 방지)
      if (existingNegativeSpend?._id) {
        console.log("[CREDIT_SPEND] skip existing machining spend for request", {
          requestId: request?.requestId,
          requestMongoId: String(request?._id || ""),
          existingUniqueKey: existingNegativeSpend.uniqueKey,
          currentUniqueKey: uniqueKey,
        });
        return;
      }
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

      // 의뢰비는 의뢰 크레딧(유료+무료 의뢰)에서만 결제 가능
      const fromBonusRequest = Math.min(bonusRequestCredit, resolvedAmount);
      const fromPaid = resolvedAmount - fromBonusRequest;

      let wasInsertedOrCorrected = false;

      if (existingFreeMarker?._id) {
        const corrected = await CreditLedger.updateOne(
          { _id: existingFreeMarker._id, amount: 0, hasFreeRequest: true },
      {
        $set: {
          userId: actorUserId || null,
          amount: -resolvedAmount,
          spentPaidAmount: fromPaid,
          spentBonusAmount: fromBonusRequest,
          hasFreeRequest: false,
        },
      },
      { session },
    );

        if (Number(corrected?.modifiedCount || 0) > 0) {
          wasInsertedOrCorrected = true;
          console.log("[CREDIT_SPEND] corrected legacy free marker to paid spend", {
            requestId: request?.requestId,
            requestMongoId: String(request?._id || ""),
            uniqueKey: existingFreeMarker.uniqueKey,
            amount: resolvedAmount,
          });
        } else {
          console.log("[CREDIT_SPEND] skip duplicate machining spend correction", {
            requestId: request?.requestId,
            requestMongoId: String(request?._id || ""),
            uniqueKey,
          });
          return;
        }
      } else {
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

        wasInsertedOrCorrected = true;
      }

      if (!wasInsertedOrCorrected) return;

      request.price = {
        ...(request.price || {}),
        ...(computedPrice && typeof computedPrice === "object"
          ? computedPrice
          : {}),
        amount: resolvedAmount,
      };

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
    },
  });
}

export async function ensureRequestCreditRefundOnRollbackToCam({
  request,
  businessAnchorId,
  actorUserId,
  session,
}) {
  if (!request?._id || !businessAnchorId) return;

  await withBusinessCreditSpendLock({
    businessAnchorId,
    runner: async () => {
      const spendRows = await CreditLedger.find({
        type: "SPEND",
        refType: "REQUEST",
        refId: request._id,
      })
        .select({
          amount: 1,
          uniqueKey: 1,
          spentPaidAmount: 1,
          spentBonusAmount: 1,
          createdAt: 1,
        })
        .sort({ createdAt: 1, _id: 1 })
        .session(session || null)
        .lean();

      const paidSpendRows = spendRows.filter(
        (row) => Number(row?.amount || 0) < 0,
      );
      if (!paidSpendRows.length) return;

      const refundRows = await CreditLedger.find({
        type: "REFUND",
        refType: "REQUEST",
        refId: request._id,
      })
        .select({ amount: 1 })
        .session(session || null)
        .lean();

      const spendTotal = paidSpendRows.reduce(
        (acc, row) => acc + Math.abs(Number(row?.amount || 0)),
        0,
      );
      const refundTotal = refundRows.reduce(
        (acc, row) => acc + Math.abs(Number(row?.amount || 0)),
        0,
      );
      const outstanding = Math.max(0, Math.round(spendTotal - refundTotal));
      if (outstanding <= 0) return;

      const latestSpendRow = paidSpendRows[paidSpendRows.length - 1] || null;
      if (!latestSpendRow?.uniqueKey) return;

      const refundAmount = outstanding;
      const split = resolveLedgerSplit(
        refundAmount,
        latestSpendRow?.spentPaidAmount,
        latestSpendRow?.spentBonusAmount,
      );
      const refundSpentPaidAmount = split ? split.paid : null;
      const refundSpentBonusAmount = split ? split.bonus : null;

      const refundKey = `request:${String(request._id)}:machining_refund`;
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
            spentPaidAmount: refundSpentPaidAmount,
            spentBonusAmount: refundSpentBonusAmount,
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
    },
  });
}

export async function ensureShippingFeeSpendOnPackingApprove({
  request,
  businessAnchorId,
  actorUserId,
  session,
}) {
  if (!request?._id || !businessAnchorId) return;

  await withBusinessCreditSpendLock({
    businessAnchorId,
    runner: async () => {
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

  // 정책: 같은 businessAnchor의 '발송 대기중(세척.패킹/포장.발송)' 건은
  // 날짜와 무관하게 하나의 패키지/배송비 단위로 묶는다.
  const pendingPackageCarrier = await Request.findOne(
    {
      businessAnchorId,
      manufacturerStage: { $in: ["세척.패킹", "포장.발송"] },
      shippingPackageId: { $ne: null },
      requestCategory: "order",
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

  // 중복 패키지 생성 방지: unique index 위반 시 재시도
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

  const fee = SHIPPING_FEE_SUPPLY;

  const { paidCredit, bonusShippingCredit } = await getBusinessCreditBalance({
    businessAnchorId,
    session,
  });

  const availableForShipping = paidCredit + bonusShippingCredit;
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

  // 배송비는 배송 크레딧(유료+무료 배송)에서만 결제 가능
  const fromBonusShipping = Math.min(bonusShippingCredit, fee);
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
    },
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

  await withBusinessCreditSpendLock({
    businessAnchorId,
    runner: async () => {
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
    .select({
      amount: 1,
      uniqueKey: 1,
      spentPaidAmount: 1,
      spentBonusAmount: 1,
    })
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

  const split = resolveLedgerSplit(
    refundAmount,
    spendRow?.spentPaidAmount,
    spendRow?.spentBonusAmount,
  );
  const refundSpentPaidAmount = split ? split.paid : null;
  const refundSpentBonusAmount = split ? split.bonus : null;

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
        spentPaidAmount: refundSpentPaidAmount,
        spentBonusAmount: refundSpentBonusAmount,
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
    },
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
