// related files:
// - web/frontend/src/shared/components/practice/PracticeAbutmentUploadOverdueAlert.tsx
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersCalendar.tsx
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
// - 2026-09-02: 수락·기한만료 후 24h/48h/도착일 경과 커스텀 어벗 STL 미업로드 경고.
// - 2026-09-02: 치과(practice) 문구 — 기공소 업로드 대기·문의 톤(업로드 CTA 없음).

export const PRACTICE_ABUTMENT_UPLOAD_OVERDUE_HOURS_YELLOW = 24;
export const PRACTICE_ABUTMENT_UPLOAD_OVERDUE_HOURS_RED = 48;

export type PracticeAbutmentUploadOverdueLevel = "yellow" | "red" | "deadline";

/** 치과=대기/문의 · 기공소=업로드 독촉 */
export type PracticeAbutmentUploadOverdueViewer = "practice" | "lab";

export const PRACTICE_ABUTMENT_UPLOAD_OVERDUE_YELLOW_LABEL =
  "어벗 업로드 대기";
export const PRACTICE_ABUTMENT_UPLOAD_OVERDUE_RED_LABEL = "어벗 업로드 지연";
export const PRACTICE_ABUTMENT_UPLOAD_OVERDUE_DEADLINE_LABEL = "기한 만료";

export const PRACTICE_ABUTMENT_UPLOAD_OVERDUE_TOOLTIP_YELLOW =
  "수락 후 24시간이 지났는데 커스텀 어벗 STL이 아직 업로드되지 않았습니다.";
export const PRACTICE_ABUTMENT_UPLOAD_OVERDUE_TOOLTIP_RED =
  "수락 후 48시간이 지났는데 커스텀 어벗 STL이 아직 업로드되지 않았습니다. 빠른 업로드를 부탁드립니다.";
export const PRACTICE_ABUTMENT_UPLOAD_OVERDUE_TOOLTIP_DEADLINE =
  "치과도착일이 지났으나 커스텀 어벗 STL이 아직 업로드되지 않았습니다. 즉시 업로드해 주세요.";

/** 치과 상세·캘린더 — 기공소가 아직 올리지 않음 */
export const PRACTICE_ABUTMENT_UPLOAD_OVERDUE_TOOLTIP_YELLOW_PRACTICE =
  "기공소 수락 후 24시간이 지났는데 커스텀 어벗 STL이 아직 업로드되지 않았습니다.";
export const PRACTICE_ABUTMENT_UPLOAD_OVERDUE_TOOLTIP_RED_PRACTICE =
  "기공소 수락 후 48시간이 지났는데 커스텀 어벗 STL이 아직 업로드되지 않았습니다. 기공소에 문의해 주세요.";
export const PRACTICE_ABUTMENT_UPLOAD_OVERDUE_TOOLTIP_DEADLINE_PRACTICE =
  "치과도착일이 지났으나 기공소에서 커스텀 어벗 STL을 아직 올리지 않았습니다. 기공소에 문의해 주세요.";

export const PRACTICE_ABUTMENT_UPLOAD_OVERDUE_DETAIL_LAB =
  "커스텀 어벗 STL을 업로드해 주세요.";
/** 치과 배너 — 모달 폭에서 한 줄 유지(상세는 툴팁) */
export const PRACTICE_ABUTMENT_UPLOAD_OVERDUE_DETAIL_PRACTICE =
  "기공소 업로드 대기 중";

const MS_PER_HOUR = 60 * 60 * 1000;

/** 의뢰수락·기한만료(업로드 대기) — 작업완료·취소 제외 */
export function isPracticeTransferPendingAbutmentUploadStatus(
  status: unknown,
): boolean {
  const s = String(status || "").trim();
  return s === "의뢰수락" || s === "다운로드완료" || s === "기한만료";
}

/** @deprecated isPracticeTransferPendingAbutmentUploadStatus */
export const isPracticeTransferAcceptedPendingAbutmentUpload =
  isPracticeTransferPendingAbutmentUploadStatus;

