// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/user.model.js
// - web/backend/controllers/businesses/business.controller.js
// - web/frontend/src/shared/business/requestorCapabilities.ts

/**
 * 의뢰자 유형(발신/수신) — 체크박스 OR.
 * - practice: 의뢰 발신자(치과) — 무료 서비스 경로 (사업자등록증 선택). 레거시 키명 clinic → practice 통일.
 * - lab: 의뢰 수신자(기공소와 기공실) — 유료 서비스 전제 (사업자등록증 필수)
 * 특정 상품명이 아니라 유료/무료 접근성 기준으로 게이트한다.
 */

export const normalizeRequestorCapabilities = (raw) => {
  // SSOT: practice. 레거시 clinic 키 호환(마이그레이션 전 DB/클라)
  const practice = Boolean(raw?.practice ?? raw?.clinic);
  const lab = Boolean(raw?.lab);
  return { practice, lab };
};

export const hasAnyRequestorCapability = (caps) => {
  const c = normalizeRequestorCapabilities(caps);
  return c.practice || c.lab;
};

/** 의뢰 수신자(lab) 선택 시 사업자등록증(검증) 필수 */
export const requiresBusinessLicense = (caps) => {
  return Boolean(normalizeRequestorCapabilities(caps).lab);
};

/** 유료 서비스 이용 가능 여부 — lab(수신) + 사업자 검증 SSOT */
export const canUsePaidServices = ({ businessVerified, caps } = {}) => {
  const lab = Boolean(normalizeRequestorCapabilities(caps).lab);
  return lab && Boolean(businessVerified);
};

/** 무료 서비스 이용 — 의뢰 발신자(practice) 선택 */
export const canUseFreeServices = (caps) => {
  return Boolean(normalizeRequestorCapabilities(caps).practice);
};

/** 기공의뢰서 발신(의뢰 발신자) */
export const canSendPracticeTransfer = (caps) => {
  return Boolean(normalizeRequestorCapabilities(caps).practice);
};

/** 기공의뢰서 수신(의뢰 수신자) */
export const canReceivePracticeTransfer = (caps) => {
  return Boolean(normalizeRequestorCapabilities(caps).lab);
};

/**
 * 앵커 우선, 없으면 유저 값. 둘 다 없으면 레거시 추론.
 * legacy: role=practice → practice cap, requestor with verified → lab
 */
export const resolveRequestorCapabilities = ({
  anchorCaps,
  userCaps,
  userRole,
  businessVerified,
} = {}) => {
  const fromAnchor = normalizeRequestorCapabilities(anchorCaps);
  if (fromAnchor.practice || fromAnchor.lab) return fromAnchor;

  const fromUser = normalizeRequestorCapabilities(userCaps);
  if (fromUser.practice || fromUser.lab) return fromUser;

  if (userRole === "practice") return { practice: true, lab: false };
  if (userRole === "requestor" && businessVerified) {
    return { practice: false, lab: true };
  }
  if (userRole === "requestor") {
    return { practice: true, lab: false };
  }
  return { practice: false, lab: false };
};
