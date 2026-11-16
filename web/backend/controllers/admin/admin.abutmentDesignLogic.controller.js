// 관리자 홈 — 반복된 생성 편향을 보고 승인하거나 거절한다.
// related files:
// - web/backend/services/abutmentDesignLogic.service.js
// - web/frontend/src/pages/admin/dashboard/AdminAbutmentDesignLogicCard.tsx
import {
  approveLogicProposal,
  dismissLogicProposal,
  listPendingLogicProposals,
  loadGenerationLogicPreview,
} from "../../services/abutmentDesignLogic.service.js";

export async function listAdminAbutmentDesignLogic(_req, res) {
  try {
    const data = await listPendingLogicProposals();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[admin] listAdminAbutmentDesignLogic error", error);
    return res.status(500).json({ success: false, message: "생성 로직 제안을 불러오지 못했습니다." });
  }
}

export async function approveAdminAbutmentDesignLogic(req, res) {
  try {
    const data = await approveLogicProposal(req.params?.id, req.user?._id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[admin] approveAdminAbutmentDesignLogic error", error);
    return res.status(500).json({ success: false, message: "생성 로직을 승인하지 못했습니다." });
  }
}

export async function dismissAdminAbutmentDesignLogic(req, res) {
  try {
    const data = await dismissLogicProposal(req.params?.id, req.user?._id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[admin] dismissAdminAbutmentDesignLogic error", error);
    return res.status(500).json({ success: false, message: "생성 로직 제안을 거절하지 못했습니다." });
  }
}

export async function getAdminAbutmentDesignLogicPreview(req, res) {
  try {
    const data = await loadGenerationLogicPreview(req.query?.transferId, req.query?.patientName);
    if (!data) {
      return res.status(404).json({ success: false, message: "이 의뢰의 디자인을 열 수 없습니다." });
    }
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[admin] getAdminAbutmentDesignLogicPreview error", error);
    return res.status(500).json({ success: false, message: "디자인을 불러오지 못했습니다." });
  }
}
