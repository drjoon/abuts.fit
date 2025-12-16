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

export interface SocketNotification {
  _id?: string;
  type: string;
  title?: string;
  message?: string;
  data?: any;
  timestamp?: string;
  createdAt?: string;
}

export function initializeSocket(token: string): Socket {
  if (socket?.connected) {
    return socket;
  }

  const serverUrl = import.meta.env.VITE_API_URL || "http://localhost:5001";

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

// Request 메시지 전송
export function sendRequestMessage(data: {
  requestId: string;
  content: string;
  attachments?: any[];
  replyTo?: string;
}) {
  socket?.emit("send-request-message", data);
}

// 타이핑 중 표시
export function emitTyping(roomId: string, isTyping: boolean) {
  socket?.emit("typing", { roomId, isTyping });
}

// 메시지 읽음 처리
export function markMessagesAsRead(roomId: string, messageIds: string[]) {
  socket?.emit("mark-as-read", { roomId, messageIds });
}

// Request 메시지 읽음 처리
export function markRequestMessagesAsRead(requestId: string) {
  socket?.emit("mark-request-messages-read", { requestId });
}

// 이벤트 리스너 등록
export function onNewMessage(callback: (message: SocketMessage) => void) {
  socket?.on("new-message", callback);
  return () => socket?.off("new-message", callback);
}

export function onNewRequestMessage(
  callback: (data: { requestId: string; message: any }) => void
) {
  socket?.on("new-request-message", callback);
  return () => socket?.off("new-request-message", callback);
}

export function onNotification(
  callback: (notification: SocketNotification) => void
) {
  socket?.on("notification", callback);
  return () => socket?.off("notification", callback);
}

export function onUserTyping(
  callback: (data: {
    userId: string;
    userName: string;
    isTyping: boolean;
  }) => void
) {
  socket?.on("user-typing", callback);
  return () => socket?.off("user-typing", callback);
}

export function onMessagesRead(
  callback: (data: {
    userId: string;
    messageIds: string[];
    readAt: string;
  }) => void
) {
  socket?.on("messages-read", callback);
  return () => socket?.off("messages-read", callback);
}

export function onRequestMessagesRead(
  callback: (data: {
    requestId: string;
    readBy: string;
    readAt: string;
  }) => void
) {
  socket?.on("request-messages-read", callback);
  return () => socket?.off("request-messages-read", callback);
}

export function onUserJoined(
  callback: (data: {
    userId: string;
    userName: string;
    timestamp: string;
  }) => void
) {
  socket?.on("user-joined", callback);
  return () => socket?.off("user-joined", callback);
}

export function onUserLeft(
  callback: (data: {
    userId: string;
    userName: string;
    timestamp: string;
  }) => void
) {
  socket?.on("user-left", callback);
  return () => socket?.off("user-left", callback);
}
