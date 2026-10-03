# Lab Helper (Windows · Mac) Rules

루트 `rules.md`가 최종 기준입니다.

## 0) 문서 목적

- 기공소 PC의 **어벗츠 연결 프로그램 v3**(Windows·Mac). 웹이 PC 폴더에 파일을 풀어 두고 탐색기·Finder로 열 수 있게 하는 통로다.
- 하는 일: 작업 폴더 지정, 케이스 폴더 확인·저장, 케이스 폴더 열기, **v4 PC 알람**(웹 숨김·브라우저 종료 시 OS 알림음).
- **디자인 SW(3Shape·exocad)는 실행하지 않는다.** 두 SW 모두 명령줄 인자로 주문(케이스)을 등록할 수 없다(2026-09 조사). 기공소는 케이스 폴더에서 스캔을 가져온다.
- Windows와 Mac은 **같은 HTTP API·같은 이름 규칙**을 쓴다. 한쪽을 바꾸면 다른 쪽도 바꾼다.

## 1) 설치 UX (강제)

- 웹 「작업열기」에서 연결 프로그램이 없으면 OS에 맞는 설치 파일을 **바로 받고** 안내 모달(`LabHelperInstallDialog`)을 띄운다. 모달은 연결될 때까지 기다렸다가 **자동으로 이어서 저장**한다.
- 헤더 설정 팝오버(`LabReceiveAlarmSettingsButton`)에도 **연결 프로그램** 설치·업데이트 항목이 있다. 기공의뢰 채팅 입력 포커스 시 미설치·구버전이면 같은 모달(`useLabHelperInstallPrompt`, 탭 세션당 한 번).
- 설치 파일을 열면 「설치할까요?」 한 번. 「예」·「설치」면 바로 설치·실행·연결 확인 → 완료 안내. 이미 설치돼 있으면 다시 설치(업데이트)·삭제.
- **관리자 권한·암호 없음.** 사용자 폴더에만 쓴다. 이후 로그인할 때마다 화면 없이 켜진다.
- 작업 폴더 안 파일은 설치·삭제 때 지우지 않는다. v2 헬퍼는 설치 때 정리하고 작업 폴더 설정만 옮겨 온다.

### Windows

- 배포물: exe 하나 `web/frontend/public/downloads/lab-helper/AbutsLabHelperSetup.exe`(받는 이름 `어벗츠연결_설치.exe`).
- 설치 위치 `%LOCALAPPDATA%\Abuts\LabHelper`(`asInvoker`), HKCU만:
  - `HKCU\...\Run\AbutsLabHelper` — 로그인 때마다 `--serve`
  - `HKCU\Software\Classes\abuts-cad` — 꺼져 있으면 웹이 `abuts-cad://wake`로 깨운다(설치한 PC에서만)
  - `HKCU\...\Uninstall\AbutsLabHelper` — 「앱 및 기능」에서 제거(`--uninstall`)
- Windows 서비스(session 0)로 만들지 않는다. 관리자 설치가 필요하고, 사용자 화면에 탐색기·폴더 고르기 창을 띄울 수 없다.
- 코드 서명 전: SmartScreen 「Windows의 PC 보호」 → 모달 안내 「추가 정보」 → 「실행」.

### Mac

- 배포물: `web/frontend/public/downloads/lab-helper/AbutsLabHelper-mac.zip`(받는 이름 `어벗츠연결_설치_Mac.zip`) 안에 `어벗츠 연결.app`(유니버설, macOS 12+, `LSUIElement` — Dock에 안 보임).
- 설치: 앱을 `~/Library/Application Support/Abuts/LabHelper/AbutsLabHelper.app`로 복사, quarantine 제거, LaunchAgent `~/Library/LaunchAgents/fit.abuts.labhelper.plist`(`RunAtLoad`, `KeepAlive.SuccessfulExit=false`, `--serve`) 등록. 비정상 종료면 launchd가 다시 띄운다.
- 제거: 설치 파일을 다시 열어 「삭제」(또는 `--uninstall`).
- 공증 전(Developer ID 없음): Gatekeeper 「확인할 수 없습니다」 → 모달 안내 「완료」 → 시스템 설정 › 개인정보 보호 및 보안 › 「그래도 열기」. **Apple Developer ID로 서명·공증하면 이 단계가 없어진다**(`mac/build.sh` 환경변수).

## 2) 작업 폴더 · 케이스 폴더

