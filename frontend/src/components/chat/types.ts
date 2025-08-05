export interface User {
  id: string;
  name: string;
  role: 'requestor' | 'manufacturer' | 'admin';
  avatar?: string;
  isOnline: boolean;
  lastSeen?: Date;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: 'requestor' | 'manufacturer' | 'admin';
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
  role: 'requestor' | 'manufacturer' | 'admin';
  avatar?: string;
  isOnline: boolean;
  statusMessage?: string;
  isFavorite?: boolean;
}