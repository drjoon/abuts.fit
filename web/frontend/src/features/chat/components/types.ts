// related files:
// - web/frontend/rules.md
// - web/frontend/src/shared/types/role.ts
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import type { AppUserRole } from "@/shared/types/role";

export type ChatUserRole = AppUserRole;

export interface User {
  id: string;
  name: string;
  role: ChatUserRole;
  avatar?: string;
  isOnline: boolean;
  lastSeen?: Date;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: ChatUserRole;
  content: string;
  timestamp: Date;
  attachments?: string[];
  isRead: boolean;
}

export interface ChatRoom {
  id: string;
  participants: User[];
  title: string;
  lastMessage?: Message;
  unreadCount: number;
  isGroup: boolean;
  createdAt: Date;
  avatar?: string;
}

export interface Friend {
  id: string;
  name: string;
  role: ChatUserRole;
  avatar?: string;
  isOnline: boolean;
  statusMessage?: string;
  isFavorite?: boolean;
}