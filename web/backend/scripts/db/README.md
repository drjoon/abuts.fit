# DB Scripts

이 폴더의 스크립트가 **DB 초기화/시드의 단일 진실(Single Source of Truth)** 입니다.

## 실행

- **DB 전체 초기화(컬렉션 deleteMany)**

```bash
npm run db:reset
```

- **초기화 + 계정 36개(데모 + 영업자 10명 + 의뢰자 20명)**

```bash
npm run db:reset-account
```

- **계정 + 더미 의뢰/배송/정산 시드 (리셋 없이)**

```bash
npm run db:seed
```

- **초기화 + 계정 + 더미 의뢰/배송/정산 (풀 시드)**

```bash
npm run db:reset-seed
```

## 안전장치

- 기본적으로 **production에서는 DB 변경을 거부**합니다.
- 예외적으로 강제로 실행해야 하면 아래 환경 변수를 직접 설정해야 합니다.

```bash
ABUTS_DB_FORCE=true
```

## 주의

- `reset`은 dropDatabase가 아니라 **각 컬렉션 deleteMany**로 정리합니다.
- DB 연결은 `scripts/db/_mongo.js`의 규칙을 따릅니다.

## 강제 실행

ABUTS_DB_FORCE=true npm run db:reset-seed
