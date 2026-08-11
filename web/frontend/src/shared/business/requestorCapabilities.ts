// related files:
// - web/backend/utils/requestorCapabilities.js
// - web/frontend/src/shared/components/business/settings/business/businessMeCache.ts

/** 역할 XOR — 치과(기공실) / 기공소 */
export type RequestorKind = "practice" | "lab";

/** 서비스 OR — 기공의뢰서(무료) / 생산의뢰(유료) */
export type RequestorServices = {
  free: boolean;
  paid: boolean;
};

export type RequestorProfile = {
  kind: RequestorKind | null;
  services: RequestorServices;
};

/** @deprecated 레거시 — normalize/백필·응답 호환용 */
export type RequestorCapabilities = {
  practice: boolean;
  lab: boolean;
};

/** 입력용 — 레거시 `clinic` 키는 normalize에서 `practice`로 승격 */
export type RequestorCapabilitiesInput = Partial<RequestorCapabilities> & {
  clinic?: boolean;
};

export const REQUESTOR_KINDS = ["practice", "lab"] as const;

export const normalizeRequestorKind = (
  raw?: string | null,
): RequestorKind | null => {
  const k = String(raw || "").trim();
  if (k === "practice" || k === "lab") return k;
  return null;
};

export const normalizeRequestorServices = (
  raw?: Partial<RequestorServices> | null,
): RequestorServices => ({
  free: Boolean(raw?.free),
  paid: Boolean(raw?.paid),
});

export const hasAnyRequestorService = (
  services?: Partial<RequestorServices> | null,
) => {
  const s = normalizeRequestorServices(services);
  return s.free || s.paid;
};

export const hasRequestorProfile = (profile?: {
  kind?: string | null;
  services?: Partial<RequestorServices> | null;
}) =>
  Boolean(normalizeRequestorKind(profile?.kind)) &&
  hasAnyRequestorService(profile?.services);

export const normalizeRequestorCapabilities = (
  raw?: RequestorCapabilitiesInput | null,
): RequestorCapabilities => ({
  practice: Boolean(raw?.practice ?? raw?.clinic),
  lab: Boolean(raw?.lab),
});

export const hasAnyRequestorCapability = (
  caps?: RequestorCapabilitiesInput | null,
) => {
  const c = normalizeRequestorCapabilities(caps);
  return c.practice || c.lab;
};

export const profileFromLegacyCapabilities = (
  caps?: RequestorCapabilitiesInput | null,
  args?: { businessVerified?: boolean },
): RequestorProfile => {
  const c = normalizeRequestorCapabilities(caps);
  if (!c.practice && !c.lab) {
    return { kind: null, services: { free: false, paid: false } };
  }
  let kind: RequestorKind;
  if (c.practice && c.lab) {
    kind = args?.businessVerified ? "lab" : "practice";
  } else if (c.lab) {
    kind = "lab";
  } else {
    kind = "practice";
  }
  return {
    kind,
    services: {
      free: true,
      paid: Boolean(c.lab && args?.businessVerified),
    },
  };
};

export const legacyCapabilitiesFromProfile = (profile?: {
  kind?: string | null;
  services?: Partial<RequestorServices> | null;
}): RequestorCapabilities => {
  const k = normalizeRequestorKind(profile?.kind);
  const s = normalizeRequestorServices(profile?.services);
  if (!k || !hasAnyRequestorService(s)) {
    return { practice: false, lab: false };
  }
  return {
    practice: k === "practice",
    lab: k === "lab",
  };
};

export const resolveRequestorProfile = (args?: {
  anchorKind?: string | null;
  anchorServices?: Partial<RequestorServices> | null;
  anchorCaps?: RequestorCapabilitiesInput | null;
  userKind?: string | null;
  userServices?: Partial<RequestorServices> | null;
  userCaps?: RequestorCapabilitiesInput | null;
  userRole?: string | null;
  businessVerified?: boolean;
}): RequestorProfile => {
  const fromAnchorKind = normalizeRequestorKind(args?.anchorKind);
  const fromAnchorServices = normalizeRequestorServices(args?.anchorServices);
  if (fromAnchorKind && hasAnyRequestorService(fromAnchorServices)) {
    return { kind: fromAnchorKind, services: fromAnchorServices };
  }

  const fromAnchorLegacy = profileFromLegacyCapabilities(args?.anchorCaps, {
    businessVerified: args?.businessVerified,
  });
  if (fromAnchorLegacy.kind) return fromAnchorLegacy;

  const fromUserKind = normalizeRequestorKind(args?.userKind);
  const fromUserServices = normalizeRequestorServices(args?.userServices);
  if (fromUserKind && hasAnyRequestorService(fromUserServices)) {
    return { kind: fromUserKind, services: fromUserServices };
  }

  const fromUserLegacy = profileFromLegacyCapabilities(args?.userCaps, {
    businessVerified: args?.businessVerified,
  });
  if (fromUserLegacy.kind) return fromUserLegacy;

  if (args?.userRole === "practice") {
    return { kind: "practice", services: { free: true, paid: false } };
  }
  if (args?.userRole === "requestor" && args?.businessVerified) {
    return { kind: "lab", services: { free: true, paid: true } };
  }
  if (args?.userRole === "requestor") {
    return { kind: "practice", services: { free: true, paid: false } };
  }
  return { kind: null, services: { free: false, paid: false } };
};

