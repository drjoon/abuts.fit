import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { onAppEvent } from "@/shared/realtime/socket";

export type CommBadgeKey = "request" | "chat" | "mail" | "inquiry" | "sms";

export type CommBadgeCounts = Record<CommBadgeKey, number>;

const COMM_BADGE_HREFS: Record<string, CommBadgeKey> = {
  "/dashboard/monitoring": "request",
  "/dashboard/chat-management": "chat",
  "/dashboard/sms": "sms",
  "/dashboard/mail": "mail",
  "/dashboard/inquiries": "inquiry",
};

const INITIAL_COUNTS: CommBadgeCounts = {
  request: 0,
  chat: 0,
  mail: 0,
  inquiry: 0,
  sms: 0,
};

/**
 * 관리자 소통 메뉴 배지 카운트 관리 훅.
 *
 * - 마운트 시 /api/admin/comm-badges 로 초기 카운트를 1회 조회
 * - 이후 app-event comm:badge-update 소켓 이벤트로 실시간 증가 수신
 * - 해당 페이지 방문 시 해당 키의 카운트를 0으로 초기화
 */
export function useAdminCommBadges() {
  const { token, user } = useAuthStore();
  const [counts, setCounts] = useState<CommBadgeCounts>(INITIAL_COUNTS);
  const fetchedRef = useRef(false);

  const fetchInitialCounts = useCallback(async () => {
    if (!token || user?.role !== "admin") return;
    try {
      const res = await apiFetch<{ success: boolean; data: CommBadgeCounts }>({
        path: "/api/admin/comm-badges",
        method: "GET",
        token,
      });
      if (res.ok && res.data?.success) {
        setCounts(res.data.data);
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

  // 소켓 이벤트로 실시간 카운트 업데이트
  useEffect(() => {
    if (user?.role !== "admin") return;

    const unsubscribe = onAppEvent((evt) => {
      if (evt.type === "comm:badge-update") {
        const { key, delta } = (evt.data || {}) as {
          key?: CommBadgeKey;
          delta?: number;
        };
        if (key && typeof delta === "number") {
          setCounts((prev) => ({
            ...prev,
            [key]: Math.max(0, (prev[key] ?? 0) + delta),
          }));
        }
      }
    });

    return unsubscribe;
  }, [user?.role]);

  /**
   * 특정 소통 페이지를 방문했을 때 해당 배지를 0으로 초기화.
   * DashboardLayout에서 경로 변경 시 호출.
   */
  const clearBadgeForPath = useCallback((pathname: string) => {
    const key = COMM_BADGE_HREFS[pathname];
    if (!key) return;
    setCounts((prev) => (prev[key] === 0 ? prev : { ...prev, [key]: 0 }));
  }, []);

  /**
   * href를 받아 해당 메뉴의 배지 카운트를 반환.
   */
  const getBadgeForHref = useCallback(
    (href: string): number => {
      const key = COMM_BADGE_HREFS[href];
      return key ? (counts[key] ?? 0) : 0;
    },
    [counts],
  );

  return { counts, clearBadgeForPath, getBadgeForHref };
}
