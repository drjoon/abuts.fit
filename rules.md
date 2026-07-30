# abuts.fit rules (slim)

이 문서는 **루트 단일 기준(SSOT)** 규칙입니다.  
중복/히스토리/트러블슈팅 상세는 제거했고, 과거 전문은 `.archive/rules.legacy-2026-07-29.md`에 보관합니다.

---

## 0) 운영 원칙

### 0.1 문서/코드 동시 갱신 (강제)

한 작업에서 **3개 이상 파일**을 수정/탐색하면 아래를 함께 수행합니다.

1. `rules.md`에는 **중요 진입 파일 위치만** 간단히 갱신
2. 실제 수정한 코드 파일 상단에 `related files:` 상호참조 주석 갱신
3. 1~2 누락 시 작업 완료로 간주하지 않음

### 0.2 룰 문서 경량화 원칙

- 루트 `rules.md`: 정책 **요약/불변 규칙/진입점 지도**만 유지
- **루트 룰에는 루트에 적합한 것(전역 원칙/역할 간 공통 진입점)만 기록**
- 도메인/로컬 구현 메모(예: 프론트 훅/컴포넌트 단위 세부)는 각 로컬 `rules.md`에 기록
- 구현 로그/원인 분석/히스토리: 코드 주석 또는 `.archive/` 문서로 분리
- 하위 `rules.md`는 로컬 메모만 유지 (충돌 시 루트 우선)

### 0.3 상호참조 주석 템플릿

```ts
// related files:
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
```

- 경로는 저장소 루트 기준 상대경로
- “해당 파일이 직접 연결되는 파일”만 기록 (과도한 나열 금지)

### 0.4 애매한 정책은 보류 후 사용자 컨펌 (강제)

- 요구사항/정책이 애매하면 임의 확장/임의 축소 금지
- fallback, 추정값, 임시 하드코딩으로 진행하지 않음
- 판단 보류 상태를 명시하고 사용자에게 확인 질문 후 진행
- 특히 권한(role), 과금/정산, 추천(리퍼럴) 범위는 컨펌 없이 변경 금지

---

## 1) 절대 원칙 (변경 금지)

### 1.1 레거시 제거 / SSOT 단일화

- 레거시 alias, 이중 경로, 임시 fallback 금지
- 데이터는 **하나의 필드만 SSOT**로 사용
- 읽기 경로에서 보정/추정하지 말고, 쓰기 이벤트 시점에만 SSOT 갱신

### 1.2 무분별 fallback 금지

- 값이 없을 때 임의 추정값 주입 금지
- 없으면 빈값/null/명시적 오류로 드러내고 원인 수정

### 1.3 보안

- 비밀번호/API키/DB URI/JWT secret 하드코딩 금지
- 환경변수 미설정 시 즉시 실패

### 1.4 시간

- 모든 날짜/집계/표시는 KST(Asia/Seoul) 기준
- 월 경계/기간 필터도 KST 기준

### 1.5 구조

- 역할별 UI를 한 파일에서 분기하지 말고 역할 폴더 분리
- 소스 파일 800줄 초과 금지 (초과 시 분리)

---

## 2) 데이터/도메인 핵심 SSOT

### 2.1 사업자/권한

- 사업자 SSOT: `BusinessAnchor`
- 사용자-사업자 연결 키: `User.businessAnchorId`
- `subRole`만 사용 (`owner|staff|null`), 레거시 role 필드 금지
- 사업자 타입 허용: `requestor | manufacturer | admin | salesman | devops | practice`

### 2.2 의뢰 생성/공정

- 신규 의뢰 표준: `POST /api/requests/from-draft`
- 공정 SSOT: `Request.manufacturerStage`
  - `의뢰 → CAM → 가공 → 세척.패킹 → 포장.발송 → 추적관리`
- 승인/롤백 외 경로에서 과금/환불 로직 추가 금지

### 2.3 크레딧/정산

- 크레딧/배송/정산 귀속 키는 사용자 개인이 아니라 `businessAnchorId`
- 이벤트 기반 캐시 갱신 우선, 조회 시 대규모 재계산 지양

### 2.4 practice(치과) 전송

- practice는 **의뢰 파일 전송 전용 경량 role**로 취급
- practice 제출은 Request 생성 경유 금지
- SSOT API:
  - 생성: `POST /api/practice/transfers`
  - 조회: `GET /api/practice/transfers/my`
  - 취소: `POST /api/practice/transfers/cancel-batch`
- 저장 SSOT: `PracticeTransfer`
- 제조사 워크시트 조회에서 practice 태그 의뢰 제외
- 정책 고정: practice는 크레딧/정산/추천(리퍼럴) 기능/집계/보상 범위에 포함하지 않음

### 2.5 채팅

- 일반 의뢰 기반 채팅: `GET /api/chats/request-room/:requestId`
- practice 전송 기반 채팅: `GET /api/chats/practice/transfer-room/:transferId`
- 채팅 연결 판단은 라우팅 필드 SSOT 기준으로 처리

### 2.6 CNC/브리지

- 브리지/장비 상태 SSOT는 백엔드 DB
- 자동가공(Worksheet) 큐와 수동업로드(Equipment) 큐 절대 분리
- `allowAutoMachining`(자동가공)과 `allowJobStart`(수동시작) 의미 혼용 금지

### 2.7 배송/우편함

