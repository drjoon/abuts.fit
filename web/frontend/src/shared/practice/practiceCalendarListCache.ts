// 발신 목록(일정) 마지막 응답. 새로고침 때 빈 칸 대신 직전 목록을 바로 그린다.
import { toKstYmd } from "@/shared/date/kst";
import { useAuthStore } from "@/store/useAuthStore";
import { normalizeLabReceiveCalendarDateKey } from "@/shared/practice/labReceiveCalendarDateKey";
import { readStoredLabReceiveCalendarCursorYmd } from "@/shared/practice/labReceiveCalendarCursorYmd";
import { readStoredLabReceiveCalendarViewMode } from "@/shared/practice/labReceiveCalendarViewMode";
import { buildLabReceiveCalendarFetchYmdRange } from "@/shared/practice/labReceiveCalendarYmdRange";
import type { PracticeRecentRequestItem } from "@/shared/practice/practiceRecentTransferList";

const STORAGE_KEY = "abuts.practiceCalendarSend.v1";
const TTL_MS = 6 * 60 * 60 * 1000;

export function practiceCalendarListCacheKey(parts: {
  anchorId: string;
  dateKey: string;
  fromYmd: string;
  toYmd: string;
}): string {
  return [parts.anchorId, parts.dateKey, parts.fromYmd, parts.toYmd].join("|");
}

export function readPracticeCalendarListCache(
  key: string,
): PracticeRecentRequestItem[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      key?: string;
      savedAt?: number;
      requests?: unknown;
    };
    if (parsed.key !== key) return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > TTL_MS) return null;
    if (!Array.isArray(parsed.requests) || parsed.requests.length === 0) return null;
    return parsed.requests as PracticeRecentRequestItem[];
  } catch {
    return null;
  }
}

export function writePracticeCalendarListCache(
  key: string,
  requests: PracticeRecentRequestItem[],
): void {
  if (!key || requests.length === 0) return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ key, savedAt: Date.now(), requests }),
    );
  } catch {
    // quota / private mode
  }
}

/** 첫 렌더 — 저장된 커서·보기와 같은 구간의 캐시만 쓴다. */
export function readInitialSendCalendarCache(): PracticeRecentRequestItem[] {
  const cursor =
    readStoredLabReceiveCalendarCursorYmd() || toKstYmd(new Date()) || "";
  const mode = readStoredLabReceiveCalendarViewMode();
  const range = buildLabReceiveCalendarFetchYmdRange(cursor, mode);
  const user = useAuthStore.getState().user;
  const dateKey = normalizeLabReceiveCalendarDateKey(
    user?.labReceiveCalendarDateKey,
  );
  const anchorId = String(user?.businessAnchorId || "");
  const key = practiceCalendarListCacheKey({
    anchorId,
    dateKey,
    fromYmd: range.fromYmd,
    toYmd: range.toYmd,
  });
  return readPracticeCalendarListCache(key) ?? [];
}
