# 운영 컷오버 가이드 (`abuts.fit`)

테스트 기간 데이터를 **운영 DB로 승격**하고, `https://abuts.fit`을 운영 서버에 붙이는 당일 절차입니다.

## 한 줄 요약

의뢰·계정·관계는 그대로 가져가고, **치과는 데모 모드로 계속**, **잔고(무료·유료 양수분)는 0으로 맞춘 뒤** 운영 URL만 전환합니다.

---

## 목표 상태

| | 운영 | 테스트 |
| --- | --- | --- |
| URL | `https://abuts.fit` | `https://test.abuts.fit` (가칭) |
| EB | **신규** prod 환경 | 현재 `Abutsfit-env` 유지 |
| 배포 | `./eb.sh prod` | `./eb.sh test` |
| `NODE_ENV` | `production` | `test` |
| Mongo | `MONGODB_URI` → `abuts_fit` | `MONGODB_URI_TEST` → `abuts_fit_test` |
| env 파일 | `backend/prod.env` | `backend/test.env` |

지금 라이브는 사실상 **테스트 DB(`abuts_fit_test`)** 를 보고 있습니다.  
`prod.env`의 운영 URI(`abuts_fit`)는 이미 준비되어 있습니다.

---

## 정책 (이번 컷오버)

| 항목 | 처리 |
| --- | --- |
| 의뢰(`PracticeTransfer`)·채팅·파일 키 | **유지** (삭제 금지) |
| 계정·사업자·관계 | **유지** |
| 치과 데모 모드 | **계속 ON** |
| 데모 90일 시계 | **런칭일로 리셋** (권장) |
| 잔고 | **양수 유료·무료 회수 → 0원** (데모 마이너스 허용) |
| 원장 전량 삭제 | **하지 않음** (`reset-requestor-credit-ledgers.js` 금지) |
| 기공소 | 데모 없음. 데모 치과에서 쌓인 정산분은 `demoSettlementCredit`로 분리됨 |

잔고 회수 스크립트: `scripts/db/zero-practice-credits-enable-demo.js`  
→ 치과 양수 **유료+무료**를 회수합니다. “무료만”이 아니니, 유료를 남기려면 당일 전에 알려 주세요.

---

## D-7 ~ D-1 (미리 해둘 것)

컷오버 당일에 인프라를 만들지 않습니다. 아래는 **전에** 끝냅니다.

### 1) 운영 EB 환경

1. AWS EB에 **운영용 환경 신규 생성** (예: `Abutsfit-prod`)
2. 현재 `Abutsfit-env`는 **테스트용으로 유지**
3. 운영 환경에 HTTPS·헬스체크(`/healthz`) 확인
4. Atlas Network Access에 운영 EB(또는 NAT) IP 추가

### 2) DNS / 도메인

1. `test.abuts.fit`(가칭) → 현재 `Abutsfit-env` 연결 + 인증서
2. 컷오버 때 `abuts.fit` / `www.abuts.fit`만 운영 EB로 넘길 준비
3. TTL을 미리 짧게(300s) 줄여 두면 전환이 쉽습니다

### 3) env / 키

1. `prod.env`: `MONGODB_URI` = `.../abuts_fit?...` 확인
2. `test.env`: `MONGODB_URI_TEST` = `.../abuts_fit_test?...` 확인
3. 결제·웹훅·카카오 redirect는 **운영 URL / 테스트 URL** 각각 맞춤
4. S3: DB를 복사하면 파일 키도 같이 보여야 하므로, 당분간 **동일 버킷**이 단순합니다(현재 prod/test가 같은 `AWS_S3_BUCKET`을 쓰는 구성)

### 4) BG PC / Lab Helper

1. 라이노·Esprit·팩 워커가 컷오버 후 **운영 API**를 보게 할지 시점 확정
2. Lab Helper CORS에 테스트 도메인이 있으면 allowlist 추가

### 5) 리허설 (권장)

Atlas에서 `abuts_fit`에 **1회 복제 리허설** → dry-run 크레딧 → 스모크 후, 본 컷오버 전에 운영 DB를 다시 비우거나 덮어쓸 계획만 정해 둡니다.

---

## 컷오버 당일 (순서대로)

예상 소요: **30~60분** (복제·DNS 전파에 따라 다름)  
작업 PC: 로컬 Mac, repo `web/` 기준

### 0) 시작 전 체크

```bash
cd /Users/joonholee/Joon/1-Project/dev/abuts.fit/web

# 배포 스크립트·env 존재
test -f eb.sh && test -f backend/prod.env && test -f backend/test.env && echo OK
```

