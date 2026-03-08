# BRIDGE_SHARED_SECRET Rotation Checklist

- 이 문서는 **운영 체크리스트 문서**입니다.
- 정책 기준 문서가 아니며, 실제 동작 기준은 코드와 루트 `rules.md`입니다.

## 0. 현재 구조 요약

- **PC1은 3개 서비스로 분리**됩니다.
  - `bridge`
  - `rhino`
  - `esprit`
- 따라서 PC1 secret도 이제 아래처럼 분리합니다.
  - `BRIDGE_SHARED_SECRET`
  - `RHINO_SHARED_SECRET`
  - `ESPRIT_SHARED_SECRET`
- `lot` / `pack` / `wbl`은 PC1과 별도 secret로 운영합니다.

## 1. 왜 회전해야 하나

현재 저장소 히스토리와 일부 추적 파일에 `BRIDGE_SHARED_SECRET` 및 동일한 값이 재사용된 다른 shared secret이 노출된 흔적이 있습니다.

히스토리 전체 정리보다 먼저 해야 할 일은 **secret rotation** 입니다.

## 2. 우선순위

1. 새 secret 생성
2. 실제 사용 중인 환경변수 교체
3. 관련 서비스 재시작
4. 인증 실패 여부 확인
5. 필요 시 히스토리 정리 검토

## 2.1 새 secret 생성 규칙

- 길이: **최소 32자**, 가능하면 48자 이상
- 문자 조합: 영문 대문자 + 영문 소문자 + 숫자 + 특수문자
- 사람이 기억하기 쉬운 단어/회사명/도메인명은 넣지 않습니다.
- 기존 secret의 일부를 재사용하지 않습니다.
- `BRIDGE_SHARED_SECRET`, `RHINO_SHARED_SECRET`, `ESPRIT_SHARED_SECRET`, `LOT_SHARED_SECRET`, `PACK_PRINT_SERVER_SHARED_SECRET`, `WBL_PRINT_SHARED_SECRET`를 같은 값으로 다시 맞추지 않는 것을 권장합니다.
- 가능하면 **용도별로 서로 다른 secret**을 발급합니다.

예시 규칙:

- bridge용 1개
- rhino용 1개
- esprit용 1개
- lot용 1개
- pack print용 1개
- wbl print용 1개

## 3. 현재 확인된 사용 지점

### 3.1 Backend

- `web/backend/middlewares/bridgeSecret.middleware.js`
  - `process.env.BRIDGE_SHARED_SECRET`
  - `process.env.RHINO_SHARED_SECRET`
  - `process.env.ESPRIT_SHARED_SECRET`
  - 검증
- `web/backend/local.env`
- `web/backend/test.env`
- `web/backend/prod.env`

### 3.2 Bridge Server

- `bg/pc1/bridge-server/Config.cs`
- `bg/pc1/bridge-server/BridgeAuthHandler.cs`
- `bg/pc1/bridge-server/Program.cs`
- `bg/pc1/bridge-server/DummyCncScheduler.cs`
- `bg/pc1/bridge-server/CncContinuousMachining.cs`
- `bg/pc1/bridge-server/local.env`

### 3.3 Rhino Server

- `bg/pc1/rhino-server/compute/core/app_factory.py`
- `bg/pc1/rhino-server/compute/core/settings.py`
- `bg/pc1/rhino-server/compute/scripts/process_abutment_stl.py`
- `bg/pc1/rhino-server/compute/local.env`

### 3.4 Esprit Add-in

- `bg/pc1/esprit-addin/Config.cs`
- `bg/pc1/esprit-addin/StlFileProcessor.cs`
- `bg/pc1/esprit-addin/local.env`
- `bg/pc1/esprit-addin/referenes/old/ProcessConfig.cs` (old reference)

### 3.5 Lot Server

- `bg/pc2/lot-server/src/index.js`
- `bg/pc2/lot-server/local.env`

## 4. 같은 값 재사용 여부 추가 점검 대상

현재 같은 값이 아래 secret에도 재사용된 흔적이 있습니다. 가능하면 **같이 회전**하는 것이 안전합니다.

- `RHINO_SHARED_SECRET`
- `ESPRIT_SHARED_SECRET`
- `LOT_SHARED_SECRET`
- `PACK_PRINT_SERVER_SHARED_SECRET`
- `WBL_PRINT_SHARED_SECRET`

## 4.1 권장 secret 분리 전략

- **PC1 Bridge 계열**
  - 용도: backend ↔ bridge
  - 키:
    - `BRIDGE_SHARED_SECRET`
  - 원칙: rhino/esprit와도 분리합니다.

