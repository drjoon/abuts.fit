# 팝빌 API 연동 설정 가이드

## 1. 팝빌 회원가입 및 API 인증 정보 발급

1. [팝빌 홈페이지](https://www.popbill.com/) 회원가입
2. 팝빌 테스트 환경에서 개발 진행 (무료)
3. 팝빌 관리자 페이지에서 LinkID, SecretKey 발급

## 2. 환경변수 설정

`local.env`, `prod.env` 파일에 다음 환경변수를 추가하세요:

```bash
# 팝빌 API 인증
POPBILL_LINK_ID=your_link_id
POPBILL_SECRET_KEY=your_secret_key
POPBILL_IS_TEST=true  # 테스트 환경: true, 운영 환경: false

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
POPBILL_SENDER_NUM=01012345678  # 문자/알림톡 발신번호
```

## 3. 팝빌 서비스별 설정

### 3.1 계좌조회 (EasyFinBank)

1. 팝빌 관리자 페이지에서 계좌조회 서비스 신청
2. 은행 계좌 등록 및 인증
3. 은행코드 확인 (예: 004=KB국민은행, 020=우리은행)

**사용 API:**

- `POST /api/admin/credits/b-plan/bank-transactions/request` - 계좌 거래내역 수집 요청
- `GET /api/admin/credits/b-plan/bank-transactions/search` - 수집된 거래내역 조회

### 3.2 세금계산서 (Taxinvoice)

1. 팝빌 관리자 페이지에서 전자세금계산서 서비스 신청
2. 사업자 인증서 등록 (공동인증서 또는 전자세금계산서용 인증서)
3. 공급자(어벗츠) 정보 등록

**사용 API:**

- `POST /api/admin/tax-invoices/drafts/:id/issue` - 세금계산서 발행
- `GET /api/admin/tax-invoices/status` - 발행 상태 조회
- `POST /api/admin/tax-invoices/cancel` - 발행 취소

### 3.3 카카오톡 알림톡 (Kakao)

1. 팝빌 관리자 페이지에서 카카오톡 서비스 신청
2. 카카오톡 채널 생성 및 연동
3. 알림톡 템플릿 등록 및 승인 받기

**템플릿 등록 절차:**

- 팝빌 관리자 > 카카오톡 > 템플릿 관리
- 템플릿 작성 (변수는 #{변수명} 형식)
- 카카오 심사 요청 (영업일 기준 1-2일 소요)
- 승인 후 templateCode 확인

**사용 API:**

- `GET /api/admin/kakao/templates` - 등록된 템플릿 목록 조회
- `POST /api/admin/messages/send` - 카카오톡 알림톡 전송 (실패 시 SMS 대체)

### 3.4 문자 (SMS/LMS)

1. 팝빌 관리자 페이지에서 문자 서비스 신청
2. 발신번호 등록 및 인증

**사용 API:**

- `POST /api/admin/sms/send` - SMS/LMS 직접 전송
- `GET /api/admin/sms/history` - 발송 이력 조회

## 4. 요금 정책

### 4.1 계좌조회

- 수집 건당 과금 (은행별 상이)
- 일 수집 횟수 제한 있음

### 4.2 세금계산서

- 발행 건당 과금 (약 110원/건)
- 국세청 전송 포함

### 4.3 카카오톡 알림톡

- 발송 건당 과금 (약 8원/건)
- 대체 문자 발송 시 문자 요금 추가

### 4.4 문자 (SMS/LMS)

- SMS: 약 12원/건 (90byte 이하)
- LMS: 약 35원/건 (90byte 초과)

## 5. 테스트 환경

팝빌 테스트 환경에서는:

- 모든 API 무료 사용 가능
- 실제 국세청 전송 없음 (가상 처리)
- 실제 문자/알림톡 발송 없음 (가상 처리)
- 계좌조회는 샘플 데이터 반환

**테스트 환경 URL:** https://test.popbill.com/

## 6. 운영 환경 전환

1. `POPBILL_IS_TEST=false` 설정
2. 운영용 LinkID, SecretKey 발급
3. 실제 사업자 인증서 등록
4. 포인트 충전 (선불 방식)
5. IP 화이트리스트 설정 (선택사항)

## 7. 에러 처리

팝빌 API 에러는 다음과 같이 처리됩니다:

- **-99999999**: 인증 실패 (LinkID, SecretKey 확인)
- **-11000001**: 잔액 부족 (포인트 충전 필요)
- **-11000002**: 사업자번호 오류
- **-11000003**: 인증서 오류
- **-11000004**: 템플릿 오류 (알림톡)

자세한 에러 코드는 [팝빌 개발자센터](https://developers.popbill.com/) 참조

## 8. 보안 주의사항

1. **환경변수 관리**

   - `.env` 파일은 절대 git에 커밋하지 않기
   - `.gitignore`에 `*.env` 추가 확인

2. **API 키 보안**

   - LinkID, SecretKey는 서버에서만 사용
   - 프론트엔드에 노출 금지

3. **IP 제한**
   - 운영 환경에서는 IP 화이트리스트 설정 권장
   - 팝빌 관리자 페이지에서 설정 가능

## 9. 모니터링

팝빌 관리자 페이지에서 확인 가능:

- 포인트 잔액 및 사용 내역
- API 호출 통계
- 발송/발행 내역
- 에러 로그

## 10. 문의

- 팝빌 고객센터: 1600-8536
- 팝빌 개발자센터: https://developers.popbill.com/
- 원격지원: https://988.co.kr
