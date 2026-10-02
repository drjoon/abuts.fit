// related files:
// - web/frontend/src/shared/chat/chatSoundPrefs.ts
// - web/frontend/src/shared/chat/chatSoundPlayer.ts
// - web/frontend/src/shared/chat/chatSoundViewing.ts
// - web/frontend/src/shared/hooks/useLabReceiveUnreadSound.ts
// - web/frontend/src/App.tsx
// change-log:
// - 2026-10-03: 치과(practice·requestor practice)도 전체 알림 prefs로 채팅음 게이트.
// - 2026-10-03: 치과별 mute 제거(전체 알림 prefs만).
// - 2026-09-08: 미확인 의뢰음과 동일 플레이어(중복 재생 방지).
// - 2026-09-07: 전역 채팅 알림음 — chat:message-created · remote-support:chat.

import { useMemo } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import {
  remoteSupportChatSoundTarget,
  shouldPlayChatSound,
} from "@/shared/chat/chatSoundPrefs";
import {
  bindChatSoundUnlockOnGesture,
  playChatNotifySound,
} from "@/shared/chat/chatSoundPlayer";
import { isChatSoundViewingTarget } from "@/shared/chat/chatSoundViewing";
import { shouldPlayLabReceiveSound } from "@/shared/practice/labReceiveSoundPrefs";
import { normalizeRequestorKind } from "@/shared/business/requestorCapabilities";

const isLabUser = (user: {
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

/** 헤더 설정 팝오버「전체 알림」prefs를 쓰는 역할 */
const usesLabReceiveSoundPrefs = (user: {
  role?: string | null;
  requestorKind?: string | null;
} | null): boolean => {
  if (!user) return false;
  if (isLabUser(user)) return true;
  const role = String(user.role || "").trim();
  if (role === "practice") return true;
  if (role === "requestor") {
    return normalizeRequestorKind(user.requestorKind) === "practice";
  }
  return false;
};

const myIdSet = (user: {
  id?: string;
  _id?: string;
  mockUserId?: string;
} | null): Set<string> => {
  const ids = [user?.mockUserId, user?.id, user?._id]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  return new Set(ids);
};

/**
 * 로그인 후 전역으로 새 채팅 메시지 알림음을 재생한다.
 * 내 메시지·시스템·보고 있는 방·음소거 대상은 생략.
 */
export function useChatMessageSound() {
  const { user, isAuthenticated, token } = useAuthStore();
  const myIds = useMemo(() => myIdSet(user as any), [user]);

  useAppEventListener({
    enabled: Boolean(token && isAuthenticated),
    eventTypes: ["chat:message-created", "remote-support:chat"],
    requireVisible: false,
    deferWhenEditing: false,
    onMatch: (evt) => {
      bindChatSoundUnlockOnGesture();

      const type = String(evt?.type || "").trim();
      const data =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};

      if (type === "remote-support:chat") {
        const sessionId = String(data.sessionId || "").trim();
        const sender = String(
          typeof data.senderId === "object" && data.senderId
            ? (data.senderId as { _id?: string })._id || ""
            : data.senderId || "",
        ).trim();
        if (!sessionId) return;
        if (sender && myIds.has(sender)) return;
        const target = remoteSupportChatSoundTarget(sessionId);
        if (!shouldPlayChatSound(target)) return;
        if (isChatSoundViewingTarget(target)) return;
        playChatNotifySound({ title: "원격지원", body: "새 메시지가 도착했습니다." });
        return;
      }

      if (type !== "chat:message-created") return;

      const roomId = String(data.roomId || "").trim();
      if (!roomId) return;

      const message =
        data.message && typeof data.message === "object"
          ? (data.message as {
              messageKind?: string;
              sender?: { _id?: string };
            })
          : null;

      if (String(message?.messageKind || "").trim() === "system") return;

      const senderId = String(
        data.senderId || message?.sender?._id || "",
      ).trim();
      if (senderId && myIds.has(senderId)) return;

      if (!shouldPlayChatSound(roomId)) return;
      if (isChatSoundViewingTarget(roomId)) return;

      if (usesLabReceiveSoundPrefs(user as any) && !shouldPlayLabReceiveSound()) return;

      playChatNotifySound({
        title: "새 채팅",
        body: "새 메시지가 도착했습니다.",
      });
    },
  });
}
