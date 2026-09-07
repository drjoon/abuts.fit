// related files:
// - web/frontend/src/shared/chat/chatSoundPrefs.ts
// - web/frontend/src/shared/chat/chatSoundPlayer.ts
// - web/frontend/src/shared/chat/chatSoundViewing.ts
// - web/frontend/src/shared/hooks/useLabReceiveUnreadSound.ts
// - web/frontend/src/App.tsx
// change-log:
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
        playChatNotifySound();
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

      playChatNotifySound();
    },
  });
}
