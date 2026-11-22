// 승인된 생성 보정을 읽고, 확정 디자인의 원점 대비 차이를 쌓는다.
// related files:
// - web/backend/services/abutmentDesignLogic.service.js
// - web/backend/modules/ai/ai.routes.js
import { Types } from "mongoose";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import {
  listActiveGenerationRules,
  recordGenerationEdits,
} from "../../services/abutmentDesignLogic.service.js";

async function editableTransfer(req, rawTransferId) {
  const transferId = String(rawTransferId || "").trim();
  if (!transferId) return null;
  const select = {
    transferId: 1,
    practiceBusinessAnchorId: 1,
    targetLabAnchorId: 1,
    assigneeLabAnchorId: 1,
  };
  let transfer = null;
  if (Types.ObjectId.isValid(transferId)) {
    transfer = await PracticeTransfer.findById(transferId).select(select).lean();
  }
  if (!transfer?.practiceBusinessAnchorId) {
    transfer = await PracticeTransfer.findOne({ transferId }).select(select).lean();
  }
  if (!transfer?.practiceBusinessAnchorId) return null;
  const practiceId = String(transfer.practiceBusinessAnchorId);
  const own = String(req.user?.businessAnchorId || "").trim();
  const privileged = req.user?.role === "admin" || req.user?.role === "internalLab";
  const labs = [transfer.targetLabAnchorId, transfer.assigneeLabAnchorId].map((id) => String(id || ""));
  if (!privileged && own !== practiceId && !labs.includes(own)) return null;
  return {
    anchorId: practiceId,
    transferId: String(transfer.transferId || transferId),
  };
}

export async function getCustomAbutmentGenerationLogic(req, res) {
  try {
    const rules = await listActiveGenerationRules(req.user?._id);
    return res.status(200).json({ success: true, data: { rules } });
  } catch (error) {
    console.error("[AI] getCustomAbutmentGenerationLogic error", error);
    return res.status(500).json({ success: false, message: "생성 보정을 불러오지 못했습니다." });
  }
}

export async function recordCustomAbutmentGenerationEdits(req, res) {
  try {
    const editable = await editableTransfer(req, req.body?.transferId);
    if (!editable) {
      return res.status(403).json({ success: false, message: "이 의뢰의 편집을 남길 수 없습니다." });
    }
    const data = await recordGenerationEdits({
      transferId: editable.transferId,
      practiceBusinessAnchorId: editable.anchorId,
      userId: req.user?._id,
      editorName: req.user?.name,
      action: req.body?.action,
      patientName: req.body?.patientName,
      teeth: req.body?.teeth,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[AI] recordCustomAbutmentGenerationEdits error", error);
    return res.status(500).json({ success: false, message: "편집을 저장하지 못했습니다." });
  }
}
