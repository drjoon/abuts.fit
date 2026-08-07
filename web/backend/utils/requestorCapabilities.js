// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/user.model.js
// - web/backend/controllers/businesses/business.controller.js
// - web/frontend/src/shared/business/requestorCapabilities.ts

/**
 * 의뢰자 유형(치과/기공소) — 체크박스 OR.
 * - clinic: 무료 서비스 경로 (사업자등록증 선택)
 * - lab: 유료 서비스 전제 (사업자등록증 필수)
 * 특정 상품명이 아니라 유료/무료 접근성 기준으로 게이트한다.
 */

export const normalizeRequestorCapabilities = (raw) => {
  const clinic = Boolean(raw?.clinic);
  const lab = Boolean(raw?.lab);
  return { clinic, lab };
};

export const hasAnyRequestorCapability = (caps) => {
  const c = normalizeRequestorCapabilities(caps);
  return c.clinic || c.lab;
};

/** 기공소(lab) 선택 시 사업자등록증(검증) 필수 */
export const requiresBusinessLicense = (caps) => {
  return Boolean(normalizeRequestorCapabilities(caps).lab);
};

/** 유료 서비스 이용 가능 여부 — 사업자 검증 SSOT */
export const canUsePaidServices = ({ businessVerified } = {}) => {
  return Boolean(businessVerified);
};

/** 무료 서비스 이용 — 치과 선택(또는 레거시 practice) */
export const canUseFreeServices = (caps) => {
  return Boolean(normalizeRequestorCapabilities(caps).clinic);
};

/** 기공의뢰서 발신(치과 측) */
export const canSendPracticeTransfer = (caps) => {
  return Boolean(normalizeRequestorCapabilities(caps).clinic);
};

/** 기공의뢰서 수신(기공소 측) */
export const canReceivePracticeTransfer = (caps) => {
  return Boolean(normalizeRequestorCapabilities(caps).lab);
};

/**
 * 앵커 우선, 없으면 유저 값. 둘 다 없으면 레거시 추론.
 * legacy: practice role → clinic, requestor with verified → lab
 */
export const resolveRequestorCapabilities = ({
  anchorCaps,
  userCaps,
  userRole,
  businessVerified,
} = {}) => {
  const fromAnchor = normalizeRequestorCapabilities(anchorCaps);
  if (fromAnchor.clinic || fromAnchor.lab) return fromAnchor;

  const fromUser = normalizeRequestorCapabilities(userCaps);
  if (fromUser.clinic || fromUser.lab) return fromUser;

  if (userRole === "practice") return { clinic: true, lab: false };
  if (userRole === "requestor" && businessVerified) {
    return { clinic: false, lab: true };
  }
  if (userRole === "requestor") {
    return { clinic: true, lab: false };
  }
  return { clinic: false, lab: false };
};
