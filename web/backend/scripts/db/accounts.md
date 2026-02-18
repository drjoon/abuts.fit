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

### 영업자 20명

- 이메일: `s001@gmail.com` ~ `s020@gmail.com`
- role: salesman, referralGroupLeaderId = 랜덤 부모 또는 null

### 의뢰자 100명

- 이메일: `r001@gmail.com` ~ `r100@gmail.com`
- 조직: `org-001` ~ `org-100` (owner만 생성, staff 없음)
- 리퍼럴 코드 랜덤, 추천인 랜덤(영업자/의뢰자 혼합)
- 입금: 50만/100만/200만/300만원 중 랜덤으로 `CreditLedger` CHARGE 생성
- 의뢰 기록: 최근 6개월 내 의뢰 1~8건 랜덤 생성, 금액 12~25만원 구간 랜덤, 상태 `발송`
- 크레딧 사용: 의뢰 금액만큼 `CreditLedger` SPEND 생성(충전액 범위 내에서만)