- **PC1 Rhino 계열**
  - 용도: backend ↔ rhino, rhino ↔ backend
  - 키:
    - `RHINO_SHARED_SECRET`
  - 원칙: bridge/esprit/print와 분리합니다.

- **PC1 Esprit 계열**
  - 용도: backend ↔ esprit, esprit ↔ backend
  - 키:
    - `ESPRIT_SHARED_SECRET`
  - 원칙: bridge/rhino/print와 분리합니다.

- **Pack Print 계열**
  - 용도: backend ↔ pack-server
  - 키:
    - `PACK_PRINT_SERVER_SHARED_SECRET`
  - 원칙: PC1 전 계열과 분리합니다.

- **Lot 계열**
  - 용도: backend ↔ lot-server
  - 키:
    - `LOT_SHARED_SECRET`
  - 원칙: bridge/rhino/esprit/print와 분리합니다.

- **Waybill Print 계열**
  - 용도: backend ↔ wbls-server
  - 키:
    - `WBL_PRINT_SHARED_SECRET`
  - 원칙: PC1/lot/pack 계열과 분리합니다.

- **최종 권장 구성**
  - bridge용 1개
  - rhino용 1개
  - esprit용 1개
  - lot용 1개
  - pack용 1개
  - wbl용 1개
  - 총 6개 secret 운영

확인 파일:

- `bg/pc2/pack-server/local.env`
- `bg/pc3/wbls-server/local.env`
- `bg/pc2/lot-server/local.env`
- `web/backend/local.env`
- `web/backend/test.env`
- `web/backend/prod.env`
- `bg/pc1/esprit-addin/local.env`

## 5. 실행 체크리스트

### 5.1 새 값 생성

- 충분히 긴 랜덤 문자열 생성
- 예: 32자 이상, 영문 대소문자 + 숫자 + 특수문자 조합

### 5.2 환경변수 교체

다음 값을 모두 새 값으로 교체:

- `BRIDGE_SHARED_SECRET`
- `RHINO_SHARED_SECRET`
- `ESPRIT_SHARED_SECRET`
- `LOT_SHARED_SECRET`
- print 계열
  - `PACK_PRINT_SERVER_SHARED_SECRET`
  - `WBL_PRINT_SHARED_SECRET`

### 5.2.1 파일별 교체 순서

아래 순서대로 수정하면 추적과 검증이 쉽습니다.

1. **backend 기준 env 교체**
   - `web/backend/local.env`
   - `web/backend/test.env`
   - `web/backend/prod.env`

2. **bridge 본체 교체**
   - `bg/pc1/bridge-server/local.env`

3. **PC1 rhino 교체**
   - `bg/pc1/rhino-server/compute/local.env`

4. **PC1 esprit 교체**
   - `bg/pc1/esprit-addin/local.env`

5. **lot 교체**
   - `bg/pc2/lot-server/local.env`

6. **print 계열 secret 교체**
   - `bg/pc2/pack-server/local.env`
   - `bg/pc3/wbls-server/local.env`
   - backend의 대응 값
     - `web/backend/local.env`
     - `web/backend/test.env`
     - `web/backend/prod.env`

7. **하드코딩/주석/예시 재점검**
   - 문서, old reference, 주석 curl 예시

### 5.2.2 교체 대상 env 파일 체크박스

- [ ] `web/backend/local.env`
- [ ] `web/backend/test.env`
- [ ] `web/backend/prod.env`
- [ ] `bg/pc1/bridge-server/local.env`
- [ ] `bg/pc1/rhino-server/compute/local.env`
- [ ] `bg/pc1/esprit-addin/local.env`
- [ ] `bg/pc2/lot-server/local.env`
- [ ] `bg/pc2/pack-server/local.env`
- [ ] `bg/pc3/wbls-server/local.env`

체크 기준:

- bridge 값이 들어가는 파일은 모두 같은 bridge secret인지
- rhino 값이 들어가는 파일은 모두 같은 rhino secret인지
- esprit 값이 들어가는 파일은 모두 같은 esprit secret인지
- lot 값이 들어가는 파일은 모두 같은 lot secret인지
- pack 값이 들어가는 파일은 모두 같은 pack secret인지
- wbl 값이 들어가는 파일은 모두 같은 wbl secret인지
- 서로 다른 계열 secret이 섞이지 않았는지

### 5.3 재시작 대상

- backend
- bridge-server
- rhino-server
- esprit-addin
- lot-server
- pack-server
- wbls-server

Windows 서비스/NSSM 또는 수동 실행 프로세스를 실제 운영 방식에 맞게 재시작합니다.

