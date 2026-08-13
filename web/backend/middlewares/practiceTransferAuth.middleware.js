// related files:
// - web/backend/utils/requestorCapabilities.js
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/backend/middlewares/auth.middleware.js
// - web/backend/services/requestDashboardCache.service.js
// - 2026-08-14: sendAuth 프로필 — authenticate User 재사용 + 30s 캐시(목록 폴링 병목).
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  canReceivePracticeTransfer,
  canSendPracticeTransfer,
  resolveRequestorProfile,
} from "../utils/requestorCapabilities.js";
import {
  getRequestPerfCacheValue,
  setRequestPerfCacheValue,
  withRequestPerfInFlight,
} from "../services/requestDashboardCache.service.js";

const PROFILE_CACHE_TTL_MS = 30 * 1000;

const loadResolvedProfile = async (user) => {
  if (!user) return { kind: null, services: { free: false, paid: false } };

  const userId = String(user._id || "").trim();
  const cacheKey = userId ? `practice-auth-profile:${userId}` : "";
  if (cacheKey) {
    const cached = getRequestPerfCacheValue(cacheKey);
    if (cached) return cached;
  }

  const build = async () => {
    let anchorKind = null;
    let anchorServices = null;
    let anchorCaps = null;
    let businessVerified = false;
    if (user.businessAnchorId) {
      const anchor = await BusinessAnchor.findById(user.businessAnchorId)
        .select({
          requestorKind: 1,
          requestorServices: 1,
          requestorCapabilities: 1,
          status: 1,
        })
        .lean();
      anchorKind = anchor?.requestorKind || null;
      anchorServices = anchor?.requestorServices || null;
      anchorCaps = anchor?.requestorCapabilities || null;
      businessVerified = anchor?.status === "verified";
    }

    // authenticate가 이미 User를 로드함. 동일 요청/짧은 TTL 안에서 재조회하지 않는다.
    return resolveRequestorProfile({
      anchorKind,
      anchorServices,
      anchorCaps,
      userKind: user.requestorKind,
      userServices: user.requestorServices,
      userCaps: user.requestorCapabilities,
      userRole: user.role,
      businessVerified,
    });
  };

  if (!cacheKey) return build();

  return withRequestPerfInFlight(cacheKey, async () => {
    const profile = await build();
    setRequestPerfCacheValue(cacheKey, profile, PROFILE_CACHE_TTL_MS);
    return profile;
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

      const profile = await loadResolvedProfile(req.user);
      if (!canSendPracticeTransfer(profile)) {
        return res.status(403).json({
          success: false,
          message:
            "치과(기공실) 역할이 필요합니다. 설정 > 사업자에서 확인해주세요.",
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

      req.requestorProfile = profile;
      req.requestorCapabilities = {
        practice: profile.kind === "practice",
        lab: profile.kind === "lab",
      };
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
 * 기공의뢰서 수신: requestor+lab
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

      const profile = await loadResolvedProfile(req.user);
      if (!canReceivePracticeTransfer(profile)) {
        return res.status(403).json({
          success: false,
          message:
            "기공소 역할이 필요합니다. 설정 > 사업자에서 확인해주세요.",
        });
      }

      req.requestorProfile = profile;
      req.requestorCapabilities = {
        practice: profile.kind === "practice",
        lab: profile.kind === "lab",
      };
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
