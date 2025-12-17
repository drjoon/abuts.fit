# 크레딧 조직 기반 시스템

## 개요

크레딧은 **RequestorOrganization(기공소)** 단위로 소유되며, 주대표/공동대표/직원 모두 동일한 조직 크레딧을 공유합니다.

## 데이터 모델

### CreditLedger

- `organizationId`: 필수 (ref: RequestorOrganization)
- `userId`: 선택 (추적용, ref: User)
- `type`: CHARGE, BONUS, SPEND, REFUND, ADJUST
- `amount`: 금액
- `refType`, `refId`: 참조 정보
- `uniqueKey`: 중복 방지

### CreditOrder

- `organizationId`: 필수 (ref: RequestorOrganization)
- `userId`: 선택 (추적용, ref: User)
- `orderId`: 주문 ID
- `status`: CREATED, WAITING_FOR_DEPOSIT, DONE, CANCELED, REFUND_REQUESTED, REFUNDED, EXPIRED
- `supplyAmount`, `vatAmount`, `totalAmount`: 금액
- `refundedSupplyAmount`, `refundedVatAmount`, `refundedTotalAmount`: 환불 금액
- `paymentKey`, `tossSecret`: 토스 결제 정보
- `virtualAccount`: 가상계좌 정보

## API 권한

- **모든 크레딧 API**: 주대표/공동대표만 접근 가능
- **organizationId 필수**: 없으면 403 에러 반환

## 핵심 로직

### 조직 스코프 조회

```javascript
async function getCreditScope(req) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    throw new Error("기공소 정보가 설정되지 않았습니다.");
  }
  // 조직 멤버 조회
  const members = await User.find({ organizationId }).select({ _id: 1 }).lean();
  const userIds = members.map((m) => m._id).filter(Boolean);
  return { organizationId, userIds };
}
```

### 쿼리 패턴

```javascript
// 단순 organizationId 기반 쿼리
{
  organizationId: scope.organizationId;
}
```

### 잔액 계산

- 조직의 모든 CreditLedger 조회
- CHARGE/BONUS: 적립
- SPEND: 차감 (보너스 우선 사용)
- REFUND: 환불 (음수 적립)
- ADJUST: 조정

## API 엔드포인트

### 크레딧 주문

- `POST /api/credits/orders` - 크레딧 충전 주문 생성
- `GET /api/credits/orders` - 주문 목록 조회
- `POST /api/credits/orders/:orderId/cancel` - 주문 취소

### 크레딧 결제

- `POST /api/credits/payments/confirm` - 가상계좌 입금 확인

### 크레딧 환불

- `POST /api/credits/refunds` - 환불 요청

### 크레딧 조회

- `GET /api/credits/balance` - 잔액 조회
- `GET /api/credits/insights/spend` - 사용 통계

## 주요 체크

### 크레딧 충전

1. organizationId 필수 체크
2. 주대표/공동대표 권한 체크
3. 금액 유효성 검증 (50만원~500만원, 단위 제한)
4. CreditOrder 생성 (organizationId, userId 포함)
5. 가상계좌 발급

### 크레딧 입금 (Toss Webhook)

1. CreditOrder 조회
2. status를 DONE으로 업데이트
3. CreditLedger에 CHARGE 기록 (organizationId, userId 포함)

### 크레딧 환불

1. organizationId 기반으로 환불 가능 주문 조회
2. 환불 금액 할당 (최신 주문부터)
3. Toss API로 부분/전체 취소
4. CreditLedger에 REFUND 기록 (음수)
5. CreditOrder 상태 업데이트

### 주대표 탈퇴

1. organizationId 필수 체크
2. 조직의 paidBalance 조회
3. 잔액이 있으면 탈퇴 불가

## 테스트 스크립트

### addTestCredit.js

- organizationId 기반으로 테스트 크레딧 추가
- RequestorOrganization 조회 후 CreditLedger 생성

### fixTestAccounts.js, fixTestAccountsSimple.js

- 테스트 계정 수정 시 organizationId 기반으로 처리

## 주의사항

1. **organizationId 필수**: 모든 새로운 크레딧 적립은 organizationId 포함
2. **userId는 추적용**: 어떤 사용자가 작업했는지 추적하기 위해 선택적으로 저장
3. **조직 공유**: 같은 조직의 모든 멤버가 동일한 크레딧 공유
4. **권한 분리**: 주대표/공동대표만 크레딧 관리 가능, 직원은 불가

## 파일 구조

### 모델

- `backend/models/creditLedger.model.js`
- `backend/models/creditOrder.model.js`

### 컨트롤러

- `backend/controllers/credit.controller.js` - 크레딧 비즈니스 로직
- `backend/controllers/tossWebhook.controller.js` - 토스 웹훅 처리
- `backend/controllers/auth.controller.js` - 탈퇴 시 크레딧 체크

### 라우트

- `backend/routes/credit.routes.js` - 크레딧 API 라우트

### 스크립트

- `backend/scripts/addTestCredit.js`
- `backend/scripts/fixTestAccounts.js`
- `backend/scripts/fixTestAccountsSimple.js`
