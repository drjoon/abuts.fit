// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/user.model.js
// - web/backend/controllers/businesses/business.controller.js
// - web/frontend/src/shared/business/requestorCapabilities.ts

/**
 * 의뢰자 SSOT:
 * - requestorKind: "practice" | "lab" (XOR) — 치과(기공실) / 기공소
 * - requestorServices: paid-only. `free`(기공의뢰서)는 폐기 — 읽기 시 paid로 승격, 쓰기는 `{free:false,paid:true}`.
 * 레거시 requestorCapabilities.{practice,lab}는 normalize·백필·resolve 폴백 전용.
 */

export const REQUESTOR_KINDS = ["practice", "lab"];

export const normalizeRequestorKind = (raw) => {
  const k = String(raw || "").trim();
  if (k === "practice" || k === "lab") return k;
  return null;
};

const missingRequestorKindClause = {
  $or: [
    { requestorKind: { $exists: false } },
    { requestorKind: null },
    { requestorKind: "" },
  ],
};

/**
 * 앵커 kind 검색 필터.
 * requestorKind 우선, kind 미백필이면 레거시 caps로 폴백.
 */
export const requestorKindCapableAnchorFilter = (kind) => {
  const k = normalizeRequestorKind(kind);
  if (!k) return null;
  return {
    $or: [
      { requestorKind: k },
      {
        $and: [
          missingRequestorKindClause,
          { [`requestorCapabilities.${k}`]: true },
        ],
      },
    ],
  };
};

export const PAID_ONLY_SERVICES = Object.freeze({ free: false, paid: true });
export const EMPTY_REQUESTOR_SERVICES = Object.freeze({
  free: false,
  paid: false,
});

/** paid-only. 레거시 free-only는 paid로 승격. */
export const normalizeRequestorServices = (raw) => {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_REQUESTOR_SERVICES };
  }
  const paid = Boolean(raw.paid || raw.free);
  return paid ? { ...PAID_ONLY_SERVICES } : { ...EMPTY_REQUESTOR_SERVICES };
};

export const hasAnyRequestorService = (services) =>
  Boolean(normalizeRequestorServices(services).paid);

export const hasRequestorProfile = ({ kind, services } = {}) =>
  Boolean(normalizeRequestorKind(kind)) && hasAnyRequestorService(services);

/** 레거시 caps — clinic → practice 승격 */
export const normalizeRequestorCapabilities = (raw) => {
  const practice = Boolean(raw?.practice ?? raw?.clinic);
  const lab = Boolean(raw?.lab);
  return { practice, lab };
};

export const hasAnyRequestorCapability = (caps) => {
  const c = normalizeRequestorCapabilities(caps);
  return c.practice || c.lab;
};

/** 레거시 caps → kind/services (백필·resolve 폴백) */
export const profileFromLegacyCapabilities = (
  caps,
  { businessVerified = false } = {},
) => {
  const c = normalizeRequestorCapabilities(caps);
  if (!c.practice && !c.lab) {
    return { kind: null, services: { ...EMPTY_REQUESTOR_SERVICES } };
  }
  let kind = null;
  if (c.practice && c.lab) {
    kind = businessVerified ? "lab" : "practice";
  } else if (c.lab) {
    kind = "lab";
  } else {
    kind = "practice";
  }
  return { kind, services: { ...PAID_ONLY_SERVICES } };
};

/** 검색 결과 후처리 — 듀얼 caps·미백필 앵커를 resolve 결과와 맞춤 */
export const matchesRequestedRequestorKind = (anchor, requestedKind) => {
  const kind = normalizeRequestorKind(requestedKind);
  if (!kind) return true;
  const fromAnchor = normalizeRequestorKind(anchor?.requestorKind);
  if (fromAnchor) return fromAnchor === kind;
  const fromLegacy = profileFromLegacyCapabilities(anchor?.requestorCapabilities, {
    businessVerified: String(anchor?.status || "").trim() === "verified",
  });
  if (fromLegacy.kind) return fromLegacy.kind === kind;
  return false;
};

/** kind/services → 레거시 caps (응답 호환·이중 읽기) */
export const legacyCapabilitiesFromProfile = ({ kind, services } = {}) => {
  const k = normalizeRequestorKind(kind);
  const s = normalizeRequestorServices(services);
  if (!k || !hasAnyRequestorService(s)) {
    return { practice: false, lab: false };
  }
  return {
    practice: k === "practice",
    lab: k === "lab",
  };
};

/**
 * 앵커 우선(kind+services) → 앵커 레거시 caps → 유저 → 레거시 role 폴백.
 */
