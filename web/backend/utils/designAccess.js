// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/middlewares/auth.middleware.js
// - web/backend/modules/devops/designAccess.routes.js
// - web/backend/controllers/businesses/business.controller.js
// - web/backend/controllers/requests/designClaim.controller.js
// - web/backend/controllers/requests/designHandoff.controller.js
// change-log:
// - 2026-10-01: 디자인 접근 캐시는 만료·상한으로 걷는다.
// - 2026-09-27: PTX 디자인 claim/handoff — 원청(target)뿐 아니라 수행 기공소(assignee, 협력·하청)도 허용.
// - 2026-09-02: canClaimOrHandoffDesignRequest — 호출측이 넘긴 transferTargetLabAnchorId면 재조회 생략.
// - 2026-08-15: PTX 수락 판정 — Request.businessAnchorId 또는 transfer.targetLabAnchorId.
// - 2026-08-15: 기공의뢰(PTX) 연동 디자인+생산은 수락 기공소만 claim/handoff.
import BusinessAnchor from "../models/businessAnchor.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import { canLabOperatePracticeTransferWork } from "./practiceTransferAutoMatchCore.js";
import { getTtlMapValue, setTtlMapValue } from "./boundedTtlMap.js";

const DESIGN_ACCESS_CACHE_TTL_MS = 30 * 1000;
const DESIGN_ACCESS_CACHE_MAX_ENTRIES = 1000;
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
  const hit = getTtlMapValue(__designAccessCache, cacheKey);
  if (hit && typeof hit.enabled === "boolean") {
    return hit.enabled;
  }

  const anchor = await BusinessAnchor.findById(anchorId)
    .select({ designAccessEnabled: 1, businessType: 1 })
    .lean();

  const enabled =
    String(anchor?.businessType || "") === "requestor" &&
    isDesignAccessEnabled(anchor);

  setTtlMapValue(
    __designAccessCache,
    cacheKey,
    { enabled },
    DESIGN_ACCESS_CACHE_TTL_MS,
    DESIGN_ACCESS_CACHE_MAX_ENTRIES,
  );
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

const normalizeAnchorId = (value) => String(value || "").trim();

/**
 * 세 번째 인자: 앵커 id 문자열, id 배열, 또는 Transfer 일부
 * `{ targetLabAnchorId, assigneeLabAnchorId }`.
 */
const collectTransferDesignLabAnchorIds = (transferLabs) => {
  if (transferLabs == null) return [];
  if (Array.isArray(transferLabs)) {
    return transferLabs.map(normalizeAnchorId).filter(Boolean);
  }
  if (typeof transferLabs === "object") {
    return [
      transferLabs.targetLabAnchorId,
      transferLabs.transferTargetLabAnchorId,
      transferLabs.assigneeLabAnchorId,
      transferLabs.performingLabAnchorId,
    ]
      .map(normalizeAnchorId)
      .filter(Boolean);
  }
  const one = normalizeAnchorId(transferLabs);
  return one ? [one] : [];
};

/**
 * PTX 연동 디자인+생산.
 * 협력: 수행 기공소(assignee)만. 원청은 작업하지 않는다.
 * 하청·자체 수행: 원청도 디자인·핸드오프 가능(하청이 있어도 개입).
 * labs 객체가 없으면 Request 소유 기공소 또는 전달된 id 목록.
 */
export const isAcceptingLabForPtxDesignRequest = (
  user,
  request,
  transferLabs = null,
) => {
  if (!user || !request) return false;
  if (!isPtxLinkedDesignRequest(request)) return false;
  const myAnchor = normalizeAnchorId(user.businessAnchorId);
  if (!myAnchor) return false;
  if (
    transferLabs &&
    typeof transferLabs === "object" &&
    !Array.isArray(transferLabs)
  ) {
    const targetLabAnchorId = normalizeAnchorId(
      transferLabs.targetLabAnchorId || transferLabs.transferTargetLabAnchorId,
    );
    const assigneeLabAnchorId = normalizeAnchorId(
      transferLabs.assigneeLabAnchorId,
    );
    const performingLabAnchorId = normalizeAnchorId(
      transferLabs.performingLabAnchorId,
    );
    if (targetLabAnchorId || assigneeLabAnchorId || performingLabAnchorId) {
      return canLabOperatePracticeTransferWork(
        {
          targetLabAnchorId: targetLabAnchorId || null,
          assigneeLabAnchorId:
            assigneeLabAnchorId ||
            (performingLabAnchorId &&
            performingLabAnchorId !== targetLabAnchorId
              ? performingLabAnchorId
              : null),
          assigneeKind: transferLabs.assigneeKind,
          autoMatch: transferLabs.autoMatch,
          targetLabName: transferLabs.targetLabName,
          matchingMode: transferLabs.matchingMode,
        },
        myAnchor,
      );
    }
  }
  const ownerAnchor = normalizeAnchorId(request.businessAnchorId);
  if (ownerAnchor && myAnchor === ownerAnchor) return true;
  return collectTransferDesignLabAnchorIds(transferLabs).some(
    (id) => id === myAnchor,
  );
};

/**
 * claim/handoff 권한.
 * - PTX 연동: 수락 기공소만 (디자인 파트너 제외)
 * - 비PTX(어벗생산의뢰): 기존 designAccessEnabled / admin·internalLab
 * - options.transferTargetLabAnchorId 또는 assigneeLabAnchorId 가 있으면
 *   (호출측이 이미 Transfer를 읽음) 재조회 생략
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
    const hasKnownLabs =
      options &&
      (Object.prototype.hasOwnProperty.call(
        options,
        "transferTargetLabAnchorId",
      ) ||
        Object.prototype.hasOwnProperty.call(options, "assigneeLabAnchorId"));
    if (hasKnownLabs) {
      return isAcceptingLabForPtxDesignRequest(user, request, {
        targetLabAnchorId: options.transferTargetLabAnchorId,
        assigneeLabAnchorId: options.assigneeLabAnchorId,
        assigneeKind: options.assigneeKind,
        autoMatch: options.autoMatch,
      });
    }
    if (isAcceptingLabForPtxDesignRequest(user, request)) return true;
    const transferId = request?.partnerBilling?.relatedPracticeTransferId
      ? String(request.partnerBilling.relatedPracticeTransferId).trim()
      : "";
    if (!transferId) return false;
    const transfer = await PracticeTransfer.findById(transferId)
      .select({
        targetLabAnchorId: 1,
        assigneeLabAnchorId: 1,
        assigneeKind: 1,
        "autoMatch.claimedAt": 1,
        targetLabName: 1,
        matchingMode: 1,
      })
      .lean();
    return isAcceptingLabForPtxDesignRequest(user, request, {
      targetLabAnchorId: transfer?.targetLabAnchorId,
      assigneeLabAnchorId: transfer?.assigneeLabAnchorId,
      assigneeKind: transfer?.assigneeKind,
      autoMatch: transfer?.autoMatch,
      targetLabName: transfer?.targetLabName,
      matchingMode: transfer?.matchingMode,
    });
  }

  return resolveDesignAccessForUser(user);
};
