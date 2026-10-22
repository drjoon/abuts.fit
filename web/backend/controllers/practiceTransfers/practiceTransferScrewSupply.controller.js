// related files:
// - web/backend/utils/labPracticeScrewSupply.js
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import {
  canLabOperatePracticeTransferWork,
  isPracticeTransferLabReceiverRole,
} from "../../utils/practiceTransferAutoMatchCore.js";
import {
  normalizeScrewSupply,
  syncPracticeTransferScrewSupply,
} from "../../utils/labPracticeScrewSupply.js";

function buildTransferIdFilter(rawTransferId) {
  const value = String(rawTransferId || "").trim();
  if (!value) return null;
  if (Types.ObjectId.isValid(value)) {
    return {
      $or: [{ transferId: value }, { _id: new Types.ObjectId(value) }],
    };
  }
  return { transferId: value };
}

export async function setPracticeTransferScrewSupply(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (!isPracticeTransferLabReceiverRole(role) && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }
    const screwSupply = normalizeScrewSupply(req.body?.screwSupply);
    if (!screwSupply) {
      return res.status(400).json({
        success: false,
        message: "스크류는 어벗츠 또는 제조사 중 하나여야 합니다.",
      });
    }
    const transferIdFilter = buildTransferIdFilter(req.params?.transferId);
    if (!transferIdFilter) {
      return res.status(400).json({
        success: false,
        message: "transferId가 필요합니다.",
      });
    }

    const doc = await PracticeTransfer.findOne(transferIdFilter);
    if (!doc || String(doc.status || "") === "deleted") {
      return res.status(404).json({
        success: false,
        message: "전송 내역을 찾을 수 없습니다.",
      });
    }

    const labAnchorId = String(req.user?.businessAnchorId || "").trim();
    if (role !== "admin" && !canLabOperatePracticeTransferWork(doc, labAnchorId)) {
      return res.status(403).json({
        success: false,
        message: "작업을 하는 기공소만 스크류를 바꿀 수 있습니다.",
      });
    }

    let practiceName = "";
    const practiceAnchorId = doc.practiceBusinessAnchorId;
    if (practiceAnchorId && Types.ObjectId.isValid(String(practiceAnchorId))) {
      const practice = await BusinessAnchor.findById(practiceAnchorId)
        .select({ name: 1 })
        .lean();
      practiceName = String(practice?.name || "").trim();
    }

    const synced = await syncPracticeTransferScrewSupply({
      transfer: doc,
      screwSupply,
      practiceName,
    });

    return res.status(200).json({
      success: true,
      data: {
        transferId: String(doc.transferId || "").trim(),
        screwSupply: synced?.screwSupply || screwSupply,
        preference: synced?.preference || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "스크류 저장 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}