- [ ] 치과/기공소에 “잠시 점검” 공지 (가능하면)
- [ ] 운영 EB가 Ready
- [ ] Atlas `abuts_fit` / `abuts_fit_test` 백업 스냅샷 가능 여부 확인

### 1) Write 잠금 (짧게)

선택지 중 하나:

- A. EB 환경에 점검 안내 + 신규 의뢰 자제 공지
- B. 테스트 EB를 temporarily 중지/스케일 0 (가능하면)
- C. 공지만 하고 빠르게 진행 (데이터가 거의 안 들어오는 시간대)

목표는 **복제 중·직후 테스트 DB에 새 의뢰가 안 쌓이게** 하는 것입니다.

### 2) DB 복제: `abuts_fit_test` → `abuts_fit`

Atlas UI 권장:

1. Atlas → cluster → … → **Restore / Clone** 또는 dump·restore
2. 소스: `abuts_fit_test`
3. 대상: `abuts_fit` (**덮어쓰기** — 운영이 비어 있거나 리허설 잔여분이면 정리 후)

CLI 예시 (Tools 설치되어 있을 때):

```bash
# URI는 prod.env / local.env에서 복사해 쓰되, 채팅·로그에 붙여 넣지 말 것
mongodump --uri="$MONGODB_URI_TEST" --db=abuts_fit_test --out=/tmp/abuts-cutover
mongorestore --uri="$MONGODB_URI" --db=abuts_fit --drop /tmp/abuts-cutover/abuts_fit_test
```

확인:

```bash
cd backend
ENV_FILE=prod.env NODE_ENV=production ABUTS_DB_FORCE=true \
  node -e "
    import('./scripts/db/_mongo.js').then(async ({ connectDb, disconnectDb, getDbNameFromMongoUri, getMongoUri }) => {
      const { mongoUri } = await connectDb();
      const db = (await import('mongoose')).default.connection.db;
      const cols = await db.listCollections().toArray();
      const ptx = await db.collection('practicetransfers').estimatedDocumentCount();
      const ba = await db.collection('businessanchors').estimatedDocumentCount();
      console.log({ db: getDbNameFromMongoUri(mongoUri), collections: cols.length, practicetransfers: ptx, businessanchors: ba });
      await disconnectDb();
    });
  "
```

의뢰·사업자 수가 테스트 DB와 비슷하면 OK.

### 3) 운영 DB 마이그레이션

```bash
cd backend
ENV_FILE=prod.env NODE_ENV=production ABUTS_DB_FORCE=true \
  node scripts/db/pending-migrations.js
# 목록 확인 후
ENV_FILE=prod.env NODE_ENV=production ABUTS_DB_FORCE=true \
  node scripts/db/pending-migrations.js --apply
```

### 4) 잔고 0 + 치과 데모 ON (dry-run → apply)

```bash
cd backend

# 1) 먼저 dry-run (APPLY 없음) — 대상·회수 금액만 출력
ENV_FILE=prod.env NODE_ENV=production ABUTS_DB_FORCE=true \
  node scripts/db/zero-practice-credits-enable-demo.js

# 2) 숫자 보고 이상 없으면 적용
ENV_FILE=prod.env NODE_ENV=production ABUTS_DB_FORCE=true \
  APPLY=1 node scripts/db/zero-practice-credits-enable-demo.js
```

의뢰 문서는 지우지 않습니다. 치과 양수 잔고만 회수하고 데모를 켭니다.

### 5) 데모 90일 시계를 런칭일로 (권장)

모든 **미전환 치과**의 데모를 “오늘부터 90일”로 맞춥니다.

```bash
cd backend
ENV_FILE=prod.env NODE_ENV=production ABUTS_DB_FORCE=true \
  node --input-type=module -e "
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from './scripts/db/_mongo.js';
import BusinessAnchor from './models/businessAnchor.model.js';
import {
  normalizeRequestorKind,
  normalizeRequestorCapabilities,
} from './utils/requestorCapabilities.js';

await connectDb();
const now = new Date();
const anchors = await BusinessAnchor.find({ businessType: 'requestor' })
  .select({ requestorKind: 1, requestorCapabilities: 1, demoModeExitedAt: 1, name: 1 })
  .lean();

let n = 0;
for (const a of anchors) {
  if (a.demoModeExitedAt) continue;
  const kind = normalizeRequestorKind(a.requestorKind);
  const caps = normalizeRequestorCapabilities(a.requestorCapabilities);
  const isPractice = kind === 'practice' || (kind !== 'lab' && caps.practice);
  if (!isPractice) continue;
  await BusinessAnchor.updateOne(
    { _id: a._id },
    { \$set: { demoMode: true, demoModeStartedAt: now, conversionPendingAt: null, conversionPendingReason: '' } },
  );
  n += 1;
}
console.log({ resetDemoClock: n, at: now.toISOString() });
await disconnectDb();
"
```