### 5.3.1 권장 재시작 순서

1. `backend`
2. `bridge-server`
3. `rhino-server`
4. `esprit-addin`
5. `lot-server`
6. `pack-server`
7. `wbls-server`

이 순서가 좋은 이유:

- 인증을 받는 쪽(backend, bridge)을 먼저 올리고
- 호출하는 쪽(BG 서비스)을 나중에 올리면
- 불필요한 401 로그를 줄이기 쉽습니다.

### 5.4 검증 포인트

- backend → bridge 호출이 401 없이 동작하는지
- backend → rhino 호출이 401 없이 동작하는지
- backend → esprit 호출이 401 없이 동작하는지
- backend → lot 호출이 401 없이 동작하는지
- BG → backend 호출이 401 없이 동작하는지
- Rhino/Esprit/Lot 등록 콜백이 정상인지
- pack/wbl 프록시 호출이 정상인지
- 로그에 아래 메시지가 없는지 확인
  - `Invalid bridge secret`
  - `Missing X-Bridge-Secret header`
  - `Unauthorized: X-Bridge-Secret mismatch`

### 5.4.1 실행형 검증 절차

1. **backend 로그 확인**
   - bridge/rhino/esprit 관련 401/403이 없는지
   - pack/wbl 프록시 호출 실패가 없는지

2. **bridge-server 로그 확인**
   - `Invalid X-Bridge-Secret header value`
   - `Missing X-Bridge-Secret header`
   - `Forbidden by allowlist`
   - 위 메시지가 없는지 확인

3. **rhino/esprit/lot 로그 확인**
   - backend callback 등록 실패가 없는지
   - 파일 등록/메타 조회가 정상인지
   - rhino/esprit inbound unauthorized가 없는지

4. **기능 smoke test**
   - backend에서 bridge settings 등록
   - BG 파일 등록 콜백 1건
   - pack print health / proxy 1건
   - wbl print health / proxy 1건

5. **문서/예시 재검색**
   - 저장소 전체에서 이전 secret 문자열 재검색
   - 남은 값이 있으면 문서/예시/old reference인지 확인 후 제거 또는 회전 범위에 포함

### 5.4.2 grep 대신 IDE 기준 점검 순서

1. **Global Search에서 키 이름으로 검색**
   - `BRIDGE_SHARED_SECRET`
   - `RHINO_SHARED_SECRET`
   - `ESPRIT_SHARED_SECRET`
   - `LOT_SHARED_SECRET`
   - `PACK_PRINT_SERVER_SHARED_SECRET`
   - `WBL_PRINT_SHARED_SECRET`

2. **검색 결과를 파일 그룹별로 확인**
   - backend env
   - bridge/rhino/esprit/lot env
   - pack/wbl env
   - 코드 검증 지점
   - 문서/old reference

3. **활성 파일 값 비교**
   - 같은 계열은 같은 값인지
   - 다른 계열은 다른 값인지

4. **코드 검증 지점 확인**
   - backend middleware
   - bridge auth handler
   - rhino auth middleware
   - esprit http server auth
   - rhino/esprit/lot 호출부

5. **문서/old reference 점검**
   - 예시값이 `<redacted>` 처리됐는지
   - 실제 secret이 문서에 남아 있지 않은지

## 6. 지금 바로 바꾸지 말아야 하는 것

- 현재 사용 중인 `local.env`, `prod.env`, `test.env`의 값을 placeholder로 바꾸는 작업

이 작업은 실행 중 서비스 인증을 즉시 깨뜨릴 수 있으므로, **새 secret을 준비한 뒤 일괄 교체**해야 합니다.

## 7. 후속 조치

- 회전 완료 후 저장소 내 예시/문서 값 재점검
- 필요하면 GitHub secret scanning / push protection 활성화
- 필요 시 히스토리 rewrite는 별도 작업으로 검토

## 8. 간단 Runbook

### Step 1

- 새 bridge/rhino/esprit secret 생성
- 새 lot secret 생성
- pack/wbl용 secret도 별도로 생성

### Step 2

- backend env 3개(`local.env`, `test.env`, `prod.env`) 수정

### Step 3

- bridge/rhino/esprit/lot/pack/wbl 각 local env 수정

### Step 4

- backend 재시작
- bridge 재시작
- 나머지 BG/print 서버 재시작

### Step 5

- 로그에서 401/403 확인
- backend ↔ bridge/rhino/esprit/lot ↔ BG ↔ print 프록시 smoke test

### Step 6

- 저장소 전체에서 이전 secret 문자열 재검색
- 남은 값이 있으면 문서/old code/주석까지 마무리
