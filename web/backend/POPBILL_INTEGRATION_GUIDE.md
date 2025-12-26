# 팝빌 API 통합 가이드 (최종)

## 변경 사항 요약

### 1. 입금자명 기반 자동 매칭

- **이전**: depositCode (기공소코드)를 입금자명에 입력
- **현재**: 사용자 실명(계정 회원명)을 입금자명으로 사용
- 자동 매칭 로직이 입금자명 부분 일치로 동작 (앞뒤 다른 문자 허용)

### 2. 즉시 크레딧 충전 + 사후 검증

- **이전 계획**: 자동 매칭 후 관리자 승인 대기 → 크레딧 충전
- **현재**: 자동 매칭 즉시 크레딧 충전 (바로 사용 가능)
- 관리자는 사후 검증 수행
- 문제 발견 시 해당 조직의 크레딧 사용 lock 처리

### 3. 세금계산서 일괄 발행

- **이전 계획**: 관리자 승인 시 즉시 발행
- **현재**: 다음날 낮 12시에 미발행 내역 일괄 발행 (background 앱에서 처리)
- 자동 매칭 시 세금계산서 Draft 생성 (`APPROVED` 상태)

### 4. 전화번호 인증

- 인증번호: 6자리 → **2자리**로 변경
- 유효시간: 5분 유지

## 백엔드 API 엔드포인트

### 의뢰자(Requestor) API

#### 크레딧 충전 요청

```
POST /api/credits/orders
Body: { supplyAmount: number }
Response: {
  success: true,
  data: {
    id, status, depositCode, depositorName,
    supplyAmount, vatAmount, amountTotal,
    expiresAt, depositAccount
  }
}
```

**중요**: `depositorName`은 현재 로그인한 사용자의 이름(`req.user.name`)으로 자동 설정됩니다.

#### 충전 주문 목록 조회

```
GET /api/credits/orders
Response: {
  success: true,
  data: {
    depositAccount: { bankName, accountNumber, holderName },
    items: [{
      status: "PENDING" | "AUTO_MATCHED" | "MATCHED" | "EXPIRED" | "CANCELED",
      depositCode,
      depositorName,
      supplyAmount,
      vatAmount,
      amountTotal,
      expiresAt,
      matchedAt,
      adminApproved,
      createdAt
    }]
  }
}
```

**상태 설명**:

- `PENDING`: 입금 대기 중
- `MATCHED`: 자동 매칭 완료 (크레딧 충전됨, 바로 사용 가능)
- `EXPIRED`: 기한 만료
- `CANCELED`: 취소됨

#### 세금계산서 목록 조회

```
GET /api/credits/tax-invoices?status=SENT&page=1&limit=20
Response: {
  success: true,
  data: TaxInvoiceDraft[],
  pagination: { page, limit, total, totalPages }
}
```

**세금계산서 상태**:

- `APPROVED`: 승인됨 (발행 대기)
- `SENT`: 발행 완료
- `FAILED`: 발행 실패

#### 전화번호 인증

```
POST /api/credits/phone/send-code
Body: {
  phone: string,
  useKakao?: boolean (default: true),
  templateCode?: string
}
Response: {
  success: true,
  message: "인증번호가 발송되었습니다.",
  method: "KAKAO" | "SMS",
  expiresIn: 300
}
```

```
POST /api/credits/phone/verify-code
Body: { phone: string, code: string }
Response: {
  success: true,
  message: "전화번호 인증이 완료되었습니다."
}
```

### 관리자(Admin) API

#### 충전 주문 사후 검증

```
POST /api/admin/credits/b-plan/charge-orders/verify
Body: { chargeOrderId: string }
Response: {
  success: true,
  data: ChargeOrder,
  message: "충전 주문이 검증되었습니다."
}
```

**용도**: 자동 매칭된 주문을 관리자가 확인했음을 기록

#### 충전 주문 잠금 (문제 발견 시)

