// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/realtime/useAppEventDebouncedReload.ts
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;
let socketAuthToken: string | null = null;
const appEventSubscribers = new Set<(evt: AppEventMessage) => void>();
const socketEventSubscribers = new Map<string, Set<(payload: unknown) => void>>();
const socketEventForwarders = new Map<string, (payload: unknown) => void>();

const handleAppEvent = (evt: AppEventMessage) => {
  appEventSubscribers.forEach((callback) => {
    callback(evt);
  });
};

const bindSocketEventForwarder = (target: Socket, eventName: string) => {
  const forwarder = socketEventForwarders.get(eventName);
  if (!forwarder) return;
  target.off(eventName, forwarder);
  target.on(eventName, forwarder);
};

const ensureSocketEventForwarder = (eventName: string) => {
  const normalizedEvent = String(eventName || "").trim();
  if (!normalizedEvent) return;
  if (socketEventForwarders.has(normalizedEvent)) return;

  const forwarder = (payload: unknown) => {
    const subscribers = socketEventSubscribers.get(normalizedEvent);
    if (!subscribers || subscribers.size === 0) return;
    subscribers.forEach((callback) => {
      callback(payload);
    });
  };

  socketEventForwarders.set(normalizedEvent, forwarder);
  if (socket) {
    bindSocketEventForwarder(socket, normalizedEvent);
  }
};

const subscribeSocketEvent = <T>(
  eventName: string,
  callback: (payload: T) => void,
) => {
  const normalizedEvent = String(eventName || "").trim();
  if (!normalizedEvent) {
    return () => undefined;
  }

  ensureSocketEventForwarder(normalizedEvent);

  const subscribers =
    socketEventSubscribers.get(normalizedEvent) || new Set<(payload: unknown) => void>();
  subscribers.add(callback as (payload: unknown) => void);
  socketEventSubscribers.set(normalizedEvent, subscribers);

  if (socket) {
    bindSocketEventForwarder(socket, normalizedEvent);
  }

  return () => {
    const current = socketEventSubscribers.get(normalizedEvent);
    if (!current) return;

    current.delete(callback as (payload: unknown) => void);
    if (current.size > 0) return;

    socketEventSubscribers.delete(normalizedEvent);
    const forwarder = socketEventForwarders.get(normalizedEvent);
    if (socket && forwarder) {
      socket.off(normalizedEvent, forwarder);
    }
    socketEventForwarders.delete(normalizedEvent);
  };
};

function bindSharedSocketListeners(target: Socket) {
  target.off("app-event", handleAppEvent);
  target.on("app-event", handleAppEvent);

  socketEventForwarders.forEach((_, eventName) => {
    bindSocketEventForwarder(target, eventName);
  });
}

