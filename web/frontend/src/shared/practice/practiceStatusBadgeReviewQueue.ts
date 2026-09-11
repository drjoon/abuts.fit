/**
 * 상단 상태 뱃지 「확인 큐」.
 * - 미확인(채팅) unread>0 → 항상 큐(찾아가기용)
 * - 미처리(작업큐): 작업시작 전 의뢰 → 열람만으로 빠지지 않음(본문 건수도 전체 유지)
 * - 완료·취소·어벗 → 상세/채팅을 열면 계정 preferences에 transferId 저장 → 본문 건수·큐에서 감소
 * - 작업시작 이후(진행중) → 열면 큐 하이라이트만 감소(본문 건수는 전체 유지)
 *
 * related files:
 * - web/frontend/src/shared/practice/practiceStatusBadgeClearedTransferIds.ts
 * - web/frontend/src/store/useAuthStore.ts
 * - web/backend/controllers/users/user.controller.js
 * - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
 * - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 * - web/frontend/src/shared/practice/practiceRecentTransferList.ts
 */
import { apiFetch } from "@/shared/api/apiClient";
import { normalizePracticeStatusBadgeClearedTransferIds } from "@/shared/practice/practiceStatusBadgeClearedTransferIds";
import { useAuthStore } from "@/store/useAuthStore";

/** @deprecated 레거시 브라우저 저장 — 계정 prefs로 1회 이전 후 삭제 */
const LEGACY_STORAGE_PREFIX = "practice_status_badge_cleared_v1:";

export const PRACTICE_STATUS_BADGE_CLEARED_EVENT =
  "abuts:practice-status-badge:cleared";

export type PracticeStatusBadgeClearedDetail = {
  transferIds: string[];
  clearedIds: string[];
};

const normalizeTransferId = (transferId: unknown) =>
  String(transferId || "").trim();

const readLegacyLocalClearedIds = (userId: unknown): string[] => {
  if (typeof window === "undefined") return [];
  const key = String(userId || "").trim();
  if (!key) return [];
  try {
    const raw = localStorage.getItem(`${LEGACY_STORAGE_PREFIX}${key}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizePracticeStatusBadgeClearedTransferIds(parsed);
  } catch {
    return [];
  }
};

const clearLegacyLocalClearedIds = (userId: unknown) => {
  if (typeof window === "undefined") return;
  const key = String(userId || "").trim();
  if (!key) return;
  try {
    localStorage.removeItem(`${LEGACY_STORAGE_PREFIX}${key}`);
  } catch {
    // ignore
  }
};

const persistClearedTransferIdsToAccount = (
  transferIds: readonly string[],
) => {
  const token = useAuthStore.getState().token;
  if (!token || transferIds.length === 0) return;
  void apiFetch({
    path: "/api/users/practice-status-badge-cleared-transfer-ids",
    method: "PUT",
    token,
    jsonBody: { transferIds: [...transferIds] },
  }).catch(() => {
    // 저장 실패는 UX를 막지 않음 — 다음 로그인 시 서버 값으로 복원
  });
};

const emitClearedEvent = (added: string[], clearedIds: string[]) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PracticeStatusBadgeClearedDetail>(
      PRACTICE_STATUS_BADGE_CLEARED_EVENT,
      {
        detail: {
          transferIds: added,
          clearedIds,
        },
      },
    ),
  );
};

/** 계정 preferences(+메모리)에서 열람 제외 transferId Set. */
export const readPracticeStatusBadgeClearedIds = (
  _scopeKey?: unknown,
): Set<string> => {
  const ids =
    useAuthStore.getState().user?.practiceStatusBadgeClearedTransferIds || [];
  return new Set(normalizePracticeStatusBadgeClearedTransferIds(ids));
};

/**
 * 예전 localStorage 값을 계정 preferences로 1회 이전.
 * 페이지 마운트 시 호출.
 */
export const migratePracticeStatusBadgeClearedFromLegacyLocalStorage =
  (): void => {
    const { user, token, setPracticeStatusBadgeClearedTransferIds } =
      useAuthStore.getState();
    if (!user?.id || !token) return;
    const legacy = readLegacyLocalClearedIds(user.id);
    if (legacy.length === 0) return;
    clearLegacyLocalClearedIds(user.id);
    const current = normalizePracticeStatusBadgeClearedTransferIds(
      user.practiceStatusBadgeClearedTransferIds,
    );
    const merged = normalizePracticeStatusBadgeClearedTransferIds([
      ...current,
      ...legacy,
    ]);
    const added = merged.filter((id) => !current.includes(id));
    if (added.length === 0) return;
    setPracticeStatusBadgeClearedTransferIds(merged);
    persistClearedTransferIdsToAccount(added);
    emitClearedEvent(added, merged);
  };

/**
 * 상세·채팅 오픈 시 호출 — 완료·취소·어벗 본문 건수·확인 큐에서 제외.
 * 계정 preferences에 저장(낙관적 반영 + fire-and-forget PUT).
 *
 * 호출 형태:
 * - markPracticeStatusBadgeTransfersCleared([id])
 * - markPracticeStatusBadgeTransfersCleared(scopeKey, [id]) — scopeKey는 무시(레거시)
 */
export const markPracticeStatusBadgeTransfersCleared = (
  scopeKeyOrIds: unknown,
  transferIdsRaw?: readonly unknown[],
): Set<string> => {
  const rawList: readonly unknown[] = Array.isArray(transferIdsRaw)
    ? transferIdsRaw
    : Array.isArray(scopeKeyOrIds)
      ? scopeKeyOrIds
      : [];

  const { user, setPracticeStatusBadgeClearedTransferIds } =
    useAuthStore.getState();
  const current = normalizePracticeStatusBadgeClearedTransferIds(
    user?.practiceStatusBadgeClearedTransferIds,
  );
  const nextSet = new Set(current);
  const added: string[] = [];
  for (const raw of rawList) {
    const id = normalizeTransferId(raw);
    if (!id || id === "-") continue;
    if (nextSet.has(id)) continue;
    nextSet.add(id);
    added.push(id);
  }
  if (added.length === 0) return nextSet;

  const next = normalizePracticeStatusBadgeClearedTransferIds([
    ...current,
    ...added,
  ]);
  setPracticeStatusBadgeClearedTransferIds(next);
  persistClearedTransferIdsToAccount(added);
  emitClearedEvent(added, next);
  return new Set(next);
};

/** 작업시작 전 의뢰 — 열람만으로 확인 큐·본문 건수에서 제거하지 않음. */
export const isPracticeStatusBadgePendingStartStatus = (status: unknown) => {
  const s = String(status || "").trim();
  return (
    s === "발송완료" ||
    s === "수신완료" ||
    s === "자동매칭" ||
    s === "하청대기"
  );
};

/**
 * 헤더·목록 확인 큐에 남을 건.
 * 미확인(채팅) unread, 또는 미처리(작업시작 전), 또는 아직 안 연 건.
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
  const id = normalizeTransferId(transfer.transferId);
  if (!id || id === "-") return false;
  return !clearedIds.has(id);
};
