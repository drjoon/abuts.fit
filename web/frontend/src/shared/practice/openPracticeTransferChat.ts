// related files:
// - web/frontend/src/features/chat/components/NewChatWidget.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/hooks/useLabReceiveUnreadSound.ts
// change-log:
// - 2026-10-21: 목록 페이지가 아니면 다른 브라우저 창(최소화 포함)의 수신함을 헬퍼로 앞으로 올려 연다.
// - 2026-10-21: 다른 페이지(작업현황 등)에서 보기 — location.assign 대신 pushState+popstate(SPA 이동).
// - 2026-10-21: 보기 — 클릭한 창에서 연다. 다른 창 ack의 window.focus()는 채팅을 앞으로 못 가져옴.
// - 2026-10-04: 보기 — 이미 이 탭 목록이면 BroadcastChannel/헬퍼 없이 바로 채팅 오픈.
// - 2026-10-04: applyOpenHere — URL ba가 이 계정과 다르면 열지 않음.
// - 2026-10-04: localFallback=false — 역할이 다른 창은 수신함 탭만 찾고 이 창 URL을 바꾸지 않음.
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
const WINDOW_FOCUS_CHANNEL = "abuts:window-focus";

type FocusQueryMsg = { type: "query"; id: string };
type FocusYesMsg = { type: "yes"; id: string };
type FocusMsg = FocusQueryMsg | FocusYesMsg;

/** 포커스된 창이 다른 창의 "지금 보고 있나" 물음에 답한다. */
export const subscribeWindowFocusQuery = (): (() => void) => {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return () => undefined;
  }
  const ch = new BroadcastChannel(WINDOW_FOCUS_CHANNEL);
  const onMessage = (evt: MessageEvent<FocusMsg>) => {
    const data = evt?.data;
    if (!data || data.type !== "query") return;
    if (typeof document.hasFocus !== "function" || !document.hasFocus()) return;
    ch.postMessage({ type: "yes", id: data.id } satisfies FocusYesMsg);
  };
  ch.addEventListener("message", onMessage);
  return () => {
    ch.removeEventListener("message", onMessage);
    ch.close();
  };
};

/**
 * 같은 브라우저의 다른 창이 포커스면 true.
 * 포커스된 창에 이미 페이지 안 토스트가 있으므로, 백그라운드 창은 OS 토스트를 덮지 않는다.
 */
export const anySiblingWindowFocused = (): Promise<boolean> => {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const ch = new BroadcastChannel(WINDOW_FOCUS_CHANNEL);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let yes = false;
    const onMessage = (evt: MessageEvent<FocusMsg>) => {
      const data = evt?.data;
      if (data?.type === "yes" && data.id === id) yes = true;
    };
    ch.addEventListener("message", onMessage);
    ch.postMessage({ type: "query", id } satisfies FocusQueryMsg);
    window.setTimeout(() => {
      ch.removeEventListener("message", onMessage);
      ch.close();
      resolve(yes);
    }, 60);
  });
};

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
  /** 그 탭이 사용자 포커스를 갖고 있을 때만 true. 백그라운드 ack는 화면이 안 바뀐다. */
  focused?: boolean;
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
  const myBa = resolvePracticeTransferAlertAccountId();
  const ba = String(accountId || myBa).trim();
  // 다른 계정 URL이 이 창에 떨어지면 채팅을 열지 않음
  if (ba && myBa && ba !== myBa) return;
  focusThisWindow();
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
  if (!path) return;
  // 전체 새로고침 대신 SPA 이동 — 재로딩 중 토큰·목록 경쟁으로 채팅이 안 열리는 문제 방지.
  try {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
  } catch {
    window.location.assign(path);
  }
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
    const focused =
      typeof document.hasFocus === "function" && document.hasFocus();
    ch.postMessage({
      type: "ack",
      id: data.id,
      focused,
    } satisfies AlertAckMsg);
    applyOpenHere(transferId, mode, myBa);
    onOpen?.(transferId);
  };
  ch.addEventListener("message", onMessage);
  return () => {
    ch.removeEventListener("message", onMessage);
    ch.close();
  };
};

export type OpenPracticeTransferAlertOptions = {
  /**
   * true(기본): 대상 탭을 못 찾으면 이 창에서 연다.
   * false: 역할이 다른 창(치과에 수신 URL 등) — 헬퍼·BroadcastChannel만, 이 창 URL은 유지.
   */
  localFallback?: boolean;
};

/**
 * 보기 버튼을 누른 창(같은 계정)에서 채팅을 연다.
 * 역할이 다른 창만 수신함 탭·헬퍼로 넘긴다. 그때도 백그라운드 ack만으로 끝내지 않는다.
 */
export const openPracticeTransferAlert = (
  transferId: string,
  mode: PracticeTransferAlertMode,
  accountId?: string,
  options?: OpenPracticeTransferAlertOptions,
) => {
  const id = String(transferId || "").trim();
  const ba = String(accountId || resolvePracticeTransferAlertAccountId()).trim();
  const path = practiceTransferAlertPath(id, mode, ba);
  if (!id || !path) return;
  const localFallback = options?.localFallback !== false;
  const myBa = resolvePracticeTransferAlertAccountId();
  // 이 창이 이미 기공의뢰 목록이면 여기서 바로 연다.
  // 그 외(작업현황 등)는 다른 브라우저 창의 수신함/발신함 탭이 열려 있으면 그쪽을 연다.
  // 최소화된 창은 window.focus()가 안 되므로 헬퍼가 앞으로 올린다. 못 찾으면 이 창에서 연다.
  const onList =
    window.location.pathname.startsWith("/dashboard/practice-transfers") ||
    window.location.pathname.startsWith("/practice/dashboard");
  if (localFallback && onList && (!ba || !myBa || ba === myBa)) {
    applyOpenHere(id, mode, ba);
    return;
  }

  const href = practiceTransferAlertHref(id, mode, ba);
  const ch = alertChannel();
  const msgId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let ackFocused = false;
  const onAck = (evt: MessageEvent<AlertMsg>) => {
    const data = evt?.data;
    if (data?.type === "ack" && data.id === msgId && data.focused) {
      ackFocused = true;
    }
  };
  ch?.addEventListener("message", onAck);
  ch?.postMessage({
    type: "open",
    id: msgId,
    transferId: id,
    mode,
    ba: ba || undefined,
  } satisfies AlertOpenMsg);

  const cleanup = () => {
    ch?.removeEventListener("message", onAck);
    ch?.close();
  };

  // 포커스된 다른 탭이 열었으면 그 창이 사용자 앞에 있다.
  // 백그라운드 ack는 window.focus()가 막혀 채팅이 안 보이므로 헬퍼로 창을 앞으로 올린다.
  window.setTimeout(() => {
    if (ackFocused) {
      cleanup();
      return;
    }
    void openLabHelperHref(href).then((focused) => {
      window.setTimeout(() => {
        cleanup();
        if (ackFocused || focused) return;
        if (!localFallback) return;
        applyOpenHere(id, mode, ba);
      }, 120);
    });
  }, 80);
};
