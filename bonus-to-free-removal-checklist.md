# Bonus -> Free 삭제 우선순위 체크리스트

## 목적
- `bonus*` 레거시 alias/fallback/type/route를 제거하고
- SSOT를 `freeRequestCredit`, `freeShippingCredit`, `freeBalance`로 단일화한다.

## 우선순위 (실행 순서)

### 1) 데이터 모델 SSOT 정리 (최우선)
- [x] `BusinessCreditBalance`에서 `bonusRequestCredit`, `bonusShippingCredit` 제거
- [x] `SystemSettings.creditSettings`에서 `defaultWelcomeBonusCredit`, `defaultFreeShippingCredit` 제거
- [x] `FreeCreditGrant.type`에서 `WELCOME_BONUS` 제거

### 2) 장부/잔액 계산 경로 정리
- [x] `creditBalance.service.js`의 `bonus*` 조회/증감/응답 alias 제거
- [x] `BusinessCreditBalance` 업데이트 경로(`$setOnInsert`, `$inc`, 조건절)에서 `bonus*` 제거
- [x] 집계/복구/롤백 경로를 `free*` 기준으로 통일

### 3) 관리자 무료크레딧 도메인 정리
- [x] `adminFreeCreditGrant.controller.js`의 `bonusGrantId` alias 제거
- [x] grant type alias(`WELCOME_BONUS`, `FREE_SHIPPING_CREDIT`) fallback 제거
- [x] canonical type 사용: `REQUEST_FREE_CREDIT`, `SHIPPING_FREE_CREDIT`

### 4) 관리자 라우트 정리
- [x] `/bonus-grants/*` 레거시 라우트 제거
- [x] `adminListBonusGrants` 등 legacy export/import 제거

### 5) API 응답 계약 정리 (Backend)
- [x] `auth/credits/requests/admin` 컨트롤러에서 `bonus*` 응답 alias 제거
- [x] admin credit 리스트/상세/집계에서 `free*`만 반환

### 6) UI 소비 경로 정리 (Frontend)
- [x] `bonus*` fallback 제거 (`DashboardLayout`, `CreditPaymentTab`, `new_request` 등)
- [x] admin credit 화면 타입/집계/정렬/모달에서 `free*`만 사용
- [x] settings 훅/탭에서 legacy settings key 제거

### 7) 운영 스크립트/로그 정리
- [x] 백필/재계산 스크립트 출력 키를 `free*` 기준으로 정리

### 8) 검증
- [x] `web/backend`에서 legacy 키워드 grep 0건 확인
- [x] `web/frontend/src`에서 legacy 키워드 grep 0건 확인
- [ ] 배포 전 실데이터 마이그레이션 여부 점검
  - 필요 시: 기존 문서에 남은 legacy 필드(과거 스냅샷/grant type) 오프라인 정리

## 최종 SSOT
- 잔액 필드: `paidCredit`, `freeRequestCredit`, `freeShippingCredit`, `balance`
- 설정 필드: `defaultRequestFreeCredit`, `defaultShippingFreeCredit`
- 지급 타입: `REQUEST_FREE_CREDIT`, `SHIPPING_FREE_CREDIT`
- 표시 타입: `CHARGE_FREE_REQUEST`, `CHARGE_FREE_SHIPPING`, `SPEND_FREE_REQUEST`, `SPEND_FREE_SHIPPING`
