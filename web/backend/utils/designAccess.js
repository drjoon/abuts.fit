// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/middlewares/auth.middleware.js
// - web/backend/modules/devops/designAccess.routes.js
// - web/backend/controllers/businesses/business.controller.js
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
