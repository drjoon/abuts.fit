// related files:
// - web/backend/utils/abutsLabCertification.js
// - web/frontend/src/features/settings/tabs/LabAutoMatchParticipationTab.tsx
// - web/frontend/src/pages/devops/components/PracticeTransferAutoMatchTab.tsx
// change-log:
// - 2026-08-16: 상태 라벨 — 미신청/신청중/테스트중/인증/인증보류.
// - 2026-08-16: 기공소 어벗츠 인증 신청·테스트·상태 라벨 SSOT(FE).
// - 2026-08-16: parse 시 풀 ON → certified 승격 제거(미신청 배너용).

export const ABUTS_LAB_CERT_STATUSES = [
  "none",
  "applied",
  "testing",
  "certified",
  "rejected",
] as const;

export type AbutsLabCertStatus = (typeof ABUTS_LAB_CERT_STATUSES)[number];

export const ABUTS_LAB_TEST_STATUSES = [
  "none",
  "pending",
  "passed",
  "failed",
] as const;

export type AbutsLabTestStatus = (typeof ABUTS_LAB_TEST_STATUSES)[number];

export const ABUTS_LAB_CERT_MEMO_MAX = 2000;

export const ABUTS_LAB_CERT_STATUS_LABEL: Record<AbutsLabCertStatus, string> = {
  none: "미신청",
  applied: "신청중",
  testing: "테스트중",
  certified: "인증",
  rejected: "인증보류",
};

export const ABUTS_LAB_TEST_STATUS_LABEL: Record<AbutsLabTestStatus, string> = {
  none: "미실시",
  pending: "대기/진행",
  passed: "통과",
  failed: "미통과",
};

export type AbutsLabCertificationPublic = {
  status: AbutsLabCertStatus;
  testStatus: AbutsLabTestStatus;
  memo: string;
  appliedAt?: string | null;
  testedAt?: string | null;
  certifiedAt?: string | null;
  rejectedAt?: string | null;
};

export function normalizeAbutsLabCertStatus(
  value: unknown,
): AbutsLabCertStatus {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if ((ABUTS_LAB_CERT_STATUSES as readonly string[]).includes(raw)) {
    return raw as AbutsLabCertStatus;
  }
  return "none";
}

export function normalizeAbutsLabTestStatus(
  value: unknown,
): AbutsLabTestStatus {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if ((ABUTS_LAB_TEST_STATUSES as readonly string[]).includes(raw)) {
    return raw as AbutsLabTestStatus;
  }
  return "none";
}

export function normalizeAbutsLabCertMemo(value: unknown): string {
  return String(value || "")
    .trim()
    .slice(0, ABUTS_LAB_CERT_MEMO_MAX);
}

export function parseAbutsLabCertification(
  raw: unknown,
  // enabled는 호환용(무시). 풀 ON만으로 certified 승격하지 않음.
  _opts: { enabled?: boolean } = {},
): AbutsLabCertificationPublic {
  const row =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    status: normalizeAbutsLabCertStatus(row.status),
    testStatus: normalizeAbutsLabTestStatus(row.testStatus),
    memo: normalizeAbutsLabCertMemo(row.memo),
    appliedAt: row.appliedAt ? String(row.appliedAt) : null,
    testedAt: row.testedAt ? String(row.testedAt) : null,
    certifiedAt: row.certifiedAt ? String(row.certifiedAt) : null,
    rejectedAt: row.rejectedAt ? String(row.rejectedAt) : null,
  };
}
