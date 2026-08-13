// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/user.model.js
// - web/backend/controllers/businesses/business.controller.js
// - web/frontend/src/shared/business/requestorCapabilities.ts

/**
 * 의뢰자 SSOT:
 * - requestorKind: "practice" | "lab" (XOR) — 치과(기공실) / 기공소
 * - requestorServices: { free, paid } (OR, 최소 1) — 기공의뢰서 / 생산의뢰
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

export const normalizeRequestorServices = (raw) => ({
  free: Boolean(raw?.free),
  paid: Boolean(raw?.paid),
});

export const hasAnyRequestorService = (services) => {
  const s = normalizeRequestorServices(services);
  return s.free || s.paid;
};

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
    return { kind: null, services: { free: false, paid: false } };
  }
  let kind = null;
  if (c.practice && c.lab) {
    kind = businessVerified ? "lab" : "practice";
  } else if (c.lab) {
    kind = "lab";
  } else {
    kind = "practice";
  }
  // 구 모델: practice=무료 발신, lab=수신(+검증 시 유료)
  const free = true;
  const paid = Boolean(c.lab && businessVerified);
  return { kind, services: { free, paid } };
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
    return { kind: "practice", services: { free: true, paid: false } };
  }
  if (userRole === "requestor" && businessVerified) {
    return { kind: "lab", services: { free: true, paid: true } };
  }
  if (userRole === "requestor") {
    return { kind: "practice", services: { free: true, paid: false } };
  }
  return { kind: null, services: { free: false, paid: false } };
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

/** 무료 서비스 — 기공의뢰서 */
export const canUseFreeServices = (servicesOrProfileOrCaps) => {
  if (!servicesOrProfileOrCaps || typeof servicesOrProfileOrCaps !== "object") {
    return false;
  }
  if ("services" in servicesOrProfileOrCaps) {
    return Boolean(
      normalizeRequestorServices(servicesOrProfileOrCaps.services).free,
    );
  }
  if ("free" in servicesOrProfileOrCaps || "paid" in servicesOrProfileOrCaps) {
    return Boolean(normalizeRequestorServices(servicesOrProfileOrCaps).free);
  }
  // 레거시: practice면 무료
  return Boolean(
    normalizeRequestorCapabilities(servicesOrProfileOrCaps).practice,
  );
};

/** 기공의뢰서 발신: practice + free */
export const canSendPracticeTransfer = (profileOrCaps) => {
  if (!profileOrCaps || typeof profileOrCaps !== "object") return false;
  if ("kind" in profileOrCaps || "services" in profileOrCaps) {
    return (
      normalizeRequestorKind(profileOrCaps.kind) === "practice" &&
      Boolean(normalizeRequestorServices(profileOrCaps.services).free)
    );
  }
  return Boolean(normalizeRequestorCapabilities(profileOrCaps).practice);
};

/** 기공의뢰서 수신: lab + free */
export const canReceivePracticeTransfer = (profileOrCaps) => {
  if (!profileOrCaps || typeof profileOrCaps !== "object") return false;
  if ("kind" in profileOrCaps || "services" in profileOrCaps) {
    return (
      normalizeRequestorKind(profileOrCaps.kind) === "lab" &&
      Boolean(normalizeRequestorServices(profileOrCaps.services).free)
    );
  }
  return Boolean(normalizeRequestorCapabilities(profileOrCaps).lab);
};

/** User/Anchor $set 필드 */
export const requestorProfilePersistFields = (profile = {}) => {
  const kind = normalizeRequestorKind(profile.kind);
  const services = normalizeRequestorServices(profile.services);
  return {
    requestorKind: kind,
    requestorServices: services,
  };
};

/** API 응답 필드 (레거시 caps는 파생 호환) */
export const requestorProfileResponseFields = (profile = {}) => {
  const kind = normalizeRequestorKind(profile.kind);
  const services = normalizeRequestorServices(profile.services);
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
    return { kind: kindFromBody, services: servicesFromBody };
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
      services: servicesFromBody || { free: false, paid: false },
    };
  }

  return { kind: null, services: { free: false, paid: false } };
};
