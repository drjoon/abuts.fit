import { Types } from "mongoose";
import CreditLedger from "../../models/creditLedger.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import { applyStatusMapping, computePriceForRequest } from "./utils.js";
import { emitCreditBalanceUpdatedToBusiness } from "../../utils/creditRealtime.js";

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

// Ensure request credit spend on machining enter
export async function ensureRequestCreditSpendOnMachiningEnter({
  request,
  businessAnchorId,
  actorUserId,
  session,
}) {
  if (!request || !businessAnchorId) return;

  const camRollbackCount = Number(request?.caseInfos?.rollbackCounts?.cam || 0);
  const uniqueKey = `request:${String(request._id)}:machining_spend:${camRollbackCount}`;
  const existingSpend = await CreditLedger.findOne({ uniqueKey })
    .select({ _id: 1 })
    .session(session || null)
    .lean();
  if (existingSpend?._id) {
    console.log("[CREDIT_SPEND] skip existing machining spend", {
      requestId: request?.requestId,
      requestMongoId: String(request?._id || ""),
      uniqueKey,
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

  await CreditLedger.updateOne(
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