```
POST /api/admin/credits/b-plan/charge-orders/lock
Body: {
  chargeOrderId: string,
  reason: string
}
Response: {
  success: true,
  data: ChargeOrder,
  message: "충전 주문이 잠겼습니다. 해당 조직의 크레딧 사용이 제한됩니다."
}
```

**효과**:

- 해당 조직의 크레딧 사용 차단
- 의뢰 생성 시 lock 체크하여 차단

#### 충전 주문 잠금 해제

```
POST /api/admin/credits/b-plan/charge-orders/unlock
Body: { chargeOrderId: string }
Response: {
  success: true,
  data: ChargeOrder,
  message: "충전 주문 잠금이 해제되었습니다."
}
```

## 프론트엔드 구현 가이드

### 의뢰자 - 설정 > 결제 페이지

#### 1. 크레딧 충전 요청 UI

```tsx
const [supplyAmount, setSupplyAmount] = useState(500000);
const userName = user?.name; // 현재 로그인한 사용자 이름

const handleChargeRequest = async () => {
  if (!userName) {
    toast({
      title: "사용자 이름을 먼저 등록해주세요.",
      description: "설정 > 계정에서 이름을 등록할 수 있습니다.",
      variant: "destructive",
    });
    return;
  }

  const res = await request({
    path: "/api/credits/orders",
    method: "POST",
    token,
    jsonBody: { supplyAmount },
  });

  if (res.ok) {
    // 입금 안내 모달 표시
    showDepositGuide({
      bankName: res.data.depositAccount.bankName,
      accountNumber: res.data.depositAccount.accountNumber,
      holderName: res.data.depositAccount.holderName,
      depositorName: res.data.depositorName, // 반드시 이 이름으로 입금
      amount: res.data.amountTotal,
      expiresAt: res.data.expiresAt,
    });
  }
};
```

**입금 안내 모달 내용**:

```
📌 입금 안내

입금 계좌: KB국민은행 123456-78-901234 (어벗츠 주식회사)
입금 금액: 550,000원
입금자명: 홍길동 ⚠️ 반드시 이 이름으로 입금해주세요!
입금 기한: 2025-12-27 18:55

⚠️ 중요 안내:
- 입금자명을 반드시 "홍길동"으로 입력해주세요.
- 다른 이름으로 입금하시면 자동 처리가 되지 않습니다.
- 은행에 따라 입금자명 앞뒤에 다른 문자가 붙을 수 있으나,
  "홍길동"이 포함되어 있으면 자동으로 처리됩니다.
- 입금 확인 후 자동으로 크레딧이 충전되며,
  관리자 승인 후 세금계산서가 자동 발행됩니다.
```

#### 2. 충전 내역 표시

```tsx
const { data: orders } = await request({
  path: "/api/credits/orders",
  method: "GET",
  token,
});

// 상태별 뱃지 표시
const getStatusBadge = (status: string, adminApproved: boolean) => {
  switch (status) {
    case "PENDING":
      return <Badge variant="secondary">입금 대기</Badge>;
    case "AUTO_MATCHED":
      return <Badge variant="warning">입금 확인됨 (승인 대기)</Badge>;
    case "MATCHED":
      return <Badge variant="success">충전 완료</Badge>;
    case "EXPIRED":
      return <Badge variant="destructive">기한 만료</Badge>;
    case "CANCELED":
      return <Badge variant="outline">취소됨</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

// 각 주문 표시
{
  orders.items.map((order) => (
    <div key={order._id}>
      <div>입금자명: {order.depositorName}</div>
      <div>금액: {order.amountTotal.toLocaleString()}원</div>
      <div>상태: {getStatusBadge(order.status, order.adminApproved)}</div>
      {order.status === "AUTO_MATCHED" && (
        <div className="text-sm text-muted-foreground">
          입금이 확인되었습니다. 관리자 승인 후 크레딧이 충전됩니다.
        </div>
      )}
    </div>
  ));
}
```

#### 3. 세금계산서 목록 표시

