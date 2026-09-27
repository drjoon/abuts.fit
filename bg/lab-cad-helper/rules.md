# Lab CAD Helper Rules

루트 `rules.md`가 최종 기준입니다.

## 0) 문서 목적

- 기공소 PC에 한 번 설치하면 계속 떠 있는 **로컬 헬퍼(127.0.0.1:8010)**. 웹(브라우저)이 사용자 PC와 상호작용하는 통로다.
  - 의뢰 파일을 **작업 폴더**(환자 케이스를 모으는 폴더)에 저장
  - 설정 디자인 SW(3Shape/exocad) 실행·앞으로 가져오기
- OS별 설치본: Windows(PowerShell, 관리자 권한 불필요) · macOS(Swift 바이너리 + LaunchAgent).
- **컴맹 UX SSOT**: 웹에서 zip 받기 → 설치 파일 **더블클릭 한 번** → 이후 자동(PC 시작·로그인 시 실행).

## 1) 디자인 SW 열기 — 인자로 파일 열기는 안 된다

조사 결과(2026-09) 두 SW 모두 **흩어진 스캔 파일(STL/PLY/DCM)을 명령줄 인자로 받아 디자인 케이스를 여는 기능이 없다.**

| SW | 공식 동작 | 헬퍼 처리 (`guide`) |
|----|-----------|---------------------|
| 3Shape Dental System | 공개 CLI 없음. 외부 스캔은 Dental Manager › 주문 › **스캔 가져오기**. `DentalDesktop.exe <파일>`은 파일을 무시 | Dental Manager 실행(이미 떠 있으면 앞으로) + 케이스 폴더 열기 + **경로 클립보드 복사** → `3shape_import` |
| exocad | `DentalCADApp.exe`는 DentalDB가 만든 **`.dentalProject`만** 인자로 연다 | `.dentalProject`가 있으면 바로 열기(`exocad_project`). 없으면 DentalDB + 폴더 + 경로 복사 → `exocad_import` |
| 기타(custom) | — | `exePaths.custom`에 파일 인자(`args`) |
| macOS | 3Shape·exocad 미지원 | 폴더만 Finder로(`folder_only`) |

웹은 `guide`에 맞춰 3단계 안내(`LabCadOpenedGuideDialog`)를 띄운다: 새 주문 → 스캔 가져오기 → 주소 칸 Ctrl+V.

프로그램 탐색 순서: `config.managerPaths`/`exePaths` → **실행 중 프로세스** → Program Files·C:\·D:\ 아래 `3Shape*`/`exocad*` 폴더.
3Shape: `DentalManager.exe`(없으면 `DentalDesktop.exe`). exocad: `DentalCADApp.exe`, `DentalDB.exe`.

## 2) 작업 폴더

- 웹 localStorage `abuts.labWorkFolder` + 헬퍼 `config.json.workFolder`. **저장 성공할 때마다 로컬 갱신.**
- 우선순위: 로컬 저장값 → 헬퍼 설정값(폴더가 있을 때) → 없으면 `LabWorkFolderDialog`(폴더 고르기 창 또는 경로 붙여넣기, 예: `\\DESKTOP-HAQNS44\CAM-in`).
- 저장 시 헬퍼가 폴더가 없다고 하면(`WORK_FOLDER_NOT_FOUND`) 로컬값을 지우고 다시 묻는다.
- 케이스 폴더: `YYYYMMDD_치과명-환자명-치아번호`(주문일 KST, `buildLabCaseFolderName`, 예: `20260927_서울치과-이재민-47`). 빈 항목은 빠지고, 환자명이 없으면 `의뢰{ID 끝 6자리}`. 같은 이름 파일은 덮어쓴다.
- **작업 폴더 안 파일은 헬퍼가 절대 지우지 않는다.** 세션 만료 정리는 temp 폴더만.

## 3) 기공소 사용자 흐름

