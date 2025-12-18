# DB Scripts

이 폴더의 스크립트가 **DB 초기화/시드의 단일 진실(Single Source of Truth)** 입니다.

## 실행

- DB 전체 초기화(컬렉션 deleteMany)

```bash
npm run db:reset
```

- 필수 데이터 시드(core)

```bash
npm run db:seed:core
```

- 개발용 데이터 시드(dev: 샘플 계정, 크레딧, 임플란트 프리셋)

```bash
npm run db:seed:dev
```

- 초기화 + core + dev 한번에

```bash
npm run db:reset-and-seed
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
