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

## 4.1 requestId 생성 규칙

- `Request.requestId`는 **서버에서 생성**하며, 클라이언트가 임의로 지정하지 않습니다.
- 포맷은 `YYYYMMDD-XXXXXXXX` 형태의 **문자열 식별자**입니다.
  - 앞 8자리: KST 기준 날짜(`YYYYMMDD`)
  - 뒤 8자리: 대문자 영문 코드(예: `ABCDEFGH`)
- `requestId`는 **유니크**해야 하며, 생성 시 충돌이 발생하면 재시도합니다.

## 5. 크레딧 및 의뢰 관리 정책

### 5.1 크레딧 관리 정책

- **크레딧 단위**: `organizationId` (RequestorOrganization) 기준으로 관리
- **충전**: 조직 단위로 크레딧 충전 (공급가 기준 적립, 결제는 공급가+VAT)
- **차감**: 의뢰 생성 시 조직의 크레딧에서 차감 (누가 의뢰하든 동일한 조직 크레딧 사용)
- **환불**: 의뢰 취소 시 조직 크레딧으로 복원
- **조회**: 조직 내 모든 멤버가 동일한 잔액 조회 (`GET /api/credits/balance`)

### 5.2 의뢰건 조회 권한 정책

**기본 원칙**: 조직(RequestorOrganization) 내 역할에 따라 의뢰 조회 권한 차등 적용

- **대표 (owner, owners)**:
  - 조직 내 모든 의뢰 조회 가능 (전체 멤버가 생성한 의뢰)
  - 조직 내 모든 의뢰 수정/취소/삭제 권한
- **직원 (members)**:
  - 본인이 생성한 의뢰만 조회 가능
  - 본인이 생성한 의뢰만 수정/취소/삭제 가능
  - 타 직원의 의뢰는 조회 불가

**구현**:

- `buildRequestorOrgScopeFilter()`: 역할 기반 필터링
- `canAccessRequestAsRequestor()`: 개별 의뢰 접근 권한 검증

## 6. 채팅 API 규칙

### 6.1 Request Chat (의뢰 채팅)

- **Endpoint**: `POST /api/requests/:id/messages`
- **권한**: Requestor (본인/조직), Manufacturer (할당된 의뢰), Admin
- **Request Body**: `{ content: string, attachments?: array }`
- **Response**: 업데이트된 Request 객체 (messages 배열 포함)

### 6.2 Direct Chat (독립 채팅)

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

### 6.3 파일 첨부

- 파일은 먼저 `/api/files/upload` 엔드포인트를 통해 S3에 업로드
- 반환된 메타데이터(s3Key, s3Url 등)를 메시지의 `attachments` 배열에 포함
- 파일 다운로드는 S3 presigned URL을 통해 제공
