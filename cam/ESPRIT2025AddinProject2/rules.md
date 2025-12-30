# ESPRIT 2025 Dental Addin Development Rules

이 문서는 `abuts.fit` 프로젝트의 ESPRIT 2025 Dental Addin 작업 내용과 향후 유지보수를 위한 규칙을 정리합니다. 이 규칙은 프로젝트 루트의 `rules.md`를 기반으로 하며, CAM 애드인에 특화된 내용을 포함합니다.

## 1. 비즈니스 및 공통 규칙 (Global Sync)

### 1.1 CNC 프로그램 번호 및 파일명

- **프로그램 번호 형식**: `O` + 네 자리 숫자 (예: `O0001`, `O3001`).
- **파일명 규칙**: 브리지 서버/로컬에 저장되는 프로그램 파일명은 항상 `O####.nc` 형식을 사용합니다.
- **전송 규칙**: CNC 장비로 전송할 때는 확장자를 제거하고 숫자 프로그램 번호만 사용합니다.

### 1.2 로트넘버(생산번호)

- **Prefix**: `AB`(Custom Abutment), `CR`(Crown)
- **Format**: `[Prefix][YYYYMMDD]-[AAA~]` (예: `AB20251206-AAA`)
- **부여**: 가공 단계 진입 시 백엔드에서 자동 부여된 값을 사용합니다.

### 1.3 CaseInfos 데이터 구조

- 백엔드의 `caseInfos` 구조와 항상 동기화되어야 합니다.
- 주요 필드: `clinicName`, `patientName`, `tooth`, `implantManufacturer`, `implantSystem`, `implantType`, `maxDiameter`, `connectionDiameter`, `workType`.

## 2. CAM 시스템 규칙

### 2.1 API 서버 기반 NC 생성 자동화 (`RepeatProcess.cs`)

- **엔드포인트**: `http://localhost:8080/` (POST 요청 수신).
- **워크플로우**: STL 병합 -> 워크플로우 실행 -> NC 생성 -> 그래픽 정리(Cleanup) 과정을 자동화.
- **백엔드 콜백**: NC 생성 완료 시 `https://abuts.fit/api/requests/:id/nc-file` 호출하여 결과 보고.

### 2.2 수명 주기 및 안정성 (`Connect.cs`)

- **자동 시작**: Esprit 로드 시(`AddInConnect`) API 서버가 즉시 가동됨.
- **리소스 관리**: `RepeatProcess`를 멤버 변수로 관리하여 GC로부터 보호하고, 종료 시 `Dispose`를 통해 해제.

### 2.3 성능 및 유지보수

- **메모리 누수 방지**: COM 객체 접근 후 반드시 `Marshal.ReleaseComObject` 호출.
- **로그 관리**: `LocalApplicationData` 경로에 로그를 기록하며, 30일 경과 로그는 자동 삭제.
- **상태 확인**: `GET /health` 엔드포인트 제공.

## 3. 개발 가이드라인

### 3.1 기술 스택

- **언어**: C# (x86 플랫폼)
- **프레임워크**: .NET Framework 4.8
- **JSON 처리**: `DataContractJsonSerializer` 사용 (의존성 최소화).

### 3.2 통신 규칙

- **포트**: 8080 고정.
- **요청 모델**: `NcGenerationRequest` 클래스 사용. 필드 변경 시 백엔드 동기화 필수.

### 3.3 ESPRIT 조작

- **그래픽 정리**: 작업 완료 후 `CleanupEsprit` 메서드를 통해 모델 및 피처 삭제.
- **스레드 안전성**: 공유 데이터 접근 시 `lock` 사용.
