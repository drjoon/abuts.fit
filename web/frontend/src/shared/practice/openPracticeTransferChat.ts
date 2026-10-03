// related files:
// - web/frontend/src/features/chat/components/NewChatWidget.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/hooks/useLabReceiveUnreadSound.ts
// change-log:
// - 2026-10-03: 보기 → 헬퍼 /open-href로 수신함 창을 앞으로. BroadcastChannel은 같은 프로필 보조.
// - 2026-10-03: BroadcastChannel — 보기 클릭 시 수신함 탭이 포커스·채팅 오픈(치과 창에서 열리지 않음).
// - 2026-10-03: 알림 토스트 클릭 → 기공의뢰 상세(?openTransfer=).
// - 2026-09-07: 채팅 의뢰ID 클릭 → 작업현황(채팅) 열기 이벤트.

import { openLabHelperHref } from "@/shared/files/labHelperClient";

export const OPEN_PRACTICE_TRANSFER_CHAT_EVENT =
  "abuts:practice-transfer:open" as const;

export type OpenPracticeTransferChatDetail = {
  transferId: string;
  /** 기본 chat = 작업현황 */
  panel?: "chat" | "detail";
};

export const requestOpenPracticeTransferChat = (
  transferId: string,
  options?: { panel?: "chat" | "detail" },
) => {
  const id = String(transferId || "").trim();
  if (!id || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OpenPracticeTransferChatDetail>(
      OPEN_PRACTICE_TRANSFER_CHAT_EVENT,
      {
        detail: {
          transferId: id,
          panel: options?.panel || "chat",
        },
      },
    ),
  );
};

export type PracticeTransferAlertMode = "receive" | "send";

const ALERT_CHANNEL = "abuts:practice-transfer-alert";

type AlertOpenMsg = {
  type: "open";
  id: string;
  transferId: string;
  mode: PracticeTransferAlertMode;
};

type AlertAckMsg = {
  type: "ack";
  id: string;
};

type AlertMsg = AlertOpenMsg | AlertAckMsg;

const alertChannel = (): BroadcastChannel | null => {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  return new BroadcastChannel(ALERT_CHANNEL);
};

export const practiceTransferAlertPath = (
  transferId: string,
  mode: PracticeTransferAlertMode,
): string => {
  const id = String(transferId || "").trim();
  if (!id) return "";
  const q = new URLSearchParams({ mode, openTransfer: id });
  return `/dashboard/practice-transfers?${q.toString()}`;
};

export const practiceTransferAlertHref = (
  transferId: string,
  mode: PracticeTransferAlertMode,
): string => {
  const path = practiceTransferAlertPath(transferId, mode);
  if (!path || typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
};

const focusThisWindow = () => {
  try {
    window.focus();
  } catch {
    // 백그라운드 탭은 OS가 막을 수 있음 — 헬퍼가 창을 앞으로
  }
};

const applyOpenHere = (transferId: string, mode: PracticeTransferAlertMode) => {
  focusThisWindow();
  const path = practiceTransferAlertPath(transferId, mode);
  const onList =
    window.location.pathname.startsWith("/dashboard/practice-transfers") ||
    window.location.pathname.startsWith("/practice/dashboard");
  if (onList) {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", mode);
    url.searchParams.set("openTransfer", transferId);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    requestOpenPracticeTransferChat(transferId, { panel: "chat" });
    return;
  }
  if (path) window.location.assign(path);
};

/** 이 탭이 mode에 맞는 기공소 수신함·치과 발신함이면 알림 열기를 처리한다. */
export const subscribePracticeTransferAlert = (
  mode: PracticeTransferAlertMode,
  onOpen?: (transferId: string) => void,
): (() => void) => {
  const ch = alertChannel();
  if (!ch) return () => undefined;
  const onMessage = (evt: MessageEvent<AlertMsg>) => {
    const data = evt?.data;
    if (!data || data.type !== "open") return;
    if (data.mode !== mode) return;
    const transferId = String(data.transferId || "").trim();
    if (!transferId) return;
    ch.postMessage({ type: "ack", id: data.id } satisfies AlertAckMsg);
    applyOpenHere(transferId, mode);
    onOpen?.(transferId);
  };
  ch.addEventListener("message", onMessage);
  return () => {
    ch.removeEventListener("message", onMessage);
    ch.close();
  };
};

/**
 * 같은 원점의 수신함 탭이 있으면 그쪽에서 채팅을 연다.
 * 없으면 이 창에서 연다(치과 창이 수신 URL로 바뀌지 않게).
 */
export const openPracticeTransferAlert = (
  transferId: string,
  mode: PracticeTransferAlertMode,
) => {
  const id = String(transferId || "").trim();
  const path = practiceTransferAlertPath(id, mode);
  if (!id || !path) return;

  const href = practiceTransferAlertHref(id, mode);
  const ch = alertChannel();
  const msgId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let acked = false;
  const onAck = (evt: MessageEvent<AlertMsg>) => {
    const data = evt?.data;
    if (data?.type === "ack" && data.id === msgId) acked = true;
  };
  ch?.addEventListener("message", onAck);
  ch?.postMessage({
    type: "open",
    id: msgId,
    transferId: id,
    mode,
  } satisfies AlertOpenMsg);

  void openLabHelperHref(href).then((focused) => {
    window.setTimeout(() => {
      ch?.removeEventListener("message", onAck);
      ch?.close();
      if (acked || focused) return;
      applyOpenHere(id, mode);
    }, 120);
  });
};
