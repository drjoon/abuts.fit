import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export interface SocketMessage {
  _id: string;
  roomId: string;
  sender: {
    _id: string;
    name: string;
    role: string;
  };
  content: string;
  attachments?: any[];
  replyTo?: any;
  readBy?: Array<{ userId: string; readAt: string }>;
  createdAt: string;
  updatedAt: string;
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
  const s = getSocket();
  if (s) {
    s.on("cnc-machining-canceled", callback);
    return () => s.off("cnc-machining-canceled", callback);
  }
  let bound: Socket | null = null;
  const timer = setInterval(() => {
    const cur = getSocket();
    if (cur) {
      clearInterval(timer);
      bound = cur;
      cur.on("cnc-machining-canceled", callback);
    }
  }, 100);
  return () => {
    clearInterval(timer);
    bound?.off("cnc-machining-canceled", callback);
  };
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
  const s = getSocket();
  if (s) {
    s.on("cnc-machining-started", callback);
    return () => s.off("cnc-machining-started", callback);
  }
  let bound: Socket | null = null;
  const timer = setInterval(() => {
    const cur = getSocket();
    if (cur) {
      clearInterval(timer);
      bound = cur;
      cur.on("cnc-machining-started", callback);
    }
  }, 100);
  return () => {
    clearInterval(timer);
    bound?.off("cnc-machining-started", callback);
  };
}

export interface SocketNotification {
  _id?: string;
  type: string;
  title?: string;
  message?: string;
  data?: any;
  timestamp?: string;
  createdAt?: string;
}

export interface AppEventMessage {
  type: string;
  data?: any;
  timestamp?: string;
}

export function onAppEvent(callback: (evt: AppEventMessage) => void) {
  const s = getSocket();
  if (s) {
    s.on("app-event", callback);
    return () => s.off("app-event", callback);
  }
  let bound: Socket | null = null;
  const timer = setInterval(() => {
    const cur = getSocket();
    if (cur) {
      clearInterval(timer);
      bound = cur;
      cur.on("app-event", callback);
    }
  }, 100);
  return () => {
    clearInterval(timer);
    bound?.off("app-event", callback);
  };
}

