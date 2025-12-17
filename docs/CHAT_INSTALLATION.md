# 채팅 기능 설치 및 사용 가이드

## 📦 패키지 설치

### 백엔드

```bash
cd backend
npm install socket.io
```

### 프론트엔드

```bash
cd frontend
npm install socket.io-client date-fns
```

## 🔧 환경 변수 설정

### 백엔드 (.env)

```env
# 기존 환경 변수에 추가
FRONTEND_URL=http://localhost:5173
JWT_SECRET=your-jwt-secret
```

### 프론트엔드 (.env)

```env
# 기존 환경 변수에 추가
VITE_API_URL=http://localhost:5001
```

## 🚀 서버 시작

### 백엔드

```bash
cd backend
npm run dev
```

서버 시작 시 다음 메시지가 표시되어야 합니다:

```
서버가 포트 5001에서 실행 중입니다.
Socket.io가 활성화되었습니다.
```

### 프론트엔드

```bash
cd frontend
npm run dev
```

## 📱 프론트엔드 통합

### 1. App.tsx에 Socket 초기화 추가

```typescript
import { useSocket } from "@/shared/hooks/useSocket";

function App() {
  useSocket(); // 앱 최상위에서 Socket 초기화

  return (
    // ... 기존 코드
  );
}
```

### 2. 헤더에 알림 벨 추가

```typescript
import { NotificationBell } from "@/components/NotificationBell";

function Header() {
  return (
    <header>
      {/* ... 기존 헤더 내용 */}
      <NotificationBell />
    </header>
  );
}
```

### 3. 채팅 컴포넌트에서 실시간 기능 사용

```typescript
import { useEffect } from "react";
import {
  joinRoom,
  leaveRoom,
  sendMessage,
  onNewMessage,
  emitTyping,
  markMessagesAsRead,
} from "@/lib/socket";
import { MessageAttachment } from "@/components/chat/MessageAttachment";
import { MessageReply } from "@/components/chat/MessageReply";
import { MessageReadReceipt } from "@/components/chat/MessageReadReceipt";
import { TypingIndicator } from "@/components/chat/TypingIndicator";

function ChatRoom({ roomId }) {
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [replyTo, setReplyTo] = useState(null);

  useEffect(() => {
    // 채팅방 입장
    joinRoom(roomId);

    // 새 메시지 수신
    const unsubscribe = onNewMessage((message) => {
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      leaveRoom(roomId);
      unsubscribe();
    };
  }, [roomId]);

  const handleSendMessage = (content, attachments) => {
    sendMessage({
      roomId,
      content,
      attachments,
      replyTo: replyTo?._id,
    });
    setReplyTo(null);
  };

  const handleTyping = (isTyping) => {
    emitTyping(roomId, isTyping);
  };

  return (
    <div>
      {/* 메시지 목록 */}
      {messages.map((msg) => (
        <div key={msg._id}>
          {/* 답장 표시 */}
          {msg.replyTo && <MessageReply replyTo={msg.replyTo} compact />}

          {/* 메시지 내용 */}
          <p>{msg.content}</p>

          {/* 첨부파일 */}
          {msg.attachments?.map((att) => (
            <MessageAttachment key={att.s3Key} attachment={att} />
          ))}

          {/* 읽음 표시 */}
          <MessageReadReceipt
            readBy={msg.readBy}
            senderId={msg.sender._id}
            currentUserId={currentUser.id}
          />
        </div>
      ))}

      {/* 타이핑 인디케이터 */}
      <TypingIndicator
        show={typingUsers.length > 0}
        userName={typingUsers[0]}
      />

      {/* 답장 중 표시 */}
      {replyTo && (
        <MessageReply
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      )}

      {/* 메시지 입력 */}
      <input
        onChange={(e) => handleTyping(e.target.value.length > 0)}
        onBlur={() => handleTyping(false)}
      />
    </div>
  );
}
```

## 🎯 주요 기능 사용법

### 1. 실시간 채팅

- Socket.io를 통해 자동으로 실시간 메시지 수신
- 타이핑 인디케이터 자동 표시
- 읽음 처리 자동 동기화

### 2. 알림 시스템

```typescript
import { useNotifications } from "@/shared/hooks/useNotifications";

function MyComponent() {
  const { notifications, unreadCount, markAsRead } = useNotifications();

  // 알림 자동 수신 및 토스트 표시
}
```

### 3. 이미지 미리보기

