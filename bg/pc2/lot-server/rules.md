# Lot Server Rules

루트 `rules.md`가 최종 기준입니다.

## 0) 문서 목적

- 이 문서는 `bg/pc2/lot-server` 단위 프로그램의 로컬 정책/트러블슈팅만 기록합니다.
- 루트 rules 축약으로 제거된 상세 맥락은 아래 보존본을 참조합니다.
  - `.archive/rules.legacy-2026-07-29.md`
  - `rules.legacy-full.md` (로컬 전체 상세 미러)

## 1) 역할/흐름

- lot-server는 각인/캡처 결과를 백엔드로 전달하는 보조 서비스입니다.
- 캡처 처리 결과 SSOT 반영은 백엔드에서 수행합니다.
- 패킹 라벨 출력 트리거는 lot 흐름에서 자동 실행하지 않습니다(단계 전환/이벤트 전파 중심).
- 프로세스 TZ: 엔트리 `src/index.js`에서 `process.env.TZ = "Asia/Seoul"` (루트 §1.4).

## 2) 연결 진입 파일

- 서비스 엔트리: `bg/pc2/lot-server/src/index.js`
- 백엔드 처리: `web/backend/controllers/ai/lotCapture.controller.js`
- 워크시트 연계: `web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx`

## 3) 로컬 변경 체크

- [ ] 소스 상단 `related files` 주석 갱신
- [ ] 백엔드 이벤트/상태 전이 영향 검토
- [ ] 루트 rules와 충돌 여부 점검
