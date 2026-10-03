// related files:
// - web/frontend/src/shared/files/labHelperClient.ts
// - web/frontend/src/shared/practice/labReceiveSoundPrefs.ts
// - web/frontend/src/App.tsx
// change-log:
// - 2026-10-03: 탭 숨김·후면에서 browserAlive=false — 헬퍼가 alarms/wait 폴링(백그라운드 소켓 무음 방지).
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

const isBrowserTabAlive = () => {
  if (typeof document === "undefined") return true;
  return !document.hidden;
};

const pushSession = (token: string, browserAlive: boolean) => {
  const prefs = getLabReceiveSoundPrefs();
  void syncLabHelperAlarmSession({
    apiOrigin: resolveLabHelperApiOrigin(),
    appOrigin: window.location.origin,
    token,
    prefs: { enabled: prefs.enabled },
    browserAlive,
  });
};

/**
 * 기공소 계정으로 로그인 중이면 헬퍼에 세션을 유지한다.
 * 보이는 탭: FE 브라우저음·/notify. 숨김·종료: 헬퍼가 alarms/wait 폴링.
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
      // 백그라운드 탭은 소켓·Audio가 막히는 경우가 많아 헬퍼 폴링에 맡긴다.
      pushSession(token, isBrowserTabAlive());
    };

    sync();
    const timer = window.setInterval(sync, HEARTBEAT_MS);

    const onPrefs = () => pushSession(token, isBrowserTabAlive());
    const onVisibility = () => {
      pushSession(token, isBrowserTabAlive());
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
