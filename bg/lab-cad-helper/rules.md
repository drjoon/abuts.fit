# Lab CAD Helper Rules

루트 `rules.md`가 최종 기준입니다.

## 0) 문서 목적

- 기공소 웹「열기」→ 설정 디자인 SW(3Shape/ExoCAD/…)로 3D 파일을 연다.
- 브라우저는 CAD를 실행할 수 없으므로 **로컬 127.0.0.1 헬퍼**가 필요하다.
- **컴맹 UX SSOT**: 빨간 토스트/cmd 수동 실행이 아니라, 웹에서 zip 받기 → **「여기를_더블클릭_설치」한 번** → 이후 자동.

## 1) 기공소 사용자 흐름

1. 「열기」클릭
2. 헬퍼가 없으면(또는 꺼져 있으면) **설치 안내 모달**
3. **설치 파일 받기** → `AbutsCad연결_설치.zip`
4. zip 안 **여기를_더블클릭_설치** 실행
   - `%LOCALAPPDATA%\Abuts\LabCadHelper` 복사
   - Windows 시작 프로그램 등록(재부팅 후 자동)
   - `abuts-cad://` 프로토콜 등록(웹이 깨움)
   - 헬퍼 즉시 시작(창 숨김)
5. 모달 **설치했어요 — 연결 확인** → 성공 시 자동으로 파일 열기 재시도
6. 이후 「열기」만 누르면 됨(프로토콜 wake + 시작프로그램)

## 2) 배포 파일

| 파일 | 역할 |
|------|------|
| `여기를_더블클릭_설치.cmd` | 최초 1회 설치 |
| `run-hidden.vbs` | 창 없이 ps1 실행·중복 방지 |
| `lab-cad-helper.ps1` | HttpListener API |
| `config.example.json` | exePaths 템플릿 |
| `web/frontend/public/downloads/lab-cad-helper/AbutsCad연결_설치.zip` | 웹 다운로드 SSOT |

zip 갱신:

```bash
python3 bg/lab-cad-helper/pack-public-zip.py
```

## 3) HTTP API (변경 없음)

`POST /sessions` → `PUT .../files/:name` → `POST .../open` · `GET /health`  
bind `127.0.0.1:8010`

## 4) FE SSOT

- `LabCadHelperSetupDialog` — 설치 안내
- `labCadHelperClient.ts` — `ensureLabCadHelperReady` / `wakeLabCadHelperViaProtocol`
- `useS3FileDownload.openInDesignSoftware({ onNeedHelperSetup })`
- 수신: `RequestorPracticePage`

## 5) 포맷

- 3Shape → DCM 원본
- ExoCAD·그외 → DCM은 PLY

## 6) 개발용

- 콘솔: `start.cmd` / `node app.js` (Mac). 기공소 배포에는 쓰지 않는다.
