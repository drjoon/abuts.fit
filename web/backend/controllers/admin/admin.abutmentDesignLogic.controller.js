// 관리자 홈 — 자동 생성과 달라진 디자인을 보고 생성 로직에 반영한다.
// related files:
// - web/backend/services/abutmentDesignLogic.service.js
// - web/frontend/src/pages/admin/dashboard/AdminAbutmentDesignLogicCard.tsx
import {
  applyDesignChange,
  dismissDesignChange,
  listPendingDesignChanges,
  loadGenerationLogicPreview,
} from "../../services/abutmentDesignLogic.service.js";

export async function listAdminAbutmentDesignLogic(_req, res) {
  try {
    const data = await listPendingDesignChanges();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[admin] listAdminAbutmentDesignLogic error", error);
    return res.status(500).json({ success: false, message: "디자인 변경을 불러오지 못했습니다." });
  }
}

export async function applyAdminAbutmentDesignLogic(req, res) {
  try {
    const scope = req.body?.scope === "user" || req.body?.scope === "global" ? req.body.scope : "";
    const result = await applyDesignChange(req.params?.id, scope, req.user?._id);
    if (result?.error) {
      return res.status(400).json({ success: false, message: result.error, data: result.list });
    }
    return res.status(200).json({ success: true, data: result.list });
  } catch (error) {
    console.error("[admin] applyAdminAbutmentDesignLogic error", error);
    return res.status(500).json({ success: false, message: "생성 로직을 반영하지 못했습니다." });
  }
}

export async function dismissAdminAbutmentDesignLogic(req, res) {
  try {
    const data = await dismissDesignChange(req.params?.id, req.user?._id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[admin] dismissAdminAbutmentDesignLogic error", error);
    return res.status(500).json({ success: false, message: "디자인 변경을 건너뛰지 못했습니다." });
  }
}

export async function getAdminAbutmentDesignLogicPreview(req, res) {
  try {
    const data = await loadGenerationLogicPreview(
      req.query?.transferId,
      req.query?.patientName,
      req.query?.changeId,
    );
    if (!data) {
      return res.status(404).json({ success: false, message: "이 의뢰의 디자인을 열 수 없습니다." });
    }
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[admin] getAdminAbutmentDesignLogicPreview error", error);
    return res.status(500).json({ success: false, message: "디자인을 불러오지 못했습니다." });
  }
}
