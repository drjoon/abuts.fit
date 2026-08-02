// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/shared/realtime/socket.ts
// - web/frontend/src/shared/realtime/useAppEventListener.ts
// - web/backend/services/reviewApprovalQueue.service.js
import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import {
  initializeSocket,
  disconnectSocket,
  getSocket,
  onNotification,
  onCncMachiningAlarm,
  onCncMachiningFailed,
  SocketNotification,
} from "@/shared/realtime/socket";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";

const toText = (value: unknown) =>
  typeof value === "string" ? value.trim() : String(value ?? "").trim();

export const useSocket = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();

  useEffect(() => {
    const normalizedToken = String(token || "").trim();

    if (!normalizedToken) {
      disconnectSocket();
      return;
    }

    initializeSocket(normalizedToken);

    // 알림 수신(토큰 변경/재연결 시에도 공통 구독 레이어가 자동 재바인딩)
    const unsubscribeNotification = onNotification(
      (notification: SocketNotification) => {
        if (notification.type === "new-message") return;
      },
    );

    const unsubscribeCncFailed = onCncMachiningFailed((payload) => {
      const reason = toText(payload?.reason) || "CNC 가공 실패";
      const machineId = toText(payload?.machineId);
      const requestId = toText(payload?.requestId);

      toast({
        title: `CNC 가공 실패${machineId ? ` · ${machineId}` : ""}`,
        description: requestId
          ? `${reason} (의뢰번호: ${requestId})`
          : reason,
        variant: "destructive",
      });
    });

    const unsubscribeCncAlarm = onCncMachiningAlarm((payload) => {
      const message = toText(payload?.message);
      if (!message) return;
      const machineId = toText(payload?.machineId);

      toast({
        title: `CNC 알람${machineId ? ` · ${machineId}` : ""}`,
        description: message,
        variant: "destructive",
      });
    });

    return () => {
      unsubscribeNotification();
      unsubscribeCncFailed();
      unsubscribeCncAlarm();
    };
  }, [token, toast]);

  useAppEventListener({
    enabled: Boolean(token),
    eventTypes: ["request:async-action-failed"],
    deferWhenEditing: false,
    onMatch: (evt) => {
      const data = evt?.data as {
        action?: string;
        stage?: string;
        message?: string;
        requestId?: string;
        machineId?: string;
      } | null;

      const action = toText(data?.action);
      const isCamAutoMachining = action === "cam-auto-machining-trigger";
      const message = toText(data?.message) || "비동기 후처리 작업이 실패했습니다.";
      const requestId = toText(data?.requestId);
      const machineId = toText(data?.machineId);

      toast({
        title: isCamAutoMachining
          ? `자동 가공 시작 실패${machineId ? ` · ${machineId}` : ""}`
          : "후처리 작업 실패",
        description: requestId
          ? `${message} (의뢰번호: ${requestId})`
          : message,
        variant: "destructive",
      });
    },
  });

  return {
    socket: getSocket(),
    isConnected: getSocket()?.connected || false,
  };
};
