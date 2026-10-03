// related files:
// - web/frontend/src/features/chat/components/NewChatWidget.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/hooks/useLabReceiveUnreadSound.ts
// change-log:
// - 2026-10-04: ba(사업자 앵커)로 BroadcastChannel·URL 매칭 — 다른 치과 창이 알림 보기를 가로채지 않음.
// - 2026-10-03: 보기 → 헬퍼 /open-href로 수신함 창을 앞으로. BroadcastChannel은 같은 프로필 보조.
// - 2026-10-03: BroadcastChannel — 보기 클릭 시 수신함 탭이 포커스·채팅 오픈(치과 창에서 열리지 않음).
// - 2026-10-03: 알림 토스트 클릭 → 기공의뢰 상세(?openTransfer=).
// - 2026-09-07: 채팅 의뢰ID 클릭 → 작업현황(채팅) 열기 이벤트.

import { useAuthStore } from "@/store/useAuthStore";
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

/** 헬퍼 open-href·BroadcastChannel이 같은 로그인 계정 탭만 고르게 함 */
export type PracticeTransferAlertAccount = {
  ba: string;
  mode: PracticeTransferAlertMode;
};

declare global {
  interface Window {
    __ABUTS_ALARM_ACCOUNT__?: PracticeTransferAlertAccount;
  }
}

const ALERT_CHANNEL = "abuts:practice-transfer-alert";

type AlertOpenMsg = {
  type: "open";
  id: string;
  transferId: string;
  mode: PracticeTransferAlertMode;
  /** 수신할 계정의 businessAnchorId (없으면 레거시 — ack 하지 않음) */
  ba?: string;
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

/** 알림 보기 대상 계정 — businessAnchorId 우선 */
export const resolvePracticeTransferAlertAccountId = (): string => {
  const user = useAuthStore.getState().user as {
    businessAnchorId?: string | null;
    _id?: string | null;
    id?: string | null;
  } | null;
  return String(
    user?.businessAnchorId || user?._id || user?.id || "",
  ).trim();
};

/** 헬퍼 JXA·URL 매칭용. 기공의뢰 목록 탭이면 URL에 ba= 유지. */
export const publishPracticeTransferAlertAccount = (
  mode: PracticeTransferAlertMode,
  accountId?: string,
) => {
  if (typeof window === "undefined") return;
  const ba = String(accountId || resolvePracticeTransferAlertAccountId()).trim();
  if (!ba) {
    delete window.__ABUTS_ALARM_ACCOUNT__;
    return;
  }
  window.__ABUTS_ALARM_ACCOUNT__ = { ba, mode };
  try {
    const path = window.location.pathname || "";
    if (
      !path.startsWith("/dashboard/practice-transfers") &&
      !path.startsWith("/practice/dashboard")
    ) {
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get("ba") === ba) return;
    url.searchParams.set("ba", ba);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  } catch {
    // ignore
  }
};

export const practiceTransferAlertPath = (
  transferId: string,
  mode: PracticeTransferAlertMode,
  accountId?: string,
): string => {
  const id = String(transferId || "").trim();
  if (!id) return "";
  const ba = String(accountId || resolvePracticeTransferAlertAccountId()).trim();
  const q = new URLSearchParams({ mode, openTransfer: id });
  if (ba) q.set("ba", ba);
  return `/dashboard/practice-transfers?${q.toString()}`;
};

export const practiceTransferAlertHref = (
  transferId: string,
  mode: PracticeTransferAlertMode,
  accountId?: string,
): string => {
  const path = practiceTransferAlertPath(transferId, mode, accountId);
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

const applyOpenHere = (
  transferId: string,
  mode: PracticeTransferAlertMode,
  accountId?: string,
) => {
  focusThisWindow();
  const ba = String(accountId || resolvePracticeTransferAlertAccountId()).trim();
  const path = practiceTransferAlertPath(transferId, mode, ba);
  const onList =
    window.location.pathname.startsWith("/dashboard/practice-transfers") ||
    window.location.pathname.startsWith("/practice/dashboard");
  if (onList) {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", mode);
    url.searchParams.set("openTransfer", transferId);
    if (ba) url.searchParams.set("ba", ba);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    requestOpenPracticeTransferChat(transferId, { panel: "chat" });
    return;
  }
  if (path) window.location.assign(path);
};

/**
 * 이 탭이 mode·계정(ba)에 맞는 기공소 수신함·치과 발신함이면 알림 열기를 처리한다.
 * ba가 다르면 무시 — 같은 브라우저의 다른 치과 창이 가로채지 않음.
 */
export const subscribePracticeTransferAlert = (
  mode: PracticeTransferAlertMode,
  onOpen?: (transferId: string) => void,
  accountId?: string,
): (() => void) => {
  const myBa = String(accountId || resolvePracticeTransferAlertAccountId()).trim();
  publishPracticeTransferAlertAccount(mode, myBa);
  const ch = alertChannel();
  if (!ch) return () => undefined;
  const onMessage = (evt: MessageEvent<AlertMsg>) => {
    const data = evt?.data;
    if (!data || data.type !== "open") return;
    if (data.mode !== mode) return;
    const msgBa = String(data.ba || "").trim();
    // ba 없는 레거시는 ack하지 않음 — 발신 창 applyOpenHere로 처리
    if (!msgBa || !myBa || msgBa !== myBa) return;
    const transferId = String(data.transferId || "").trim();
    if (!transferId) return;
    ch.postMessage({ type: "ack", id: data.id } satisfies AlertAckMsg);
    applyOpenHere(transferId, mode, myBa);
    onOpen?.(transferId);
  };
  ch.addEventListener("message", onMessage);
  return () => {
    ch.removeEventListener("message", onMessage);
    ch.close();
  };
};

/**
 * 같은 원점·같은 계정(ba)의 수신함/발신함 탭이 있으면 그쪽에서 채팅을 연다.
 * 계정 탭이 ack하면 헬퍼 open-href는 건너뛴다(다른 치과 탭을 앞으로 올리지 않음).
 */
export const openPracticeTransferAlert = (
  transferId: string,
  mode: PracticeTransferAlertMode,
  accountId?: string,
) => {
  const id = String(transferId || "").trim();
  const ba = String(accountId || resolvePracticeTransferAlertAccountId()).trim();
  const path = practiceTransferAlertPath(id, mode, ba);
  if (!id || !path) return;

  const href = practiceTransferAlertHref(id, mode, ba);
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
    ba: ba || undefined,
  } satisfies AlertOpenMsg);

  // 같은 프로필의 올바른 계정이 ack할 시간을 준 뒤, 없을 때만 헬퍼로 탭 탐색
  window.setTimeout(() => {
    if (acked) {
      ch?.removeEventListener("message", onAck);
      ch?.close();
      return;
    }
    void openLabHelperHref(href).then((focused) => {
      window.setTimeout(() => {
        ch?.removeEventListener("message", onAck);
        ch?.close();
        if (acked || focused) return;
        applyOpenHere(id, mode, ba);
      }, 120);
    });
  }, 80);
};
