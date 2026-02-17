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
|-- /controllers    # API 핸들러 (도메인별 폴더: controllers/auth, controllers/requests 등)
|-- /models         # Mongoose 모델
|-- /modules        # 도메인 단위 라우트(modules/*/*.routes.js)
|-- /middlewares    # 미들웨어
|-- /utils          # 유틸리티 함수
`-- /jobs           # 백그라운드 워커
```

### 3.1 라우트 구성 원칙 (2026-02 리팩터링)

- 모든 라우트는 `modules/<domain>/*.routes.js` 구조로 통합됨.
- `app.js`는 `modules/*`에 있는 라우트를 import해서 `/api/...` prefix에 mount한다.
- 새로 추가/변경하는 도메인 라우트는 `modules/<domain>/` 아래에 둔다.

### 3.2 컨트롤러 구성 원칙 (2026-02 리팩터링)

- 컨트롤러는 `controllers/<domain>/` 폴더로 그룹화한다.
- 예: `controllers/auth/auth.controller.js`, `controllers/requests/creation.controller.js`
- 도메인별 barrel 파일(index 역할)로 재export하여 import 간결화.

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

## 6. CNC 예약목록(브리지 큐) DB 스냅샷

- **목적**: 브리지 서버 장애/네트워크 오류 시에도 제조사 UI에서 예약목록을 조회할 수 있도록, 마지막으로 확인된 브리지 큐를 DB에 스냅샷으로 저장한다.
- **저장 위치**: `CncMachine.bridgeQueueSnapshot` (jobs + updatedAt), `CncMachine.bridgeQueueSyncedAt`
- **갱신 규칙**:
  - 브리지 큐 조회가 성공한 경우에만 DB 스냅샷을 갱신한다.
  - 큐 변경(등록/삭제/재정렬/수량변경/전체삭제)이 브리지에서 성공한 경우에만 DB 스냅샷을 갱신한다.
- **조회 규칙**:
  - 제조사 UI의 `/api/cnc-machines/:machineId/bridge-queue`는 브리지 우선 조회 후,
    실패하면 DB 스냅샷을 `success: true`로 반환한다(fallback).

### 6.2 동기화 방식 (이벤트 드리븐 우선)

- **대전제**: 폴링은 최대한 자제하고, 가능한 모든 동기화는 **이벤트 드리븐(push)** 으로 구현한다.
- **폴링 도입 금지**: 주기적 폴링이 꼭 필요하다고 판단되면, 반드시 사전에 사용자 승인 후 도입한다.
- **브리지 큐 동기화 기본**:
  - DB(SSOT)의 `bridgeQueueSnapshot`이 변경되면 백엔드는 브리지 서버로 즉시 push한다.
  - Endpoint: `POST {BRIDGE_BASE}/api/bridge/queue/:machineId/replace` (jobs 전체 스냅샷)

### 6.1 브리지 전용 DB 스냅샷 조회

- 브리지 서버는 JWT 없이 `X-Bridge-Secret` 기반으로 DB 스냅샷을 조회할 수 있다.
- Endpoint: `GET /api/cnc-machines/bridge/queue-snapshot/:machineId`

## 7. CNC 가공 기록 (Bridge -> Backend -> DB)

- **목적**: 브리지 서버가 보내는 machining tick/complete/fail 이벤트를 통해, 의뢰(Request)의 실제 가공 이력을 DB에 안정적으로 기록한다.
- **저장 위치(SSOT)**: `MachiningRecord` 컬렉션
  - 필수 기록:
    - `startedAt` (가공 시작 시각)
    - `completedAt` (가공 종료 시각)
    - `durationSeconds` (최종 소요 시간)
    - `status` (RUNNING | COMPLETED | FAILED | CANCELED)
  - 진행 중 보강:
    - `lastTickAt`, `elapsedSeconds`, `percent`
  - 실패 보강:
    - `failReason`, `alarms`
- **Request 연결(populate)**:
  - `Request.productionSchedule.machiningRecord`에 `MachiningRecord._id`를 저장하고, 조회 시 populate해서 사용한다.
- **업데이트 지점(코드)**:
  - Tick: `backend/controllers/cncMachine/machiningBridge.js` -> `recordMachiningTickForBridge`
  - Complete: `backend/controllers/cncMachine/machiningBridge.js` -> `recordMachiningCompleteForBridge`
  - Fail: `backend/controllers/cncMachine/machiningBridge.js` -> `recordMachiningFailForBridge`
- **주의**:
  - `Request.productionSchedule.machiningProgress`는 UI/소켓 실시간 표시용으로 유지하고, 영속적인 이력/최종값은 `MachiningRecord`를 기준으로 한다.

