# Lot Server Rules (PC2)

루트 `rules.md`가 최종 기준입니다.

## 0) 문서 목적

- 이 문서는 `bg/pc2/lot-server`(lot-server3 기반)의 영상 감시·로컬 OCR·저장·**작업자 UI(8012)** 를 적습니다.
- 로트는 **영문 대문자 3글자**입니다. 외부 AI(Gemini 등)는 호출하지 않습니다.
- 작업자는 `http://127.0.0.1:8012/` 로컬 화면만 본다(상단 건수·직경·라벨 메뉴 + 라이브 + 대기 카드).
- 로컬 UI가 같은 출처로 `/watch`·`/live`·`/recognize`·`/focus`를 쓰고, 매칭·대기 큐·스크류 로트는 lot-server가 백엔드(`/api/bg/...`, `X-Bridge-Secret`)로 프록시한다.
- 어벗츠 FE는 lot-server를 직접 호출하지 않는다. 어벗츠 세척·패킹은 관리자용 큰 의뢰 카드만.
- 페달은 쓰지 않습니다. 정지·선명 게이트 후 OCR합니다.
- 구 폴더 감시 브리지(S3 업로드)는 `bg/pc2/lot-server-backup`에 있습니다.
- Windows PC2: `setup-windows-service.cmd` → Install. NSSM 서비스 `AbutsLotServer`가 **부팅 자동 시작**(`SERVICE_AUTO_START`). 번들 `nssm.exe` 우선.

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
- 저장 폴더는 lot-server 감시 폴더와 분리합니다. 기본값 `D:\bg\lot-server\images`. 성공 파일 `lot-…-ABC.jpg`.
- OCR·카메라는 로컬만. 코드 매칭·대기 큐·스크류 로트는 `BACKEND_BASE` + `LOT_SHARED_SECRET`으로 백엔드를 호출한다(Gemini 없음).
- 프로세스 TZ: 엔트리 `src/index.js`에서 `process.env.TZ = "Asia/Seoul"`.

## 2) 연결 진입 파일

- 서비스 엔트리: `bg/pc2/lot-server/src/index.js`
- 카메라: `bg/pc2/lot-server/src/camera.js`
- 감시: `bg/pc2/lot-server/src/watch.js`
- OCR: `bg/pc2/lot-server/src/ocr/index.js`(글자 영역 `ocr/locate.js`, 글자 단위 `ocr/chars.js`, 전처리 `ocr/preprocess.js`)
- 하드웨어 AF·LED(시리얼): `bg/pc2/lot-server/src/um-serial.js`, `src/um-serial.ps1`
- 카메라 제어(UVC): `bg/pc2/lot-server/src/uvc.js` → `src/UvcTool.exe`(`UvcTool.cs`), 대체 `src/uvc-ctl.ps1`
- ViTiny DLL(기본 꺼짐, `LOT_VITINY_DLL=1`): `bg/pc2/lot-server/src/focus.js`, `src/microscope-ctl.ps1`
- 화면: `bg/pc2/lot-server/public/index.html` · `station.css` · `station.js` · `vialLabel.js` · `packLabel.js` · `vendor/qrcode.js`
- 백엔드: `GET /api/bg/packing/queue`, `POST /api/bg/lot-capture/packing`, `GET|PUT /api/bg/packing/screw-lot-settings`
- 같은 PC pack-server(`PACK_SERVER_BASE`, 기본 `http://127.0.0.1:8004`): `GET /api/printers`, `GET /api/branding`, `POST /api/print-packing-label`, `POST /api/print-zpl`(공병 TSPL·패킹 bitmap ZPL)
- 패킹 라벨 미리보기·출력은 FE와 같은 캔버스 레이아웃(`packLabel.js`). 매칭 옆 「프린트」는 선택·최근 매칭 1건.

## 3) 로컬 변경 체크

- [ ] 소스 상단 `related files` 주석 갱신
- [ ] 저장 파일을 lot-server 감시 폴더에 넣지 않았는지
- [ ] 외부 AI 호출이 새로 생기지 않았는지
- [ ] 루트 rules와 충돌 여부 점검

- 작업 화면 의뢰 카드(`/api/queue`)는 우편함이 배정된 세척.패킹 건만 보낸다(`src/packing-queue.js`, `LOT_QUEUE_REQUIRE_MAILBOX`).
- 화질(2026-11-27): UVC 밝기를 255로 고정하지 않는다(금속면이 하얗게 날아가 각인을 못 읽었다). 권장 밝기·대비·채도 128, 색조 0, EV Auto. 작업 화면 톱니(설정) 모달에서 바꾸고 `data/camera-settings.json`에 저장(`src/camera-settings.js`). 감시 시작·수동 촬영 때 저장값을 건다.
- 인식 안전(2026-11-27): 감시·수동 인식 결과는 지금 세척.패킹 대기 목록(우편함 배정)에 있는 코드일 때만 낸다. 목록을 못 받으면 결과 없음. 같은 코드를 `LOT_OCR_CONFIRM`(기본 2)번 연속 읽어야 확정. 1위가 목록 밖이면 버린다(목록 안 2위로 바꾸지 않는다). 끄기 `LOT_OCR_QUEUE_ONLY=0`(권장하지 않음).
- 테스트 중에는 감시를 멈추고 `/api/match`를 부르지 않는다(작업 화면은 인식되면 자동으로 매칭해 포장.발송으로 넘긴다).
- 각인 인식(2026-11-27): 기본 `LOT_RECOGNIZER=engrave` — `src/engrave`(ROI→회전→칸 특징→MLP, 로컬). 지그별 ROI는 `data/jig-profiles.json`, 학습 데이터 `data/engrave-dataset`, 모델 버전 `data/engrave-models`(current.json, 이전 버전 보존). `data/`는 배포로 덮지 않는다. 매칭 성공 때 표본 저장(`LOT_ENGRAVE_COLLECT`), 재학습 `npm run train:engrave`.
