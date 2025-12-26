# Background Worker - 세금계산서 자동 발행

## 개요

매일 낮 12시에 `APPROVED` 상태의 세금계산서를 팝빌 API로 자동 발행하는 스케줄러입니다.

## 환경 변수 설정

`local.env`, `test.env`, `prod.env` 파일에 다음 환경 변수를 추가하세요:

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
```

## 설치

```bash
cd /Users/joonholee/Joon/1-Project/dev/abuts.fit/background
npm install
```

## 실행

### 개발 환경

```bash
npm run dev
```

### 프로덕션

```bash
npm start
```

## 스케줄러 동작

- **실행 시간**: 매일 12:00 (정오)
- **대상**: `TaxInvoiceDraft` 컬렉션에서 `status: "APPROVED"` 인 문서
- **처리**:
  1. APPROVED 상태의 세금계산서 조회
  2. 팝빌 API로 발행 요청
  3. 성공 시: `status: "SENT"`, `sentAt`, `hometaxTrxId` 업데이트
  4. 실패 시: `status: "FAILED"`, `errorMessage` 업데이트

## 수동 실행 (테스트용)

스케줄러를 기다리지 않고 즉시 실행하려면:

```javascript
import { runTaxInvoiceSchedulerNow } from "./jobs/taxInvoiceScheduler.js";

await runTaxInvoiceSchedulerNow();
```

## 모델 복사 규칙

DB 모델은 `web/backend/models`에서 `background/model`로 복사하여 사용합니다.

```bash
# 예시: TaxInvoiceDraft 모델 복사
cp ../web/backend/models/taxInvoiceDraft.model.js ./model/
```

**중요**: 원본은 `web/backend/models`이며, background는 복사본을 사용합니다.

## 로그 확인

```bash
# 스케줄러 시작 로그
[TaxInvoice Scheduler] 스케줄러 시작됨 - 매일 12:00에 실행

# 실행 로그
[TaxInvoice Scheduler] 세금계산서 일괄 발행 시작: 2025-12-26T03:00:00.000Z
[TaxInvoice Scheduler] 발행 대상: 5건
[TaxInvoice Scheduler] 발행 성공: 67890... (주식회사 ABC치과기공소)
[TaxInvoice Scheduler] 발행 완료 - 성공: 5건, 실패: 0건
```

## 상태 확인

```bash
curl http://localhost:4001/status
```

응답:

```json
{
  "ok": true,
  "startedAt": "2025-12-26T00:00:00.000Z",
  "uptimeSec": 3600,
  "creditBPlan": {...},
  "taxInvoiceBatch": {...}
}
```
