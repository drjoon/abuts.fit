// related files:
// - web/backend/utils/designClaim.js
// - web/backend/models/request.model.js
// - web/backend/models/systemSettings.model.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/middlewares/auth.middleware.js
import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import SystemSettings from "../../models/systemSettings.model.js";
import {
  clampDesignClaimHours,
  DESIGN_CLAIM_HOURS_DEFAULT,
  enrichDesignClaimForViewer,
} from "../../utils/designClaim.js";

async function loadClaimHours() {
  const doc = await SystemSettings.findOne({ key: "global" })
    .select({ "designDeadlineSettings.claimHours": 1 })
    .lean();
  return clampDesignClaimHours(
    doc?.designDeadlineSettings?.claimHours ?? DESIGN_CLAIM_HOURS_DEFAULT,
  );
}

/**
 * POST /api/requests/:id/design-claim
 * 디자인+생산 준비 건을 원자적으로 클레임.
 */
export async function claimDesignRequest(req, res) {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const role = String(req.user?.role || "").trim();
    if (role !== "requestor" && role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "디자인 클레임은 지정 디자이너만 할 수 있습니다.",
      });
    }

    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "인증이 필요합니다." });
    }

    const claimHours = await loadClaimHours();
    const now = new Date();
    const deadlineAt = new Date(now.getTime() + claimHours * 60 * 60 * 1000);
    const claimedByName = String(req.user?.name || "").trim() || null;

    const updated = await Request.findOneAndUpdate(
      {
        _id: id,
        "caseInfos.productMode": "design_custom_abutment",
        manufacturerStage: "준비",
        $or: [
          { "designClaim.claimedBy": null },
          { "designClaim.claimedBy": { $exists: false } },
          { "designClaim.deadlineAt": null },
          { "designClaim.deadlineAt": { $exists: false } },
          { "designClaim.deadlineAt": { $lte: now } },
        ],
      },
      {
        $set: {
          designClaim: {
            claimedBy: userId,
            claimedByName,
            claimedAt: now,
            deadlineAt,
            claimHours,
          },
        },
      },
      { new: true },
    )
      .select({
        _id: 1,
        requestId: 1,
        manufacturerStage: 1,
        "caseInfos.productMode": 1,
        designClaim: 1,
      })
      .lean();

    if (!updated) {
      const existing = await Request.findById(id)
        .select({
          _id: 1,
          requestId: 1,
          manufacturerStage: 1,
          "caseInfos.productMode": 1,
          designClaim: 1,
        })
        .lean();

      if (!existing) {
        return res
          .status(404)
          .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
      }

      const productMode = String(existing?.caseInfos?.productMode || "").trim();
      if (productMode !== "design_custom_abutment") {
        return res.status(400).json({
          success: false,
          message: "디자인+생산 의뢰만 클레임할 수 있습니다.",
        });
      }
      if (String(existing.manufacturerStage || "").trim() !== "준비") {
        return res.status(400).json({
          success: false,
          message: "준비 단계 의뢰만 클레임할 수 있습니다.",
        });
      }

      const viewer = enrichDesignClaimForViewer(existing.designClaim, userId);
      if (viewer.mine) {
        return res.status(200).json({
          success: true,
          data: {
            request: existing,
            designClaimMeta: viewer,
            alreadyClaimed: true,
          },
        });
      }

      return res.status(409).json({
        success: false,
        message: "다른 디자이너가 이미 작업 중입니다.",
        data: {
          designClaim: existing.designClaim || null,
          designClaimMeta: viewer,
        },
      });
    }

    const designClaimMeta = enrichDesignClaimForViewer(updated.designClaim, userId);

    return res.status(200).json({
      success: true,
      data: {
        request: updated,
        designClaimMeta,
      },
    });
  } catch (error) {
    console.error("[claimDesignRequest] error", error);
    return res.status(500).json({
      success: false,
      message: "디자인 클레임 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