/** @deprecated resolveRequestorProfile 사용 */
export const resolveRequestorCapabilities = (args?: {
  anchorCaps?: RequestorCapabilitiesInput | null;
  userCaps?: RequestorCapabilitiesInput | null;
  userRole?: string | null;
  businessVerified?: boolean;
  anchorKind?: string | null;
  anchorServices?: Partial<RequestorServices> | null;
  userKind?: string | null;
  userServices?: Partial<RequestorServices> | null;
}): RequestorCapabilities =>
  legacyCapabilitiesFromProfile(resolveRequestorProfile(args));

/** 의뢰자 서비스 이용 시 사업자등록증 필수 */
export const requiresBusinessLicense = (
  servicesOrCaps?:
    | Partial<RequestorServices>
    | RequestorCapabilitiesInput
    | null,
) => {
  if (
    servicesOrCaps &&
    typeof servicesOrCaps === "object" &&
    ("free" in servicesOrCaps || "paid" in servicesOrCaps)
  ) {
    return hasAnyRequestorService(servicesOrCaps);
  }
  return hasAnyRequestorCapability(servicesOrCaps);
};

export const canUsePaidServices = (args?: {
  businessVerified?: boolean;
  services?: Partial<RequestorServices> | null;
  caps?: RequestorCapabilitiesInput | null;
  profile?: RequestorProfile | null;
}) => {
  const s =
    args?.services ||
    args?.profile?.services ||
    (args?.caps
      ? profileFromLegacyCapabilities(args.caps, {
          businessVerified: args.businessVerified,
        }).services
      : null);
  return (
    Boolean(args?.businessVerified) &&
    Boolean(normalizeRequestorServices(s).paid)
  );
};

export const REQUESTOR_ACCESS_UPDATED_EVENT = "abuts:requestor-access-updated";

export const notifyRequestorAccessUpdated = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(REQUESTOR_ACCESS_UPDATED_EVENT));
};

export const isPaidRequestorPath = (href: string) => {
  const path = String(href || "").split("?")[0].replace(/\/$/, "") || "/";
  if (path === "/dashboard") return true;
  if (path === "/dashboard/new-request") return true;
  if (path.startsWith("/dashboard/new-request/")) return true;
  return false;
};

/** practice만 사업자등록증(유료) 미가용 시 대시보드·신규의뢰를 막는다. lab은 항상 허용.
 * 2026-08-11: 치과도 대시보드·어벗의뢰를 상시 열어 게이트 비활성. */
export const shouldGatePaidRequestorAccess = (_args?: {
  kind?: RequestorKind | string | null;
  canUsePaid?: boolean;
}) => false;

export const isPaidRequestorSidebarLocked = (args?: {
  kind?: RequestorKind | string | null;
  canUsePaid?: boolean;
  href?: string;
}) =>
  isPaidRequestorPath(args?.href || "") &&
  shouldGatePaidRequestorAccess({
    kind: args?.kind,
    canUsePaid: args?.canUsePaid,
  });

export const PAID_REQUESTOR_SETTINGS_TABS = new Set(["request", "payment"]);

export const REQUESTOR_KIND_LABEL = {
  practice: "치과 (기공실 포함)",
  lab: "기공소",
} as const;

/** 역할 뱃지 표기 SSOT: 의뢰자·치과 / 의뢰자·기공소 / 의뢰자 */
export const REQUESTOR_ROLE_BADGE_LABEL = {
  practice: "의뢰자·치과",
  lab: "의뢰자·기공소",
} as const;

export const getRequestorRoleBadgeLabel = (
  kind?: RequestorKind | string | null,
): string => {
  const normalized = normalizeRequestorKind(kind);
  if (normalized === "practice") return REQUESTOR_ROLE_BADGE_LABEL.practice;
  if (normalized === "lab") return REQUESTOR_ROLE_BADGE_LABEL.lab;
  return "의뢰자";
};

/** @deprecated REQUESTOR_KIND_LABEL 사용 */
export const REQUESTOR_CAPABILITY_LABEL = {
  practice: REQUESTOR_KIND_LABEL.practice,
  lab: REQUESTOR_KIND_LABEL.lab,
} as const;

export const REQUESTOR_SERVICE_LABEL = {
  free: "기공의뢰서 (무료)",
  paid: "생산의뢰 (유료)",
} as const;

export const PAID_ACCESS_DISABLED_HINT =
  "설정 > 사업자에서 사업자등록증을 등록,검증한 뒤 이용할 수 있습니다.";

export const canUseFreeServices = (
  servicesOrProfileOrCaps?:
    | Partial<RequestorServices>
    | RequestorProfile
    | RequestorCapabilitiesInput
    | null,
) => {
  if (!servicesOrProfileOrCaps || typeof servicesOrProfileOrCaps !== "object") {
    return false;
  }
  if ("services" in servicesOrProfileOrCaps) {
    return Boolean(
      normalizeRequestorServices(
        (servicesOrProfileOrCaps as RequestorProfile).services,
      ).free,
    );
  }
  if (
    "free" in servicesOrProfileOrCaps ||
    "paid" in servicesOrProfileOrCaps
  ) {
    return Boolean(
      normalizeRequestorServices(
        servicesOrProfileOrCaps as Partial<RequestorServices>,
      ).free,
    );
  }
  return Boolean(
    normalizeRequestorCapabilities(
      servicesOrProfileOrCaps as RequestorCapabilitiesInput,
    ).practice,
  );
};

export const canSendPracticeTransfer = (
  profileOrCaps?:
    | RequestorProfile
    | RequestorCapabilitiesInput
    | null,
) => {
  if (!profileOrCaps || typeof profileOrCaps !== "object") return false;
  if ("kind" in profileOrCaps || "services" in profileOrCaps) {
    const p = profileOrCaps as RequestorProfile;
    return (
      normalizeRequestorKind(p.kind) === "practice" &&
      Boolean(normalizeRequestorServices(p.services).free)
    );
  }
  return Boolean(
    normalizeRequestorCapabilities(profileOrCaps as RequestorCapabilitiesInput)
      .practice,
  );
};

export const canReceivePracticeTransfer = (
  profileOrCaps?:
    | RequestorProfile
    | RequestorCapabilitiesInput
    | null,
) => {
  if (!profileOrCaps || typeof profileOrCaps !== "object") return false;
  if ("kind" in profileOrCaps || "services" in profileOrCaps) {
    const p = profileOrCaps as RequestorProfile;
    return (
      normalizeRequestorKind(p.kind) === "lab" &&
      Boolean(normalizeRequestorServices(p.services).free)
    );
  }
  return Boolean(
    normalizeRequestorCapabilities(profileOrCaps as RequestorCapabilitiesInput)
      .lab,
  );
};

export const REQUESTOR_KIND_OPTIONS = [
  {
    key: "practice" as const,
    label: REQUESTOR_KIND_LABEL.practice,
    description:
      "구강스캔 3d 모델로 기공소에 의뢰하거나, 커스텀어벗 디자인 3d 모델로 어벗츠에 생산의뢰할 수 있습니다.",
  },
  {
    key: "lab" as const,
    label: REQUESTOR_KIND_LABEL.lab,
    description:
      "치과로부터 의뢰받거나, 커스텀어벗 디자인 3d 모델로 어벗츠에 생산의뢰할 수 있습니다.",
  },
];

export const REQUESTOR_SERVICE_OPTIONS = [
  {
    key: "free" as const,
    label: REQUESTOR_SERVICE_LABEL.free,
    description: "치과 ↔ 기공소 기공의뢰서 전달·관리.",
  },
  {
    key: "paid" as const,
    label: REQUESTOR_SERVICE_LABEL.paid,
    description: "어벗츠 생산의뢰.",
  },
];

/** @deprecated REQUESTOR_KIND_OPTIONS 사용 */
export const REQUESTOR_CAPABILITY_OPTIONS = REQUESTOR_KIND_OPTIONS.map(
  (opt) => ({
    key: opt.key,
    label: opt.label,
    description: opt.description,
  }),
);

export const normalizeRequestorProfileInput = (body?: {
  requestorKind?: string | null;
  kind?: string | null;
  requestorServices?: Partial<RequestorServices> | null;
  services?: Partial<RequestorServices> | null;
  requestorCapabilities?: RequestorCapabilitiesInput | null;
  businessVerified?: boolean;
}): RequestorProfile => {
  const kindFromBody = normalizeRequestorKind(
    body?.requestorKind ?? body?.kind,
  );
  const servicesRaw = body?.requestorServices || body?.services;
  const servicesFromBody = servicesRaw
    ? normalizeRequestorServices(servicesRaw)
    : null;

  if (
    kindFromBody &&
    servicesFromBody &&
    hasAnyRequestorService(servicesFromBody)
  ) {
    return { kind: kindFromBody, services: servicesFromBody };
  }

  if (body?.requestorCapabilities) {
    return profileFromLegacyCapabilities(body.requestorCapabilities, {
      businessVerified: Boolean(body.businessVerified),
    });
  }

  if (kindFromBody) {
    return {
      kind: kindFromBody,
      services: servicesFromBody || { free: false, paid: false },
    };
  }

  return { kind: null, services: { free: false, paid: false } };
};
