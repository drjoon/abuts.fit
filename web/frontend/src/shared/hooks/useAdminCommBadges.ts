// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/realtime/socket.ts
// - web/frontend/src/pages/admin/AdminChannelsPage.tsx
// - web/frontend/src/pages/admin/AdminMembersPage.tsx
// - web/frontend/src/pages/admin/AdminFinancePage.tsx
// change-log:
// - 2026-09-18: member·finance·tax 액션대기 키·절대 count 반영; 회원·재무 사이드 합산.
// - 2026-09-18: 레이아웃·허브 공유 zustand; 채널은 방문 clear 없이 true unread; 소켓 구독 1회.
// - 2026-09-06: 지원·채널 허브 합산 배지·탭 단위 clear.
// - 2026-09-06: remoteSupport 배지 키·href 추가.
// - 2026-08-26: 초기 fetch가 방문 clear를 덮어쓰지 않도록 cleared 키 유지.
import { useEffect, useCallback } from "react";
import { create } from "zustand";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { onAppEvent } from "@/shared/realtime/socket";

export type CommBadgeKey =
  | "request"
  | "chat"
  | "mail"
  | "inquiry"
  | "sms"
  | "remoteSupport"
  | "member"
  | "finance"
  | "tax";

export type CommBadgeCounts = Record<CommBadgeKey, number>;

const COMM_BADGE_HREFS: Record<string, CommBadgeKey> = {
  "/dashboard/monitoring": "request",
  "/dashboard/chat-management": "chat",
  "/dashboard/channels": "chat",
  "/dashboard/sms": "sms",
  "/dashboard/mail": "mail",
  "/dashboard/inquiries": "inquiry",
  "/dashboard/support": "remoteSupport",
  "/dashboard/remote-support": "remoteSupport",
  "/dashboard/members": "member",
  "/dashboard/finance": "finance",
};

const HUB_BADGE_KEYS: Record<string, CommBadgeKey[]> = {
  "/dashboard/support": ["remoteSupport", "inquiry"],
  "/dashboard/channels": ["chat", "sms", "mail"],
  "/dashboard/monitoring": ["request"],
  "/dashboard/members": ["member"],
  "/dashboard/finance": ["finance", "tax"],
};

const TAB_BADGE_KEYS: Record<string, CommBadgeKey> = {
  remote: "remoteSupport",
  inquiries: "inquiry",
  chat: "chat",
  sms: "sms",
  mail: "mail",
};

/** 채널·회원·재무는 실제 대기/unread 유지 (방문 시 0으로 지우지 않음) */
const TRUE_COUNT_KEYS: CommBadgeKey[] = [
  "chat",
  "sms",
  "mail",
  "member",
  "finance",
  "tax",
];

const INITIAL_COUNTS: CommBadgeCounts = {
  request: 0,
  chat: 0,
  mail: 0,
  inquiry: 0,
  sms: 0,
  remoteSupport: 0,
  member: 0,
  finance: 0,
  tax: 0,
};

type AdminCommBadgeStore = {
  counts: CommBadgeCounts;
  setCounts: (next: CommBadgeCounts) => void;
  applyDelta: (key: CommBadgeKey, delta: number) => void;
  setKeyCount: (key: CommBadgeKey, count: number) => void;
  zeroKeys: (keys: CommBadgeKey[]) => void;
};

export const useAdminCommBadgeStore = create<AdminCommBadgeStore>((set) => ({
  counts: INITIAL_COUNTS,
  setCounts: (next) => set({ counts: next }),
  applyDelta: (key, delta) =>
    set((state) => ({
      counts: {
        ...state.counts,
        [key]: Math.max(0, (state.counts[key] ?? 0) + delta),
      },
    })),
  setKeyCount: (key, count) =>
    set((state) => ({
      counts: {
        ...state.counts,
        [key]: Math.max(0, count),
      },
    })),
  zeroKeys: (keys) =>
    set((state) => {
      let changed = false;
      const next = { ...state.counts };
      for (const key of keys) {
        if (next[key] !== 0) {
          next[key] = 0;
          changed = true;
        }
      }
      return changed ? { counts: next } : state;
    }),
}));