```tsx
const { data: taxInvoices } = await request({
  path: "/api/credits/tax-invoices",
  method: "GET",
  token,
});

// 세금계산서는 관리자 승인 시 자동 생성되므로
// 의뢰자는 목록만 조회 가능
{
  taxInvoices.data.map((invoice) => (
    <div key={invoice._id}>
      <div>공급가액: {invoice.supplyAmount.toLocaleString()}원</div>
      <div>부가세: {invoice.vatAmount.toLocaleString()}원</div>
      <div>합계: {invoice.totalAmount.toLocaleString()}원</div>
      <div>상태: {getInvoiceStatusBadge(invoice.status)}</div>
      {invoice.status === "SENT" && (
        <div>발행일: {new Date(invoice.sentAt).toLocaleDateString()}</div>
      )}
    </div>
  ));
}
```

### 의뢰자 - 설정 > 계정 페이지

#### 전화번호 인증 UI

```tsx
const [phone, setPhone] = useState("");
const [code, setCode] = useState("");
const [codeSent, setCodeSent] = useState(false);
const [timeLeft, setTimeLeft] = useState(300);

const handleSendCode = async () => {
  const res = await request({
    path: "/api/credits/phone/send-code",
    method: "POST",
    token,
    jsonBody: {
      phone,
      useKakao: true,
      templateCode: "YOUR_TEMPLATE_CODE",
    },
  });

  if (res.ok) {
    setCodeSent(true);
    setTimeLeft(300);
    toast({
      title: `${
        res.data.method === "KAKAO" ? "카카오톡" : "SMS"
      }으로 2자리 인증번호가 발송되었습니다.`,
    });

    // 타이머 시작
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }
};

const handleVerifyCode = async () => {
  const res = await request({
    path: "/api/credits/phone/verify-code",
    method: "POST",
    token,
    jsonBody: { phone, code },
  });

  if (res.ok) {
    toast({ title: "전화번호 인증이 완료되었습니다." });
    // User 정보 업데이트
  }
};

return (
  <div>
    <Input
      type="tel"
      placeholder="전화번호 (010-1234-5678)"
      value={phone}
      onChange={(e) => setPhone(e.target.value)}
      disabled={codeSent}
    />
    <Button onClick={handleSendCode} disabled={codeSent || !phone}>
      인증번호 발송
    </Button>

    {codeSent && (
      <>
        <Input
          type="text"
          placeholder="2자리 인증번호"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={2}
        />
        <div>
          남은 시간: {Math.floor(timeLeft / 60)}:
          {String(timeLeft % 60).padStart(2, "0")}
        </div>
        <Button
          onClick={handleVerifyCode}
          disabled={!code || code.length !== 2}
        >
          인증 확인
        </Button>
      </>
    )}
  </div>
);
```

### 관리자 - 크레딧 관리 페이지

#### 자동 매칭 승인 UI

```tsx
const { data: orders } = await request({
  path: "/api/admin/credits/b-plan/charge-orders?status=AUTO_MATCHED",
  method: "GET",
  token,
});

const handleApprove = async (chargeOrderId: string) => {
  if (
    !confirm(
      "이 입금을 승인하시겠습니까? 크레딧이 충전되고 세금계산서가 자동 발행됩니다."
    )
  ) {
    return;
  }

  const res = await request({
    path: "/api/admin/credits/b-plan/auto-match/approve",
    method: "POST",
    token,
    jsonBody: { chargeOrderId },
  });

  if (res.ok) {
    toast({
      title: "승인 완료",
      description: res.data.message,
    });
    // 목록 새로고침
    refetch();
  }
};

return (
  <div>
    <h2>자동 매칭된 입금 (승인 대기)</h2>
    {orders.data.map((order) => (
      <Card key={order._id}>
        <div>입금자명: {order.depositorName}</div>
        <div>금액: {order.amountTotal.toLocaleString()}원</div>
        <div>매칭 시각: {new Date(order.matchedAt).toLocaleString()}</div>
        <Button onClick={() => handleApprove(order._id)}>
          승인 및 세금계산서 발행
        </Button>
      </Card>
    ))}
  </div>
);
```