export const resolveRequestorProfile = ({
  anchorKind,
  anchorServices,
  anchorCaps,
  userKind,
  userServices,
  userCaps,
  userRole,
  businessVerified,
} = {}) => {
  const fromAnchorKind = normalizeRequestorKind(anchorKind);
  const fromAnchorServices = normalizeRequestorServices(anchorServices);
  if (fromAnchorKind && hasAnyRequestorService(fromAnchorServices)) {
    return { kind: fromAnchorKind, services: fromAnchorServices };
  }

  const fromAnchorLegacy = profileFromLegacyCapabilities(anchorCaps, {
    businessVerified,
  });
  if (fromAnchorLegacy.kind) return fromAnchorLegacy;

  const fromUserKind = normalizeRequestorKind(userKind);
  const fromUserServices = normalizeRequestorServices(userServices);
  if (fromUserKind && hasAnyRequestorService(fromUserServices)) {
    return { kind: fromUserKind, services: fromUserServices };
  }

  const fromUserLegacy = profileFromLegacyCapabilities(userCaps, {
    businessVerified,
  });
  if (fromUserLegacy.kind) return fromUserLegacy;

  if (userRole === "practice") {
    return { kind: "practice", services: { ...PAID_ONLY_SERVICES } };
  }
  if (userRole === "requestor" && businessVerified) {
    return { kind: "lab", services: { ...PAID_ONLY_SERVICES } };
  }
  if (userRole === "requestor") {
    return { kind: "practice", services: { ...PAID_ONLY_SERVICES } };
  }
  return { kind: null, services: { ...EMPTY_REQUESTOR_SERVICES } };
};

/** @deprecated resolveRequestorProfile 사용. 레거시 caps 형태로 반환 */
export const resolveRequestorCapabilities = (args = {}) => {
  const profile = resolveRequestorProfile(args);
  return legacyCapabilitiesFromProfile(profile);
};

/** 의뢰자 서비스 이용 시 사업자등록증 필수 */
export const requiresBusinessLicense = (servicesOrCaps) => {
  if (
    servicesOrCaps &&
    typeof servicesOrCaps === "object" &&
    ("free" in servicesOrCaps || "paid" in servicesOrCaps)
  ) {
    return hasAnyRequestorService(servicesOrCaps);
  }
  return hasAnyRequestorCapability(servicesOrCaps);
};

/** 유료 서비스 — paid + 사업자 검증 */
export const canUsePaidServices = ({
  businessVerified,
  services,
  caps,
  profile,
} = {}) => {
  const s =
    services ||
    profile?.services ||
    (caps
      ? profileFromLegacyCapabilities(caps, { businessVerified }).services
      : null);
  return (
    Boolean(businessVerified) && Boolean(normalizeRequestorServices(s).paid)
  );
};

/** @deprecated 기공의뢰서(free) 폐기 — 항상 false */
export const canUseFreeServices = () => false;

/** 기공의뢰서 발신: practice (free 플래그 불필요) */
export const canSendPracticeTransfer = (profileOrCaps) => {
  if (!profileOrCaps || typeof profileOrCaps !== "object") return false;
  if ("kind" in profileOrCaps || "services" in profileOrCaps) {
    return normalizeRequestorKind(profileOrCaps.kind) === "practice";
  }
  return Boolean(normalizeRequestorCapabilities(profileOrCaps).practice);
};

/** 기공의뢰서 수신: lab (free 플래그 불필요) */
export const canReceivePracticeTransfer = (profileOrCaps) => {
  if (!profileOrCaps || typeof profileOrCaps !== "object") return false;
  if ("kind" in profileOrCaps || "services" in profileOrCaps) {
    return normalizeRequestorKind(profileOrCaps.kind) === "lab";
  }
  return Boolean(normalizeRequestorCapabilities(profileOrCaps).lab);
};

/** User/Anchor $set 필드 — kind가 있으면 항상 paid-only */
export const requestorProfilePersistFields = (profile = {}) => {
  const kind = normalizeRequestorKind(profile.kind);
  return {
    requestorKind: kind,
    requestorServices: kind
      ? { ...PAID_ONLY_SERVICES }
      : { ...EMPTY_REQUESTOR_SERVICES },
  };
};

/** API 응답 필드 (레거시 caps는 파생 호환) */
export const requestorProfileResponseFields = (profile = {}) => {
  const kind = normalizeRequestorKind(profile.kind);
  const services = kind
    ? { ...PAID_ONLY_SERVICES }
    : { ...EMPTY_REQUESTOR_SERVICES };
  const normalized = { kind, services };
  return {
    requestorKind: kind,
    requestorServices: services,
    requestorCapabilities: legacyCapabilitiesFromProfile(normalized),
  };
};

/** API/저장용 정규화 — body에서 kind+services 또는 레거시 caps */
export const normalizeRequestorProfileInput = (body = {}) => {
  const kindFromBody = normalizeRequestorKind(body.requestorKind ?? body.kind);
  const servicesFromBody =
    body.requestorServices || body.services
      ? normalizeRequestorServices(body.requestorServices || body.services)
      : null;

  if (kindFromBody && servicesFromBody && hasAnyRequestorService(servicesFromBody)) {
    return { kind: kindFromBody, services: { ...PAID_ONLY_SERVICES } };
  }

  if (body.requestorCapabilities || body.practice != null || body.lab != null) {
    return profileFromLegacyCapabilities(
      body.requestorCapabilities || body,
      { businessVerified: Boolean(body.businessVerified) },
    );
  }

  if (kindFromBody) {
    return {
      kind: kindFromBody,
      services: { ...PAID_ONLY_SERVICES },
    };
  }

  return { kind: null, services: { ...EMPTY_REQUESTOR_SERVICES } };
};
