/**
 * 상단 상태 뱃지 「확인 큐」.
 * - 미확인(채팅) unread>0 → 항상 큐(찾아가기용)
 * - 미처리(작업큐): 작업시작 전 의뢰·조치 필요 취소 → 열람만으로 빠지지 않음
 * - 그 외 → 상세/채팅을 열면 transferId 클리어로 감소
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

/** 상세·채팅 오픈 시 호출 — 헤더 뱃지 카운터에서 제외(조치 전 상태는 무시됨). */
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

/** 작업시작 전 의뢰 — 열람만으로 확인 큐에서 제거하지 않음. */
export const isPracticeStatusBadgePendingStartStatus = (status: unknown) => {
  const s = String(status || "").trim();
  return (
    s === "발송완료" ||
    s === "수신완료" ||
    s === "자동매칭" ||
    s === "하청대기"
  );
};

/** 치과 조치 필요 취소 — 열람만으로 확인 큐에서 제거하지 않음. */
export const isPracticeStatusBadgePendingActionStatus = (status: unknown) => {
  const s = String(status || "").trim();
  return s === "작업취소" || s === "거부";
};

/**
 * 헤더·목록 확인 큐에 남을 건.
 * 미확인(채팅) unread, 또는 미처리(작업시작/조치 전), 또는 아직 안 연 건.
 * 미처리만 셀 때는 unreadCount: 0 으로 호출.
 */
export const isPracticeStatusBadgeQueueTransfer = (
  transfer: {
    transferId?: unknown;
    unreadCount?: unknown;
    status?: unknown;
  },
  clearedIds: ReadonlySet<string>,
) => {
  if (Math.max(0, Number(transfer.unreadCount || 0)) > 0) return true;
  const status = String(transfer.status || "").trim();
  if (isPracticeStatusBadgePendingStartStatus(status)) return true;
  if (isPracticeStatusBadgePendingActionStatus(status)) return true;
  const id = normalizeTransferId(transfer.transferId);
  if (!id || id === "-") return false;
  return !clearedIds.has(id);
};
