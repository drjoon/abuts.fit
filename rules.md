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
4. 작업 중 발견한 중요 결정/예외/운영 기준은 루트 또는 해당 도메인 로컬 `rules.md`에 즉시 기록

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

### 0.5 작업 우선순위 원칙 (강제)

- 여러 작업을 동시에 진행할 때는 **중요도 순서**로 처리한다.
- 결제/크레딧/정산/권한/데이터무결성 같은 고위험 변경을 먼저 처리한다.
- 단순 반복 작업(예: 이름 교체, 문구 통일, 포맷 정리)은 핵심 로직 안정화 후에 처리한다.

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
- 크레딧 이벤트 발생 시점 SSOT:
  - `REQUEST_SPEND_COMMIT`: **CAM 승인(가공 진입)** 시 기록
  - `SHIPPING_SPEND_COMMIT`: **세척.패킹 승인(포장.발송 진입)** 시 기록
  - `REQUEST` 차감 삭제: **가공 롤백(CAM 복귀)** 시 대응 COMMIT 이벤트/라인 **물리 삭제**
  - `SHIPPING` 차감 삭제: **포장.발송 롤백(세척.패킹 복귀)** 시 대응 COMMIT 이벤트/라인 **물리 삭제**
  - BG 콜백은 파일 처리 결과 동기화 이벤트이며 승인/롤백 트랜지션이 아니므로,
    BG 콜백에서 크레딧/정산 장부 갱신을 수행하지 않음
- 샘플 정책(강제): `requestCategory in (rnd_sample, copied_sample)`는 크레딧/정산 무관 작업
  - 샘플은 장부에 **무기록(무자료/무상)** 처리
- 제조사 직접 NC 가공 정책(강제): `requestId`/`request._id` 등 의뢰 식별 메타가 없는 수동 NC 작업은
  크레딧/정산 대상이 아니며 장부에 **무기록(무자료/무상)** 처리
- 불완전가공(RnD unmachinable) 정책(강제):
  - 불완전가공은 샘플이 아니며, CAM 승인으로 이미 발생한 크레딧 차감은 유지한다.
  - 불완전가공 판정으로 CAM 복귀가 발생해도 장부 삭제/환불을 수행하지 않는다.
  - CAM 이전 취소(의뢰/CAM 단계 취소)만 차감 미발생 상태로 처리한다.

### 2.3 크레딧/정산

- 단일 SSOT 장부: `LedgerJournal` + `LedgerLine`(논리적으로 하나의 General Ledger)
- 기존 분리 원장(`CreditLedger`, `ManufacturerCreditLedger`, `SalesmanLedger`, `AdminCreditLedger`)은
  **레거시로 간주하며 단계적 이관 후 삭제**한다. 이관 중 이중기록(dual-write) 금지.
- 필수 이벤트 타입 SSOT(저장형):
  - `REQUEST_SPEND_COMMIT`, `SHIPPING_SPEND_COMMIT`
  - `CHARGE_PAID`, `CHARGE_FREE_REQUEST`, `CHARGE_FREE_SHIPPING`, `ADJUST`, `SETTLEMENT_PAYOUT`
- 수익 계정 SSOT:
  - `REV_MANUFACTURER`, `REV_DEVOPS`, `REV_SALESMAN`, `REV_ADMIN`
  - 유료/무료 모두 수익 라인을 기록하되, 정산 지급은 유료만 대상
  - 배송비 정책(강제): 배송 크레딧 소비(`SHIPPING_SPEND_COMMIT`)의 수익은 **전액 제조사 귀속**으로 기록
  - paid/free 혼합 소비는 의뢰자 잔액에서 **무료 우선 차감 후 부족분만 유료 차감**을 적용
  - 수익 라인(`REV_*`)의 paid/free 표시는 role 순서가 아니라 소비된 paid/free 총량을 role base에 비례 배분(무편향)해 기록
  - 무료 수익은 지급 0원으로 정산완료 상태만 표시 가능
- 롤백 원칙:
  - 롤백은 REFUND 추가가 아니라 원본 커밋 이벤트 및 대응 라인의 **물리 삭제**
