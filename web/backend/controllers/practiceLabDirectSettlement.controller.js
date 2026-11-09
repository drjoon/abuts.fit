// related files:
// - web/backend/modules/practiceBilling/practiceBilling.routes.js
// - web/backend/modules/labDirectSettlement/labDirectSettlement.routes.js
// - web/backend/modules/admin/admin.routes.js
import { Types } from "mongoose";
import {
  confirmLabDirectSettlementDeposit,
  listAdminDirectSettlements,
  listLabDirectSettlements,
  listPracticeDirectSettlements,
  saveLabTrusteeIssueChoice,
  updateLabDirectSettlement,
} from "../services/practiceLabDirectSettlement.service.js";

function anchorIdFromReq(req) {
  const raw = req.user?.businessAnchorId || req.query?.businessAnchorId;
  return raw && Types.ObjectId.isValid(String(raw)) ? String(raw) : "";
}

function sendError(res, error, fallback) {
  const status = Number(error?.statusCode) || 500;
  if (status >= 500) console.error("[practiceLabDirectSettlement]", error);
  return res.status(status).json({
    success: false,
    message: error?.message || fallback,
  });
}

export async function getPracticeDirectSettlementsApi(req, res) {
  try {
    const practiceAnchorId = anchorIdFromReq(req);
    if (!practiceAnchorId) {
      return res.status(400).json({
        success: false,
        message: "사업자 정보를 확인할 수 없습니다.",
      });
    }
    const data = await listPracticeDirectSettlements(practiceAnchorId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error, "기공비 정산서를 불러오지 못했습니다.");
  }
}

export async function getLabDirectSettlementsApi(req, res) {
  try {
    const labAnchorId = anchorIdFromReq(req);
    if (!labAnchorId) {
      return res.status(400).json({
        success: false,
        message: "사업자 정보를 확인할 수 없습니다.",
      });
    }
    const data = await listLabDirectSettlements(labAnchorId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error, "기공비 정산서를 불러오지 못했습니다.");
  }
}

export async function patchLabDirectSettlementApi(req, res) {
  try {
    const labAnchorId = anchorIdFromReq(req);
    if (!labAnchorId) {
      return res.status(400).json({
        success: false,
        message: "사업자 정보를 확인할 수 없습니다.",
      });
    }
    const body = req.body || {};
    const data = await updateLabDirectSettlement({
      settlementId: req.params.id,
      labAnchorId,
      actorUserId: req.user?._id,
      lines: body.lines,
      totalOverride: body.totalOverride,
      totalOverrideSet: Object.prototype.hasOwnProperty.call(body, "totalOverride"),
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error, "정산서를 수정하지 못했습니다.");
  }
}

export async function confirmLabDirectSettlementApi(req, res) {
  try {
    const labAnchorId = anchorIdFromReq(req);
    if (!labAnchorId) {
      return res.status(400).json({
        success: false,
        message: "사업자 정보를 확인할 수 없습니다.",
      });
    }
    const data = await confirmLabDirectSettlementDeposit({
      settlementId: req.params.id,
      labAnchorId,
      actorUserId: req.user?._id,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error, "입금 확인을 저장하지 못했습니다.");
  }
}

export async function saveLabTrusteeChoiceApi(req, res) {
  try {
    const labAnchorId = anchorIdFromReq(req);
    if (!labAnchorId) {
      return res.status(400).json({
        success: false,
        message: "사업자 정보를 확인할 수 없습니다.",
      });
    }
    const data = await saveLabTrusteeIssueChoice({
      labAnchorId,
      enabled: req.body?.trusteeIssueEnabled,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error, "계산서 발행 방식을 저장하지 못했습니다.");
  }
}

export async function adminListDirectSettlementsApi(_req, res) {
  try {
    const data = await listAdminDirectSettlements();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error, "직접 정산 목록을 불러오지 못했습니다.");
  }
}
