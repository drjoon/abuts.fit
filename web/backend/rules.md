# Backend Rules for abuts.fit

이 문서는 `abuts.fit` 백엔드 프로젝트의 구체적인 개발 규칙을 정의합니다.
**전체 프로젝트 공통 규칙(권한, 비즈니스 로직, 파일 크기 제한 등)은 프로젝트 루트의 `rules.md`를 반드시 참조하세요.**

## 1. 기술 스택 (Tech Stack)

- **Runtime**: Node.js
- **Framework**: Express
- **Database**: MongoDB
- **Language**: JavaScript (CommonJS) / 일부 TypeScript 도입 중일 수 있음 (확인 필요)

## 2. 코딩 스타일 및 컨벤션

- **컨트롤러 구조**: `backend/controllers`에 위치하며, 비즈니스 로직이 복잡해질 경우 Service 계층으로 분리를 고려합니다.
- **파일 크기**: 단일 파일 800줄 제한을 엄수합니다.
- **API 응답**: 일관된 JSON 형식을 유지합니다.

## 3. 디렉토리 구조

```
/backend
|-- /controllers    # API 핸들러
|-- /models         # Mongoose 모델
|-- /routes         # Express 라우트
|-- /middlewares    # 미들웨어
|-- /utils          # 유틸리티 함수
`-- /config         # 설정 파일
```

## 4. API 규칙

- RESTful 원칙을 따르되, 실용적인 관점에서 설계합니다.
- 명확한 HTTP 상태 코드를 반환합니다.

## 5. 채팅 API 규칙

### 5.1 Request Chat (의뢰 채팅)

- **Endpoint**: `POST /api/requests/:id/messages`
- **권한**: Requestor (본인/조직), Manufacturer (할당된 의뢰), Admin
- **Request Body**: `{ content: string, attachments?: array }`
- **Response**: 업데이트된 Request 객체 (messages 배열 포함)

### 5.2 Direct Chat (독립 채팅)

**채팅방 관련**:

- `GET /api/chats/rooms` - 내 채팅방 목록 (인증 필요)
- `GET /api/chats/rooms/all` - 모든 채팅방 (Admin 전용)
- `POST /api/chats/rooms` - 채팅방 생성 또는 기존 방 조회
- `PATCH /api/chats/rooms/:roomId/status` - 채팅방 상태 변경 (Admin 전용)

**메시지 관련**:

- `GET /api/chats/rooms/:roomId/messages` - 채팅방 메시지 조회
- `POST /api/chats/rooms/:roomId/messages` - 메시지 전송

**사용자 검색**:

- `GET /api/chats/search-users?query=검색어&role=역할` - 채팅 상대 검색

### 5.3 파일 첨부

- 파일은 먼저 `/api/files/upload` 엔드포인트를 통해 S3에 업로드
- 반환된 메타데이터(s3Key, s3Url 등)를 메시지의 `attachments` 배열에 포함
- 파일 다운로드는 S3 presigned URL을 통해 제공