- 이미지 첨부파일 자동 인라인 표시
- 클릭 시 전체 화면 미리보기 모달
- 다운로드 버튼 제공

### 4. 답장/인용

```typescript
// 메시지에 답장
const handleReply = (message) => {
  setReplyTo(message);
};

// 메시지 전송 시 replyTo 포함
sendMessage({
  roomId,
  content,
  replyTo: replyTo?._id,
});
```

### 5. 읽음 확인

- 체크 아이콘: 전송됨
- 더블 체크 (회색): 일부 읽음
- 더블 체크 (파란색): 모두 읽음
- 아이콘에 마우스 오버 시 읽은 시간 표시

## 🔍 트러블슈팅

### Socket 연결 실패

1. 백엔드 서버가 실행 중인지 확인
2. CORS 설정 확인 (backend/socket.js)
3. JWT 토큰이 유효한지 확인

### 알림이 표시되지 않음

1. useSocket 훅이 App.tsx에서 호출되는지 확인
2. 브라우저 콘솔에서 Socket 연결 상태 확인
3. 알림 권한 설정 확인

### 이미지가 로드되지 않음

1. S3 URL이 유효한지 확인
2. CORS 설정 확인
3. 파일 타입이 올바른지 확인

## 📚 API 문서

### Socket.io 이벤트

**클라이언트 → 서버**

- `join-room`: 채팅방 입장
- `leave-room`: 채팅방 퇴장
- `send-message`: 메시지 전송
- `send-request-message`: Request 메시지 전송
- `typing`: 타이핑 중 표시
- `mark-as-read`: 메시지 읽음 처리
- `mark-request-messages-read`: Request 메시지 읽음 처리

**서버 → 클라이언트**

- `new-message`: 새 메시지 수신
- `new-request-message`: 새 Request 메시지 수신
- `notification`: 알림 수신
- `user-typing`: 상대방 타이핑 중
- `messages-read`: 메시지 읽음 확인
- `request-messages-read`: Request 메시지 읽음 확인
- `user-joined`: 사용자 입장
- `user-left`: 사용자 퇴장

### REST API

**알림**

- `GET /api/notifications` - 알림 목록
- `PATCH /api/notifications/:id/read` - 알림 읽음 처리
- `PATCH /api/notifications/read-all` - 모든 알림 읽음
- `DELETE /api/notifications/:id` - 알림 삭제

**채팅**

- `GET /api/chats/rooms` - 내 채팅방 목록
- `POST /api/chats/rooms` - 채팅방 생성
- `GET /api/chats/rooms/:roomId/messages` - 메시지 조회
- `POST /api/chats/rooms/:roomId/messages` - 메시지 전송

## 🎨 커스터마이징

### 알림 스타일 변경

`frontend/src/components/NotificationBell.tsx` 수정

### 메시지 UI 변경

`frontend/src/components/chat/` 하위 컴포넌트 수정

### Socket 이벤트 추가

1. `backend/socket.js`에 이벤트 핸들러 추가
2. `frontend/src/lib/socket.ts`에 클라이언트 함수 추가

## 📝 추가 개발 사항

### 이메일/SMS 알림

`backend/controllers/notification.controller.js`의 `createNotification` 함수에서:

```javascript
// 이메일 전송
if (user?.preferences?.notifications?.email) {
  await sendEmailNotification(user.email, notification);
}

// SMS 전송
if (user?.preferences?.notifications?.sms) {
  await sendSMSNotification(user.phone, notification);
}
```

### 알림 정리 스케줄러

`backend/server.js`에 추가:

```javascript
import { cleanupOldNotifications } from "./controllers/notification.controller.js";

// 매일 자정에 30일 이상 된 알림 정리
setInterval(() => {
  cleanupOldNotifications();
}, 24 * 60 * 60 * 1000);
```

## 🔒 보안 고려사항

1. **JWT 인증**: Socket 연결 시 JWT 토큰 검증
2. **권한 확인**: 메시지 전송/조회 시 권한 검증
3. **Rate Limiting**: 과도한 메시지 전송 방지
4. **XSS 방지**: 메시지 내용 sanitize
5. **파일 업로드**: 파일 타입 및 크기 제한

## 📞 지원

문제가 발생하면 다음을 확인하세요:

1. 콘솔 로그 확인
2. 네트워크 탭에서 Socket 연결 상태 확인
3. 백엔드 로그 확인
4. 환경 변수 설정 확인
