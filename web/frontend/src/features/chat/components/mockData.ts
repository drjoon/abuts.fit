import { Friend, ChatRoom, Message, User } from './types';

export const mockFriends: Friend[] = [
  {
    id: "1",
    name: "홍길동",
    role: "admin",
    isOnline: true,
    statusMessage: "어벗츠.핏에서 근무 중",
    isFavorite: true
  },
  {
    id: "2", 
    name: "김철수",
    role: "requestor",
    isOnline: true,
    statusMessage: "3D 모델링 작업 중"
  },
  {
    id: "3",
    name: "박영희", 
    role: "manufacturer",
    isOnline: false,
    statusMessage: "임플란트 제작 전문"
  },
  {
    id: "4",
    name: "이민수",
    role: "manufacturer", 
    isOnline: true,
    statusMessage: "고품질 어벗먼트 제작"
  },
  {
    id: "5",
    name: "정수현",
    role: "requestor",
    isOnline: false,
    statusMessage: "치과기공사"
  }
];

export const mockUsers: User[] = mockFriends.map(friend => ({
  id: friend.id,
  name: friend.name,
  role: friend.role,
  avatar: friend.avatar,
  isOnline: friend.isOnline,
  lastSeen: friend.isOnline ? undefined : new Date(Date.now() - Math.random() * 3600000)
}));

export const mockChatRooms: ChatRoom[] = [
  {
    id: "room-1",
    participants: [mockUsers[0], mockUsers[1]],
    title: "상악 우측 제1대구치 임플란트 프로젝트",
    lastMessage: {
      id: "msg-1",
      senderId: "3",
      senderName: "박영희",
      senderRole: "manufacturer",
      content: "3D 모델링 파일을 확인했습니다. 내일까지 견적서를 보내드리겠습니다.",
      timestamp: new Date("2024-01-15T14:30:00"),
      isRead: false
    },
    unreadCount: 2,
    isGroup: false,
    createdAt: new Date("2024-01-15T09:00:00")
  },
  {
    id: "room-2",
    participants: [mockUsers[0], mockUsers[2], mockUsers[3]],
    title: "T-scan 3",
    lastMessage: {
      id: "msg-2", 
      senderId: "1",
      senderName: "홍길동",
      senderRole: "admin",
      content: "덴트원 사이트 들어가서 의뢰",
      timestamp: new Date("2024-06-23T16:00:00"),
      isRead: true
    },
    unreadCount: 0,
    isGroup: true,
    createdAt: new Date("2024-06-23T09:00:00")
  },
  {
    id: "room-3",
    participants: [mockUsers[1], mockUsers[2]],
    title: "커스텀브라켓 4", 
    lastMessage: {
      id: "msg-3",
      senderId: "2",
      senderName: "김철수", 
      senderRole: "requestor",
      content: "네 ㅎㅎ다음 휴가 잘 보내세요^^",
      timestamp: new Date("2024-08-01T15:20:00"),
      isRead: true
    },
    unreadCount: 0,
    isGroup: true,
    createdAt: new Date("2024-08-01T10:00:00")
  }
];

export const mockMessages: { [roomId: string]: Message[] } = {
  "room-1": [
    {
      id: "msg-1",
      senderId: "2",
      senderName: "김철수",
      senderRole: "requestor", 
      content: "안녕하세요. 상악 우측 제1대구치 임플란트 어벗먼트 제작을 의뢰드립니다.",
      timestamp: new Date("2024-01-15T09:00:00"),
      isRead: true
    },
    {
      id: "msg-2",
      senderId: "3",
      senderName: "박영희",
      senderRole: "manufacturer",
      content: "안녕하세요! 의뢰 내용을 확인했습니다. 3D 스캔 파일을 첨부해 주시겠어요?",
      timestamp: new Date("2024-01-15T09:15:00"),
      isRead: true
    },
    {
      id: "msg-3", 
      senderId: "2",
      senderName: "김철수",
      senderRole: "requestor",
      content: "3D 스캔 파일을 첨부합니다.",
      timestamp: new Date("2024-01-15T10:30:00"),
      attachments: ["scan_model_001.stl"],
      isRead: true
    },
    {
      id: "msg-4",
      senderId: "3",
      senderName: "박영희", 
      senderRole: "manufacturer",
      content: "3D 모델링 파일을 확인했습니다. 내일까지 견적서를 보내드리겠습니다.",
      timestamp: new Date("2024-01-15T14:30:00"),
      isRead: false
    }
  ]
};