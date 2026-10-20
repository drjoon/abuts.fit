// related files:
// - web/backend/services/newConnectionRequestDashboard.service.js
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// change-log:
// - 2026-10-21: 신규 커넥션 요청 확인(휴지통)·복원.
import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import { invalidateAdminDashboardCaches } from "../../services/requestDashboardCache.service.js";

const text = (value) => String(value || "").trim();

const isNewConnectionRequestCase = (caseInfos) => {
  const unsupported = text(caseInfos?.unsupportedConnection?.label);
  if (unsupported) return true;
  return Boolean(caseInfos?.newSystemRequest?.requested);
};

async function mutateAcknowledgement(req, res, { acknowledge }) {
  try {
    const id = String(req.params?.id || "").trim();
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    const doc = await Request.findById(id).select({
      caseInfos: 1,
      adminNewConnectionAcknowledgedAt: 1,
      adminNewConnectionAcknowledgedBy: 1,
    });
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }
    if (!isNewConnectionRequestCase(doc.caseInfos)) {
      return res.status(400).json({
        success: false,
        message: "신규 커넥션 요청 대상이 아닙니다.",
      });
    }

    if (acknowledge) {
      if (!doc.adminNewConnectionAcknowledgedAt) {
        doc.adminNewConnectionAcknowledgedAt = new Date();
        doc.adminNewConnectionAcknowledgedBy = req.user?._id || null;
        await doc.save();
      }
    } else {
      if (doc.adminNewConnectionAcknowledgedAt) {
        doc.adminNewConnectionAcknowledgedAt = null;
        doc.adminNewConnectionAcknowledgedBy = null;
        await doc.save();
      }
    }

    invalidateAdminDashboardCaches();

    return res.status(200).json({
      success: true,
      data: {
        id: String(doc._id),
        acknowledgedAt: doc.adminNewConnectionAcknowledgedAt || null,
      },
    });
  } catch (e) {
    console.error("[adminNewConnectionRequest] mutate error", e);
    return res.status(500).json({
      success: false,
      message: "처리에 실패했습니다.",
    });
  }
}

export async function acknowledgeAdminNewConnectionRequest(req, res) {
  return mutateAcknowledgement(req, res, { acknowledge: true });
}

export async function restoreAdminNewConnectionRequest(req, res) {
  return mutateAcknowledgement(req, res, { acknowledge: false });
}
