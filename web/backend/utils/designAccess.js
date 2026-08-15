// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/middlewares/auth.middleware.js
// - web/backend/modules/devops/designAccess.routes.js
// - web/backend/controllers/businesses/business.controller.js
// - web/backend/controllers/requests/designClaim.controller.js
// - web/backend/controllers/requests/designHandoff.controller.js
// change-log:
// - 2026-08-15: 기공의뢰(PTX) 연동 디자인+생산은 수락 기공소만 claim/handoff.
import BusinessAnchor from "../models/businessAnchor.model.js";

const DESIGN_ACCESS_CACHE_TTL_MS = 30 * 1000;
const __designAccessCache = new Map();

export const isDesignAccessEnabled = (anchor) =>
  Boolean(anchor?.designAccessEnabled);

/**
 * 의뢰자 유저의 소속 앵커 기준 디자인 큐 접근 여부.
 * manufacturer/admin/internalLab(어벗츠기공소)은 호출측에서 별도 허용.
 */
export const resolveDesignAccessForUser = async (user) => {
  if (!user) return false;
  const role = String(user.role || "").trim();
  if (role === "manufacturer" || role === "admin" || role === "internalLab") {
    return true;
  }
  if (role !== "requestor") return false;

  const anchorId = user.businessAnchorId;
  if (!anchorId) return false;

  const cacheKey = String(anchorId);
  const hit = __designAccessCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return Boolean(hit.enabled);
  }

  const anchor = await BusinessAnchor.findById(anchorId)
    .select({ designAccessEnabled: 1, businessType: 1 })
    .lean();

  const enabled =
    String(anchor?.businessType || "") === "requestor" &&
    isDesignAccessEnabled(anchor);

  __designAccessCache.set(cacheKey, {
    enabled,
    expiresAt: Date.now() + DESIGN_ACCESS_CACHE_TTL_MS,
  });
  return enabled;
};

/** PATCH 직후 사이드바·API 게이트에 즉시 반영 */
export const invalidateDesignAccessCache = (anchorId) => {
  if (!anchorId) return;
  __designAccessCache.delete(String(anchorId));
};

/** 기공의뢰(PracticeTransfer)에서 생성된 디자인+생산 Request */
export const isPtxLinkedDesignRequest = (request) => {
  const relatedId = request?.partnerBilling?.relatedPracticeTransferId;
  if (!relatedId) return false;
  return Boolean(String(relatedId).trim());
};

/**
 * PTX 연동 디자인+생산: 수락 기공소(Request.businessAnchorId)만 디자인 가능.
 */
export const isAcceptingLabForPtxDesignRequest = (user, request) => {
  if (!user || !request) return false;
  if (!isPtxLinkedDesignRequest(request)) return false;
  const myAnchor = String(user.businessAnchorId || "").trim();
  const ownerAnchor = String(request.businessAnchorId || "").trim();
  return Boolean(myAnchor && ownerAnchor && myAnchor === ownerAnchor);
};

/**
 * claim/handoff 권한.
 * - PTX 연동: 수락 기공소만 (디자인 파트너 제외)
 * - 비PTX(어벗생산의뢰): 기존 designAccessEnabled / admin·internalLab
 */
export const canClaimOrHandoffDesignRequest = async (user, request) => {
  if (!user || !request) return false;
  const role = String(user.role || "").trim();
  if (role === "admin") return true;

  if (isPtxLinkedDesignRequest(request)) {
    return isAcceptingLabForPtxDesignRequest(user, request);
  }

  return resolveDesignAccessForUser(user);
};