### 5.1 크레딧 관리 정책

- **충전**: 조직 단위로 크레딧 충전 (공급가 기준 적립, 결제는 공급가+VAT)
- **차감**: 의뢰 생성 시 조직의 크레딧에서 차감 (누가 의뢰하든 동일한 조직 크레딧 사용)
- **환불**: 의뢰 취소 시 조직 크레딧으로 복원
- **조회**: 조직 내 모든 멤버가 동일한 잔액 조회 (`GET /api/credits/balance`)

#### 5.1.1 리퍼럴 그룹 기반 주문량 합산 정책

**그룹 구조**:

- **1차 리더**: 소개 없이 가입한 기공소 (`referralGroupLeaderId = null`)
- **n차 멤버**: 리더의 리퍼럴 코드로 가입한 모든 기공소 (`referralGroupLeaderId = 리더 ID`)
- **체인 구조**: A(리더) → B(A의 리퍼럴) → C(B의 리퍼럴) → ... 모두 동일 그룹
  - B가 가입할 때: `referrer(A).referralGroupLeaderId = null` → B의 리더 = A
  - C가 가입할 때: `referrer(B).referralGroupLeaderId = A` → C의 리더 = A (상속)

**주문량 합산(다단계)**:

- **조회 대상**: 내 계정 + 내 직계 1단계(내 추천으로 가입한 계정들)의 지난 30일 완료 주문량
- **할인 계산**: 위 합산 주문량 기준으로 단가 할인 적용
- **예시**:
  - A(리더)는 A + (A가 직접 추천한 계정들)의 주문량만 합산
  - B(2단계)는 B + (B가 직접 추천한 계정들)의 주문량만 합산

**리더 변경 처리**:

- **리더 삭제 시**: 그룹 내 가장 오래된 멤버가 새로운 리더로 자동 승격
- **멤버 업데이트**: 모든 그룹 멤버의 `referralGroupLeaderId`를 새 리더로 변경
- **구현**: `handleReferralGroupLeaderChange(deletedUserId)` 함수 (utils.js)

**API 응답**:

- `GET /api/requests/my/pricing-referral-stats`
- `myLast30DaysOrders`: 본인 주문량 (참고용)
- `groupTotalOrders`: 본인+직계(1단계) 주문량 합산 (할인 계산 기준)
- `groupMemberCount`: 본인+직계 멤버 수
- `totalOrders`: 본인+직계 주문량 (= groupTotalOrders)
- `discountAmount`: 그룹 기준 할인액
- `effectiveUnitPrice`: 적용 단가

### 5.1.2 관리자용 리퍼럴 그룹 계층도 및 스냅샷

- **목표**: 리더 기준 계층도를 확인하되, 단가/주문 합산은 "리더 본인+직계 1단계" 기준으로 계산하고 당일 첫 조회 시 스냅샷을 생성함.
- **스냅샷 키**: `(ownerUserId, yyyy-MM-dd)`
- **스냅샷 생성 시점**
  - 요청자 API(`GET /api/requests/my/pricing-referral-stats`)는 본인+직계 기준 스냅샷을 조회/생성.
  - 관리자 API(`GET /api/admin/referral-groups/:leaderId`)에서 **스냅샷이 없으면** 리더 본인+직계 기준 주문량으로 `PricingReferralStatsSnapshot`을 upsert.
  - 목록 API(`/api/admin/referral-groups`)은 snapshot이 없으면 `groupTotalOrders=0`으로 둔 채 `미생성` 배지를 보여줌.
- **관리자 대시보드 설명**
  - `/dashboard/referral-groups` 페이지
    - 상단 overview 카드: 전체 그룹 수/계정 수/최근30일 주문 합산(리더+직계)/평균 단가
    - 그룹 리스트: 각 그룹 recent30일 주문(리더+직계), 단가, snapshot 생성 여부(“미생성” 배지)
    - 계층도 트리: 멤버별 최근30일 주문, 클릭 시 기본 정보 다이얼로그, 트리 상단에 그룹 주문·단가
  - 트리 조회 시 snapshot이 없는 그룹이면 처음 조회에서 snapshot 생성 → 다음 목록 새로고침부터 값 반영
  - Dialog shows account status, recent 30-day orders, email, ID, parent referral ID, creation date

문서화한 정책과 실제 UI/모델이 일치하는지 확인 후 배포 바랍니다.

### 5.2 생산 프로세스 및 스케줄 관리 정책 (시각 단위)

**생산 프로세스 타임라인**:

```
[의뢰] → (대기) → [CAM 시작] → (5분) → [CAM 완료] → [가공 시작] → (15분) → [가공 완료] → (배치 처리 1일) → [발송] → (택배 1영업일) → [완료]
```

**핵심 개념**:

- **대기 단계**: 의뢰 단계는 생산 시작을 기다리는 대기 단계 (한참 걸릴 수 있음)
- **CAM 단계**: CAM 시작 → CAM 완료까지 5분 소요
- **가공 단계**: CNC 가공 시작 → 가공 완료까지 15분 소요
- **배치 처리**: 가공 완료된 반제품 50~100개를 모아서 세척/검사/포장 (1일 소요)
- **운송장 입력 마감**: 매일 15:00(KST)까지 택배사 시스템에 당일 출고 내역(운송장)을 입력
- **택배 수거**: 매일 16:00(KST) 택배 차량이 방문하여 준비된 박스를 수거
- **배송**: 택배 수거일 다음 영업일 도착
- **시각 단위 관리**: 모든 스케줄을 시각(DateTime) 단위로 관리

**배송 모드별 스케줄 계산 (시각 기반)**:

1. **신속배송** (`originalShipping.mode: "express"`):
   - 대기 없이 즉시 CAM 시작
   - `scheduledCamStart` = 의뢰 시각
   - `scheduledCamComplete` = CAM 시작 + 5분
   - `scheduledMachiningStart` = CAM 완료 (즉시)
   - `scheduledMachiningComplete` = 가공 시작 + 15분
   - `scheduledBatchProcessing` = 가공 완료 + 1영업일 (세척/검사/포장)
   - `scheduledShipPickup` = 배치 처리 완료 후 다음날 16:00
   - `estimatedDelivery` = 택배 수거일 + 1영업일

2. **묶음배송** (`originalShipping.mode: "normal"`):
   - 직경별 대기 시간 적용 (CNC 장비별 소재 세팅 고려)
   - **6mm**: M3 전용 장비, 대기 0시간
   - **8mm**: M4 전용 장비, 대기 0시간
   - **10mm, 12mm**: 일주일에 1~2회 소재 교체하여 생산, 평균 대기 72시간
   - 대기 후 CAM 시작 → +5분 CAM 완료 → +15분 가공 완료 → +1일 배치 처리 → 다음날 16:00 택배 수거 → +1영업일 도착

**배송 옵션 데이터 구조**:

- `originalShipping`: 신규 의뢰 시 의뢰자가 선택한 원본 배송 옵션 (불변)
  - `mode`: "normal" | "express"
  - `requestedAt`: 의뢰 생성 시각 (Date)
- `finalShipping`: 의뢰자가 배송 대기 중 변경 가능한 최종 배송 옵션
  - `mode`: "normal" | "express"
  - `updatedAt`: 마지막 변경 시각 (Date)
- `productionSchedule`: 생산자 관점의 스케줄 (시각 단위, 생산 큐 관리용)
  - `scheduledCamStart`: CAM 시작 예정 시각 (Date)
  - `scheduledCamComplete`: CAM 완료 예정 시각 (Date, CAM 시작 + 5분)
  - `scheduledMachiningStart`: 가공 시작 예정 시각 (Date)
  - `scheduledMachiningComplete`: 가공 완료 예정 시각 (Date, 가공 시작 + 15분)
  - `scheduledBatchProcessing`: 배치 처리 예정 시각 (Date, 가공 완료 + 1영업일)
  - `scheduledShipPickup`: 택배 수거 시각 (Date, 배치 처리 완료 후 다음날 16:00)
  - `estimatedDelivery`: 도착 예정 시각 (Date, 택배 수거일 + 1영업일)
  - `actualCamStart`, `actualCamComplete`, `actualMachiningStart`, `actualMachiningComplete`, `actualBatchProcessing`, `actualShipPickup`: 실제 시각 (Date)
  - `assignedMachine`: 할당된 CNC 장비 (String, "M3" | "M4" | null)
  - `queuePosition`: 해당 장비 큐에서의 위치 (Number)
  - `diameter`: 실제 직경 (Number, mm)
  - `diameterGroup`: 직경 그룹 (String, "6" | "8" | "10" | "12")

**배송 옵션 변경 규칙 (Fire & Forget)**:

- 의뢰 단계에서만 변경 가능 (CAM 단계부터는 변경 불가)
- 변경 시 `originalShipping`은 보존, `finalShipping`만 업데이트
- `productionSchedule` 재계산하여 생산 큐 반영
- **Fire & Forget 방식**: API는 즉시 응답 반환, 백그라운드에서 비동기 처리
- UI 대기 시간 없음 (사용자 경험 개선)

