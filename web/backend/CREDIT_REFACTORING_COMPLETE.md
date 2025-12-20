# 크레딧 조직 전환 완료 (레거시 제거)

## 완료 날짜

2025-12-17

## 변경 개요

크레딧 시스템을 **organizationId 필수 기반**으로 전환 완료. 레거시 호환 코드 모두 제거.

## 삭제된 항목

### 1. 레거시 호환 쿼리

- `buildLedgerQuery()`: `$or` 조건 제거 → 단순 `{ organizationId }`
- `buildOrderQuery()`: `$or` 조건 제거 → 단순 `{ organizationId }`
- `getCreditScope()`: organizationId 없으면 에러 발생

### 2. 레거시 호환 함수 (auth.controller.js)

- `getCreditBalanceBreakdownByQuery()` 삭제
- `getCreditBalanceBreakdown(userId)` 삭제
- `getOrganizationCreditBalanceBreakdown()` 단순화

### 3. Fallback 코드

- `order.organizationId || organizationId` → `order.organizationId`
- `organizationId ? ... : ...` → organizationId 필수 체크

### 4. 마이그레이션 스크립트

- `migrateCreditToOrganization.js` 삭제

### 5. 이전 문서

- `CREDIT_MIGRATION_SUMMARY.md` 삭제
- `CREDIT_ORGANIZATION_CHECKLIST.md` 삭제

## 변경된 파일

### 모델 (2개)

**`backend/models/creditLedger.model.js`**

```javascript
organizationId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "RequestorOrganization",
  required: true,  // ← default: null에서 required: true로 변경
  index: true,
}
```

**`backend/models/creditOrder.model.js`**

```javascript
organizationId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "RequestorOrganization",
  required: true,  // ← default: null에서 required: true로 변경
  index: true,
}
```

### 컨트롤러 (3개)

**`backend/controllers/credit.controller.js`**

- `getCreditScope()`: organizationId 없으면 throw Error
- `buildLedgerQuery()`: 단순 `{ organizationId }` 반환
- `buildOrderQuery()`: 단순 `{ organizationId }` 반환
- CreditLedger 생성 시: `organizationId || fallback` 제거

**`backend/controllers/tossWebhook.controller.js`**

- CreditLedger 생성 시: `order.organizationId || null` → `order.organizationId`

**`backend/controllers/auth.controller.js`**

- `getOrganizationCreditBalanceBreakdown()`: 단순 `{ organizationId }` 쿼리
- `withdraw()`: organizationId 필수 체크 추가

## 현재 동작 방식

### 크레딧 조회

```javascript
// 조직 ID로만 조회
CreditLedger.find({ organizationId: scope.organizationId });
CreditOrder.find({ organizationId: scope.organizationId });
```

### 크레딧 적립

```javascript
await CreditLedger.create({
  organizationId: order.organizationId, // 필수
  userId: userId, // 선택 (추적용)
  type: "CHARGE",
  amount: 500000,
  // ...
});
```

### 에러 처리

- organizationId 없음: **403 "기공소 정보가 설정되지 않았습니다."**
- 주대표 탈퇴 시: **400 "기공소 정보가 없는 사용자는 탈퇴할 수 없습니다."**

## 검증 포인트

### ✅ 완료 확인

1. 모든 CreditLedger는 organizationId 필수
2. 모든 CreditOrder는 organizationId 필수
3. 레거시 $or 쿼리 제거
4. Fallback 코드 제거
5. 마이그레이션 스크립트 삭제
6. 문서 정리 및 단순화

### 🔍 테스트 필요

1. 크레딧 충전 (대표 계정)
2. 크레딧 환불
3. 크레딧 잔액 조회
4. 조직 멤버 간 크레딧 공유
5. 주대표 탈퇴 제한 (잔액 있을 때)
6. organizationId 없는 사용자 접근 시 403

## API 엔드포인트 (변경 없음)

- `POST /api/credits/orders` - 충전 주문 생성
- `GET /api/credits/orders` - 주문 목록
- `POST /api/credits/orders/:orderId/cancel` - 주문 취소
- `POST /api/credits/payments/confirm` - 가상계좌 입금 확인
- `POST /api/credits/refunds` - 환불 요청
- `GET /api/credits/balance` - 잔액 조회
- `GET /api/credits/insights/spend` - 사용 통계

## 참고 문서

- `backend/CREDIT_ORGANIZATION.md` - 크레딧 조직 시스템 설명서
- `backend/routes/credit.routes.js` - API 라우트
- `backend/controllers/credit.controller.js` - 비즈니스 로직
- `backend/models/creditLedger.model.js` - 크레딧 원장 모델
- `backend/models/creditOrder.model.js` - 크레딧 주문 모델

## 다음 단계

1. 기능 테스트 수행
2. 프로덕션 배포
3. 모니터링
