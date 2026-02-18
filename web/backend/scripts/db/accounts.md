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

### 영업자 4명

- 이메일: `s001@gmail.com` ~ `s004@gmail.com`
- role: salesman, referralGroupLeaderId = 랜덤 부모 또는 null
- ROOT_COUNT=3: s001~s003은 루트(미소개), 나머지는 랜덤 계층 소속

### 의뢰자 20계정 (r001~r020, 계정당 1조직)

- owner 이메일: `r001@gmail.com` ~ `r020@gmail.com`
- 조직: `org-001` ~ `org-020`, 각 계정의 `organizationId` 세팅
- 리퍼럴 코드 랜덤, 추천인: **60% 영업자 소개 / 30% 의뢰자 소개 / 10% 미소개**
- 입금: 50만/100만/200만/300만원 4종 중 랜덤으로 `CreditLedger` CHARGE 생성
- 보너스: 조직당 30,000원 `CreditLedger` BONUS 생성 (무료 크레딧, 먼저 소비)
- 의뢰 기록: 최근 1개월(30일) 내 **50~100건 랜덤 생성**, 금액 정책:
  - 가입 후 90일: 고정 10,000원 (`new_user_90days_fixed_10000`)
  - 이후: 15,000원 기준, 최근 30일 의뢰건수 × 10원 할인 (최대 5,000원)
  - 배송비: 완료 의뢰 3~20건 묶음, 패키지당 3,500원 SPEND
- 크레딧 차감: 무료 크레딧(보너스)에서 가능한 만큼 우선 차감 후 부족분을 구매 크레딧에서 차감
  - `price.bonusAmount`: bonus에서 차감된 금액 (0~amount)
  - `price.paidAmount`: 구매 크레딧에서 차감된 금액 (`amount - bonusAmount`)
  - 원장(`CreditLedger` SPEND): `spentBonusAmount`, `spentPaidAmount`로 유료/무료 사용분을 분리 기록
  - 모든 금전 계산(매출, 수수료, 단가할인)은 `price.paidAmount` 기준
  - 완료(80%): `status=완료`, `caseInfos.reviewByStage.shipping.status=APPROVED`, price 세팅
  - 진행(20%): `status=의뢰|CAM|가공|세척.포장|발송` 중 랜덤
- 크레딧 사용: 완료 의뢰 금액만큼 `CreditLedger` SPEND 생성(충전액 범위 내에서만)
- 배송비: 완료 의뢰를 3~20개씩 묶어 `ShippingPackage` 생성, 패키지당 3,500원 SPEND 생성
