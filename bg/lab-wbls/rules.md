# Lab WBLS (기공소 택배 라벨) Rules

루트 `rules.md`가 최종 기준입니다.

## 0) 역할

- 기공소 PC의 **택배·딜리버리 라벨 출력기**. 제조사 한진 운송장(`bg/pc3/wbls-server`)과 계정·계약이 다르다.
- 치과의뢰 수신 화면은 이 exe를 설치하지 않는다. 출력은 Windows 연결 프로그램 v17(`bg/lab-cad-helper`, `127.0.0.1:8010`)이 한다.
- 라벨 그림은 브라우저가 그린다. 이 프로그램은 `127.0.0.1:8011`에서 PNG를 받아 프린터로 찍는다. 수신 화면 경로에서는 쓰지 않는다.
- 프린터는 PC3 운송장과 같은 **Xprinter XP-D4602B**(`WBL_PRINTER_DEFAULT`). 드라이버는 **ZPL**. 기공소가 같은 기종을 구매해 쓴다. Zebra ZM400은 이 프린터가 아니다. 다른 큐를 고르면 안내만 한다.
- 한진 운송장번호·집하는 만들지 않는다. 기공소가 자기 택배·딜리버리에 붙이는 납품 라벨이다.

## 1) 설치

- 배포물: `web/frontend/public/downloads/lab-wbls/AbutsLabWblsSetup.exe` (받는 이름 `어벗츠택배라벨_설치.exe`).
- 설치 위치 `%LOCALAPPDATA%\Abuts\LabWbls`. HKCU Run `AbutsLabWbls`. 관리자 권한 없음.
- 웹 「택배 라벨」은 헤더 설정 「연결 프로그램」 설치·업데이트로 연결한다. 이 exe는 그 버튼에 연결하지 않는다.
- 코드 서명 전: SmartScreen 「추가 정보」 → 「실행」.

## 2) HTTP (`127.0.0.1:8011`)

허용 출처: `https://abuts.fit`, `https://www.abuts.fit`, `http://localhost:5173`, `http://127.0.0.1:5173`. `Access-Control-Allow-Private-Network: true`.

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/health` | `version`(1), `os` |
| GET | `/printers` | 설치 프린터, `defaultPrinter` |
| POST | `/print-png` | `{ png, printer?, title?, widthMm?, heightMm? }` |
| POST | `/shutdown` | 재설치용 종료 |

## 3) 웹

- 치과의뢰 수신하기 헤더 「택배 라벨」. 보철이 끝난 의뢰를 치과 탭으로 고르고 한 치과당 한 장.
- 보철 업로드로 작업이 끝나면 「출력할까요?」를 묻는다.
- 연결 프로그램 v17이 없으면 브라우저 인쇄·이미지 저장. 설치·업데이트는 헤더 설정 「연결 프로그램」.

## 4) 빌드

```bash
bg/lab-wbls/win/build.sh
```

버전을 올리면 `Program.Version`과 웹 `LAB_WBLS_VERSION`을 함께 바꾼다.
