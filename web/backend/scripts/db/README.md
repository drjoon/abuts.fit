# DB Scripts

- 이 문서는 **운영 문서**입니다.
- 정책 기준 문서가 아니며, 실제 동작 기준은 코드와 루트 `rules.md`입니다.

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

- **의뢰/배송/정산 데이터 생성 (비활성화됨 — core shared 데이터만 시딩)**

`db:seed-data` 스크립트는 의뢰/배송/정산(샘플) 데이터 생성을 비활성화하고 있으며, 연결된 공통 데이터(connections, filenameRules, packLabelBranding)만 업데이트합니다.

```bash
# 예전: npm run db:seed-data
# 현재: db:seed-data는 샘플 의뢰/레저를 생성하지 않습니다. 샘플 데이터가 필요하면 별도 opt-in 스크립트를 만들고 테스트 환경에서만 실행하세요.
```


- **임플란트 프리셋 추가 (reset 없이 add-only)**

```bash
npm run db:implant-preset
```

- **payoutRates 마이그레이션 (legacy -> 최신 필드)**

```bash
# 먼저 dry-run으로 대상/변환 결과 확인
npm run db:migrate-payout-rates -- --dry-run

# 실제 반영
npm run db:migrate-payout-rates
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