- 작업 폴더: 웹 localStorage `abuts.labWorkFolder` + 헬퍼 `config.json.workFolder`. 저장 성공 때마다 갱신.
- 우선순위: 로컬 저장값 → 헬퍼 설정값(있을 때) → `LabWorkFolderDialog`(helper 모드: 폴더 고르기 창 또는 경로 붙여넣기, 예: `\\DESKTOP-HAQNS44\CAM-in`). 폴더가 사라졌으면(`WORK_FOLDER_NOT_FOUND`) 다시 묻는다.
- 케이스 폴더: `YYYYMMDD_치과명-환자명-치아번호`(주문일 KST, `buildLabCaseFolderName`). 이름 정리 규칙은 웹 `dedupeLabCaseFiles`, Windows `SafeSegment`, Mac `safeSegment`가 같다.
- **작업열기**: 이미 받은 파일(이름 + 원본 크기, PLY 변환본은 이름만)은 건너뛰고 없는 것만 받는다. 모두 있으면 받지 않고 폴더만 연다.
- **다운로드**: 다시 받아 덮어쓴다.
- 저장이 끝나면 탐색기·Finder로 케이스 폴더를 열고 앞으로 가져온다.
- 쓰기는 `.abuts-part` 임시 파일 → 교체.

## 3) 웹 흐름 (`useS3FileDownload.saveToLabWorkFolder`)

1. 연결 프로그램(v3)이 있으면 → 헬퍼로 저장 + 폴더 열기
2. 없는 Windows·Mac(모든 브라우저) → 설치 안내 → 연결되면 1. Chrome·Edge는 처음 한 번 「로컬 네트워크 접근」 허용을 묻는다.
   - 안내를 닫으면 Chrome·Edge는 브라우저 폴더 핸들로, Firefox·Safari는 zip으로 저장하고, 그 브라우저에서는 다시 묻지 않는다(`abuts.labHelperInstallDeclined`). 저장 알림 「폴더 자동 열기」로 언제든 설치. 연결되면 플래그를 지운다.
3. 설치할 수 없는 기기(모바일·iPad·Linux) → Chrome·Edge 폴더 핸들, 그 외 zip
- 진행률: `labSaveProgress`(원본 크기 가중 0~100) → 채팅 「작업열기」·「다운로드」 버튼 「저장 중 N%」 + 하단 막대

## 4) HTTP API (v3)

