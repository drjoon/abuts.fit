// related files:
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/frontend/src/pages/manufacturer/worksheet/self/SelfProductionPage.tsx
import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import User from "../../models/user.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import { emitAppEventToRoles } from "../../socket.js";
import { getTodayYmdInKst } from "../../utils/krBusinessDays.js";
import {
  commitShippingFeeForPackage,
  ensureRequestCreditRollbackDeleteOnRollbackToCam,
  ensureRequestCreditSpendOnMachiningEnter,
  ensureShippingFeeRollbackDeleteOnShippingRollback,
} from "../requests/common.review.helpers.js";
import { releaseRequestCreditHoldsOnCancel } from "../../services/requestCreditHold.service.js";
import { markPracticeTransferAbutmentMachiningStarted } from "../../services/practiceTransferProduction.service.js";
import { releasePracticeTransferAbutmentShare } from "../../services/practiceTransferBilling.service.js";

const STAGE_ORDER = [
  "준비",
  "CAM",
  "가공",
  "세척.패킹",
  "포장.발송",
  "추적관리",
];
const MACHINING_INDEX = STAGE_ORDER.indexOf("가공");
const SHIP_INDEX = STAGE_ORDER.indexOf("포장.발송");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function emitSelfStageChanged(request, { fromStage, toStage }) {
  const requestorBusinessAnchorId = String(
    request?.businessAnchorId || "",
  ).trim();
  emitAppEventToRoles(
    ["requestor", "manufacturer", "admin", "salesman"],
    "request:stage-changed",
    {
      requestId: String(request?.requestId || ""),
      requestMongoId: String(request?._id || ""),
      requestorBusinessAnchorId: requestorBusinessAnchorId || null,
      businessAnchorId: requestorBusinessAnchorId || null,
      manufacturerStage: request.manufacturerStage,
      fromStage,
      toStage,
      selfShipment: request.selfShipment || null,
      source: "self-production",
    },
  );
}

async function assertSelfAccess(req, request) {
  if (String(req.user?.role || "") !== "manufacturer") {
    throw httpError(403, "제조사만 단계를 바꿀 수 있습니다.");
  }
  if (request.producerControl !== "self") {
    throw httpError(409, "자체 생산 의뢰가 아닙니다.");
  }
  const mine = String(req.user?.businessAnchorId || "");
  const assigneeId = String(request.caManufacturer || "");
  if (assigneeId && assigneeId === String(req.user?._id || "")) return;
  if (!assigneeId || !mine) {
    throw httpError(403, "이 의뢰의 생산 제조사가 아닙니다.");
  }
  const owner = await User.findById(assigneeId)
    .select({ businessAnchorId: 1 })
    .lean();
  if (String(owner?.businessAnchorId || "") !== mine) {
    throw httpError(403, "이 의뢰의 생산 제조사가 아닙니다.");
  }
}

async function billSelfShipping(request, actorUserId) {
  if (request.shippingPackageId) return;
  const payerId = request.businessAnchorId;
  if (!payerId) {
    throw httpError(400, "의뢰 사업자가 없어 배송비를 정산할 수 없습니다.");
  }
  const mailboxAddress = `self:${request._id}`;
  const pkg = await ShippingPackage.create({
    businessAnchorId: payerId,
    shipDateYmd: getTodayYmdInKst(),
    mailboxAddress,
    requestIds: [request._id],
    createdBy: actorUserId || null,
  });
  request.shippingPackageId = pkg._id;
  await Request.updateOne(
    { _id: request._id },
    { $set: { shippingPackageId: pkg._id } },
  );
  await commitShippingFeeForPackage({
    pkg,
    requests: [request],
    mailboxAddress,
    actorUserId,
  });
}

async function releaseAbutmentIfLinked(request, actorUserId) {
  const relatedPtxId = String(
    request?.partnerBilling?.relatedPracticeTransferId || "",
  ).trim();
  if (!relatedPtxId || !Types.ObjectId.isValid(relatedPtxId)) return;
  const transfer = await PracticeTransfer.findById(relatedPtxId);
  if (!transfer) return;
  await releasePracticeTransferAbutmentShare({
    transfer,
    actorUserId,
  });
}

