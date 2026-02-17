import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "./use-toast";
import { onNotification, SocketNotification } from "@/shared/realtime/socket";

export interface Notification {
  _id: string;
  recipient: string;
  type: string;
  title: string;
  message: string;
  data?: {
    roomId?: string;
    requestId?: string;
    messageId?: string;
    senderId?: string;
    senderName?: string;
    link?: string;
  };
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}

export const useNotifications = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(
    async (unreadOnly = false) => {
      if (!token) return;

      setLoading(true);
      try {
        const res = await apiFetch<{
          success: boolean;
          data: {
            notifications: Notification[];
            unreadCount: number;
            pagination: any;
          };
        }>({
          path: `/api/notifications?unreadOnly=${unreadOnly}`,
          method: "GET",
          token,
        });

        if (res.ok && res.data?.success) {
          setNotifications(res.data.data.notifications);
          setUnreadCount(res.data.data.unreadCount);
        }
      } catch (error) {
        console.error("알림 조회 오류:", error);
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!token) return;

      try {
        const res = await apiFetch({
          path: `/api/notifications/${notificationId}/read`,
          method: "PATCH",
          token,
        });

        if (res.ok) {
          setNotifications((prev) =>
            prev.map((n) =>
              n._id === notificationId ? { ...n, isRead: true } : n
            )
          );
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      } catch (error) {
        console.error("알림 읽음 처리 오류:", error);
      }
    },
    [token]
  );

  const markAllAsRead = useCallback(async () => {
    if (!token) return;

    try {
      const res = await apiFetch({
        path: "/api/notifications/read-all",
        method: "PATCH",
        token,
      });

      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
        toast({
          title: "완료",
          description: "모든 알림을 읽음 처리했습니다.",
        });
      }
    } catch (error) {
      toast({
        title: "오류",
        description: "알림 읽음 처리 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  }, [token, toast]);

  const deleteNotification = useCallback(
    async (notificationId: string) => {
      if (!token) return;

      try {
        const res = await apiFetch({
          path: `/api/notifications/${notificationId}`,
          method: "DELETE",
          token,
        });

        if (res.ok) {
          setNotifications((prev) =>
            prev.filter((n) => n._id !== notificationId)
          );
          const wasUnread =
            notifications.find((n) => n._id === notificationId)?.isRead ===
            false;
          if (wasUnread) {
            setUnreadCount((prev) => Math.max(0, prev - 1));
          }
        }
      } catch (error) {
        console.error("알림 삭제 오류:", error);
      }
    },
    [token, notifications]
  );

  // 실시간 알림 수신
  useEffect(() => {
    const unsubscribe = onNotification((notification: SocketNotification) => {
      if (notification._id) {
        setNotifications((prev) => [notification as any, ...prev]);
        setUnreadCount((prev) => prev + 1);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  };
};
