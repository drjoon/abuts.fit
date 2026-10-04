// related files:
// - web/frontend/src/shared/hooks/useChatMessageSound.ts
// - web/frontend/src/shared/hooks/useLabReceiveUnreadSound.ts
// - web/frontend/src/shared/chat/chatSoundPlayer.ts
// - web/frontend/src/shared/practice/openPracticeTransferChat.ts
// change-log:
// - 2026-10-04: 탭이 보이면(포커스 없어도) in-app 토스트. 숨김만 헬퍼 OS 토스트.
// - 2026-10-04: 포커스 토스트 = 전역 공통 default(두꺼운 primary 테두리). alert 변형 폐기.
// - 2026-10-04: 백그라운드·다른 사이트는 헬퍼 OS 토스트만. 포커스 중은 in-app 토스트(보기).

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

/**
 * 탭이 완전히 숨겨진 경우만 true.
 * 치과·기공소 창을 나란히 두면 한쪽은 포커스가 없어도 보이므로 in-app 토스트를 띄운다.
 */
export const isPracticeTransferAlertBackgrounded = (): boolean => {
  if (typeof document === "undefined") return true;
  return Boolean(document.hidden);
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
 * - 보이는 탭: 브라우저음 + 전역 공통 토스트(보기) — 포커스 없어도 표시
 * - 숨긴 탭·다른 사이트: 연결 프로그램 OS 토스트(보기 → 채팅)
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

  // 숨긴 탭은 헬퍼 플로팅 토스트만(페이지 안 토스트는 안 보임)
  if (isPracticeTransferAlertBackgrounded()) return;

  toast({
    title,
    description: body,
    duration: 8000,
    onClick: id ? open : undefined,
    action: id
      ? createElement(
          ToastAction,
          {
            altText: "보기",
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
