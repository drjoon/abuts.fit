# 팝빌 환경변수 설정 가이드

## 필수 환경변수

### 팝빌 인증 정보

```bash
# 팝빌 링크 ID (필수)
POPBILL_LINK_ID=your_link_id

# 팝빌 시크릿 키 (필수)
POPBILL_SECRET_KEY=your_secret_key

# 테스트 모드 (true: 테스트 환경, false: 운영 환경)
POPBILL_IS_TEST=true

# 사업자 번호 (필수)
POPBILL_CORP_NUM=1234567890

# 발신 번호 (SMS/LMS/카카오톡 발송 시 필수)
POPBILL_SENDER_NUM=01012345678
```

### 세금계산서 공급자 정보 (필수)

```bash
# 공급자 사업자번호
POPBILL_SUPPLIER_CORP_NUM=1234567890

# 공급자 상호
POPBILL_SUPPLIER_CORP_NAME=어벗츠 주식회사

# 공급자 대표자명
POPBILL_SUPPLIER_CEO_NAME=배태완

# 공급자 주소
POPBILL_SUPPLIER_ADDR=경상남도 거제시 거제중앙로29길 6, 3층(고현동)

# 공급자 업태
POPBILL_SUPPLIER_BIZ_CLASS=정보통신업

# 공급자 종목
POPBILL_SUPPLIER_BIZ_TYPE=소프트웨어 개발

# 공급자 담당자명
POPBILL_SUPPLIER_CONTACT_NAME=담당자명

# 공급자 이메일
POPBILL_SUPPLIER_EMAIL=contact@abuts.fit

# 공급자 전화번호
POPBILL_SUPPLIER_TEL=055-1234-5678
```

## 팝빌 API 기능

### 1. 전자세금계산서

- **발행**: `issueTaxInvoice()` - 세금계산서 즉시 발행
- **조회**: `getTaxInvoiceInfo()` - 세금계산서 상태 조회

### 2. 계좌조회 (EasyFinBank)

- **수집 요청**: `requestBankAccountList()` - 거래내역 수집 작업 시작
- **결과 조회**: `getBankAccountTransactions()` - 수집된 거래내역 조회

### 3. 카카오톡

- **알림톡 발송**: `sendKakaoATS()` - 템플릿 기반 알림톡 발송

### 4. 문자 (SMS/LMS)

- **SMS 발송**: `sendSMS()` - 단문 문자 발송 (90바이트 이하)
- **LMS 발송**: `sendLMS()` - 장문 문자 발송 (2000바이트 이하)

## 큐 기반 처리 아키텍처

모든 팝빌 API 호출은 MongoDB 기반 큐를 통해 비동기로 처리됩니다:

1. **웹 백엔드**: `queueClient.js`를 통해 PopbillQueue(MongoDB)에 작업 등록
2. **백그라운드 워커**: `popbillWorker.js`가 큐를 폴링(5초 간격)하여 처리
3. **재시도**: 실패 시 자동 재시도 (지수 백오프, 최대 30분)
4. **아이덴포턴시**: uniqueKey + upsert로 중복 실행 방지
5. **락 메커니즘**: lockedBy/lockedUntil로 동시 처리 방지 (TTL 5분)

### 태스크 타입 및 maxAttempts

| 태스크 타입            | 설명                         | maxAttempts |
| ---------------------- | ---------------------------- | ----------- |
| `TAX_INVOICE_ISSUE`    | 세금계산서 발행              | 5           |
| `TAX_INVOICE_CANCEL`   | 세금계산서 취소              | 3           |
| `EASYFIN_BANK_REQUEST` | 계좌 거래내역 수집 요청      | 5           |
| `EASYFIN_BANK_CHECK`   | 계좌 거래내역 수집 결과 확인 | 20          |
| `NOTIFICATION_KAKAO`   | 카카오톡 알림톡 발송         | 3           |
| `NOTIFICATION_SMS`     | SMS 발송                     | 3           |
| `NOTIFICATION_LMS`     | LMS 발송                     | 3           |

### 재시도 정책

- **지수 백오프**: 2^attemptCount × 1000ms (최대 30분)
- **최대 재시도 시간**: 생성 후 6시간 초과 시 재시도 중단
- **재시도 불가 에러**: `shouldRetry = false` 설정 시 즉시 실패 처리
- **Stuck Task 해제**: 5분 이상 락 유지 시 자동 해제 (1분마다 체크)

## 에러 처리

### 계좌조회 에러 코드

- `-99999999`: 수집 진행중 → 재시도
- `-14000001`: 잡 ID 없음 → 실패 처리

### 일반 에러

- 네트워크 오류: 자동 재시도
- 인증 오류: 즉시 실패 (환경변수 확인 필요)
- 잔액 부족: 즉시 실패 (팝빌 충전 필요)

## 개발/테스트

### 테스트 환경 사용

```bash
POPBILL_IS_TEST=true
```

### 운영 환경 사용

```bash
POPBILL_IS_TEST=false
```

**주의**: 테스트 환경과 운영 환경은 별도의 계정과 크레딧을 사용합니다.

## Pushover 알림 설정 (선택)

태스크 최종 실패 시 Pushover로 알림을 받을 수 있습니다:

```bash
# Pushover 토큰 (선택)
PUSHOVER_TOKEN=your_pushover_token
WORKER_PUSHOVER_TOKEN=your_pushover_token

# Pushover 사용자 키 (선택)
PUSHOVER_USER=your_pushover_user
WORKER_PUSHOVER_USER=your_pushover_user

# Pushover 디바이스 (선택)
PUSHOVER_DEVICE=your_device_name

# Pushover 우선순위 (선택, -2~2)
PUSHOVER_PRIORITY=0
```

**알림 발송 조건:**

- 재시도 불가 에러 (`shouldRetry = false`)
- maxAttempts 도달
- 6시간 재시도 윈도우 초과

## 참고 문서

- [팝빌 개발자센터](https://developers.popbill.com/)
- [Node.js SDK](https://github.com/linkhub-sdk/popbill.node)
- [Pushover API](https://pushover.net/api)
