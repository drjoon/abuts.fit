// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/middlewares/auth.middleware.js
// - web/backend/modules/devops/designAccess.routes.js
// - web/backend/controllers/businesses/business.controller.js
// - web/backend/controllers/requests/designClaim.controller.js
// - web/backend/controllers/requests/designHandoff.controller.js
// change-log:
// - 2026-09-02: canClaimOrHandoffDesignRequest — 호출측이 넘긴 transferTargetLabAnchorId면 재조회 생략.
// - 2026-08-15: PTX 수락 판정 — Request.businessAnchorId 또는 transfer.targetLabAnchorId.
// - 2026-08-15: 기공의뢰(PTX) 연동 디자인+생산은 수락 기공소만 claim/handoff.
import BusinessAnchor from "../models/businessAnchor.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";

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
 * PTX 연동 디자인+생산: 수락 기공소만 디자인 가능.
 * - Request.businessAnchorId (생성 시점 소유)
 * - 또는 PracticeTransfer.targetLabAnchorId (현재 수락 lab; 작업취소 후 재수락 시 소유가 어긋날 수 있음)
 */
export const isAcceptingLabForPtxDesignRequest = (
  user,
  request,
  transferTargetLabAnchorId = null,
) => {
  if (!user || !request) return false;
  if (!isPtxLinkedDesignRequest(request)) return false;
  const myAnchor = String(user.businessAnchorId || "").trim();
  if (!myAnchor) return false;
  const ownerAnchor = String(request.businessAnchorId || "").trim();
  if (ownerAnchor && myAnchor === ownerAnchor) return true;
  const transferLab = String(transferTargetLabAnchorId || "").trim();
  return Boolean(transferLab && myAnchor === transferLab);
};

/**
 * claim/handoff 권한.
 * - PTX 연동: 수락 기공소만 (디자인 파트너 제외)
 * - 비PTX(어벗생산의뢰): 기존 designAccessEnabled / admin·internalLab
 * - options.transferTargetLabAnchorId 가 있으면(호출측이 이미 Transfer를 읽음) 재조회 생략
 */
export const canClaimOrHandoffDesignRequest = async (
  user,
  request,
  options = {},
) => {
  if (!user || !request) return false;
  const role = String(user.role || "").trim();
  if (role === "admin") return true;

  if (isPtxLinkedDesignRequest(request)) {
    const knownTransferLab =
      options &&
      Object.prototype.hasOwnProperty.call(options, "transferTargetLabAnchorId")
        ? String(options.transferTargetLabAnchorId || "").trim()
        : null;
    if (knownTransferLab !== null) {
      return isAcceptingLabForPtxDesignRequest(
        user,
        request,
        knownTransferLab,
      );
    }
    if (isAcceptingLabForPtxDesignRequest(user, request)) return true;
    const transferId = request?.partnerBilling?.relatedPracticeTransferId
      ? String(request.partnerBilling.relatedPracticeTransferId).trim()
      : "";
    if (!transferId) return false;
    const transfer = await PracticeTransfer.findById(transferId)
      .select({ targetLabAnchorId: 1 })
      .lean();
    return isAcceptingLabForPtxDesignRequest(
      user,
      request,
      transfer?.targetLabAnchorId,
    );
  }

  return resolveDesignAccessForUser(user);
};
