# Rhino Server Rules

루트 `rules.md`가 최종 기준입니다.

이 문서는 `bg/pc1/rhino-server` 폴더의 로컬 메모만 남깁니다.

## 1. 구현 메모

- Rhino 서버는 `1-stl`을 입력으로 받아 `2-filled`를 생성합니다.
- 파일 감시는 이벤트 기반으로 처리합니다.
- Rhino 안정성을 위해 단일 인스턴스/전역 락 기준을 유지합니다.
- 처리 완료 결과는 백엔드 `register-file`로 등록합니다.

## 2. 트러블슈팅

- `No active Rhino instances found via RhinoCode list`가 뜨면 Rhino 실행 후 `RhinoCode` 또는 `ScriptEditor`를 한 번 열어 RhinoCode 서비스를 깨웁니다.

## 3. 정리 원칙

- 전체 정책은 루트 `rules.md`에서 관리합니다.
- 이 파일에는 Rhino 로컬 실행 메모와 트러블슈팅만 남깁니다.