## 환경변수 설정

```bash
# 팝빌 API 인증
POPBILL_LINK_ID=your_link_id
POPBILL_SECRET_KEY=your_secret_key
POPBILL_IS_TEST=true

# 팝빌 사업자 정보 (어벗츠 주식회사)
POPBILL_CORP_NUM=3588703514
POPBILL_CORP_NAME=어벗츠 주식회사
POPBILL_CEO_NAME=배태완
POPBILL_ADDR=경상남도 거제시 거제중앙로29길 6, 3층(고현동)
POPBILL_BIZ_TYPE=정보통신업
POPBILL_BIZ_CLASS=소프트웨어 개발
POPBILL_CONTACT_NAME=배태완
POPBILL_EMAIL=contact@abuts.fit
POPBILL_TEL=055-123-4567
POPBILL_SENDER_NUM=01012345678

# 입금 계좌 정보
B_PLAN_DEPOSIT_BANK_NAME=KB국민은행
B_PLAN_DEPOSIT_ACCOUNT_NO=123456-78-901234
B_PLAN_DEPOSIT_ACCOUNT_HOLDER=어벗츠 주식회사
```

## 플로우 다이어그램

### 의뢰자 크레딧 충전 플로우

```
1. 의뢰자: 크레딧 충전 요청 (금액 선택)
   ↓
2. 시스템: ChargeOrder 생성 (depositorName = 사용자 이름)
   ↓
3. 시스템: 입금 안내 표시 (계좌번호, 입금자명, 금액)
   ↓
4. 의뢰자: 계좌 이체 (반드시 안내된 입금자명으로)
   ↓
5. 시스템: 자동 매칭 워커 실행 (주기적)
   - 팝빌 계좌조회 API로 거래내역 수집
   - 입금자명 부분 일치 확인
   - 금액 일치 확인
   - ChargeOrder 상태 → AUTO_MATCHED
   ↓
6. 관리자: 자동 매칭 내역 확인 및 승인
   ↓
7. 시스템: 승인 처리
   - ChargeOrder 상태 → MATCHED
   - 크레딧 충전 (CreditLedger 생성)
   - 세금계산서 Draft 생성 (APPROVED)
   - 팝빌 세금계산서 발행 API 호출
   - 발행 성공 시 상태 → SENT
   ↓
8. 의뢰자: 충전 완료 및 세금계산서 확인
```

## 주요 변경사항 체크리스트

- [x] ChargeOrder 모델에 `depositorName`, `adminApproved` 필드 추가
- [x] ChargeOrder 상태에 `AUTO_MATCHED` 추가
- [x] 자동 매칭 로직을 입금자명 부분 일치 방식으로 변경
- [x] 자동 매칭 시 크레딧 충전하지 않고 관리자 승인 대기
- [x] 관리자 승인 API 추가 (`adminApproveAutoMatch`)
- [x] 관리자 승인 시 세금계산서 자동 발행
- [x] 전화번호 인증번호 6자리 → 2자리 변경
- [x] 의뢰자 세금계산서 요청 API 제거 (자동 발행으로 대체)

## 다음 단계

1. **프론트엔드 UI 구현**

   - 의뢰자: 입금 안내 모달 (입금자명 강조)
   - 의뢰자: 충전 내역 상태 표시 (AUTO_MATCHED, MATCHED 구분)
   - 관리자: 자동 매칭 승인 페이지

2. **테스트**

   - 입금자명 부분 일치 테스트
   - 자동 매칭 및 승인 플로우 테스트
   - 세금계산서 자동 발행 테스트

3. **모니터링**
   - 자동 매칭 성공률 모니터링
   - 세금계산서 발행 성공률 모니터링
   - 오입금 사례 모니터링
