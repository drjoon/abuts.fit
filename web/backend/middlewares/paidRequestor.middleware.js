// related files:
// - web/backend/utils/requestorCapabilities.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/middlewares/practiceTransferAuth.middleware.js
import BusinessAnchor from "../models/businessAnchor.model.js";
import User from "../models/user.model.js";
import {
  canUsePaidServices,
  resolveRequestorProfile,
} from "../utils/requestorCapabilities.js";

/**
 * 생산의뢰 API 가드: requestorServices.paid(레거시 free는 paid 승격) + BusinessAnchor verified.
 * admin은 통과.
 */
export const authorizePaidRequestor = () => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "인증이 필요합니다.",
        });
      }

      if (req.user.role === "admin") return next();
      if (req.user.role !== "requestor") {
        return res.status(403).json({
          success: false,
          message: "이 작업을 수행할 권한이 없습니다.",
        });
      }

      let businessVerified = false;
      let anchorKind = null;
      let anchorServices = null;
      let anchorCaps = null;
      if (req.user.businessAnchorId) {
        const anchor = await BusinessAnchor.findById(req.user.businessAnchorId)
          .select({
            status: 1,
            requestorKind: 1,
            requestorServices: 1,
            requestorCapabilities: 1,
          })
          .lean();
        businessVerified = anchor?.status === "verified";
        anchorKind = anchor?.requestorKind || null;
        anchorServices = anchor?.requestorServices || null;
        anchorCaps = anchor?.requestorCapabilities || null;
      }

      const freshUser = await User.findById(req.user._id)
        .select({
          requestorKind: 1,
          requestorServices: 1,
          requestorCapabilities: 1,
          role: 1,
        })
        .lean();

      const profile = resolveRequestorProfile({
        anchorKind,
        anchorServices,
        anchorCaps,
        userKind: freshUser?.requestorKind,
        userServices: freshUser?.requestorServices,
        userCaps: freshUser?.requestorCapabilities,
        userRole: freshUser?.role || req.user.role,
        businessVerified,
      });

      if (
        !canUsePaidServices({
          businessVerified,
          services: profile.services,
        })
      ) {
        return res.status(403).json({
          success: false,
          reason: "paid_services_required",
          message:
            "생산의뢰 이용을 위해 설정 > 사업자에서 사업자등록증을 검증해주세요.",
        });
      }

      req.requestorProfile = profile;
      return next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "권한 확인 중 오류가 발생했습니다.",
        error: error.message,
      });
    }
  };
};
