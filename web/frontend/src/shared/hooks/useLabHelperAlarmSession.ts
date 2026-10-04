// related files:
// - web/frontend/src/shared/files/labHelperClient.ts
// - web/frontend/src/shared/practice/labReceiveSoundPrefs.ts
// - web/frontend/src/App.tsx
// change-log:
// - 2026-10-04: prefs.soundId를 헬퍼 세션에 동기화.
// - 2026-10-04: 세션에 businessAnchorId — 헬퍼 open-href가 같은 계정 탭만 연다.
// - 2026-10-03: 치과도 헬퍼 세션(alertMode=send). 포커스 없으면 browserAlive=false.
// - 2026-10-03: 로그아웃만 해당 토큰 clear — 다른 창 계정의 세션을 지우지 않음.
// - 2026-10-04: browserAlive=false 때 헬퍼가 서버 WS 구독(v14+; 구버전은 wait 폴링).
// - 2026-10-03: 탭 숨김·후면에서 browserAlive=false — 헬퍼가 alarms/wait 폴링(백그라운드 소켓 무음 방지).
// - 2026-10-03: 기공소 로그인 중 헬퍼에 JWT·prefs·heartbeat 동기화(창 닫힌 뒤 폴링).

import { useEffect, useRef } from "react";
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
  if (role === "practice") return true;
  if (role === "requestor") {
    const kind = normalizeRequestorKind(user.requestorKind);
    return kind === "lab" || kind === "practice";
  }
  return false;
};

const alertModeForUser = (user: {
  role?: string | null;
  requestorKind?: string | null;
} | null): "send" | "receive" => {
  if (!user) return "receive";
  const role = String(user.role || "").trim();
  if (role === "practice") return "send";
  if (role === "requestor") {
    return normalizeRequestorKind(user.requestorKind) === "practice"
      ? "send"
      : "receive";
  }
  return "receive";
};

/** 보이는 탭이어도 다른 창을 보고 있으면 헬퍼 폴링(OS 알림). */
const isBrowserTabAlive = () => {
  if (typeof document === "undefined") return true;
  if (document.hidden) return false;
  if (typeof document.hasFocus === "function" && !document.hasFocus()) {
    return false;
  }
  return true;
};

const pushSession = (
  token: string,
  browserAlive: boolean,
  alertMode: "send" | "receive",
  businessAnchorId: string,
) => {
  const prefs = getLabReceiveSoundPrefs();
  void syncLabHelperAlarmSession({
    apiOrigin: resolveLabHelperApiOrigin(),
    appOrigin: window.location.origin,
    token,
    prefs: { enabled: prefs.enabled, soundId: prefs.soundId },
    browserAlive,
    alertMode,
    businessAnchorId,
  });
};

/**
 * 치과·기공소 로그인 중이면 헬퍼에 세션을 유지한다.
 * 포커스된 탭: FE 브라우저음·페이지 토스트. 숨김·다른 창: 헬퍼 OS 알림.
 */
export function useLabHelperAlarmSession() {
  const { user, isAuthenticated, token } = useAuthStore();
  const enabled =
    Boolean(token && isAuthenticated) && canSyncLabHelperAlarm(user as any);
  const alertMode = alertModeForUser(user as any);
  const businessAnchorId = String(
    (user as { businessAnchorId?: string | null } | null)?.businessAnchorId ||
      "",
  ).trim();
  const lastTokenRef = useRef("");

  useEffect(() => {
    if (!enabled || !token) {
      const prev = lastTokenRef.current;
      lastTokenRef.current = "";
      if (prev) void clearLabHelperAlarmSession(prev);
      return;
    }

    lastTokenRef.current = token;
    const sync = () => {
      pushSession(token, isBrowserTabAlive(), alertMode, businessAnchorId);
    };

    sync();
    const timer = window.setInterval(sync, HEARTBEAT_MS);

    const onPrefs = () =>
      pushSession(token, isBrowserTabAlive(), alertMode, businessAnchorId);
    const onVisibility = () => {
      pushSession(token, isBrowserTabAlive(), alertMode, businessAnchorId);
    };
    const onPageHide = () => {
      pushSession(token, false, alertMode, businessAnchorId);
    };

    window.addEventListener(LAB_RECEIVE_SOUND_PREFS_CHANGED_EVENT, onPrefs);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("blur", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener(LAB_RECEIVE_SOUND_PREFS_CHANGED_EVENT, onPrefs);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("blur", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      pushSession(token, false, alertMode, businessAnchorId);
    };
  }, [enabled, token, alertMode, businessAnchorId]);
}
