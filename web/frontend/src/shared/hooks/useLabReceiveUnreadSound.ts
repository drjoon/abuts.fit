// related files:
// - web/frontend/src/shared/practice/labReceiveSoundPrefs.ts
// - web/frontend/src/shared/chat/chatSoundPlayer.ts
// - web/frontend/src/shared/hooks/useChatMessageSound.ts
// - web/frontend/src/App.tsx
// change-log:
// - 2026-09-08: 기공의뢰수신 미확인 도착 알림음(practice:transfer-created).
//   채팅 알림과 동일 플레이어·최소 간격으로 중복 재생 방지.

import { useAuthStore } from "@/store/useAuthStore";
import { normalizeRequestorKind } from "@/shared/business/requestorCapabilities";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import { shouldPlayLabReceiveSound } from "@/shared/practice/labReceiveSoundPrefs";
import {
  bindChatSoundUnlockOnGesture,
  playChatNotifySound,
} from "@/shared/chat/chatSoundPlayer";

/** 치과로부터 수신하는 기공소·어벗츠기공소만 */
const canHearLabReceiveSound = (user: {
  role?: string | null;
  requestorKind?: string | null;
} | null): boolean => {
  if (!user) return false;
  const role = String(user.role || "").trim();
  if (role === "practice") return false;
  if (role === "internalLab") return true;
  if (role === "requestor") {
    return normalizeRequestorKind(user.requestorKind) === "lab";
  }
  return false;
};

/**
 * 로그인 후 전역으로 미확인 의뢰 도착 알림음을 재생한다.
 * 채팅 알림음과 같은 playChatNotifySound를 써서 동시 도착 시 한 번만 울린다.
 */
export function useLabReceiveUnreadSound() {
  const { user, isAuthenticated, token } = useAuthStore();
  const enabled =
    Boolean(token && isAuthenticated) && canHearLabReceiveSound(user as any);

  useAppEventListener({
    enabled,
    eventTypes: ["practice:transfer-created"],
    requireVisible: false,
    deferWhenEditing: false,
    onMatch: () => {
      bindChatSoundUnlockOnGesture();
      if (!shouldPlayLabReceiveSound()) return;
      playChatNotifySound();
    },
  });
}
