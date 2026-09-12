// change-log:
// - 2026-09-13: 기공의뢰·기공의뢰수신 캘린더/목록 커서(YMD) localStorage 유지 — 릴로드 후 직전 위치 복원
// related files:
// - web/frontend/src/shared/practice/labReceiveCalendarViewMode.ts
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/date/kst.ts

const STORAGE_KEY = "abuts.labReceiveCalendarCursorYmd.v1";
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export const normalizeLabReceiveCalendarCursorYmd = (
  raw: unknown,
): string | null => {
  const value = String(raw || "").trim();
  if (!YMD_RE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  // civil calendar sanity (reject 2026-13-40 etc.)
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  return value;
};

export function readStoredLabReceiveCalendarCursorYmd(
  fallback = "",
): string {
  try {
    return (
      normalizeLabReceiveCalendarCursorYmd(localStorage.getItem(STORAGE_KEY)) ||
      normalizeLabReceiveCalendarCursorYmd(fallback) ||
      ""
    );
  } catch {
    return normalizeLabReceiveCalendarCursorYmd(fallback) || "";
  }
}

export function writeStoredLabReceiveCalendarCursorYmd(ymd: string): void {
  const next = normalizeLabReceiveCalendarCursorYmd(ymd);
  if (!next) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // quota / private mode — ignore
  }
}
