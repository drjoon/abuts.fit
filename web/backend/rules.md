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

### 5.3 의뢰 취소 정책

- **취소 가능 단계**: `의뢰` 단계에서만 취소 가능
- **취소 불가 단계**: `CAM` 단계부터는 취소 불가

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

## 7. 백그라운드 워커(잡) 운영 규칙

- 웹 서버 프로세스와 백그라운드 잡 프로세스는 분리 운영을 권장합니다.
- 멀티 인스턴스(Load Balancer) 환경에서 웹 서버가 스케일 아웃될 경우, 웹 서버 내에서 잡을 실행하면 중복 실행/레이스 컨디션이 발생할 수 있습니다.
- **모델 공유 규칙**: 백그라운드 워커(`background/`)는 `web/backend/models`를 그대로 `background/models`에 복사해 사용합니다. (DB 스키마 단일 소스 → backend, worker는 복사본 사용)
- 작업 목록/상태는 DB에 저장되고, 백그라운드 워커가 이를 읽어 정해진 시각에 실행합니다.

### 7.1 크레딧 충전(인터넷뱅킹) 잡

- 실행 위치: `background/jobs/creditBPlanJobs.js`
- 수행 순서: NH 거래내역 폴링 → 만료 처리 → 자동 매칭
- 권장: EB Worker 환경에서 단일 인스턴스로 실행

### 7.2 세금계산서 발행 잡

- 실행 위치: `background/jobs/taxInvoiceBatch.js` (익일 정오 일괄 발행) 및 `background/jobs/taxInvoiceScheduler.js` (cron 스케줄)
- 대상: `TaxInvoiceDraft.status`가 `APPROVED` 또는 `FAILED` (재시도)
- 락: `JobLock` 컬렉션을 사용해 중복 실행 방지

### 7.3 환경변수

- `CREDIT_B_PLAN_JOB_ENABLED`
  - 기본: 미설정 시 실행
  - 웹 서버에서 잡을 끄고 워커에서만 돌릴 때: 웹 서버 환경에 `false` 설정
- `TAX_INVOICE_BATCH_ENABLED`
  - 기본: 미설정 시 실행
  - 끌 경우 `false`로 설정
- `CREDIT_B_PLAN_JOB_INTERVAL_MS`
  - 기본: 5분

## 8. 세금계산서(홈택스) 발행 규칙

- 입금 매칭(ChargeOrder MATCHED) 시점에 세금계산서 발행을 **즉시 전송하지 않고**, `TaxInvoiceDraft`를 자동 생성합니다.
- 기본 흐름은 아래와 같습니다.
  - `PENDING_APPROVAL`: 입금 매칭 시 자동 생성
  - `APPROVED`: 관리자 승인 완료
  - `SENT`: 익일 일괄 전송(성공)
  - `FAILED`: 전송 실패(재시도 대상)
  - `REJECTED`: 관리자 반려
  - `CANCELLED`: 전송 전 취소

### 8.1 승인 이후 변경/취소

- 관리자는 `SENT`(전송 완료) 이전까지 `TaxInvoiceDraft`의 금액/매입자 정보를 수정할 수 있습니다.
- 관리자는 `SENT`(전송 완료) 이전까지 `TaxInvoiceDraft`를 취소할 수 있습니다.

### 8.2 배치 실행 시간

- 세금계산서 전송 배치는 **매일 12:00 (KST)** 실행을 기준으로 합니다.
- 익일 전송 기준: 승인일(KST)과 전송일(KST)을 비교하여, 승인 당일 건은 제외하고 **익일부터** 전송합니다.

### 8.3 홈택스 연동(현재 단계)

- 홈택스 API 인증/전자서명/사업자 정보는 아직 연결 전이며, 현재는 **mock 전송**으로 `hometaxTrxId`만 생성합니다.

## 9. 팝빌(Popbill) 처리 아키텍처

### 9.1 큐 기반 아키텍처

- **단일 백그라운드 워커 전담**: 팝빌 관련 작업(세금계산서 발행/재시도, 계좌조회 수집/확인, 알림 큐 처리)은 백그라운드 워커가 전담합니다.
- **web → 큐 → 워커**: 외부 진입(web)에서 팝빌 연동이 필요한 이벤트는 큐(PopbillQueue)를 통해 워커로 전달합니다. web 인스턴스 다중화 시에도 중복 처리를 피하기 위해 직접 발행하지 않습니다.
- **헬스체크 + 오토리스타트**: 워커는 헬스체크 기반으로 자동 재시작합니다. 워커 장애가 곧 팝빌 기능 중단이므로 필수입니다.
- **아이덴포턴시**: 세금계산서 발행/취소, 계좌조회 수집 job, 알림 발송 키 등 모든 처리에 unique key + upsert로 중복 실행을 방지합니다.
- **모니터링/스케일업 준비**: 워커 처리 지연을 감시하는 모니터를 두고, 필요 시 큐 소비 워커를 1→N대로 확장(또는 서버 스케일업)할 수 있도록 합니다.
- **은행 웹훅**: BANK_WEBHOOK은 예외적으로 큐/워커를 거치지 않고 `/api/webhooks/bank`에서 웹 백엔드가 즉시 처리합니다. 큐에 enqueue 하지 않습니다.

