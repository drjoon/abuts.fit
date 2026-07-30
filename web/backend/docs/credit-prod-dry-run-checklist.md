# 운영 DB 크레딧 점검/보정 전 `dry-run` 체크리스트

> 대상: `web/backend` 크레딧 원장(`CreditLedger`) 무결성 점검
> 원칙: **운영에서는 먼저 dry-run만 수행**하고, 결과/리스크 승인 후 execute 단계로 진행

---

## 0) 사전 원칙 (중요)

- 운영 반영 전 모든 명령은 `web/backend`에서 실행
- 운영 DB URI는 `MONGODB_URI`(또는 환경에 맞는 PROD URI)만 사용
- 이번 정책 합의 기준:
  - 과거 음수 구간 이력은 즉시 `ADJUST`로 덮지 않고 유지 가능
  - 다만 **중복 차감/누락 차감은 반드시 0건**이어야 함
- 실행/검증 로그는 작업 티켓 또는 배포 기록에 원문 보관

---

## 1) 실행 전 스냅샷/롤백 준비

### 1-1. 필수 백업

- MongoDB 백업(최소 아래 컬렉션):
  - `creditledgers`
  - `requests`
  - `shippingpackages`
  - `businessanchors`
- 백업 파일명 예시:
  - `prod-credit-before-YYYYMMDD-HHmm.archive`

### 1-2. 롤백 포인트 정의

- 롤백 기준 시점(T0) 기록
- 롤백 방식 2개 준비:
  1. 전체 컬렉션 restore
  2. 키 기반 선택 롤백(`uniqueKey`) 스크립트/쿼리

### 1-3. 변경 동결

- 점검/보정 시간대에 관리자 승인 작업(의뢰 승인/롤백) 일시 통제 권장
- 최소한 작업 시간대의 승인 이벤트 로그를 별도 수집

---

## 2) 1차 진단 (전부 dry-run)

### 2-1. 라이프사이클 감사

```bash
node scripts/credit-lifecycle-audit.mjs
```

확인 항목(목표):
- `chargeMissingRefCount = 0`
- `requestSpendMissingRefCount = 0`
- `shippingSpendMissingRefCount = 0`
- `orphanRequestRefundCount = 0`
- `orphanShippingRefundCount = 0`
- `ledgerSplitMismatchCount = 0`

### 2-2. 무결성 보정 dry-run

```bash
node scripts/fix-credit-ledger-integrity.mjs
```

확인 항목(목표):
- `deleteTargetCount = 0`
- `orphanRefundCount = 0`
- `splitMismatchCount = 0`

### 2-3. requestor 누락 차감 점검 dry-run

```bash
node scripts/reconcile-business-credit-spends.mjs --all-requestors
```

확인 항목(목표):
- `target.shippingSpendInsertions = 0`
- `target.requestSpendInsertions = 0`
- `target.requestSpendCorrections = 0`

---

## 3) 이상 징후별 조치 순서 (execute는 승인 후)

> 아래는 **권장 순서**입니다. 반드시 각 단계 후 재진단을 반복합니다.

1. `fix-credit-ledger-integrity.mjs --execute`
2. `reconcile-business-credit-spends.mjs --all-requestors --execute`
3. (필요 시) 요청 중복 차감 환불 보정 스크립트 실행
   - 기준: 요청별 `SPEND(REQUEST)` 합 - `REFUND(REQUEST)` 합이 `price.amount` 초과
4. 실행 후 다시 2장(진단 3종) 재실행

---

## 4) 요청 중복 차감 판정 규칙 (운영 승인용)

요청 단위 SSOT:
- 최종 잔존 차감(`request outstanding`)은 **요청당 1회분**이어야 함
- 판정식:
  - `outstanding = sum(abs(SPEND.REQUEST<0)) - sum(abs(REFUND.REQUEST))`
  - 정상 기준: `outstanding == expectedPrice(=Request.price.amount)`

주의:
- 단순 `SPEND row count > 1`만으로 오류 판정 금지
- cycle 증가(롤백 후 재승인) 이력이 있어도 환불 정합이 맞으면 정상

---

## 5) 롤백 시나리오

### 시나리오 A: execute 직후 감사 지표 악화

- 즉시 변경 중단
- T0 백업으로 restore
- restore 후 2장(진단 3종) 재검증

### 시나리오 B: 일부 앵커만 오차

- 전체 restore 대신 `uniqueKey` 단위 선택 롤백
- 롤백 대상:
  - 이번 실행에서 생성된 `REFUND`/`SPEND` 키
  - 무결성 스크립트로 삭제된 `_id` 목록(사전 로그 필요)

### 시나리오 C: 음수 구간 이력만 남음

- 정책상 허용 시(현재 합의), execute 중단하고 이력 유지
- 단, 재발 차단 코드가 배포돼 있어야 함

---

## 6) 배포 전 코드 체크포인트 (재발 방지)

반드시 배포 포함:
- `web/backend/controllers/requests/common.review.helpers.js`
  - `businessAnchorId` 단위 소비 락(`creditspendlocks`)
  - 요청 과금 1회 SSOT(중복 승인/사이클 증가 추가 차감 방지)

권장 확인:
- 동일 request 2회 승인 시 추가 차감이 발생하지 않는지
- 동시에 여러 request 승인 시 음수 진입이 차단되는지

---

## 7) 최종 종료 조건 (Go/No-Go)

Go 조건:
- 2장 진단 지표가 목표값 충족
- 누락/중복 차감 0건
- 운영 승인자(담당자) 결과 확인 완료

No-Go 조건:
- `shippingSpendInsertions` 또는 `requestSpendInsertions` 잔여
- `ledgerSplitMismatchCount > 0`
- 중복 차감 판정(`outstanding > expectedPrice`) 1건 이상

---

## 8) 실행 로그 템플릿

- 실행 시각(KST):
- 실행자:
- 대상 DB:
- 백업 파일:
- 2-1 결과:
- 2-2 결과:
- 2-3 결과:
- execute 수행 여부/범위:
- 재진단 결과:
- 이슈/조치:
- 최종 승인자:
