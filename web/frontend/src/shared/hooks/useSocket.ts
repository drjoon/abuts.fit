// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/realtime/socket.ts
import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import {
  initializeSocket,
  disconnectSocket,
  getSocket,
  onNotification,
  SocketNotification,
} from "@/shared/realtime/socket";

export const useSocket = () => {
  const { token } = useAuthStore();

  useEffect(() => {
    const normalizedToken = String(token || "").trim();

    if (!normalizedToken) {
      disconnectSocket();
      return;
    }

    initializeSocket(normalizedToken);

    // 알림 수신(토큰 변경/재연결 시에도 공통 구독 레이어가 자동 재바인딩)
    const unsubscribe = onNotification((notification: SocketNotification) => {
      if (notification.type === "new-message") return;
    });

    return () => {
      unsubscribe();
    };
  }, [token]);

  return {
    socket: getSocket(),
    isConnected: getSocket()?.connected || false,
  };
};