### 6) 운영 서버 배포

```bash
cd /Users/joonholee/Joon/1-Project/dev/abuts.fit/web

# 운영 EB 환경명이 config.yml main과 다르면, 배포 전에
# .elasticbeanstalk/config.yml 의 main.environment 를 운영 환경명으로 맞춘다.
./eb.sh prod
```

배포 후:

```bash
# 운영 EB 헬스 (환경 URL로)
curl -sS "https://<PROD_EB_URL>/healthz"
```

로그에서 `연결된 DB: abuts_fit`, `MongoDB 연결 성공: PROD DB` 인지 확인합니다.

### 7) DNS 전환

1. `abuts.fit` / `www.abuts.fit` → **운영 EB**
2. 기존 EB는 `test.abuts.fit`에 유지 (`./eb.sh test`)
3. 전파 확인:

```bash
curl -sS -o /dev/null -w "%{http_code} %{url_effective}\n" https://abuts.fit/healthz
dig +short abuts.fit
```

### 8) 스모크 테스트 (5분)

운영(`abuts.fit`)에서:

- [ ] 로그인
- [ ] 기존 의뢰 목록·상세·채팅·첨부 파일 열림
- [ ] 치과 잔액 0 + 「데모」뱃지 / 남은 일수 ≈ 90
- [ ] 신규 의뢰 전송(데모 마이너스) 가능
- [ ] 기공소 수신함에서 기존·신규 의뢰 보임
- [ ] (해당 시) 결제/카카오 로그인 콜백이 운영 도메인인지

테스트(`test.abuts.fit`)에서:

- [ ] 여전히 `abuts_fit_test` 연결
- [ ] 운영과 DB가 섞이지 않음

### 9) 주변 시스템

- [ ] BG PC API endpoint → 운영
- [ ] Lab Helper / 다운로드 링크
- [ ] 관리자·영업 공지: “본 서비스 시작, 데모 90일 재시작, 잔고 0”

### 10) Write 잠금 해제

공지 종료. 테스트 서버는 내부/QA 전용으로 사용.

---

## 롤백 (문제 시)

1. DNS를 다시 **기존 EB(`Abutsfit-env`)** 로 돌린다 → 즉시 `abuts_fit_test` 세계로 복귀  
2. 운영 DB(`abuts_fit`)에 쓴 크레딧 회수는 운영에만 영향 → 롤백해도 테스트 DB는 그대로  
3. 운영에서 이미 새 의뢰가 들어왔다면, 그 건은 테스트로 자동 이전되지 않음 → 수동 처리

---

## 하지 말 것

- `reset-requestor-credit-ledgers.js` (원장·HOLD 전량 삭제)
- `npm run db:reset` / 컬렉션 wipe
- 테스트·운영 URI를 한 EB에 섞어 넣기
- 컷오버 중 `abuts_fit_test`에 마이그레이션/리셋을 먼저 적용하기 (복제 소스 오염)
- 채팅·이슈에 Mongo URI·키 붙여 넣기

---

## 당일 치트시트 (복붙)

```bash
# === 위치 ===
cd /Users/joonholee/Joon/1-Project/dev/abuts.fit/web

# === DB 복제 후 ===
cd backend
ENV_FILE=prod.env NODE_ENV=production ABUTS_DB_FORCE=true \
  node scripts/db/pending-migrations.js --apply

ENV_FILE=prod.env NODE_ENV=production ABUTS_DB_FORCE=true \
  node scripts/db/zero-practice-credits-enable-demo.js
ENV_FILE=prod.env NODE_ENV=production ABUTS_DB_FORCE=true \
  APPLY=1 node scripts/db/zero-practice-credits-enable-demo.js

# (데모 시계 리셋은 위 §5 블록)

# === 배포 ===
cd ..
./eb.sh prod

# === 확인 ===
curl -sS https://abuts.fit/healthz
```

---

## 메모

- 로컬/에이전트 스크립트는 계속 `ENV_FILE=local.env NODE_ENV=test` → `MONGODB_URI_TEST`만 사용
- SSOT: `backend/utils/mongoUri.js`, `backend/scripts/db/_mongo.js`, 루트 `rules.md` 데모 모드 절
- 이 문서: `web/PROD_CUTOVER.md`