export function resolvePracticeAbutmentUploadOverdueLevel(opts: {
  status: unknown;
  requestorDownloadedAt?: string | number | Date | null;
  requestorAcceptedAt?: string | number | Date | null;
  arrivalDeadlineExpiredAt?: string | number | Date | null;
  needsAbutmentUpload?: boolean;
  now?: Date;
}): PracticeAbutmentUploadOverdueLevel | null {
  if (!opts.needsAbutmentUpload) return null;
  if (!isPracticeTransferPendingAbutmentUploadStatus(opts.status)) return null;

  if (
    opts.arrivalDeadlineExpiredAt != null &&
    String(opts.arrivalDeadlineExpiredAt || "").trim()
  ) {
    return "deadline";
  }

  const raw =
    opts.requestorDownloadedAt ??
    opts.requestorAcceptedAt ??
    null;
  if (raw == null || raw === "") return null;

  const acceptedMs = new Date(raw).getTime();
  if (!Number.isFinite(acceptedMs) || acceptedMs <= 0) return null;

  const nowMs = (opts.now ?? new Date()).getTime();
  const hours = (nowMs - acceptedMs) / MS_PER_HOUR;

  if (hours >= PRACTICE_ABUTMENT_UPLOAD_OVERDUE_HOURS_RED) return "red";
  if (hours >= PRACTICE_ABUTMENT_UPLOAD_OVERDUE_HOURS_YELLOW) return "yellow";
  return null;
}

export function getPracticeAbutmentUploadOverdueLabel(
  level: PracticeAbutmentUploadOverdueLevel,
): string {
  if (level === "deadline") return PRACTICE_ABUTMENT_UPLOAD_OVERDUE_DEADLINE_LABEL;
  return level === "red"
    ? PRACTICE_ABUTMENT_UPLOAD_OVERDUE_RED_LABEL
    : PRACTICE_ABUTMENT_UPLOAD_OVERDUE_YELLOW_LABEL;
}

export function getPracticeAbutmentUploadOverdueDetail(
  viewer: PracticeAbutmentUploadOverdueViewer = "lab",
): string {
  return viewer === "practice"
    ? PRACTICE_ABUTMENT_UPLOAD_OVERDUE_DETAIL_PRACTICE
    : PRACTICE_ABUTMENT_UPLOAD_OVERDUE_DETAIL_LAB;
}

export function getPracticeAbutmentUploadOverdueTooltip(
  level: PracticeAbutmentUploadOverdueLevel,
  viewer: PracticeAbutmentUploadOverdueViewer = "lab",
): string {
  if (viewer === "practice") {
    if (level === "deadline") {
      return PRACTICE_ABUTMENT_UPLOAD_OVERDUE_TOOLTIP_DEADLINE_PRACTICE;
    }
    return level === "red"
      ? PRACTICE_ABUTMENT_UPLOAD_OVERDUE_TOOLTIP_RED_PRACTICE
      : PRACTICE_ABUTMENT_UPLOAD_OVERDUE_TOOLTIP_YELLOW_PRACTICE;
  }
  if (level === "deadline") return PRACTICE_ABUTMENT_UPLOAD_OVERDUE_TOOLTIP_DEADLINE;
  return level === "red"
    ? PRACTICE_ABUTMENT_UPLOAD_OVERDUE_TOOLTIP_RED
    : PRACTICE_ABUTMENT_UPLOAD_OVERDUE_TOOLTIP_YELLOW;
}

/** 치과 최근전송·캘린더 — CA 있고 디자인 없는 수락·기한만료 건 */
export function resolvePracticeRecentTransferAbutmentUploadOverdue(opts: {
  status: unknown;
  hasCustomAbutment?: boolean;
  designFileCount?: unknown;
  designFiles?: unknown;
  designReadyAt?: unknown;
  requestorDownloadedAt?: string | number | Date | null;
  requestorAcceptedAt?: string | number | Date | null;
  arrivalDeadlineExpiredAt?: string | number | Date | null;
  now?: Date;
}): PracticeAbutmentUploadOverdueLevel | null {
  const designN = Math.max(
    Number(opts.designFileCount || 0) || 0,
    Array.isArray(opts.designFiles) ? opts.designFiles.length : 0,
  );
  const needsUpload =
    Boolean(opts.hasCustomAbutment) &&
    designN <= 0 &&
    !Boolean(opts.designReadyAt);
  return resolvePracticeAbutmentUploadOverdueLevel({
    status: opts.status,
    requestorDownloadedAt: opts.requestorDownloadedAt,
    requestorAcceptedAt: opts.requestorAcceptedAt,
    arrivalDeadlineExpiredAt: opts.arrivalDeadlineExpiredAt,
    needsAbutmentUpload: needsUpload,
    now: opts.now,
  });
}