function applyShipment(request, body, stage) {
  const trackingStages = stage === "포장.발송" || stage === "추적관리";
  if (!trackingStages) return;
  const hasCarrier = Object.prototype.hasOwnProperty.call(body, "carrier");
  const hasTracking = Object.prototype.hasOwnProperty.call(
    body,
    "trackingNumber",
  );
  if (!hasCarrier && !hasTracking) return;
  const prev = request.selfShipment || {};
  request.selfShipment = {
    carrier: hasCarrier
      ? String(body.carrier || "").trim()
      : String(prev.carrier || ""),
    trackingNumber: hasTracking
      ? String(body.trackingNumber || "").trim()
      : String(prev.trackingNumber || ""),
    updatedAt: new Date(),
  };
}

export async function updateSelfProduction(req, res) {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }
    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }
    await assertSelfAccess(req, request);

    const fromStage = String(request.manufacturerStage || "준비");
    const requested = String(req.body?.manufacturerStage || "").trim();
    const nextStage = requested || fromStage;
    const actorUserId = req.user?._id || null;

    if (nextStage === "취소") {
      if (fromStage !== "준비") {
        return res.status(409).json({
          success: false,
          message: "준비 단계에서만 취소할 수 있습니다.",
        });
      }
      request.manufacturerStage = "취소";
      await request.save();
      void releaseRequestCreditHoldsOnCancel({ request, actorUserId }).catch(
        (err) => {
          console.error("[self-production] hold release failed", err?.message);
        },
      );
      emitSelfStageChanged(request, { fromStage, toStage: "취소" });
      return res.status(200).json({
        success: true,
        data: {
          manufacturerStage: request.manufacturerStage,
          selfShipment: request.selfShipment || null,
        },
      });
    }

    const fromIndex = STAGE_ORDER.indexOf(fromStage);
    const toIndex = STAGE_ORDER.indexOf(nextStage);
    if (fromIndex < 0 || toIndex < 0) {
      return res
        .status(400)
        .json({ success: false, message: "바꿀 수 없는 단계입니다." });
    }
    if (toIndex < fromIndex && toIndex !== fromIndex - 1) {
      return res.status(400).json({
        success: false,
        message: "단계는 한 칸만 되돌릴 수 있습니다.",
      });
    }

    const businessAnchorId =
      request.businessAnchorId || request.requestor?.businessAnchorId || null;

    if (fromIndex < MACHINING_INDEX && toIndex >= MACHINING_INDEX) {
      await ensureRequestCreditSpendOnMachiningEnter({
        request,
        businessAnchorId,
        actorUserId,
      });
      void markPracticeTransferAbutmentMachiningStarted(request).catch(
        (err) => {
          console.warn(
            "[self-production] machining started mark failed",
            err?.message || err,
          );
        },
      );
    }

    if (toIndex === fromIndex - 1 && fromStage === "가공" && nextStage === "CAM") {
      await ensureRequestCreditRollbackDeleteOnRollbackToCam({
        request,
        businessAnchorId,
        actorUserId,
      });
    }

    if (fromIndex < SHIP_INDEX && toIndex >= SHIP_INDEX) {
      await billSelfShipping(request, actorUserId);
      void releaseAbutmentIfLinked(request, actorUserId).catch((err) => {
        console.error("[self-production] abutment release failed", err?.message);
      });
    }

    if (
      toIndex === fromIndex - 1 &&
      fromStage === "포장.발송" &&
      nextStage === "세척.패킹"
    ) {
      await ensureShippingFeeRollbackDeleteOnShippingRollback({
        request,
        actorUserId,
      });
    }

    request.manufacturerStage = nextStage;
    applyShipment(request, req.body || {}, nextStage);
    await request.save();
    emitSelfStageChanged(request, { fromStage, toStage: nextStage });

    return res.status(200).json({
      success: true,
      data: {
        manufacturerStage: request.manufacturerStage,
        selfShipment: request.selfShipment || null,
        shippingPackageId: request.shippingPackageId || null,
      },
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({
      success: false,
      message: error?.message || "단계 변경에 실패했습니다.",
    });
  }
}
