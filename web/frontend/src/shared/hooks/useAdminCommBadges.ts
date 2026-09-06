// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/realtime/useAppEventListener.ts
// change-log:
// - 2026-09-06: 지원·채널 허브 합산 배지·탭 단위 clear.
// - 2026-09-06: remoteSupport 배지 키·href 추가.
// - 2026-08-26: 초기 fetch가 방문 clear를 덮어쓰지 않도록 cleared 키 유지.
import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";

export type CommBadgeKey =
  | "request"
  | "chat"
  | "mail"
  | "inquiry"
  | "sms"
  | "remoteSupport";

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
};

const HUB_BADGE_KEYS: Record<string, CommBadgeKey[]> = {
  "/dashboard/support": ["remoteSupport", "inquiry"],
  "/dashboard/channels": ["chat", "sms", "mail"],
  "/dashboard/monitoring": ["request"],
};

const TAB_BADGE_KEYS: Record<string, CommBadgeKey> = {
  remote: "remoteSupport",
  inquiries: "inquiry",
  chat: "chat",
  sms: "sms",
  mail: "mail",
};

const INITIAL_COUNTS: CommBadgeCounts = {
  request: 0,
  chat: 0,
  mail: 0,
  inquiry: 0,
  sms: 0,
  remoteSupport: 0,
};

/**
 * 관리자 소통 메뉴 배지 카운트 관리 훅.
 *
 * - 마운트 시 /api/admin/comm-badges 로 초기 카운트를 1회 조회
 * - 이후 app-event comm:badge-update 소켓 이벤트로 실시간 증가 반영
 * - 해당 페이지 방문 시 해당 키의 카운트를 0으로 초기화
 */
export function useAdminCommBadges() {
  const { token, user } = useAuthStore();
  const [counts, setCounts] = useState<CommBadgeCounts>(INITIAL_COUNTS);
  const fetchedRef = useRef(false);
  const clearedKeysRef = useRef<Set<CommBadgeKey>>(new Set());

  const fetchInitialCounts = useCallback(async () => {
    if (!token || user?.role !== "admin") return;
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
        setCounts(next);
      }
    } catch {
      // silent
    }
  }, [token, user?.role]);

  useEffect(() => {
    if (!token || user?.role !== "admin" || fetchedRef.current) return;
    fetchedRef.current = true;
    void fetchInitialCounts();
  }, [fetchInitialCounts, token, user?.role]);

  useAppEventListener({
    enabled: user?.role === "admin",
    eventTypes: ["comm:badge-update"],
    deferWhenEditing: false,
    onMatch: (evt) => {
      const { key, delta } = (evt.data || {}) as {
        key?: CommBadgeKey;
        delta?: number;
      };
      if (key && typeof delta === "number") {
        // 현재 보고 있는 메뉴는 unread로만 쓰므로 +delta 무시
        if (clearedKeysRef.current.has(key) && delta > 0) return;
        setCounts((prev) => ({
          ...prev,
          [key]: Math.max(0, (prev[key] ?? 0) + delta),
        }));
      }
    },
  });

  /**
   * 특정 소통 페이지를 방문했을 때 해당 배지를 0으로 초기화.
   * DashboardLayout에서 경로 변경 시 호출.
   * 허브는 활성 탭 키만 clear (search의 tab).
   */
  const clearBadgeForPath = useCallback((pathname: string, search = "") => {
    const path = String(pathname || "").replace(/\/$/, "") || "/";
    const tab = new URLSearchParams(search).get("tab");
    const keys = new Set<CommBadgeKey>();

    if (path === "/dashboard/support") {
      keys.add(TAB_BADGE_KEYS[tab || "remote"] || "remoteSupport");
    } else if (path === "/dashboard/channels") {
      keys.add(TAB_BADGE_KEYS[tab || "chat"] || "chat");
    } else {
      const single = COMM_BADGE_HREFS[path];
      if (single) keys.add(single);
    }

    if (keys.size === 0) {
      clearedKeysRef.current = new Set();
      return;
    }

    clearedKeysRef.current = keys;
    setCounts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of keys) {
        if (next[key] !== 0) {
          next[key] = 0;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

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