1. 채팅창 「작업열기」 또는 의뢰 파일 「다운로드」
2. 헬퍼 없음 → 설치 안내(OS별 zip). 구버전(v1) → 「연결 프로그램 업데이트」
3. 작업 폴더 없음 → 작업 폴더 지정
4. 파일을 케이스 폴더에 저장
5. 다운로드: 폴더 열기 + 토스트(「폴더 변경」). 작업열기: SW 실행 + 가져오기 안내
6. SW를 못 찾으면: 파일은 이미 저장됨 → SW를 켠 뒤 「다시 열기」(재설치 불필요, 실행 중 프로세스로 찾음)

## 4) 배포 파일

| 파일 | 역할 |
|------|------|
| `여기를_더블클릭_설치.cmd` | ASCII 전용 런처 → `install.ps1` |
| `install.ps1` | 예전 헬퍼 종료 → `%LOCALAPPDATA%\Abuts\LabCadHelper` 복사 → `abuts-cad://` 프로토콜·시작프로그램 → v2 연결 확인 |
| `run-hidden.vbs` | 창 없이 ps1 실행·중복 방지 (ASCII 전용) |
| `lab-cad-helper.ps1` | TcpListener HTTP API (관리자 URL 예약 불필요) |
| `start.cmd` | 개발용 콘솔 실행 |
| `mac/AbutsLabHelper.swift` · `mac/build.sh` | macOS 헬퍼(유니버설 바이너리) |
| `mac/Abuts연결_설치.command` | LaunchAgent `fit.abuts.labhelper` 등록 |
| `web/frontend/public/downloads/lab-cad-helper/AbutsCad연결_설치.zip` · `…_Mac.zip` | 웹 다운로드 SSOT |

zip 갱신:

```bash
bg/lab-cad-helper/mac/build.sh          # macOS 바이너리 (Xcode CLT)
python3 bg/lab-cad-helper/pack-public-zip.py
```

### 인코딩 (강제)

- `.ps1`은 **UTF-8 BOM**. PowerShell 5.1은 BOM이 없으면 한국어 Windows에서 CP949로 읽어 한글 문자열이 깨지고 파싱이 실패할 수 있다. `pack-public-zip.py`가 BOM·CRLF를 강제한다.
- `.cmd`/`.vbs`는 **ASCII 전용**(cmd·wscript는 ANSI 코드페이지로 읽는다). 한글 안내는 `install.ps1`에서.

## 5) HTTP API (v2)

bind `127.0.0.1:8010` · CORS 허용 출처: `https://abuts.fit`, `https://www.abuts.fit`, `http://localhost:5173` (+ `config.allowOrigin` 쉼표 목록). 다른 출처는 401. `Access-Control-Allow-Private-Network: true`.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/health` | `version`(2), `os`, `workFolder`, `workFolderExists` |
| GET/POST | `/work-folder` | 조회 / `{path}` 확인 후 저장 |
| POST | `/work-folder/pick` | PC 폴더 고르기 창 |
| POST | `/sessions` | `{workFolder, caseFolder}` → 케이스 폴더 (비우면 temp) |
| PUT | `/sessions/:id/files/:name` | 파일 저장(최대 1GB) |
| POST | `/sessions/:id/reveal` | 폴더 열기 |
| POST | `/sessions/:id/open` | `{designSoftware}` → `guide`·`folder`·`clipboard` |
| POST | `/shutdown` | 재설치용 종료 |

## 6) FE SSOT

- `labCadHelperClient.ts` — `ensureLabCadHelperReady`(ready/need_setup/need_update), 작업 폴더, 세션
- `useS3FileDownload` — `openInDesignSoftware`, `saveToLabWorkFolder`
- `LabCadHelperSetupDialog` · `LabWorkFolderDialog` · `LabCadOpenedGuideDialog`
- 수신: `RequestorPracticePage` (의뢰 파일 버튼 라벨 「다운로드」)

## 7) 포맷

- 3Shape → DCM 원본
- exocad·그외 → DCM은 PLY(칼라)
- 다운로드는 DCM 원본/PLY 선택 유지
