/**
 * 상단 상태 뱃지 「확인할 건수」큐 — 상세/채팅을 열면 transferId를 클리어해 헤더 숫자가 줄어든다.
 * 채팅 unread>0 이면 클리어해도 다시 카운트(새 메시지).
 * 캘린더·목록 칩의 빨간 unread 배지에는 쓰지 않는다(실제 채팅 unread만).
 *
 * related files:
 * - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
 * - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 */
const STORAGE_PREFIX = "practice_status_badge_cleared_v1:";

export const PRACTICE_STATUS_BADGE_CLEARED_EVENT =
  "abuts:practice-status-badge:cleared";

export type PracticeStatusBadgeClearedDetail = {
  scopeKey: string;
  transferIds: string[];
  clearedIds: string[];
};

const normalizeScopeKey = (scopeKey: unknown) => {
  const key = String(scopeKey || "").trim();
  return key || "anon";
};

const normalizeTransferId = (transferId: unknown) =>
  String(transferId || "").trim();

export const readPracticeStatusBadgeClearedIds = (
  scopeKey: unknown,
): Set<string> => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(
      `${STORAGE_PREFIX}${normalizeScopeKey(scopeKey)}`,
    );
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.map((id) => normalizeTransferId(id)).filter(Boolean),
    );
  } catch {
    return new Set();
  }
};

const writePracticeStatusBadgeClearedIds = (
  scopeKey: unknown,
  ids: ReadonlySet<string>,
) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}${normalizeScopeKey(scopeKey)}`,
      JSON.stringify(Array.from(ids)),
    );
  } catch {
    // ignore quota / private mode
  }
};

/** 상세·채팅 오픈 시 호출 — 헤더 뱃지 카운터에서 제외. */
export const markPracticeStatusBadgeTransfersCleared = (
  scopeKey: unknown,
  transferIdsRaw: readonly unknown[],
): Set<string> => {
  const scope = normalizeScopeKey(scopeKey);
  const next = readPracticeStatusBadgeClearedIds(scope);
  const added: string[] = [];
  for (const raw of transferIdsRaw) {
    const id = normalizeTransferId(raw);
    if (!id || id === "-") continue;
    if (next.has(id)) continue;
    next.add(id);
    added.push(id);
  }
  if (added.length === 0) return next;
  writePracticeStatusBadgeClearedIds(scope, next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<PracticeStatusBadgeClearedDetail>(
        PRACTICE_STATUS_BADGE_CLEARED_EVENT,
        {
          detail: {
            scopeKey: scope,
            transferIds: added,
            clearedIds: Array.from(next),
          },
        },
      ),
    );
  }
  return next;
};

/**
 * 헤더 뱃지 큐에 남을 건 — 아직 안 열었거나, 채팅 안읽음이 다시 생긴 건.
 * (캘린더 칩 unread 표시에는 사용하지 말 것)
 */
export const isPracticeStatusBadgeQueueTransfer = (
  transfer: { transferId?: unknown; unreadCount?: unknown },
  clearedIds: ReadonlySet<string>,
) => {
  if (Math.max(0, Number(transfer.unreadCount || 0)) > 0) return true;
  const id = normalizeTransferId(transfer.transferId);
  if (!id || id === "-") return false;
  return !clearedIds.has(id);
};