- 조회/표시 타입 원칙:
  - 충전은 `CHARGE_PAID` / `CHARGE_FREE_REQUEST` / `CHARGE_FREE_SHIPPING`으로 분리 표기 (`CHARGE` 단일표시 금지)
  - 소비는 `SPEND_PAID` / `SPEND_FREE_REQUEST` / `SPEND_FREE_SHIPPING`으로 분리 표기 (`SPEND` 단일표시 금지)
- 정산 보존식 SSOT(의뢰 단위):
  - `의뢰자 순소비(현존 COMMIT 이벤트 기준)` = `어벗츠/제조사/개발운영사/영업자 수익합`
  - 합계 비교는 VAT 제외 공급가(`amountExcludingVat`) 우선
- 정산 지급 가능 잔액 집계 원칙(공통):
  - `SETTLEMENT_PAYOUT`은 포함
  - `EARN/ADJUST`는 `creditKind=PAID|null`만 포함 (무료 수익/무료 조정은 지급 대상 제외)
- CreditLedger → GL 이관 보정 원칙:
  - 레거시 `CreditLedger`를 원본으로 이관하되, 정책 위반/무효 행(예: 0원 SPEND, 참조 누락된 상쇄형 SHIPPING SPEND/REFUND 쌍)은 장부 반영 대신 무시 처리
  - 샘플(`rnd_sample|copied_sample`) 및 비의뢰 수동 NC 작업은 장부 무기록 원칙 유지
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
- 강제 분리: practice 클라이언트/서버는 `Request` 도메인 API(`/api/requests/*`)를 사용하지 않는다.
  - 레거시 혼입 경로(예: `/api/requests/practice/*`, practice의 Request draft 접근)는 제거 대상으로 관리한다.

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

- 루트에는 전역 진입점만 유지합니다.
  - `web/frontend/src/App.tsx`
  - `web/frontend/src/features/layout/DashboardLayout.tsx`
  - `web/frontend/src/shared/types/role.ts`
- 프론트 상세 진입 파일 지도는 `web/frontend/rules.md`를 참조합니다.

### 4.2 Backend

- 루트에는 전역 진입점만 유지합니다.
  - `web/backend/app.js`
  - `web/backend/server.js`
  - `web/backend/utils/distributedJobLock.js` (멀티 인스턴스 워커 락 SSOT)
- 백엔드 상세 진입 파일 지도는 `web/backend/rules.md`를 참조합니다.

### 4.3 Background

- BG 상세 진입 파일 지도는 각 프로그램 로컬 `rules.md`를 참조합니다.
  - `bg/pc1/rhino-server/rules.md`
  - `bg/pc1/esprit-addin/rules.md`
  - `bg/pc1/bridge-server/rules.md`
  - `bg/pc2/lot-server/rules.md`
  - `bg/pc2/pack-server/rules.md`
  - `bg/pc3/wbls-server/rules.md`

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

## 6) 인프라 마이그레이션 완료 기준 (EB → LB+NAT)

- 목표 SSOT:
  - EB 단일 인스턴스 구조를 **로드밸런싱 + NAT 인스턴스 구조**로 전환
  - MongoDB Atlas 비용은 기존 수준을 유지
- 안정화 관찰 기간(며칠):
  - 실사용 트래픽 기준 핵심 기능 점검(로그인, 주문/의뢰 등록 등)
  - 에러 리포팅/CloudWatch 알람 확인
  - 피크 시간대 오토스케일링 동작 확인(최대 2대 시나리오)
  - 단일 NAT 인스턴스 재부팅/장애 없이 안정 동작하는지 확인
- 보강 권장(선택):
  - NAT 자동 복구를 위해 CloudWatch 알람 + Auto Scaling Group(최소=최대=1) 구성 검토
- 마이그레이션 최종 종료 조건:
  - 안정화 기간 동안 이상 없음
  - 기존 `abutsfit`(단일 인스턴스) 환경 종료
  - Atlas Network Access에서 기존 EIP 제거 후 NAT IP만 유지

---

## 부록) 문서 범위 밖 항목

- 상세 이력/긴 트러블슈팅/과거 정책 비교표는 루트 rules에서 제거
- 필요 시 `.archive/` 또는 각 도메인 로컬 문서로 관리