bind `127.0.0.1:8010`(Windows TcpListener — HttpListener URL 예약은 관리자 권한 필요, Mac NWListener). 허용 출처: `https://abuts.fit`, `https://www.abuts.fit`, `http://localhost:5173`, `http://127.0.0.1:5173` (+ `config.allowOrigin` 쉼표 목록). 다른 `Origin`은 403. 응답에 `Access-Control-Allow-Private-Network: true`.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/health` | `version`(5), `os`(`windows`/`mac`), `workFolder`, `workFolderExists` |
| GET/POST | `/work-folder` | 조회 / `{path}` 확인 후 저장 |
| POST | `/work-folder/pick` | 폴더 고르기 창(브라우저 위) |
| POST | `/cases/check` | `{workFolder, caseFolder, files:[{name,size}]}` → `folder`, `exists`, `missing` |
| PUT | `/cases/file?workFolder&caseFolder&name` | 파일 저장(최대 4GB). 쿼리의 `+`는 공백 |
| POST | `/cases/reveal` | `{workFolder, caseFolder}` → 탐색기·Finder로 열기 |
| POST | `/notify` | `{title?, body?}` → OS 알림음(+ balloon/알림). v4 |
| POST | `/session` | `{apiOrigin, appOrigin?, token, prefs, browserAlive, alertMode?, businessAnchorId?}` — 토큰별로 세션 유지. 포커스 없는 계정만 `alarms/wait` 폴링. v4, 다중 세션 v8, ba v9 |
| POST | `/session/clear` | `{token?}` 해당 계정만 제거. token 없으면 전부 삭제. v4 |
| POST | `/open-href` | `{ href }` — 이미 열린 기공의뢰 탭을 앞으로. v7. v9는 `ba=`로 같은 계정 탭만. v11은 JS 주입 실패 시 URL 폴백 |
| POST | `/open-privacy-settings` | Mac — 개인정보 보호 및 보안(시스템 설정) 열기. v10 |
| POST | `/shutdown` | 재설치용 종료 |

- 웹 `LAB_HELPER_MIN_VERSION`(폴더열기)=3, `LAB_HELPER_ALARM_MIN_VERSION`=4, `LAB_HELPER_CURRENT_VERSION`=12. 알람 API는 version≥4일 때만 호출한다.
- **자동 갱신(v5+)**: serve 중 `version.json`을 보고 원격이 더 높으면 설치본을 받아 `--silent-update`로 교체. 이미 설치된 PC에서 설치 파일을 열면 확인 창 없이 덮어쓴다. 구버전은 웹 `LabHelperUpdateDialog`로 파일 받기 + 「열어서 설치」를 짧게 안내한다. v6: 탭 숨김 시 폴링·401 백오프·캐시 무시. v8: 치과·기공소 JWT를 동시에 들고, 포커스 없는 쪽만 OS 알림. v9: `businessAnchorId`/`ba=`로 다른 치과 창이 알림 보기를 가로채지 않음. v10: Mac `POST /open-privacy-settings`. v11: open-href가 JS 주입 실패해도 기존 탭 URL로 연다. v12: OS 알림을 커스텀 플로팅 토스트(보기)로.

## 5) 파일 · 빌드

| 파일 | 역할 |
|------|------|
| `win/Program.cs` | 진입: 설치(기본) / `--serve` / `--uninstall`. 설치 폴더에서 실행되면 serve |
| `win/Installer.cs` | 동의·복사·레지스트리·v2 정리·연결 확인·제거 |
| `win/HttpServer.cs` | HTTP·CORS·라우팅 |
| `win/Notify.cs` | v4 PC 알람(소리·balloon·session·폴링) |
| `win/AutoUpdate.cs` | v5 version.json 자동 갱신 |
| `win/CaseFolder.cs` | 이름 정리·확인·쓰기 |
| `win/WinShell.cs` | 탐색기 열기·앞으로, 폴더 고르기 창 |
| `win/Config.cs` | `config.json`·`helper.log` |
| `mac/AbutsLabHelper.swift` | Mac 전부(설치·LaunchAgent·HTTP·케이스 폴더·Finder·폴더 고르기·v4 알람) |

```bash
bg/lab-cad-helper/win/build.sh   # .NET SDK 8+ → AbutsLabHelperSetup.exe (.NET Framework 4.8, 약 30KB)
bg/lab-cad-helper/mac/build.sh   # Xcode CLT → AbutsLabHelper-mac.zip (유니버설, 약 150KB)
# Mac 서명·공증: MAC_SIGN_IDENTITY="Developer ID Application: …" MAC_NOTARY_PROFILE=… bg/lab-cad-helper/mac/build.sh
```

- 버전을 올리면 Windows `Program.Version`·csproj `Version`·`app.manifest`, Mac `helperVersion`·`build.sh` Info.plist, 웹 `LAB_HELPER_CURRENT_VERSION`을 함께 바꾼다.
- v7: `POST /open-href` `{ href }` — 이미 열린 기공의뢰 탭을 앞으로. Mac은 Chrome 수신함/발신함 탭을 찾고, 웹 알림 **보기**가 호출한다.
- v8: 헬퍼 세션이 계정(JWT)마다 따로 있다. 치과 창이 기공소 세션을 덮어쓰지 않고, 포커스 없는 치과도 OS 알림을 받는다.
- v9: 세션·알림 URL에 `businessAnchorId`/`ba=` — Mac open-href가 같은 계정 탭만 연다. 웹 BroadcastChannel도 ba로 필터.
- v10: Mac `POST /open-privacy-settings` — Gatekeeper 「그래도 열기」용 시스템 설정을 헬퍼가 연다(브라우저 프로토콜 확인창 없음).
- v11: Mac open-href — Apple Event JS 주입이 막혀도 기존 수신함/발신함 탭에 URL을 넣고, ba를 못 읽어도 mode·host가 맞으면 그 탭을 연다(앞창에 빈 탭이 생기지 않게).
- v12: OS 알림 — Mac·Windows 커스텀 플로팅 토스트(브랜드 액센트·「보기」). 브라우저를 닫거나 다른 사이트를 볼 때도 화면 오른쪽 위에 뜨고, 보기로 해당 채팅 탭을 연다.

## 6) 레거시

- `lab-cad-helper.ps1`·`install.ps1`·`run-hidden.vbs`·`*.cmd`·`mac/Abuts연결_설치.command`는 v2 기록이다. 배포하지 않는다. v3 설치가 v2를 정리한다.