export interface SocketMessage {
  _id: string;
  roomId: string;
  sender: {
    _id: string;
    name: string;
    role: string;
  };
  content: string;
  attachments?: unknown[];
  replyTo?: unknown;
  readBy?: Array<{ userId: string; readAt: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface SocketNotification {
  _id?: string;
  type: string;
  title?: string;
  message?: string;
  data?: unknown;
  timestamp?: string;
  createdAt?: string;
}

export interface AppEventMessage {
  type: string;
  data?: unknown;
  timestamp?: string;
}

export function onAppEvent(callback: (evt: AppEventMessage) => void) {
  appEventSubscribers.add(callback);
  if (socket) {
    bindSharedSocketListeners(socket);
  }
  return () => {
    appEventSubscribers.delete(callback);
  };
}

export function initializeSocket(token: string): Socket {
  const nextToken = String(token || "").trim();
  if (!nextToken) {
    throw new Error("Socket token is required");
  }

  if (socket) {
    if (socketAuthToken === nextToken) {
      return socket;
    }

    // 로그인 사용자/토큰이 바뀐 경우 기존 소켓 인증 컨텍스트를 폐기하고 재연결한다.
    disconnectSocket();
  }

  const envSocketUrl = (import.meta.env.VITE_SOCKET_URL as string) || "";
  const envApiUrl = (import.meta.env.VITE_API_URL as string) || "";
  const envDevApiTarget = (import.meta.env.VITE_DEV_API_TARGET as string) || "";
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";

  const serverUrl = envSocketUrl
    ? envSocketUrl
    : import.meta.env.DEV
      ? envDevApiTarget || envApiUrl || origin || "http://localhost:5173"
      : origin || envApiUrl || "https://abuts.fit";

  console.log("[socket] connecting to", serverUrl);

  socket = io(serverUrl, {
    auth: { token: nextToken },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on("connect", () => {
    console.log("Socket.io 연결됨:", socket?.id);
  });

  socket.on("disconnect", (reason) => {
    console.log("Socket.io 연결 해제:", reason);
  });

  socket.on("error", (error) => {
    console.error("Socket.io 오류:", error);
  });

  socket.on("connect_error", (error) => {
    console.error("Socket.io 연결 오류:", error.message);
  });

  bindSharedSocketListeners(socket);
  socketAuthToken = nextToken;

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (!socket) return;

  socket.off("app-event", handleAppEvent);
  socketEventForwarders.forEach((forwarder, eventName) => {
    socket?.off(eventName, forwarder);
  });

  socket.disconnect();
  socket = null;
  socketAuthToken = null;
}

export function joinRoom(roomId: string) {
  socket?.emit("join-room", roomId);
}

export function leaveRoom(roomId: string) {
  socket?.emit("leave-room", roomId);
}

export function sendMessage(data: {
  roomId: string;
  content: string;
  attachments?: unknown[];
  replyTo?: string;
}) {
  socket?.emit("send-message", data);
}

export function emitTyping(roomId: string, isTyping: boolean) {
  socket?.emit("typing", { roomId, isTyping });
}

export function markMessagesAsRead(roomId: string, messageIds: string[]) {
  socket?.emit("mark-as-read", { roomId, messageIds });
}

export function onNewMessage(callback: (message: SocketMessage) => void) {
  return subscribeSocketEvent<SocketMessage>("new-message", callback);
}

export function onNotification(callback: (data: SocketNotification) => void) {
  return subscribeSocketEvent<SocketNotification>("notification", callback);
}

export function onUserTyping(
  callback: (data: {
    userId: string;
    userName: string;
    isTyping: boolean;
  }) => void,
) {
  return subscribeSocketEvent("user-typing", callback);
}

export function onMessagesRead(
  callback: (data: {
    userId: string;
    messageIds: string[];
    readAt: string;
  }) => void,
) {
  return subscribeSocketEvent("messages-read", callback);
}

export function onUserJoined(
  callback: (data: {
    userId: string;
    userName: string;
    timestamp: string;
  }) => void,
) {
  return subscribeSocketEvent("user-joined", callback);
}

export function onUserLeft(
  callback: (data: {
    userId: string;
    userName: string;
    timestamp: string;
  }) => void,
) {
  return subscribeSocketEvent("user-left", callback);
}

export function subscribeCncMachining(machineId: string, jobId: string) {
  socket?.emit("subscribe-cnc-machining", { machineId, jobId });
}

export function unsubscribeCncMachining(machineId: string, jobId: string) {
  socket?.emit("unsubscribe-cnc-machining", { machineId, jobId });
}

export function onCncMachiningCompleted(
  callback: (data: {
    machineId: string;
    jobId: string;
    status: "COMPLETED" | "FAILED";
    result: unknown;
    completedAt: string;
  }) => void,
) {
  return subscribeSocketEvent("cnc-machining-completed", callback);
}

export function onCncMachiningTick(
  callback: (data: {
    machineId: string;
    jobId: string | null;
    requestId: string;
    phase: string | null;
    percent: number | null;
    startedAt: string;
    elapsedSeconds: number;
    tickAt: string;
  }) => void,
) {
  return subscribeSocketEvent("cnc-machining-tick", callback);
}

export function onCncMachiningStarted(
  callback: (data: {
    machineId: string;
    jobId: string | null;
    requestId: string | null;
    bridgePath: string | null;
    startedAt: string;
  }) => void,
) {
  return subscribeSocketEvent("cnc-machining-started", callback);
}

export function onCncMachiningCanceled(
  callback: (data: {
    machineId: string;
    jobId: string | null;
    requestId: string | null;
    status: "CANCELED";
    canceledAt: string;
    durationSeconds: number;
  }) => void,
) {
  return subscribeSocketEvent("cnc-machining-canceled", callback);
}

export function onCncMachiningAlarm(
  callback: (data: {
    machineId: string;
    jobId: string | null;
    requestId: string | null;
    message?: string | null;
    errorCode?: string | null;
    alarms?: unknown[];
    alarmAt: string;
  }) => void,
) {
  return subscribeSocketEvent("cnc-machining-alarm", callback);
}

export function onCncMachiningFailed(
  callback: (data: {
    machineId: string;
    jobId: string | null;
    requestId: string | null;
    bridgePath?: string | null;
    status: "FAILED";
    reason?: string | null;
    errorCode?: string | null;
    alarms?: unknown[];
    failedAt: string;
  }) => void,
) {
  return subscribeSocketEvent("cnc-machining-failed", callback);
}

export function onCncMachineSettingsChanged(
  callback: (data: { machineId: string; settings: unknown }) => void,
) {
  return subscribeSocketEvent("cnc-machine-settings-changed", callback);
}

export function onCncMachiningTimeout(
  callback: (data: {
    machineId: string;
    jobId: string;
    timedOutAt: string;
  }) => void,
) {
  return subscribeSocketEvent("cnc-machining-timeout", callback);
}
