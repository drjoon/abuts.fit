// related files:
// - web/backend/utils/requestorCapabilities.js
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/backend/middlewares/auth.middleware.js
import BusinessAnchor from "../models/businessAnchor.model.js";
import User from "../models/user.model.js";
import {
  canReceivePracticeTransfer,
  canSendPracticeTransfer,
  resolveRequestorCapabilities,
} from "../utils/requestorCapabilities.js";

const loadResolvedCapabilities = async (user) => {
  if (!user) return { practice: false, lab: false };

  let anchorCaps = null;
  let businessVerified = false;
  if (user.businessAnchorId) {
    const anchor = await BusinessAnchor.findById(user.businessAnchorId)
      .select({ requestorCapabilities: 1, status: 1 })
      .lean();
    anchorCaps = anchor?.requestorCapabilities || null;
    businessVerified = anchor?.status === "verified";
  }

  const freshUser = await User.findById(user._id)
    .select({ requestorCapabilities: 1, role: 1 })
    .lean();

  return resolveRequestorCapabilities({
    anchorCaps,
    userCaps: freshUser?.requestorCapabilities,
    userRole: freshUser?.role || user.role,
    businessVerified,
  });
};

/**
 * 기공의뢰서 발신: legacy practice role 또는 requestor+practice
 */
export const authorizePracticeTransferSend = (options = {}) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "인증이 필요합니다.",
        });
      }

      if (req.user.role === "admin") return next();
      if (req.user.role === "practice") {
        const { subRoles } = options;
        if (Array.isArray(subRoles) && subRoles.length > 0) {
          const sub = String(req.user.subRole || "").trim();
          if (!subRoles.includes(sub)) {
            return res.status(403).json({
              success: false,
              message: "이 작업을 수행할 권한이 없습니다.",
            });
          }
        }
        return next();
      }

      if (req.user.role !== "requestor") {
        return res.status(403).json({
          success: false,
          message: "이 작업을 수행할 권한이 없습니다.",
        });
      }

      const caps = await loadResolvedCapabilities(req.user);
      if (!canSendPracticeTransfer(caps)) {
        return res.status(403).json({
          success: false,
          message:
            "치과(무료 서비스) 유형이 필요합니다. 설정 > 사업자에서 유형을 확인해주세요.",
        });
      }

      const { subRoles } = options;
      if (Array.isArray(subRoles) && subRoles.length > 0) {
        const sub = String(req.user.subRole || "").trim() || "owner";
        if (!subRoles.includes(sub)) {
          return res.status(403).json({
            success: false,
            message: "이 작업을 수행할 권한이 없습니다.",
          });
        }
      }

      req.requestorCapabilities = caps;
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

/**
 * 기공의뢰서 수신: requestor+lab (레거시 requestor는 resolve 기본 lab)
 */
export const authorizePracticeTransferReceive = () => {
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

      const caps = await loadResolvedCapabilities(req.user);
      if (!canReceivePracticeTransfer(caps)) {
        return res.status(403).json({
          success: false,
          message:
            "기공소(유료 서비스) 유형이 필요합니다. 설정 > 사업자에서 유형을 확인해주세요.",
        });
      }

      req.requestorCapabilities = caps;
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
