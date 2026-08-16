// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/services/labAutoMatchParticipation.service.js
// - web/backend/controllers/devops/practiceTransferAutoMatch.controller.js
// - web/frontend/src/shared/practice/abutsLabCertification.ts
// change-log:
// - 2026-08-16: 상태 라벨 — 미신청/신청중/테스트중/인증/인증보류.
// - 2026-08-16: 기공소 어벗츠 인증 신청·기공 테스트·인증 SSOT.
// - 2026-08-16: API status는 DB 그대로(레거시 풀 ON → virtual certified 승격 제거).

export const ABUTS_LAB_CERT_STATUSES = [
  "none",
  "applied",
  "testing",
  "certified",
  "rejected",
];

export const ABUTS_LAB_CERT_STATUS = {
  NONE: "none",
  APPLIED: "applied",
  TESTING: "testing",
  CERTIFIED: "certified",
  REJECTED: "rejected",
};

export const ABUTS_LAB_TEST_STATUSES = ["none", "pending", "passed", "failed"];

export const ABUTS_LAB_TEST_STATUS = {
  NONE: "none",
  PENDING: "pending",
  PASSED: "passed",
  FAILED: "failed",
};

export const ABUTS_LAB_CERT_MEMO_MAX = 2000;

export const ABUTS_LAB_CERT_STATUS_LABEL = {
  none: "미신청",
  applied: "신청중",
  testing: "테스트중",
  certified: "인증",
  rejected: "인증보류",
};

export const ABUTS_LAB_TEST_STATUS_LABEL = {
  none: "미실시",
  pending: "대기/진행",
  passed: "통과",
  failed: "미통과",
};

export function normalizeAbutsLabCertStatus(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (ABUTS_LAB_CERT_STATUSES.includes(raw)) return raw;
  return ABUTS_LAB_CERT_STATUS.NONE;
}

export function normalizeAbutsLabTestStatus(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (ABUTS_LAB_TEST_STATUSES.includes(raw)) return raw;
  return ABUTS_LAB_TEST_STATUS.NONE;
}

export function normalizeAbutsLabCertMemo(value) {
  return String(value || "")
    .trim()
    .slice(0, ABUTS_LAB_CERT_MEMO_MAX);
}

/**
 * API/UI용 정규화.
 * DB status를 그대로 노출(미신청 안내 배너가 레거시 풀 ON에 가려지지 않게).
 * 풀 자격은 practiceTransferAutoMatchEnabled / isAbutsLabCertificationCertified.
 */
export function toAbutsLabCertificationApi(anchor) {
  const raw =
    anchor?.abutsLabCertification &&
    typeof anchor.abutsLabCertification === "object"
      ? anchor.abutsLabCertification
      : {};
  return {
    status: normalizeAbutsLabCertStatus(raw.status),
    testStatus: normalizeAbutsLabTestStatus(raw.testStatus),
    memo: normalizeAbutsLabCertMemo(raw.memo),
    appliedAt: raw.appliedAt ? new Date(raw.appliedAt).toISOString() : null,
    testedAt: raw.testedAt ? new Date(raw.testedAt).toISOString() : null,
    certifiedAt: raw.certifiedAt
      ? new Date(raw.certifiedAt).toISOString()
      : null,
    rejectedAt: raw.rejectedAt ? new Date(raw.rejectedAt).toISOString() : null,
  };
}

export function isAbutsLabCertificationCertified(anchor) {
  const cert = toAbutsLabCertificationApi(anchor);
  return (
    cert.status === ABUTS_LAB_CERT_STATUS.CERTIFIED ||
    Boolean(anchor?.practiceTransferAutoMatchEnabled)
  );
}

export function canLabApplyAbutsCertification(anchor) {
  const status = toAbutsLabCertificationApi(anchor).status;
  return (
    status === ABUTS_LAB_CERT_STATUS.NONE ||
    status === ABUTS_LAB_CERT_STATUS.REJECTED
  );
}

export function canLabJoinAutoMatchAfterCertification(anchor) {
  return isAbutsLabCertificationCertified(anchor);
}

export function buildCertificationApplySet(now = new Date()) {
  return {
    "abutsLabCertification.status": ABUTS_LAB_CERT_STATUS.APPLIED,
    "abutsLabCertification.appliedAt": now,
    "abutsLabCertification.rejectedAt": null,
  };
}

export function buildCertificationTestingSet(now = new Date()) {
  return {
    "abutsLabCertification.status": ABUTS_LAB_CERT_STATUS.TESTING,
    "abutsLabCertification.testStatus": ABUTS_LAB_TEST_STATUS.PENDING,
    "abutsLabCertification.testedAt": now,
  };
}

export function buildCertificationPassedFields(now = new Date()) {
  return {
    "abutsLabCertification.status": ABUTS_LAB_CERT_STATUS.CERTIFIED,
    "abutsLabCertification.testStatus": ABUTS_LAB_TEST_STATUS.PASSED,
    "abutsLabCertification.testedAt": now,
    "abutsLabCertification.certifiedAt": now,
    "abutsLabCertification.rejectedAt": null,
  };
}

export function buildCertificationRejectedFields({
  testStatus = ABUTS_LAB_TEST_STATUS.FAILED,
  now = new Date(),
} = {}) {
  return {
    "abutsLabCertification.status": ABUTS_LAB_CERT_STATUS.REJECTED,
    "abutsLabCertification.testStatus": normalizeAbutsLabTestStatus(testStatus),
    "abutsLabCertification.testedAt": now,
    "abutsLabCertification.rejectedAt": now,
  };
}