export function initializeSocket(token: string): Socket {
  // 이미 소켓 인스턴스가 있으면(연결 중 포함) 재사용한다.
  // 연결 중에 initializeSocket이 반복 호출되면 기존 인스턴스를 덮어써서
  // 리스너가 사라지고 UI 이벤트가 누락될 수 있다.
  if (socket) {
    return socket;
  }

  const envSocketUrl = (import.meta.env.VITE_SOCKET_URL as string) || "";
  const envApiUrl = (import.meta.env.VITE_API_URL as string) || "";
  const envDevApiTarget = (import.meta.env.VITE_DEV_API_TARGET as string) || "";
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";

  // 운영 빌드에서는 env가 잘못 주입되더라도 localhost로 붙지 않도록
  // 기본값을 window.location.origin으로 강제한다.
  // (명시적 VITE_SOCKET_URL이 있으면 그 값을 최우선으로 사용)
  const serverUrl = envSocketUrl
    ? envSocketUrl
    : import.meta.env.DEV
      ? envDevApiTarget || envApiUrl || origin || "http://localhost:5173"
      : origin || envApiUrl || "https://abuts.fit";

  console.log("[socket] connecting to", serverUrl);

  socket = io(serverUrl, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
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

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// 채팅방 입장
export function joinRoom(roomId: string) {
  socket?.emit("join-room", roomId);
}

// 채팅방 퇴장
export function leaveRoom(roomId: string) {
  socket?.emit("leave-room", roomId);
}

// 메시지 전송 (Direct Chat)
export function sendMessage(data: {
  roomId: string;
  content: string;
  attachments?: any[];
  replyTo?: string;
}) {
  socket?.emit("send-message", data);
}

// 타이핑 중 표시
export function emitTyping(roomId: string, isTyping: boolean) {
  socket?.emit("typing", { roomId, isTyping });
}

// 메시지 읽음 처리
export function markMessagesAsRead(roomId: string, messageIds: string[]) {
  socket?.emit("mark-as-read", { roomId, messageIds });
}

// 이벤트 리스너 등록
export function onNewMessage(callback: (message: SocketMessage) => void) {
  socket?.on("new-message", callback);
  return () => socket?.off("new-message", callback);
}

export function onNotification(callback: (data: any) => void) {
  socket?.on("notification", callback);
  return () => socket?.off("notification", callback);
}

export function onUserTyping(
  callback: (data: {
    userId: string;
    userName: string;
    isTyping: boolean;
  }) => void,
) {
  socket?.on("user-typing", callback);
  return () => socket?.off("user-typing", callback);
}

export function onMessagesRead(
  callback: (data: {
    userId: string;
    messageIds: string[];
    readAt: string;
  }) => void,
) {
  socket?.on("messages-read", callback);
  return () => socket?.off("messages-read", callback);
}

export function onUserJoined(
  callback: (data: {
    userId: string;
    userName: string;
    timestamp: string;
  }) => void,
) {
  socket?.on("user-joined", callback);
  return () => socket?.off("user-joined", callback);
}

export function onUserLeft(
  callback: (data: {
    userId: string;
    userName: string;
    timestamp: string;
  }) => void,
) {
  socket?.on("user-left", callback);
  return () => socket?.off("user-left", callback);
}

// CNC 가공 완료 구독
export function subscribeCncMachining(machineId: string, jobId: string) {
  socket?.emit("subscribe-cnc-machining", { machineId, jobId });
}

// CNC 가공 완료 구독 해제
export function unsubscribeCncMachining(machineId: string, jobId: string) {
  socket?.emit("unsubscribe-cnc-machining", { machineId, jobId });
}

// CNC 가공 완료 이벤트 리스너
export function onCncMachiningCompleted(
  callback: (data: {
    machineId: string;
    jobId: string;
    status: "COMPLETED" | "FAILED";
    result: any;
    completedAt: string;
  }) => void,
) {
  const s = getSocket();
  if (s) {
    s.on("cnc-machining-completed", callback);
    return () => s.off("cnc-machining-completed", callback);
  }
  // 소켓이 아직 초기화되지 않은 경우 지연 등록
  let bound: Socket | null = null;
  const timer = setInterval(() => {
    const cur = getSocket();
    if (cur) {
      clearInterval(timer);
      bound = cur;
      cur.on("cnc-machining-completed", callback);
    }
  }, 100);
  return () => {
    clearInterval(timer);
    bound?.off("cnc-machining-completed", callback);
  };
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
  const s = getSocket();
  if (s) {
    s.on("cnc-machining-tick", callback);
    return () => s.off("cnc-machining-tick", callback);
  }
  // 소켓이 아직 초기화되지 않은 경우 지연 등록
  let bound: Socket | null = null;
  const timer = setInterval(() => {
    const cur = getSocket();
    if (cur) {
      clearInterval(timer);
      bound = cur;
      cur.on("cnc-machining-tick", callback);
    }
  }, 100);
  return () => {
    clearInterval(timer);
    bound?.off("cnc-machining-tick", callback);
  };
}

// CNC 장비 설정 변경 이벤트 리스너
export function onCncMachineSettingsChanged(
  callback: (data: { machineId: string; settings: any }) => void,
) {
  const s = getSocket();
  if (s) {
    s.on("cnc-machine-settings-changed", callback);
    return () => s.off("cnc-machine-settings-changed", callback);
  }
  // 소켓이 아직 초기화되지 않은 경우 지연 등록
  let bound: Socket | null = null;
  const timer = setInterval(() => {
    const cur = getSocket();
    if (cur) {
      clearInterval(timer);
      bound = cur;
      cur.on("cnc-machine-settings-changed", callback);
    }
  }, 100);
  return () => {
    clearInterval(timer);
    bound?.off("cnc-machine-settings-changed", callback);
  };
}
export function onCncMachiningTimeout(
  callback: (data: {
    machineId: string;
    jobId: string;
    timedOutAt: string;
  }) => void,
) {
  const s = getSocket();
  if (s) {
    s.on("cnc-machining-timeout", callback);
    return () => s.off("cnc-machining-timeout", callback);
  }
  // 소켓이 아직 초기화되지 않은 경우 지연 등록
  let bound: Socket | null = null;
  const timer = setInterval(() => {
    const cur = getSocket();
    if (cur) {
      clearInterval(timer);
      bound = cur;
      cur.on("cnc-machining-timeout", callback);
    }
  }, 100);
  return () => {
    clearInterval(timer);
    bound?.off("cnc-machining-timeout", callback);
  };
}
