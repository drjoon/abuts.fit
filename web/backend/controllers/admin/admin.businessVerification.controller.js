// related files:
// - web/backend/jobs/businessVerificationRetryWorker.js
// - web/backend/modules/admin/admin.routes.js
// - web/frontend/src/pages/admin/dashboard/AdminBusinessVerificationCard.tsx
// change-log:
// - 2026-10-13: 홈택스 장애로 보류된 사업자 목록·즉시 재검증·수동 승인·반려(관리자 개입).
import mongoose from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  RETRY_WINDOW_MS,
  promotePendingBusinessToVerified,
  releasePendingBusiness,
  retryOnePendingBusinessVerification,
} from "../../jobs/businessVerificationRetryWorker.js";

const PENDING_FILTER = { status: "active", verificationPendingAt: { $ne: null } };

async function loadPending(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return BusinessAnchor.findOne({ _id: id, ...PENDING_FILTER })
    .select({
      name: 1,
      businessType: 1,
      businessNumberNormalized: 1,
      primaryContactUserId: 1,
      metadata: 1,
      verificationRetryCount: 1,
    })
    .lean();
}

const notPending = (res) =>
  res.status(404).json({
    success: false,
    message: "보류 중인 사업자가 아닙니다. 이미 처리되었을 수 있습니다.",
  });

/** @route GET /api/admin/business-verifications/pending */
export async function adminListPendingBusinessVerifications(req, res) {
  try {
    const rows = await BusinessAnchor.find(PENDING_FILTER)
      .select({
        name: 1,
        businessType: 1,
        businessNumberNormalized: 1,
        verificationPendingAt: 1,
        verificationMessage: 1,
        verificationRetryCount: 1,
        verificationLastCheckedAt: 1,
        "metadata.representativeName": 1,
        "metadata.phoneNumber": 1,
      })
      .sort({ verificationPendingAt: 1 })
      .limit(200)
      .lean();
    return res.json({
      success: true,
      data: {
        pending: rows.map((r) => ({
          id: String(r._id),
          name: r.name || "",
          businessType: r.businessType || "",
          businessNumber: r.businessNumberNormalized || "",
          representativeName: r.metadata?.representativeName || "",
          phoneNumber: r.metadata?.phoneNumber || "",
          pendingAt: r.verificationPendingAt,
          message: r.verificationMessage || "",
          retryCount: Number(r.verificationRetryCount) || 0,
          lastCheckedAt: r.verificationLastCheckedAt || null,
          // 보류 후 하루가 지나 워커가 더 이상 재검증하지 않는 건
          autoRetryStopped:
            !!r.verificationPendingAt &&
            Date.now() - new Date(r.verificationPendingAt).getTime() >
              RETRY_WINDOW_MS,
        })),
      },
    });
  } catch (error) {
    console.error("adminListPendingBusinessVerifications error:", error);
    return res
      .status(500)
      .json({ success: false, message: "보류 사업자 조회에 실패했습니다." });
  }
}

/** @route POST /api/admin/business-verifications/:id/retry */
export async function adminRetryBusinessVerification(req, res) {
  try {
    const row = await loadPending(req.params.id);
    if (!row) return notPending(res);
    const state = await retryOnePendingBusinessVerification(row);
    return res.json({ success: true, data: { state } });
  } catch (error) {
    console.error("adminRetryBusinessVerification error:", error);
    return res
      .status(500)
      .json({ success: false, message: "재검증에 실패했습니다." });
  }
}

/** @route POST /api/admin/business-verifications/:id/approve */
export async function adminApproveBusinessVerification(req, res) {
  try {
    const row = await loadPending(req.params.id);
    if (!row) return notPending(res);
    await promotePendingBusinessToVerified(row);
    console.info("[businessVerify] admin approved", {
      adminId: String(req.user?._id || ""),
      anchorId: String(row._id),
    });
    return res.json({ success: true, data: { state: "verified" } });
  } catch (error) {
    console.error("adminApproveBusinessVerification error:", error);
    return res
      .status(500)
      .json({ success: false, message: "수동 승인에 실패했습니다." });
  }
}

/** @route POST /api/admin/business-verifications/:id/reject */
export async function adminRejectBusinessVerification(req, res) {
  try {
    const row = await loadPending(req.params.id);
    if (!row) return notPending(res);
    const reason = String(req.body?.reason || "").trim();
    await releasePendingBusiness(
      row._id,
      reason || "관리자가 사업자 검증을 반려했습니다.",
    );
    console.info("[businessVerify] admin rejected", {
      adminId: String(req.user?._id || ""),
      anchorId: String(row._id),
    });
    return res.json({ success: true, data: { state: "rejected" } });
  } catch (error) {
    console.error("adminRejectBusinessVerification error:", error);
    return res
      .status(500)
      .json({ success: false, message: "반려 처리에 실패했습니다." });
  }
}