/** 모듈 단일 fetch / cleared / socket — Layout·허브가 공유 */
const clearedKeysRef = { current: new Set<CommBadgeKey>() };
let fetchStartedForToken: string | null = null;
let socketUnsub: (() => void) | null = null;

async function fetchAdminCommBadges(token: string) {
  try {
    const res = await apiFetch<{ success: boolean; data: CommBadgeCounts }>({
      path: "/api/admin/comm-badges",
      method: "GET",
      token,
    });
    if (res.ok && res.data?.success) {
      const next = { ...INITIAL_COUNTS, ...res.data.data };
      for (const key of clearedKeysRef.current) {
        next[key] = 0;
      }
      useAdminCommBadgeStore.getState().setCounts(next);
    }
  } catch {
    // silent
  }
}

function ensureSocketListener() {
  if (socketUnsub) return;
  socketUnsub = onAppEvent((evt) => {
    if (String(evt?.type || "") !== "comm:badge-update") return;
    const { key, delta, count } = (evt.data || {}) as {
      key?: CommBadgeKey;
      delta?: number;
      count?: number;
    };
    if (!key) return;
    if (typeof count === "number" && Number.isFinite(count)) {
      useAdminCommBadgeStore.getState().setKeyCount(key, count);
      return;
    }
    if (typeof delta !== "number") return;
    if (clearedKeysRef.current.has(key) && delta > 0) return;
    useAdminCommBadgeStore.getState().applyDelta(key, delta);
  });
}

/**
 * 관리자 소통·액션대기 메뉴 배지 카운트 관리 훅.
 *
 * - 마운트 시 /api/admin/comm-badges 로 초기 카운트를 1회 조회(전역 공유)
 * - 이후 app-event comm:badge-update 소켓 이벤트로 실시간 증감/절대값(구독 1회)
 * - 지원/모니터링 등은 방문 시 해당 키를 0으로 초기화
 * - 채널·회원·재무는 true count 유지
 */
export function useAdminCommBadges() {
  const { token, user } = useAuthStore();
  const counts = useAdminCommBadgeStore((s) => s.counts);
  const zeroKeys = useAdminCommBadgeStore((s) => s.zeroKeys);

  useEffect(() => {
    if (!token || user?.role !== "admin") return;
    ensureSocketListener();
    if (fetchStartedForToken === token) return;
    fetchStartedForToken = token;
    void fetchAdminCommBadges(token);
  }, [token, user?.role]);

  const clearBadgeForPath = useCallback(
    (pathname: string, search = "") => {
      const path = String(pathname || "").replace(/\/$/, "") || "/";
      const tab = new URLSearchParams(search).get("tab");

      if (
        path === "/dashboard/channels" ||
        path === "/dashboard/chat-management" ||
        path === "/dashboard/sms" ||
        path === "/dashboard/mail" ||
        path === "/dashboard/members" ||
        path === "/dashboard/finance"
      ) {
        clearedKeysRef.current = new Set();
        return;
      }

      const keys = new Set<CommBadgeKey>();

      if (path === "/dashboard/support") {
        keys.add(TAB_BADGE_KEYS[tab || "remote"] || "remoteSupport");
      } else {
        const single = COMM_BADGE_HREFS[path];
        if (single && !TRUE_COUNT_KEYS.includes(single)) {
          keys.add(single);
        }
      }

      if (keys.size === 0) {
        clearedKeysRef.current = new Set();
        return;
      }

      clearedKeysRef.current = keys;
      zeroKeys([...keys]);
    },
    [zeroKeys],
  );

  const getBadgeForHref = useCallback(
    (href: string): number => {
      const path = String(href || "").split("?")[0].replace(/\/$/, "") || "/";
      const hubKeys = HUB_BADGE_KEYS[path];
      if (hubKeys) {
        return hubKeys.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
      }
      const key = COMM_BADGE_HREFS[path];
      return key ? (counts[key] ?? 0) : 0;
    },
    [counts],
  );

  return { counts, clearBadgeForPath, getBadgeForHref };
}
