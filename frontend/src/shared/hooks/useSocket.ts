import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import {
  initializeSocket,
  disconnectSocket,
  getSocket,
  onNotification,
  SocketNotification,
} from "@/lib/socket";

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

    return () => {
      if (!token && socketInitialized.current) {
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
