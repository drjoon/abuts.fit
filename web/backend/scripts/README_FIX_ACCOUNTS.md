# 테스트 계정 수정 스크립트 실행 방법

## 문제

1. 의뢰자 계정들이 `approvedAt`이 없어서 가입 화면으로 리다이렉트됨
2. 주대표 계정에 환불 테스트를 위한 유료 크레딧 필요

## 해결 방법

### 방법 1: 스크립트 실행 (권장)

```bash
cd /Users/joonholee/Joon/1-Project/dev/abuts.fit/backend
node scripts/fixTestAccountsSimple.js
```

이 스크립트는:

- 모든 의뢰자 계정의 `approvedAt`을 현재 시간으로 업데이트
- 첫 번째 주대표 계정에 500,000원 유료 크레딧 추가

### 방법 2: MongoDB 직접 접근

MongoDB Compass나 mongosh를 사용하여:

```javascript
// 1. approvedAt 업데이트
db.users.updateMany(
  {
    role: "requestor",
    active: true,
    $or: [{ approvedAt: null }, { approvedAt: { $exists: false } }],
  },
  {
    $set: { approvedAt: new Date() },
  }
);

// 2. 주대표 계정 찾기
const principal = db.users.findOne({
  role: "requestor",
  position: "principal",
  active: true,
});

// 3. 크레딧 추가
db.creditledgers.insertOne({
  userId: principal._id,
  type: "paid_charge",
  amount: 500000,
  uniqueKey: `test:credit:${Date.now()}`,
  description: "테스트용 유료 크레딧",
  createdAt: new Date(),
});
```

## 확인 방법

1. 의뢰자 계정으로 로그인 시도 → 가입 화면으로 가지 않고 대시보드로 이동
2. 주대표 계정으로 로그인 → 설정 > 결제 페이지에서 잔액 확인
3. 해지 시도 → 크레딧 정보가 표시되고 환불 계좌 입력 가능
