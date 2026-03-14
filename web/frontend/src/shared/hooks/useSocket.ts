import { useEffect, useRef } from "react";
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
  const socketInitialized = useRef(false);

  useEffect(() => {
    if (token && !socketInitialized.current) {
      const socket = initializeSocket(token);
      socketInitialized.current = true;

      // 알림 수신
      const unsubscribe = onNotification((notification: SocketNotification) => {
        if (notification.type === "new-message") return;
      });

      return () => {
        unsubscribe();
      };
    }

    // 토큰이 사라지면 즉시 소켓을 끊어 connect_error를 방지한다.
    if (!token && socketInitialized.current) {
      disconnectSocket();
      socketInitialized.current = false;
    }

    return () => {
      if (socketInitialized.current && !token) {
        disconnectSocket();
        socketInitialized.current = false;
      }
    };
  }, [token]);

  return {
    socket: getSocket(),
    isConnected: getSocket()?.connected || false,
  };
};
