# WBLS Server Rules

루트 `rules.md`가 최종 기준입니다.

## 0) 문서 목적

- 이 문서는 `bg/pc3/wbls-server` 단위 프로그램의 로컬 정책/트러블슈팅만 기록합니다.
- 루트 rules 축약으로 제거된 상세 맥락은 아래 보존본을 참조합니다.
  - `.archive/rules.legacy-2026-07-29.md`
  - `rules.legacy-full.md` (로컬 전체 상세 미러)

## 1) 역할/흐름

- wbls-server는 운송장/라벨 출력의 최종 프린트 게이트웨이입니다.
- label 모드에서는 프론트 Canvas PNG 렌더링 후 백엔드 프록시를 통해 wbls-server가 출력합니다.
- 한진 인증/주문/상태 SSOT는 백엔드이며, wbls는 출력 수행에 집중합니다.
- 프로세스 TZ: 엔트리 `app.js`에서 `process.env.TZ = "Asia/Seoul"` (루트 §1.4).

## 2) 연결 진입 파일

- 서비스 엔트리: `bg/pc3/wbls-server/app.js`
- 로거: `bg/pc3/wbls-server/utils/logger.js`
- 백엔드 한진 컨트롤러: `web/backend/controllers/requests/shipping.Hanjin.controller.js`
- 백엔드 한진 헬퍼: `web/backend/controllers/requests/shipping.Hanjin.helpers.js`
- 프론트 출력 호출: `web/frontend/src/pages/manufacturer/worksheet/custom_abutment/shipping/components/mailboxGrid.helpers.ts`

## 3) 로컬 변경 체크

- [ ] 소스 상단 `related files` 주석 갱신
- [ ] 출력 모드(image/label) 동작 확인
- [ ] 루트 rules와 충돌 여부 점검
