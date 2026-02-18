# accounts

## Admin (고정 데모)

- admin.owner@demo.abuts.fit / `Ao!6fN#9rV@4cH2$` (owner)
- admin.staff@demo.abuts.fit / `As!4mJ#7tK@9pW3$` (staff)

## Manufacturer (고정 데모)

- manufacturer.owner@demo.abuts.fit / `Mo!7vL#6pR@3sB8$` (owner)
- manufacturer.staff@demo.abuts.fit / `Ms!5kP#8wQ@2nZ7$` (staff)

## Requestor (기본 데모 2계정)

- requestor.owner@demo.abuts.fit / `Rq!8zY#4fQ@7nC5$` (owner) — org: 데모기공소
- requestor.staff@demo.abuts.fit / `Rs!9xT#5gA@6mD4$` (staff) — org: 데모기공소, referredBy=owner

## 대량 시드 (reset-and-seed.js 기준)

- 공통 비밀번호: `Abc!1234`
- 리퍼럴 코드: 대문자/숫자 4자리(영업자) 혹은 5자리(의뢰자) 랜덤
- 추천/리더: 영업자/의뢰자 중 랜덤 참조로 생성

### 영업자 10명

- 이메일: `s001@gmail.com` ~ `s010@gmail.com`
- role: salesman
- ROOT_COUNT=3: s001~s003은 루트(미소개)
- s004~s010 중 일부는 소개 관계 포함(`referredByUserId`가 null이 아닌 영업자 존재)
- referralGroupLeaderId = 루트 또는 상위 영업자에 의해 결정 (계층 소속)

### 의뢰자 5계정 (r001~r005, 계정당 1조직)

- owner 이메일: `r001@gmail.com` ~ `r005@gmail.com`
- 조직: `org-001` ~ `org-005`, 각 계정의 `organizationId` 세팅
- 리퍼럴 코드 랜덤, 추천인: **60% 영업자 소개 / 30% 의뢰자 소개 / 10% 미소개**
- 입금: 50만/100만/200만/300만원 4종 중 랜덤으로 `CreditLedger` CHARGE 생성
- 보너스: 조직당 30,000원 `CreditLedger` BONUS 생성 (무료 크레딧, 먼저 소비)
- 의뢰 기록: **최근 2개월(60일) 내 100~500건 랜덤 생성**, 금액 정책:
  - 가입 후 90일: 고정 10,000원 (`new_user_90days_fixed_10000`)
  - 이후: 15,000원 (`base_price`)
  - **r001 첫 번째 완료 의뢰**: 무료 신속배송 1건 (`rule=free_express`, paidAmount=0, bonusAmount=price)
- 크레딧 차감: 무료 크레딧(보너스)에서 가능한 만큼 우선 차감 후 부족분을 구매 크레딧에서 차감
  - `price.bonusAmount`: bonus에서 차감된 금액 (0~amount)
  - `price.paidAmount`: 구매 크레딧에서 차감된 금액 (`amount - bonusAmount`)
  - 원장(`CreditLedger` SPEND): `spentBonusAmount`, `spentPaidAmount`로 유료/무료 사용분을 분리 기록
  - 모든 금전 계산(매출, 수수료, 단가할인)은 `price.paidAmount` 기준
  - 완료(80%): `status=완료`, `caseInfos.reviewByStage.shipping.status=APPROVED`, price 세팅
  - 진행(20%): `status=의뢰|CAM|가공|세척.포장|발송` 중 랜덤
- 크레딧 사용: 완료 의뢰 금액만큼 `CreditLedger` SPEND 생성(충전액 범위 내에서만)
- 배송비: 완료 의뢰를 3~20개씩 묶어 `ShippingPackage` 생성, 패키지당 3,500원 SPEND 생성
