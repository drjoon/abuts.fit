# DB Scripts

이 폴더의 스크립트가 **DB 초기화/시드의 단일 진실(Single Source of Truth)** 입니다.

## 실행

- **DB 전체 초기화(컬렉션 deleteMany, 더미 데이터 없음)**

```bash
npm run db:reset
```

- **기본 계정 8개 생성**

```bash
npm run db:seed-account
```

- **대량 계정 생성**

```bash
npm run db:seed-account -- r=20 s=10
```

- **의뢰/배송/정산 데이터 생성 (기본 50건)**

```bash
npm run db:seed-data
```

- **의뢰/배송/정산 데이터 생성 (건수 지정)**

```bash
npm run db:seed-data -- 200
```

- **임플란트 프리셋 추가 (reset 없이 add-only)**

```bash
npm run db:implant-preset
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
- `seed-data`는 기존 계정을 사용하므로, 먼저 `db:seed-account`를 실행하는 것을 권장합니다.
- `implant-preset`은 모든 환경에서 **기존 데이터는 유지하고 없는 항목만 추가**합니다.

## 강제 실행

ABUTS_DB_FORCE=true npm run db:reset
