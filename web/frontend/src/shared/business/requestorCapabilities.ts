// related files:
// - web/backend/utils/requestorCapabilities.js
// - web/frontend/src/shared/components/business/settings/business/businessMeCache.ts

export type RequestorCapabilities = {
  practice: boolean;
  lab: boolean;
};

/** 입력용 — 레거시 `clinic` 키는 normalize에서 `practice`로 승격 */
export type RequestorCapabilitiesInput = Partial<RequestorCapabilities> & {
  clinic?: boolean;
};

export const normalizeRequestorCapabilities = (
  raw?: RequestorCapabilitiesInput | null,
): RequestorCapabilities => ({
  // SSOT: practice. 레거시 clinic 키 호환(마이그레이션 전 DB/클라)
  practice: Boolean(raw?.practice ?? raw?.clinic),
  lab: Boolean(raw?.lab),
});

export const hasAnyRequestorCapability = (
  caps?: RequestorCapabilitiesInput | null,
) => {
  const c = normalizeRequestorCapabilities(caps);
  return c.practice || c.lab;
};

/** 수신자(lab) 선택 시 사업자등록증(검증) 필수 */
export const requiresBusinessLicense = (
  caps?: RequestorCapabilitiesInput | null,
) => Boolean(normalizeRequestorCapabilities(caps).lab);

/** 유료 서비스 — lab 선택 + 사업자 검증 */
export const canUsePaidServices = (args?: {
  businessVerified?: boolean;
  caps?: RequestorCapabilitiesInput | null;
}) =>
  Boolean(args?.businessVerified) &&
  Boolean(normalizeRequestorCapabilities(args?.caps).lab);

/** 사업자 me 갱신 후 사이드바·유료게이트 재조회 */
export const REQUESTOR_ACCESS_UPDATED_EVENT = "abuts:requestor-access-updated";

export const notifyRequestorAccessUpdated = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(REQUESTOR_ACCESS_UPDATED_EVENT));
};

/** 의뢰자 사이드바·라우트 중 유료(사업자 검증) 필요 경로 */
export const isPaidRequestorPath = (href: string) => {
  const path = String(href || "").split("?")[0].replace(/\/$/, "") || "/";
  if (path === "/dashboard") return true;
  if (path === "/dashboard/new-request") return true;
  if (path.startsWith("/dashboard/new-request/")) return true;
  return false;
};

export const PAID_REQUESTOR_SETTINGS_TABS = new Set(["request", "payment"]);

export const REQUESTOR_CAPABILITY_LABEL = {
  practice: "의뢰 발신자 (치과)",
  lab: "의뢰 수신자 (기공소과 기공실)",
} as const;

export const PAID_ACCESS_DISABLED_HINT =
  `유료 서비스입니다. ${REQUESTOR_CAPABILITY_LABEL.lab}을 선택하고 사업자등록증을 검증한 뒤 이용할 수 있습니다. 설정 > 사업자에서 설정하세요.`;

/** 무료 서비스 — 의뢰 발신자(practice) 선택 */
export const canUseFreeServices = (
  caps?: RequestorCapabilitiesInput | null,
) => Boolean(normalizeRequestorCapabilities(caps).practice);

export const canSendPracticeTransfer = (
  caps?: RequestorCapabilitiesInput | null,
) => Boolean(normalizeRequestorCapabilities(caps).practice);

export const canReceivePracticeTransfer = (
  caps?: RequestorCapabilitiesInput | null,
) => Boolean(normalizeRequestorCapabilities(caps).lab);

export const resolveRequestorCapabilities = (args?: {
  anchorCaps?: RequestorCapabilitiesInput | null;
  userCaps?: RequestorCapabilitiesInput | null;
  userRole?: string | null;
  businessVerified?: boolean;
}): RequestorCapabilities => {
  const fromAnchor = normalizeRequestorCapabilities(args?.anchorCaps);
  if (fromAnchor.practice || fromAnchor.lab) return fromAnchor;

  const fromUser = normalizeRequestorCapabilities(args?.userCaps);
  if (fromUser.practice || fromUser.lab) return fromUser;

  // 레거시 role=practice 유저 폴백(마이그레이션 전)
  if (args?.userRole === "practice") return { practice: true, lab: false };
  if (args?.userRole === "requestor" && args?.businessVerified) {
    return { practice: false, lab: true };
  }
  if (args?.userRole === "requestor") {
    return { practice: true, lab: false };
  }
  return { practice: false, lab: false };
};

export const REQUESTOR_CAPABILITY_OPTIONS = [
  {
    key: "practice" as const,
    label: REQUESTOR_CAPABILITY_LABEL.practice,
    description:
      "기공의뢰서를 발신합니다. 무료 서비스이며 사업자등록증은 선택 사항입니다.",
  },
  {
    key: "lab" as const,
    label: REQUESTOR_CAPABILITY_LABEL.lab,
    description:
      "기공의뢰서 수신은 무료이지만,\n사업자등록증 등록시 유료 서비스 사용 가능합니다.",
  },
];
