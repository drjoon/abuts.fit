# Pack Server Rules

루트 `rules.md`가 최종 기준입니다.

## 0) 문서 목적

- 이 문서는 `bg/pc2/pack-server` 단위 프로그램의 로컬 정책/트러블슈팅만 기록합니다.
- 루트 rules 축약으로 제거된 상세 맥락은 아래 보존본을 참조합니다.
  - `.archive/rules.legacy-2026-07-29.md`
  - `rules.legacy-full.md` (로컬 전체 상세 미러)

## 1) 역할/흐름

- pack-server는 패킹 라벨 출력 보조 서비스입니다.
- 패킹 라벨의 정상 운영 경로는 프론트 수동 출력이며, 백엔드는 프록시/보조 렌더링을 담당합니다.
- 브랜딩/한글 설정 SSOT는 환경변수보다 DB(`SystemSettings`)를 우선합니다.

## 2) 연결 진입 파일

- 서비스 엔트리: `bg/pc2/pack-server/app.js`
- 백엔드 출력 로직: `web/backend/controllers/requests/packingPrint.controller.js`
- 백엔드 유틸: `web/backend/utils/packPrint.utils.js`
- 렌더러: `web/backend/utils/packLabelRenderer.js`
- 프론트 수동 출력: `web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx`

## 3) 로컬 변경 체크

- [ ] 소스 상단 `related files` 주석 갱신
- [ ] 프론트 수동 출력 경로와 동기화 확인
- [ ] 루트 rules와 충돌 여부 점검
