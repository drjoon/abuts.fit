# Lot Server 2 Rules

루트 `rules.md`가 최종 기준입니다.

## 0) 문서 목적

- 이 문서는 `bg/pc2/lot-server2`의 영상 감시·로컬 OCR·저장만 적습니다.
- 로트는 **영문 대문자 3글자**입니다. 외부 AI(Gemini 등)는 호출하지 않습니다.
- 페달은 쓰지 않습니다. 정지·선명 게이트 후 OCR합니다.

## 1) 역할/흐름

- Windows 감시 시작 때는 UVC(`src/uvc.js` → `UvcTool.exe`, 대체 `uvc-ctl.ps1`)로 밝기를 건다. 이 UM20은 UVC 포커스가 없다.
- 초점은 UM 시리얼 AF(`src/um-serial.js` → `um-serial.ps1`, CP210x COM 115200 8N2, UM Viewer와 같은 키)로 정지·흐림일 때 건다. 스트림을 끊지 않는다. AF 뒤에는 리모컨 원격 제어를 다시 끈다.
- LED는 감시 시작 때 켜고(`LOT_LED_LEVEL`이 있으면 그 단계), 감시 중지 때는 항상, 서버 종료(SIGINT/SIGTERM/exit) 때는 감시 중이었으면 끈다. 단계는 키(0x1A/0x1B)로 맞춘다(fw 1.4.0은 0x06 직접 쓰기가 밝기에 반영되지 않음).
- 시리얼 작업(AF·LED·상태)은 `um-serial.js` 큐로 한 번에 하나만. LED가 꺼져 있으면 AF하지 않는다(`led-off`). 감시 중지 때 라이브 프레임을 비운다.
- `mltcCom` `ComInitial`은 이 UM20에서 `init-failed`라 핫패스에서 부르지 않는다.
- 카메라 연동: `src/camera.js`(목록·선택·Grab 프로파일·상주 스트림). Continuity/화면캡처는 자동 선택에서 뒤로 민다.
- 감시 중 ffmpeg는 **상주 1개**만 돌리고 JPEG를 덮어씁니다. 프레임마다 프로세스를 만들지 않습니다.
- 움직임이 줄고 선명도가 임계 이상이면 `src/ocr`로 인식합니다. 라이브는 `GET /live`.
- 기본 `LOT_AUTO_WATCH=0`. Continuity+자동감시는 IDE/머신 부하가 커서 수동 시작을 권장합니다.
- OCR은 tesseract.js를 `src/ocr`에 감싼 내부 모듈입니다. 화이트리스트 A–Z, 결과는 3글자만 확정합니다. 최소 신뢰도 `LOT_OCR_MIN_CONF` 미만은 버립니다. 학습 데이터는 `ocr-cache/`에 둡니다(외부 AI 아님).
- 시리얼 AF를 못 쓰면(장치 없음·`LOT_UM_SERIAL=0`) 흐림 때 스트림을 끊지 않고 화면에 초점 안내만 띄웁니다.
- 드라이버·시스템 소프트웨어를 새로 설치하지 않습니다(CP210x VCP는 Windows 기본/기존 설치본).
- 저장 폴더는 lot-server 감시 폴더와 분리합니다. 기본값 `D:\bg\lot-server2\images`. 성공 파일 `lot-…-ABC.jpg`.
- 패킹 라벨 출력·백엔드 AI 인식 API는 호출하지 않습니다(이후 연동 시 별도).
- 프로세스 TZ: 엔트리 `src/index.js`에서 `process.env.TZ = "Asia/Seoul"`.

## 2) 연결 진입 파일

- 서비스 엔트리: `bg/pc2/lot-server2/src/index.js`
- 카메라: `bg/pc2/lot-server2/src/camera.js`
- 감시: `bg/pc2/lot-server2/src/watch.js`
- OCR: `bg/pc2/lot-server2/src/ocr/index.js`(글자 영역 `ocr/locate.js`, 글자 단위 `ocr/chars.js`, 전처리 `ocr/preprocess.js`)
- 하드웨어 AF·LED(시리얼): `bg/pc2/lot-server2/src/um-serial.js`, `src/um-serial.ps1`
- 카메라 제어(UVC): `bg/pc2/lot-server2/src/uvc.js` → `src/UvcTool.exe`(`UvcTool.cs`), 대체 `src/uvc-ctl.ps1`
- ViTiny DLL(기본 꺼짐, `LOT_VITINY_DLL=1`): `bg/pc2/lot-server2/src/focus.js`, `src/microscope-ctl.ps1`
- 화면: `bg/pc2/lot-server2/public/index.html`

## 3) 로컬 변경 체크

- [ ] 소스 상단 `related files` 주석 갱신
- [ ] 저장 파일을 lot-server 감시 폴더에 넣지 않았는지
- [ ] 외부 AI 호출이 새로 생기지 않았는지
- [ ] 루트 rules와 충돌 여부 점검
