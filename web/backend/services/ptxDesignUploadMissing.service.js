// related files:
// - web/backend/services/worksheetReadyQueue.guard.js
// - web/backend/controllers/requests/designHandoff.controller.js
// - web/backend/models/request.model.js
// change-log:
// - 2026-11-07: PTX 동일 의뢰 다치아 — 일부만 어벗 STL 업로드 시 미업로드 sibling을 준비 큐에 노출.

import { Types } from "mongoose";
import Request from "../models/request.model.js";

/** partnerBilling 플래그 — 동일 PTX에 디자인 완료 sibling이 있을 때 미업로드 건 준비 큐 노출 */
export const PTX_DESIGN_UPLOAD_MISSING_VISIBLE_FIELD =
  "partnerBilling.ptxDesignUploadMissingVisible";

/**
 * 같은 PTX에 어벗 STL이 1건이라도 올라오면, 아직 designCompletedAt 없는 sibling을 준비 큐에 올린다.
 * @returns {Promise<{ modifiedCount: number, requestIds: string[] }>}
 */
export async function revealPtxSiblingDesignUploadMissing({
  relatedPracticeTransferId,
  excludeRequestId = null,
} = {}) {
  const transferId = String(relatedPracticeTransferId || "").trim();
  if (!transferId || !Types.ObjectId.isValid(transferId)) {
    return { modifiedCount: 0, requestIds: [] };
  }

  const excludeOid =
    excludeRequestId && Types.ObjectId.isValid(String(excludeRequestId))
      ? new Types.ObjectId(String(excludeRequestId))
      : null;

  const filter = {
    "partnerBilling.relatedPracticeTransferId": new Types.ObjectId(transferId),
    "caseInfos.hexVerificationSample": { $ne: true },
    designCompletedAt: { $not: { $type: "date" } },
    manufacturerStage: { $nin: ["취소"] },
    [PTX_DESIGN_UPLOAD_MISSING_VISIBLE_FIELD]: { $ne: true },
  };
  if (excludeOid) filter._id = { $ne: excludeOid };

  const pending = await Request.find(filter).select({ _id: 1 }).lean();
  if (!pending.length) {
    return { modifiedCount: 0, requestIds: [] };
  }

  const ids = pending.map((row) => row._id);
  const result = await Request.updateMany(
    { _id: { $in: ids } },
    { $set: { [PTX_DESIGN_UPLOAD_MISSING_VISIBLE_FIELD]: true } },
  );

  return {
    modifiedCount: Number(result?.modifiedCount || 0),
    requestIds: ids.map((id) => String(id)),
  };
}

/** 이 Request에 STL이 올라가면 미업로드 플래그 제거 */
export async function clearOwnPtxDesignUploadMissingVisible(requestDoc) {
  if (!requestDoc) return;
  if (requestDoc.partnerBilling?.ptxDesignUploadMissingVisible !== true) {
    return;
  }
  if (!requestDoc.partnerBilling) requestDoc.partnerBilling = {};
  requestDoc.partnerBilling.ptxDesignUploadMissingVisible = false;
}

/**
 * 같은 PTX sibling 중 designCompletedAt 유무로 미업로드 노출 플래그를 맞춘다.
 * - 완료 sibling 있음 → 미완료·비취소 건에 플래그 on
 * - 완료 sibling 없음 → 플래그 off (다시 숨김)
 */
export async function refreshPtxSiblingDesignUploadMissingVisibility(
  relatedPracticeTransferId,
) {
  const transferId = String(relatedPracticeTransferId || "").trim();
  if (!transferId || !Types.ObjectId.isValid(transferId)) {
    return { revealed: 0, cleared: 0 };
  }

  const transferOid = new Types.ObjectId(transferId);
  const base = {
    "partnerBilling.relatedPracticeTransferId": transferOid,
    "caseInfos.hexVerificationSample": { $ne: true },
  };

  const designedCount = await Request.countDocuments({
    ...base,
    designCompletedAt: { $type: "date" },
    manufacturerStage: { $nin: ["취소"] },
  });

  if (designedCount > 0) {
    const reveal = await Request.updateMany(
      {
        ...base,
        designCompletedAt: { $not: { $type: "date" } },
        manufacturerStage: { $nin: ["취소"] },
      },
      { $set: { [PTX_DESIGN_UPLOAD_MISSING_VISIBLE_FIELD]: true } },
    );
    return {
      revealed: Number(reveal?.modifiedCount || 0),
      cleared: 0,
    };
  }

  const clear = await Request.updateMany(
    {
      ...base,
      [PTX_DESIGN_UPLOAD_MISSING_VISIBLE_FIELD]: true,
    },
    { $set: { [PTX_DESIGN_UPLOAD_MISSING_VISIBLE_FIELD]: false } },
  );
  return {
    revealed: 0,
    cleared: Number(clear?.modifiedCount || 0),
  };
}