**공정 단계 진행 규칙 (시각 기반)**:

1. **의뢰 → CAM**: **수동 처리** (제조사가 직접 CAM 작업 시작)
2. **CAM → 생산**: **수동 처리** (제조사가 CAM 승인 후 가공 큐에 추가)
3. **생산 → 발송**: `productionSchedule.scheduledBatchProcessing <= 현재 시각` (배치 처리 완료, 자동 진행)
4. **발송 → 완료**: `deliveryInfoRef.deliveredAt` 존재 (배송 완료 API에서 처리)

**CNC 장비별 생산 큐 시스템**:

- **M3 장비**: 6mm 전용 (기본 세팅)
- **M4 장비**: 8mm 전용 (기본 세팅)
- **10mm, 12mm**: 소재 교체 필요 (unassigned 상태로 대기)

**장비별 큐 우선순위**:

- 각 장비마다 독립적인 큐 관리
- **우선순위**: 도착 예정시각(`estimatedDelivery`) 순서만 고려 (FIFO)
- 점수 계산 없음, 단순 시각 순서

**소재 세팅 변경**:

- 제조사가 M3 또는 M4의 소재를 12mm로 변경 시
- 해당 직경 그룹의 unassigned 의뢰를 자동으로 장비에 할당
- 도착 예정시각 순으로 큐에 추가

**소재 교체 예약 기능**:

- **목적**: 12mm 의뢰가 쌓여있을 때, 특정 시각에 소재를 교체하여 대기 중인 의뢰를 처리
- **예약 방법**: `POST /api/cnc-machines/:machineId/schedule-material-change`
  - `targetTime`: 교체 목표 시각 (Date)
  - `newDiameter`: 새 소재 직경 (Number)
  - `newDiameterGroup`: 새 직경 그룹 (String, "6" | "8" | "10" | "12")
  - `notes`: 메모 (String, optional)
- **예약 취소**: `DELETE /api/cnc-machines/:machineId/schedule-material-change`
- **자동 처리 로직** (productionScheduler 워커):
  1. 예약된 교체 시각 도래 시 자동 실행
  2. 현재 장비에 할당된 의뢰 중 교체 시각 이전에 완료 불가능한 의뢰는 unassigned로 변경
  3. 소재 교체 실행 (currentMaterial 업데이트)
  4. 새 직경 그룹의 unassigned 의뢰를 해당 장비에 자동 할당
- **UI 표시**: 제조사 대시보드에서 장비별 예약된 소재 교체 정보 표시

**지연 위험 요약**:

- **지연(delayed)**: `scheduledCamStart < 현재 시각`
- **경고(warning)**: `scheduledCamStart - 현재 시각 <= 4시간`
- 모든 role 대시보드에 지연 위험 요약 표시 (눈에 띄게 UI 처리)
- 제조사/관리자가 긴급 상황 인지 가능

**배송 운영 마감(제조사 우선순위) 정책**:

- 매일 15:00(KST) 운송장 입력 마감에 맞추기 위해, 발송 이전 단계(의뢰/CAM/생산)에 있는 의뢰는 **출고 마감(15:00) 기준으로 우선순위를 계산**한다.
- **신속배송(Express)**:
  - KST 기준 **당일 00:00까지 주문된 신속배송**은 당일 15:00 출고 내역에 포함되어 익일 도착하도록 처리한다.
  - 따라서 신속배송 의뢰가 발송 이전 단계에 있다면 다른 건보다 우선순위를 높게 잡아 신속히 발송 단계까지 진행한다.
- **묶음배송(Bulk/Normal)**:
  - 도착예정일을 맞추기 위해, **도착 예정일 전(직전 영업일) 15:00**까지 운송장 입력이 가능해야 한다.
  - 이를 위해 해당 시각 이전에 생산 단계까지 완료되어 발송 대기 상태가 되도록 스케줄/우선순위를 관리한다.

**자동화 구현**:

- 백그라운드 워커: `/background/jobs/productionScheduler.js`
- 5분 간격으로 실행
- 생산 스케줄 기준으로 공정 단계 자동 진행
- 상태 조회: `GET /status` (background worker)

**하위 호환성**:

- `timeline.estimatedCompletion`: `productionSchedule.estimatedDelivery.toISOString().slice(0, 10)` (String, YYYY-MM-DD)
- 기존 날짜 기반 로직과의 호환성 유지

### 5.3 의뢰 취소 및 정보 변경 정책

**취소 정책**:

- **취소 가능 단계**: `의뢰`, `CAM` 단계에서 취소 가능
- **취소 불가 단계**: `생산` 단계부터는 취소 불가 (고객센터 문의 필요)
- **취소 방법**: `DELETE /api/requests/:id` (상태를 '취소'로 변경, 실제 삭제 아님)
- **크레딧 환불**: 취소 시 조직 크레딧으로 자동 환불

**정보 변경 정책**:

- **의뢰 단계**: 모든 정보 수정 가능 (환자 정보, 임플란트 정보)
- **CAM 단계 (승인 전)**: 모든 정보 수정 가능
- **CAM 완료 후**: 환자 정보만 수정 가능, 임플란트 정보 수정 불가
  - 수정 가능: `patientName`, `patientAge`, `patientGender`, `messages`
  - 수정 불가: `implantType`, `implantBrand`, `implantDiameter`, `implantLength`, `maxDiameter`, `connectionDiameter`, `toothNumber`, `abutType`
- **생산 단계 이후**: 환자 정보만 수정 가능, `caseInfos` 전체 수정 불가
- **변경 방법**: `PUT /api/requests/:id`
- **관리자**: 모든 단계에서 모든 정보 수정 가능

### 5.2 의뢰건 조회 권한 정책

**기본 원칙**: 동일 조직(RequestorOrganization) 소속이면 역할(owner/staff)과 무관하게 조직 내 모든 의뢰를 조회/접근할 수 있습니다.

**구현**:

- `buildRequestorOrgScopeFilter()`: 조직 단위 필터링
- `canAccessRequestAsRequestor()`: 동일 조직이면 접근 허용

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

### 10.1 lotNumber 구조

- **Request.lotNumber**: 중첩 객체 구조로 관리
  ```javascript
  lotNumber: {
    material: String,  // 원소재 Heat No.
    part: String,      // 반제품 로트번호 (CAP+YYMMDD-AAA)
    final: String      // 완제품 로트번호 (CA+YYMMDD-AAA)
  }
  ```
- **레거시 필드 제거**: `rawMaterialHeatNo`, `finishedLotNumber` 필드는 더 이상 사용하지 않음

### 10.2 로트번호 부여 시점

- **원소재(material)**: 가공 시작 웹훅에서 `assignedMachine`의 현재 소재(`currentMaterial.heatNo`)를 조회해 `lotNumber.material`에 저장
- **반제품(part)**: 의뢰 단계 승인 직후(CAM 진입) `ensureLotNumberForMachining(request)` 호출 → `lotNumber.part`에 `CAP+YYMMDD-AAA` 생성
- **완제품(final)**: `packaging` 단계 승인 시 `ensureFinishedLotNumberForPackaging(request)` 호출 → `lotNumber.final`에 `CA+YYMMDD-AAA` 생성

### 10.3 가공 시작 웹훅

- **엔드포인트**: `POST /api/webhooks/machining-start`
  - Body: `{ requestId (또는 id), assignedMachine }`
  - (프로덕션) 헤더 `x-webhook-secret`가 `MACHINING_WEBHOOK_SECRET`와 일치해야 함
- **처리 로직**:
  1. 요청 ID 검증 (반제품 로트번호는 의뢰 승인 시 이미 존재하므로 추가 생성 없음)
  2. `assignedMachine` 설정, `assignedAt` 기록
  3. 원소재 Heat No를 `lotNumber.material`에 스냅샷 저장
  4. 저장 후 `{ id, lotNumber: { material, part, final }, assignedMachine, assignedAt }` 반환
- **프론트 표시**: 카드의 환자/치아 라인(상단)에서 `assignedMachine`과 `lotNumber.part` 배지를 함께 노출

### 10.4 CAM 롤백 시 로트번호 초기화

- CAM 파일 삭제 및 의뢰 단계 복귀 시:
  ```javascript
  request.lotNumber = request.lotNumber || {};
  request.lotNumber.part = undefined;
  request.lotNumber.final = undefined;
  request.lotNumber.material = "";
  }
  ```

## 11. CNC 장비 '의뢰 배정' 정책 (allowRequestAssign)

- CNC 장비의 **의뢰 배정 후보 여부**는 `Machine.allowRequestAssign` 단일 옵션으로 결정한다.
- 이 옵션은 다음 로직에서 **장비 후보 필터**로 사용한다.
  - **의뢰 → CAM** 승인 시 CAM 소재 직경 확정/스크리닝 대상
  - **CAM → 가공** 승인 시 가공 장비 자동 선택 대상
- `allowAutoMachining`(자동 가공 시작) 및 `allowJobStart`(원격가공/제어) 옵션은
  - **의뢰 배정 후보 필터링에 사용하지 않는다.**
  - 자동 시작(브리지 트리거) 등 **실행 동작 제어**에만 사용한다.

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