- 묶음 배송 식별은 박스/패키지 기준으로 유지
- 배송비 과금 시점: 세척.패킹 승인
- 추적관리 진입 기준: 집하완료(statusCode 11 / picked_up)

### 2.8 R&D 샘플

- 의뢰 분류 SSOT: `Request.requestCategory`
  - `order | rnd_sample | copied_sample`
- 운영 통계에는 샘플 제외, 작업 카드에는 정책에 따라 표시

---

## 3) 주요 금지사항 요약

- 브라우저 `alert/confirm/prompt` 사용 금지 (`ConfirmDialog` 사용)
- 프론트가 BG/브리지 서버 직접 호출 금지 (백엔드 프록시 경유)
- 규칙 우회용 임시 분기/레거시 보존 금지
- 정책 변경 없이 색상/단계명/필드명 임의 확장 금지

---

## 4) 중요 진입 파일 지도 (rules에는 이것만 유지)

아래 파일은 도메인 진입점이므로, 정책 변경 시 우선 확인합니다.

### 4.1 Frontend

- 앱/라우팅
  - `web/frontend/src/App.tsx`
  - `web/frontend/src/features/layout/DashboardLayout.tsx`
- 공용 타입(역할 SSOT)
  - `web/frontend/src/shared/types/role.ts`
- 실시간(웹소켓) 공통
  - `web/frontend/src/shared/realtime/socket.ts`
  - `web/frontend/src/shared/realtime/useAppEventDebouncedReload.ts`
- 의뢰자 신규의뢰/치과
  - `web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx`
  - `web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx`
- 제조사 워크시트
  - `web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx`
  - `web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx`
  - `web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetStageSearchInput.tsx`
- practice
  - `web/frontend/src/pages/practice/PracticeDropzonePage.tsx`
  - `web/frontend/src/pages/practice/PracticeFileTransferPage.tsx`
  - `web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx`
  - `web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx`
- 관리자 사용자/사업자
  - `web/frontend/src/pages/admin/users/AdminUserManagement.tsx`
  - `web/frontend/src/pages/admin/businesses/AdminBusinessPage.tsx`
- 관리자 대시보드/소통
  - `web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx`
  - `web/frontend/src/pages/admin/support/AdminChatManagement.tsx`

### 4.2 Backend

- 서버 엔트리
  - `web/backend/app.js`
  - `web/backend/server.js`
- 의뢰/공정
  - `web/backend/modules/requests/request.routes.js`
  - `web/backend/controllers/requests/creation.from-draft.controller.js`
  - `web/backend/controllers/requests/common.review.controller.js`
  - `web/backend/controllers/requests/common.requests.controller.js`
- CNC/브리지
  - `web/backend/controllers/cnc/machiningBridge.js`
- 채팅
  - `web/backend/modules/chat/chat.routes.js`
  - `web/backend/controllers/chats/chat.controller.js`
- practice 전송
  - `web/backend/modules/practiceTransfers/practiceTransfer.routes.js`
  - `web/backend/controllers/practiceTransfers/practiceTransfer.controller.js`
  - `web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js`
  - `web/backend/models/businessAnchor.model.js`
- 관리자 사용자 권한
  - `web/backend/controllers/admin/admin.users.controller.js`

### 4.3 Background

- Rhino: `bg/pc1/rhino-server/compute/scripts/process_abutment_stl.py`
- Esprit: `bg/pc1/esprit-addin/DentalAddin/MainModuleComposite.cs`
- Bridge: `bg/pc1/bridge-server/`
- LOT: `bg/pc2/lot-server/`
- WBL: `bg/pc3/wbls-server/app.js`

### 4.4 단위 프로그램 로컬 rules 위치

- Frontend: `web/frontend/rules.md`
- Backend: `web/backend/rules.md`
- Rhino: `bg/pc1/rhino-server/rules.md`
- Esprit: `bg/pc1/esprit-addin/rules.md`
- Bridge: `bg/pc1/bridge-server/rules.md`
- LOT: `bg/pc2/lot-server/rules.md`
- Pack: `bg/pc2/pack-server/rules.md`
- WBL: `bg/pc3/wbls-server/rules.md`

### 4.5 상세 정책 참조 인덱스 (누락 방지)

- 원문 보존본(archive): `.archive/rules.legacy-2026-07-29.md`
- 로컬 전체 상세 미러(운영 참조본): `rules.legacy-full.md`
- 원칙:
  - 루트 `rules.md`는 요약/진입점/불변 원칙만 유지
  - 세부 정책/히스토리/예외 규칙은 각 로컬 `rules.md` + 전체 상세 미러에서 참조
  - 정책 해석 충돌 시 우선순위: 루트 요약 원칙 > 해당 도메인 로컬 rules > 전체 상세 미러

---

## 5) 변경 체크리스트 (작업 종료 전)

- [ ] 레거시/중복 필드 제거 완료
- [ ] fallback 없이 SSOT 단일 경로로 정리
- [ ] 수정 파일 상단 `related files` 주석 갱신
- [ ] 루트 `rules.md`의 중요 진입점 필요 시 갱신
- [ ] 가능하면 최소 범위 테스트/검증 실행

---

## 부록) 문서 범위 밖 항목

- 상세 이력/긴 트러블슈팅/과거 정책 비교표는 루트 rules에서 제거
- 필요 시 `.archive/` 또는 각 도메인 로컬 문서로 관리
