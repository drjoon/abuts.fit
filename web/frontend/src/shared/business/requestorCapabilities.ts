// related files:
// - web/backend/utils/requestorCapabilities.js
// - web/frontend/src/shared/components/business/settings/business/businessMeCache.ts

export type RequestorCapabilities = {
  clinic: boolean;
  lab: boolean;
};

export const normalizeRequestorCapabilities = (
  raw?: Partial<RequestorCapabilities> | null,
): RequestorCapabilities => ({
  clinic: Boolean(raw?.clinic),
  lab: Boolean(raw?.lab),
});

export const hasAnyRequestorCapability = (
  caps?: Partial<RequestorCapabilities> | null,
) => {
  const c = normalizeRequestorCapabilities(caps);
  return c.clinic || c.lab;
};

/** 기공소(lab) 선택 시 사업자등록증(검증) 필수 */
export const requiresBusinessLicense = (
  caps?: Partial<RequestorCapabilities> | null,
) => Boolean(normalizeRequestorCapabilities(caps).lab);

/** 유료 서비스 — 사업자 검증 여부 */
export const canUsePaidServices = (businessVerified?: boolean) =>
  Boolean(businessVerified);

/** 의뢰자 사이드바·라우트 중 유료(사업자 검증) 필요 경로 */
export const isPaidRequestorPath = (href: string) => {
  const path = String(href || "").split("?")[0].replace(/\/$/, "") || "/";
  if (path === "/dashboard") return true;
  if (path === "/dashboard/new-request") return true;
  if (path.startsWith("/dashboard/new-request/")) return true;
  return false;
};

export const PAID_REQUESTOR_SETTINGS_TABS = new Set(["request", "payment"]);

export const PAID_ACCESS_DISABLED_HINT =
  "유료 서비스입니다. 사업자등록증을 등록·검증한 뒤 이용할 수 있습니다. 설정 > 사업자에서 등록하세요.";

/** 무료 서비스 — 치과 선택 */
export const canUseFreeServices = (
  caps?: Partial<RequestorCapabilities> | null,
) => Boolean(normalizeRequestorCapabilities(caps).clinic);

export const canSendPracticeTransfer = (
  caps?: Partial<RequestorCapabilities> | null,
) => Boolean(normalizeRequestorCapabilities(caps).clinic);

export const canReceivePracticeTransfer = (
  caps?: Partial<RequestorCapabilities> | null,
) => Boolean(normalizeRequestorCapabilities(caps).lab);

export const resolveRequestorCapabilities = (args?: {
  anchorCaps?: Partial<RequestorCapabilities> | null;
  userCaps?: Partial<RequestorCapabilities> | null;
  userRole?: string | null;
  businessVerified?: boolean;
}): RequestorCapabilities => {
  const fromAnchor = normalizeRequestorCapabilities(args?.anchorCaps);
  if (fromAnchor.clinic || fromAnchor.lab) return fromAnchor;

  const fromUser = normalizeRequestorCapabilities(args?.userCaps);
  if (fromUser.clinic || fromUser.lab) return fromUser;

  if (args?.userRole === "practice") return { clinic: true, lab: false };
  if (args?.userRole === "requestor" && args?.businessVerified) {
    return { clinic: false, lab: true };
  }
  if (args?.userRole === "requestor") {
    return { clinic: true, lab: false };
  }
  return { clinic: false, lab: false };
};

export const REQUESTOR_CAPABILITY_OPTIONS = [
  {
    key: "clinic" as const,
    label: "원내 기공실 없는 치과",
    description: "무료 서비스를 이용합니다. 사업자등록증은 선택 사항입니다.",
  },
  {
    key: "lab" as const,
    label: "기공소 혹은 원내 기공실",
    description: "유료 서비스를 이용합니다. 사업자등록증 등록이 필요합니다.",
  },
];