### 9.2 큐 모델 (PopbillQueue)

- **taskType**: TAX_INVOICE_ISSUE, TAX_INVOICE_CANCEL, NOTIFICATION_KAKAO, NOTIFICATION_SMS, NOTIFICATION_LMS, EASYFIN_BANK_REQUEST, EASYFIN_BANK_CHECK
- **status**: PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED
- **uniqueKey**: 중복 방지를 위한 고유 키 (예: `tax_invoice_issue:${draftId}`)
- **payload**: 작업 수행에 필요한 데이터
- **priority**: 우선순위 (높을수록 먼저 처리)
- **maxAttempts**: 최대 재시도 횟수
- **scheduledFor**: 예약 실행 시간

### 9.3 큐 사용 방법

**web 백엔드에서 큐에 작업 등록:**

```javascript
import { enqueueTaxInvoiceIssue } from "../utils/queueClient.js";

const result = await enqueueTaxInvoiceIssue({
  draftId: "...",
  corpNum: "...",
  priority: 10,
});
```

**background 워커에서 자동 처리:**

- `popbillWorker.js`가 5초마다 큐를 폴링하여 작업 처리
- 실패 시 지수 백오프로 자동 재시도
- 최대 재시도 횟수 초과 시 FAILED 상태로 전환

## 10. 가공 시작(Webhook) 시 로트번호/장비명 부여 규칙

- **lotNumber 부여 시점**: CAM 승인 시에는 부여하지 않음. **가공 시작 웹훅(워커 호출)** 시에만 `ensureLotNumberForMachining`을 호출해 생성한다.
- **엔드포인트**: `POST /api/webhooks/machining-start`
  - Body: `{ requestId (또는 id), assignedMachine }`
  - (프로덕션) 헤더 `x-webhook-secret`가 `MACHINING_WEBHOOK_SECRET`와 일치해야 함.
- **처리 로직**:
  1. 요청 ID 검증 후 `ensureLotNumberForMachining(request)` 실행 → lotNumber 생성
  2. `assignedMachine` 설정, `assignedAt` 기록
  3. 저장 후 `{ id, lotNumber, assignedMachine, assignedAt }` 반환
- **프론트 표시**: 카드의 환자/치아 라인(상단)에서 `assignedMachine`과 `lotNumber` 배지를 함께 노출.

### 9.4 알림 큐 헬퍼

## 10. 역할/서브역할 정책 (Admin/Manufacturer/Requestor)

- User.role: `requestor` | `manufacturer` | `admin`
- 서브역할: 각 역할별로 `owner` / `staff`
  - requestorRole, manufacturerRole, adminRole 필수 (role별로만 의미 있음)
- 기본값: 가입 시 role=requestor, requestorRole=owner
- self-upgrade 금지: 본인은 role/서브역할 변경 불가

### 10.1 Admin 권한

- owner만: 금전 관련(크레딧 수동 처리, B-Plan 수동 매칭/입금 upsert/검증/락), 시스템 설정, 보너스 예외 지급
- staff 허용: 사용자 CRUD/role 변경, 의뢰 상태/배정, 세금계산서 승인/발행/취소(자동 처리된 건), 메일/SMS/알림톡 발송, 팝빌 큐 재시도/취소 등 비금전 영역

### 10.2 Manufacturer 권한

- owner만: 입금 기록 등 금전 관련
- staff 허용: 입금 조회, 긴급 메시지, 전화 인증
- 제조 워크플로(배정 수락/거절/상태 변경/출고/메타 수정) 권한은 별도 라우트에서 manufacturerRole로 분리 적용할 것

### 10.3 Requestor 권한

- owner: 조직 설정 수정, 대표/직원 관리, 환불 승인, 크레딧/조직 정보 수정
- staff: 본인 의뢰 생성/조회/취소 가능(조직 크레딧 사용 가능), 조직 설정/멤버 관리/환불 승인 불가
- 가입/탈퇴/조인 취소는 owner·staff 모두 가능

### 10.4 미들웨어/라우트 적용 원칙

- `authorize(roles, { adminRoles, manufacturerRoles, requestorRoles })`로 서브역할 체크
- 돈 관련은 owner 제한, 그 외는 명시 정책에 따라 staff 허용 여부 결정

```javascript
import { sendNotificationViaQueue } from "../utils/notificationQueue.js";

await sendNotificationViaQueue({
  type: "SMS",
  to: ["01012345678"],
  content: "알림 내용",
  priority: 0,
});
```
