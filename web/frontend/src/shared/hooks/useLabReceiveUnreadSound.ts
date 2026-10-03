// related files:
// - web/frontend/src/shared/practice/labReceiveSoundPrefs.ts
// - web/frontend/src/shared/chat/chatSoundPlayer.ts
// - web/frontend/src/shared/hooks/useChatMessageSound.ts
// - web/frontend/src/shared/practice/openPracticeTransferChat.ts
// - web/frontend/src/App.tsx
// change-log:
// - 2026-10-04: 알림 보기 ba(계정) 전달 — 다른 치과 창이 가로채지 않음.
// - 2026-10-03: 보기 → 수신함 탭 BroadcastChannel. App은 Router 밖.
// - 2026-10-03: App은 Router 밖 — useNavigate 제거(location.assign).
// - 2026-10-03: 토스트 클릭 → 해당 의뢰 상세. 오른쪽 위.
// - 2026-10-03: 치과 — 작업시작·완료·작업파일 도착음. 로그인 시 unlock 바인딩.
// - 2026-10-03: 치과별 mute 제거. 헬퍼 알람 문구.
// - 2026-09-08: 기공의뢰수신 미확인 도착 알림음(practice:transfer-created).
//   채팅 알림과 동일 플레이어·최소 간격으로 중복 재생 방지.

import { createElement, useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { normalizeRequestorKind } from "@/shared/business/requestorCapabilities";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import { shouldPlayLabReceiveSound } from "@/shared/practice/labReceiveSoundPrefs";
import {
  bindChatSoundUnlockOnGesture,
  playChatNotifySound,
} from "@/shared/chat/chatSoundPlayer";
import { toast } from "@/shared/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  openPracticeTransferAlert,
  practiceTransferAlertHref,
  publishPracticeTransferAlertAccount,
  resolvePracticeTransferAlertAccountId,
  subscribePracticeTransferAlert,
  type PracticeTransferAlertMode,
} from "@/shared/practice/openPracticeTransferChat";

type SoundUser = {
  role?: string | null;
  requestorKind?: string | null;
};

/** 치과로부터 수신하는 기공소·어벗츠기공소만 */
const canHearLabReceiveSound = (user: SoundUser | null): boolean => {
  if (!user) return false;
  const role = String(user.role || "").trim();
  if (role === "practice") return false;
  if (role === "internalLab") return true;
  if (role === "requestor") {
    return normalizeRequestorKind(user.requestorKind) === "lab";
  }
  return false;
};

/** 기공소 작업 진행을 듣는 치과 */
const canHearPracticeTransferSound = (user: SoundUser | null): boolean => {
  if (!user) return false;
  const role = String(user.role || "").trim();
  if (role === "practice") return true;
  if (role === "requestor") {
    return normalizeRequestorKind(user.requestorKind) === "practice";
  }
  return false;
};

const PRACTICE_ALERT_ACTIONS = new Set([
  "accepted",
  "completed",
  "result-files-appended",
]);

const practiceAlertCopy = (
  action: string,
): { title: string; body: string } => {
  if (action === "accepted") {
    return { title: "작업시작", body: "기공소가 작업을 시작했습니다." };
  }
  if (action === "completed") {
    return { title: "작업완료", body: "기공 작업이 완료되었습니다." };
  }
  return { title: "작업 파일", body: "작업 파일이 도착했습니다." };
};

const notifyTransferAlert = ({
  title,
  body,
  transferId,
  mode,
}: {
  title: string;
  body: string;
  transferId: string;
  mode: PracticeTransferAlertMode;
}) => {
  const ba = resolvePracticeTransferAlertAccountId();
  const href = practiceTransferAlertHref(transferId, mode, ba);
  playChatNotifySound({ title, body, href });
  toast({
    title,
    description: body,
    duration: 8000,
    onClick: transferId
      ? () => openPracticeTransferAlert(transferId, mode, ba)
      : undefined,
    action: transferId
      ? createElement(
          ToastAction,
          {
            altText: "보기",
            onClick: (e) => {
              e.stopPropagation();
              openPracticeTransferAlert(transferId, mode, ba);
            },
          },
          "보기",
        )
      : undefined,
  });
};

/**
 * 로그인 후 전역으로 의뢰 알림음을 재생한다.
 * 기공소: 새 의뢰. 치과: 작업시작·완료·작업파일.
 * 채팅 알림음과 같은 playChatNotifySound를 써서 동시 도착 시 한 번만 울린다.
 */
export function useLabReceiveUnreadSound() {
  const { user, isAuthenticated, token } = useAuthStore();
  const lab = canHearLabReceiveSound(user as SoundUser);
  const practice = canHearPracticeTransferSound(user as SoundUser);
  const enabled = Boolean(token && isAuthenticated) && (lab || practice);
  const mode: PracticeTransferAlertMode = lab ? "receive" : "send";

  const eventTypes = [
    ...(lab ? (["practice:transfer-created"] as const) : []),
    ...(practice ? (["practice:transfer-updated"] as const) : []),
  ];

  useEffect(() => {
    if (!enabled) return;
    bindChatSoundUnlockOnGesture();
  }, [enabled]);

  const accountId = String(
    (user as { businessAnchorId?: string | null } | null)?.businessAnchorId ||
      (user as { _id?: string | null } | null)?._id ||
      (user as { id?: string | null } | null)?.id ||
      "",
  ).trim();

  useEffect(() => {
    if (!enabled) return;
    publishPracticeTransferAlertAccount(mode, accountId);
    return subscribePracticeTransferAlert(mode, undefined, accountId);
  }, [enabled, mode, accountId]);

  useAppEventListener({
    enabled,
    eventTypes: [...eventTypes],
    requireVisible: false,
    deferWhenEditing: false,
    onMatch: (evt) => {
      bindChatSoundUnlockOnGesture();
      if (!shouldPlayLabReceiveSound()) return;
      const type = String(evt?.type || "").trim();
      const data =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};

      if (type === "practice:transfer-created") {
        if (!lab) return;
        const clinic = String(
          data.practiceName ||
            data.clinicName ||
            (data.practice &&
              typeof data.practice === "object" &&
              (data.practice as { businessName?: string }).businessName) ||
            "",
        ).trim();
        const patient = String(data.patientName || "").trim();
        const body = [clinic || "치과", patient].filter(Boolean).join(" · ");
        notifyTransferAlert({
          title: "새 기공의뢰",
          body: body || "새 기공의뢰가 도착했습니다.",
          transferId: String(data.transferId || "").trim(),
          mode,
        });
        return;
      }

      if (type !== "practice:transfer-updated") return;
      if (!practice) return;
      const action = String(data.action || "").trim();
      if (!PRACTICE_ALERT_ACTIONS.has(action)) return;
      const copy = practiceAlertCopy(action);
      notifyTransferAlert({
        ...copy,
        transferId: String(data.transferId || "").trim(),
        mode,
      });
    },
  });
}
