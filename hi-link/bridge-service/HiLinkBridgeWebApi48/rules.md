# Hi-Link Bridge Service Development Rules

이 문서는 `abuts.fit` 프로젝트의 Hi-Link Bridge Service (HiLinkBridgeWebApi48) 작업 내용과 유지보수 규칙을 정리합니다.

## 1. 비즈니스 및 공통 규칙 (Global Sync)

### 1.1 CNC 프로그램 번호 및 파일명

- **프로그램 번호 형식**: `O` + 네 자리 숫자 (예: `O0001`, `O3001`).
- **파일명 규칙**: 브리지 서버 및 로컬에 저장되는 프로그램 파일명은 항상 `O####.nc` 형식을 사용합니다.
- **전송 규칙**: CNC 장비(Hi-Link)로 프로그램 번호를 전송하거나 활성화할 때는 확장자 없이 **숫자 4자리**만 사용합니다.
- **정규화**: 외부에서 들어오는 파일명이나 프로그램 번호는 항상 `O####` 형식으로 정규화하여 처리합니다.

### 1.2 로트넘버(생산번호)

- **Prefix**: `AB`(Custom Abutment), `CR`(Crown)
- **Format**: `[Prefix][YYYYMMDD]-[AAA~]` (예: `AB20251206-AAA`)
- **부여 시점**: 가공 단계 진입 시 백엔드에서 자동 부여됩니다.

### 1.3 장비 식별 (UID)

- 각 CNC 장비는 고유한 `UID`로 식별됩니다.
- Hi-Link DLL 호출 시 이 UID를 기반으로 대상 장비를 지정합니다.

## 2. 브리지 서비스 시스템 규칙

### 2.1 Hi-Link DLL 연동 (`HiLinkMode2Client.cs`)

- **스레드 안정성**: Hi-Link Mode2 DLL은 스레드에 불안정하므로, 모든 요청은 `HiLinkMode2Client`의 단일 워커 스레드에서 직렬화하여 처리합니다.
- **FIFO 큐**: `MessageHandler.RequestFIFO`와 `ResponseFIFO`를 사용하여 DLL과 통신하며, 응답 대기 시 UID와 DataType 매칭을 확인합니다.
- **초기화**: `MessageHandler` 인스턴스는 워커 스레드 내에서 단 한 번만 생성되어야 합니다.

### 2.2 API 엔드포인트 및 통신

- **기술 스택**: .NET Framework 4.8, ASP.NET Web API 2.
- **인증**: `BridgeAuthHandler`를 통한 기본 토큰 기반 인증을 수행할 수 있습니다.
- **장비 설정**: `MachinesConfigStore`를 통해 장비 목록(UID, IP, Port)을 관리합니다.

### 2.3 예외 처리 및 로깅

- DLL 호출 실패나 타임아웃 발생 시 적절한 에러 코드를 반환합니다.
- 모든 주요 작업 및 통신 내용은 콘솔/로그에 기록하여 추적 가능하게 합니다.

## 3. 운영 가이드라인

### 3.1 프로그램 전송 프로세스

1. 파일 업로드 시 파일명에서 O번호 추출.
2. `O####.nc` 형식으로 정규화하여 저장.
3. 장비 전송 시 `UpdateProgram` 등을 통해 숫자 번호만 전달.
4. 전송 완료 후 `UpdateActivateProg`로 해당 번호 활성화.

### 3.2 헬스체크

- 브리지 서비스의 생존 여부와 각 장비의 연결 상태를 주기적으로 확인합니다.
