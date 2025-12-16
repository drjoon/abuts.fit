import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import {
  initializeSocket,
  disconnectSocket,
  getSocket,
  onNotification,
  SocketNotification,
} from "@/lib/socket";
import { useToast } from "./use-toast";

export const useSocket = () => {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const socketInitialized = useRef(false);

  useEffect(() => {
    if (token && !socketInitialized.current) {
      const socket = initializeSocket(token);
      socketInitialized.current = true;

      // 알림 수신
      const unsubscribe = onNotification((notification: SocketNotification) => {
        // 토스트로 알림 표시
        if (
          notification.type === "new-message" ||
          notification.type === "new-request-message"
        ) {
          toast({
            title: notification.title || "새 메시지",
            description:
              notification.message || "새로운 메시지가 도착했습니다.",
          });
        }
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
  }, [token, toast]);

  return {
    socket: getSocket(),
    isConnected: getSocket()?.connected || false,
  };
};
