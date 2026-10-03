// related files:
// - web/frontend/src/shared/hooks/useChatMessageSound.ts
// - web/frontend/src/shared/hooks/useLabReceiveUnreadSound.ts
// - web/frontend/src/shared/chat/chatSoundPlayer.ts
// - web/frontend/src/shared/practice/openPracticeTransferChat.ts
// change-log:
// - 2026-10-04: 백그라운드·다른 사이트는 헬퍼 OS 토스트만. 포커스 중은 예쁜 in-app alert 토스트.

import { createElement } from "react";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/shared/hooks/use-toast";
import { playChatNotifySound } from "@/shared/chat/chatSoundPlayer";
import {
  openPracticeTransferAlert,
  practiceTransferAlertHref,
  resolvePracticeTransferAlertAccountId,
  type PracticeTransferAlertMode,
} from "@/shared/practice/openPracticeTransferChat";

/** 탭이 숨겨졌거나 다른 창/사이트를 보는 중 */
export const isPracticeTransferAlertBackgrounded = (): boolean => {
  if (typeof document === "undefined") return true;
  if (document.hidden) return true;
  if (typeof document.hasFocus === "function" && !document.hasFocus()) {
    return true;
  }
  return false;
};

type NotifyOpts = {
  title: string;
  body: string;
  transferId: string;
  mode: PracticeTransferAlertMode;
  accountId?: string;
};

/**
 * 채팅·의뢰 알림.
 * - 포커스된 탭: 브라우저음 + in-app alert 토스트(보기)
 * - 숨김·다른 사이트·다른 앱: 연결 프로그램 OS 토스트(보기 → 채팅)
 */
export const notifyPracticeTransferAlert = ({
  title,
  body,
  transferId,
  mode,
  accountId,
}: NotifyOpts) => {
  const id = String(transferId || "").trim();
  const ba = String(
    accountId || resolvePracticeTransferAlertAccountId(),
  ).trim();
  const href = id ? practiceTransferAlertHref(id, mode, ba) : "";
  const open = () => {
    if (!id) return;
    openPracticeTransferAlert(id, mode, ba);
  };

  playChatNotifySound({ title, body, href });

  // 백그라운드는 헬퍼 플로팅 토스트만(페이지 안 토스트는 안 보임)
  if (isPracticeTransferAlertBackgrounded()) return;

  toast({
    variant: "alert",
    title,
    description: body,
    duration: 8000,
    onClick: id ? open : undefined,
    action: id
      ? createElement(
          ToastAction,
          {
            altText: "보기",
            className:
              "shrink-0 rounded-lg border-0 bg-primary px-3 text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
            onClick: (e) => {
              e.stopPropagation();
              open();
            },
          },
          "보기",
        )
      : undefined,
  });
};
