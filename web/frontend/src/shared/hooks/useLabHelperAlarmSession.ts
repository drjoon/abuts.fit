// related files:
// - web/frontend/src/shared/files/labHelperClient.ts
// - web/frontend/src/shared/practice/labReceiveSoundPrefs.ts
// - web/frontend/src/App.tsx
// change-log:
// - 2026-10-03: 기공소 로그인 중 헬퍼에 JWT·prefs·heartbeat 동기화(창 닫힌 뒤 폴링).

import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { normalizeRequestorKind } from "@/shared/business/requestorCapabilities";
import {
  LAB_RECEIVE_SOUND_PREFS_CHANGED_EVENT,
  getLabReceiveSoundPrefs,
} from "@/shared/practice/labReceiveSoundPrefs";
import {
  clearLabHelperAlarmSession,
  resolveLabHelperApiOrigin,
  syncLabHelperAlarmSession,
} from "@/shared/files/labHelperClient";

const HEARTBEAT_MS = 25_000;

const canSyncLabHelperAlarm = (user: {
  role?: string | null;
  requestorKind?: string | null;
} | null): boolean => {
  if (!user) return false;
  const role = String(user.role || "").trim();
  if (role === "internalLab") return true;
  if (role === "requestor") {
    return normalizeRequestorKind(user.requestorKind) === "lab";
  }
  return false;
};

const pushSession = (token: string, browserAlive: boolean) => {
  const prefs = getLabReceiveSoundPrefs();
  void syncLabHelperAlarmSession({
    apiOrigin: resolveLabHelperApiOrigin(),
    token,
    prefs: { enabled: prefs.enabled },
    browserAlive,
  });
};

/**
 * 기공소 계정으로 로그인 중이면 헬퍼에 세션을 유지한다.
 * heartbeat가 끊기면 헬퍼가 alarms/wait 폴링으로 전환한다.
 */
export function useLabHelperAlarmSession() {
  const { user, isAuthenticated, token } = useAuthStore();
  const enabled =
    Boolean(token && isAuthenticated) && canSyncLabHelperAlarm(user as any);

  useEffect(() => {
    if (!enabled || !token) {
      void clearLabHelperAlarmSession();
      return;
    }

    const sync = () => {
      const alive =
        typeof document === "undefined" ? true : !document.hidden;
      // 탭이 숨겨져도 페이지가 살아 있으면 heartbeat 유지(폴링 이중음 방지).
      // pagehide(언로드)에서만 browserAlive=false.
      pushSession(token, true);
      void alive;
    };

    sync();
    const timer = window.setInterval(sync, HEARTBEAT_MS);

    const onPrefs = () => pushSession(token, true);
    const onVisibility = () => {
      // 숨김이어도 FE가 /notify 하므로 세션은 alive 유지
      pushSession(token, true);
    };
    const onPageHide = () => {
      pushSession(token, false);
    };

    window.addEventListener(LAB_RECEIVE_SOUND_PREFS_CHANGED_EVENT, onPrefs);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener(LAB_RECEIVE_SOUND_PREFS_CHANGED_EVENT, onPrefs);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      pushSession(token, false);
    };
  }, [enabled, token]);
}
