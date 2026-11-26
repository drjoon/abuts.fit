# lot-server

패킹 PC(원격 Windows) **작업자 화면**입니다. 브라우저 `http://127.0.0.1:8012/` 에서 세척·패킹(라이브·대기 카드·상단 건수/직경/라벨 메뉴)을 합니다. UM20 영상이 **멈추고 초점이 맞으면** 로컬 OCR로 **영문 대문자 3글자**를 읽고, lot-server가 어벗츠 백엔드로 매칭합니다. 페달·Gemini는 쓰지 않습니다. 어벗츠 FE는 lot-server를 직접 호출하지 않습니다.

`npm install`은 그 Windows PC에서 합니다. ffmpeg·sharp·tesseract.js는 설치하는 OS용 자산을 받습니다.

UMViewer를 끄고, 현미경은 PC CAM 모드로 둡니다. Windows에서는 감시 시작 시 **UVC 밝기**를 건 뒤 라이브 스트림을 연다. **초점은 UM 시리얼 AF**(현미경 안의 CP210x USB-UART, 예: COM7)로 리모컨과 같은 AF 키를 보내 맞춘다. ViTiny `mltcCom`은 이 UM20에서 `ComInitial`이 실패해 쓰지 않는다.

카메라 연동은 `src/camera.js`입니다. 장치 목록·선택·fps/해상도 프로파일(Grab)을 담당합니다. Mac에서 Continuity(iPhone)는 자동 선택에서 뒤로 밀리고, 화면에서 직접 고를 수 있습니다.

## 실행

```bash
cd bg/pc2/lot-server
npm install
node src/index.js
```

브라우저에서 `http://127.0.0.1:8012/` 를 엽니다. 기본은 **감시 수동 시작**입니다(`LOT_AUTO_WATCH=1`이면 자동).

공병·패킹 라벨은 같은 PC의 **pack-server**(기본 `http://127.0.0.1:8004`)로 보냅니다. `local.env`의 `PACK_SERVER_BASE` · `PACK_PRINT_SERVER_SHARED_SECRET`을 pack-server와 맞춥니다.

감시 중에는 ffmpeg **한 프로세스**가 라이브 JPEG를 덮어씁니다. 예전처럼 프레임마다 ffmpeg를 새로 띄우지 않습니다(Cursor/머신 부하 원인).

한 번만 인식하려면 `npm run capture`(내부적으로 `/recognize`와 같음).

저장 위치는 `local.env`의 `LOT_CAPTURE_DIR` 입니다. 인식 성공 파일은 `lot-…-ABC.jpg` 형식입니다. 예시는 `local.env.example`.

## 동작

1. 감시 시작 시 UVC 제어(`src/uvc.js` → `UvcTool.exe`, 실패 시 `uvc-ctl.ps1`)로 노출·밝기·게인·포커스 중 장치가 지원하는 것을 1회 건 뒤(ffmpeg가 장치를 잡기 전), 상주 ffmpeg가 라이브 JPEG를 덮어쓴다. 제어 중에는 스트림을 잠시 놓는다.
2. 이전 프레임과 비교해 움직임이 작아지고, 선명·밝기가 임계 이상인 상태가 연속이면 OCR한다. 정지했는데 흐리면 쿨다운·횟수 상한 안에서 **하드웨어 AF**(`src/um-serial.js` → `um-serial.ps1`)를 건다. 1회째는 현재 구간(약 5초), 그 뒤는 전체 구간(약 10초). 시리얼 AF는 영상 스트림을 끊지 않는다. AF로 화면이 바뀐 것은 3초간 ‘움직임’으로 보지 않는다(재아밍 반복 방지). 어두우면 UVC 밝기를 다시 건다. 시리얼 장치가 없으면(다른 기종·`LOT_UM_SERIAL=0`) 예전처럼 화면에 초점 안내만 띄운다.
   - 선명도는 320px 화면을 8×4 타일로 나눈 라플라시안 상위 10% 값이다(실측 UM20: 흐림 약 1.5, AF 후 약 13.7). 매끈한 배경이 넓어도 글자 부분만 선명하면 높게 나온다.
3. OCR은 `src/ocr`(tesseract.js, 문자 화이트리스트 A–Z)로 영문 3글자만 확정한다.
   - 글자 영역을 찾아(`locate.js`: Otsu 이진화·연결 성분) 0/180/90/270도 크롭을 만든다. 시료가 어느 방향으로 놓여도 된다.
   - 1단계 `chars.js`: 크롭을 적응 이진화해 3칸으로 자르고 글자마다 psm 10으로 읽는다. 전처리 8가지 결과를 자리별로 투표한다. 각인 글자는 테두리만 진해서, 한 줄 모드는 첫 글자를 자주 놓친다(실측 “BDZ”).
   - 상위 후보는 한 줄 모드로도 읽어 맞으면 가점을 준다. 180도 뒤집어도 다른 3글자로 읽혀 점수가 비슷하면(W↔M 등) 확정하지 않는다.
   - 2단계(1단계 실패 시): 한 줄 모드 후보(크롭·중앙 ROI·전체 화면)를 신뢰도 합으로 투표.
   - `LOT_OCR_MIN_CONF` 미만은 버린다. 못 읽으면 움직임 없이도 `LOT_OCR_RETRY`회까지 다시 읽는다.
4. 같은 로트가 연속으로 나오면 한 번만 저장하고, 다시 움직임이 있을 때까지 유지한다.

라이브 프레임은 JPEG 시작/끝 마커가 다 있을 때만 쓴다(ffmpeg가 덮어쓰는 도중 읽으면 버림). 화면 상태 줄에 현재 선명도·밝기·움직임이 나온다(`GET /watch`의 `lastFrame`). 임계값 조정에 쓴다.

OCR 학습 데이터(`eng.traineddata`)는 첫 인식 때 내려받아 `ocr-cache/`에 둔다. 인터넷이 없는 PC면 그 파일을 복사해 두거나 `LOT_OCR_LANG_PATH`로 경로를 준다.

## API

| 경로 | 설명 |
| --- | --- |
| `GET /watch` | 감시 상태·최근 로트 |
| `GET /live` | 감시 중 최신 JPEG(라이브 뷰) |
| `GET /devices` | 카메라 목록(태그 포함) |
| `POST /devices` | `{ "device": "이름" }` 선택 |
| `POST /watch/start` | 감시 시작 |
| `POST /watch/stop` | 감시 중지 |
| `POST /recognize` | 지금 한 번 인식(감시 중이 아니면 감시를 켜지 않고 1회만). 흐리면 먼저 AF |
| `POST /focus` | 하드웨어 AF 1회 `{ "area": "whole" \| "local" }`. 전후 선명도·렌즈 위치를 돌려준다 |
| `POST /capture` | 초점 후 저장만(OCR 없음, 점검용) |

## Windows

### 하드웨어 AF (UM 시리얼)

UM08/UM10/UM20/UM22/UM30은 영상(UVC, VID 1BCF:2C99)과 별도로 **CP210x USB-UART**(VID 10C4:EA60, “Silicon Labs CP210x USB to UART Bridge (COMn)”)를 낸다. UM Viewer 1.100(.NET, `NewUMControl`)이 이 포트로 리모컨 키를 보낸다. `um-serial.ps1`이 같은 프로토콜을 쓴다.

- 115200bps, 8N2, CR 끝. 읽기 `R00aa` → `@vv`, 글자 읽기 `S00aa`, 쓰기 `Waavv`(aa=주소, vv=값, 16진).
- 주소 0x00 상태(bit2 AF 중, bit3 PC 원격 제어), 0x01 키(0x40|키=누름), 0x09/0x0A 렌즈 위치, 0x0E AF 구간(0x1A 전체, 0x1B 현재), 0x23–0x2C 시리얼(`UM20TW0100`), 0x2D–0x2F 펌웨어.
- 키: 0x0F 원격 제어 토글, 0x14 수동, 0x15 단일 AF, 0x16 연속 AF, 0x1E 모터 리셋.
- 순서: 포트 찾기(시리얼 번호 `UM..` 확인) → 원격 제어 켬(`W014F`) → 구간(`W0E1A`/`W0E1B`) → 단일 AF(`W0155`) → 상태 bit2가 올라갔다 내려가면 완료 → 원격 제어 끔(리모컨 다시 사용 가능).
- 드라이버는 Windows에 이미 있는 CP210x VCP를 쓴다(이 PC: COM7). 포트는 자동으로 찾고, 고정하려면 `LOT_UM_PORT=COM7`.
- 시험: `powershell -ExecutionPolicy Bypass -File src\um-serial.ps1 -Action status` / `-Action af -Area whole`.
- **LED**: 감시를 시작하면 켜고, 감시를 멈추거나 서버를 끄면(Ctrl+C·SIGINT/SIGTERM·정상 종료) 끈다. 작업 관리자 강제 종료는 신호가 없어 꺼지지 않는다.
  - 상태 0x00 bit1=1이면 꺼짐. 키 0x19로 켜고 끄고, 0x1A/0x1B로 한 단계씩 올리고 내린다(누름 0x40|키, 뗌 0x80|키). 현재 단계는 0x06(1–12).
  - 0x06에 직접 쓰기는 새 펌웨어에서만 된다(이 UM20 fw 1.4.0은 값만 바뀌고 밝기는 그대로). 그래서 키로 맞춘다.
  - 켤 때 `LOT_LED_LEVEL`(1–12)이 있으면 그 단계로 맞춘다. 비우면 리모컨으로 맞춘 단계를 그대로 쓴다.
  - 실측(BDZ 임플란트): 단계를 올리면 화면 평균 밝기는 163(1단계) → 183(4) → 193(6) → 198(9–12)으로 오르지만, 4단계부터 각인 면이 번쩍여 글자가 사라진다. 이 시료는 **1–2단계**가 글자 대비가 가장 좋다.
  - 끝나면 원격 제어를 풀어 리모컨이 계속 듣는다. LED 제어를 끄려면 `LOT_UM_LED=0`.
  - LED 명령은 상태를 읽고 필요할 때만 토글한 뒤 다시 읽어 확인한다(최대 3회). AF·LED·상태 확인은 서버 안에서 한 줄로 줄 세워 포트를 동시에 열지 않는다. 다른 프로그램이 포트를 잡고 있으면 4초까지 기다린 뒤 `port-busy`.
  - LED가 꺼져 있으면(상태 bit1) 자동 초점을 하지 않는다. 이 카메라는 LED가 꺼져도 화면 밝기가 약 143으로 남아 ‘어두움’이 아니라 ‘흐림’처럼 보이고, AF가 렌즈를 엉뚱한 곳(예: 208)으로 보냈다. 대신 “LED가 꺼져 있어 자동 초점을 건너뜁니다…”를 띄운다.
  - 감시를 멈추면 라이브 화면을 비운다(멈춘 뒤에는 새 프레임이 없다).
  - 시험: `-Action ledon -Level 2` / `-Action ledoff`.

카메라 제어는 UVC입니다. `UvcTool.exe`(`UvcTool.cs`, x64, Media Foundation `IAMCameraControl`/`IAMVideoProcAmp`)를 먼저 부르고, 실패하면 `uvc-ctl.ps1`로 같은 일을 합니다. 이 PC의 UM20(“Digital Microscope Camera”)은 밝기만 제어되고 포커스·노출은 `skip`입니다.

ViTiny `mltcCom`(32비트, `vendor/vitiny`, `microscope-ctl.ps1`)은 이 UM20에서 `ComInitial`이 `init-failed`라 기본으로 부르지 않습니다. 다른 기종에서 시험할 때만 `LOT_VITINY_DLL=1`로 켭니다.

## 임계값 (`local.env`)

- `LOT_MOTION_THRESHOLD` 움직임(그레이 MAD). 기본 6
- `LOT_SHARP_THRESHOLD` 선명도(타일 라플라시안 상위 10%). 기본 8, 이 PC 6. 실측 흐림 약 1.5 / 초점 약 13.7
- `LOT_DARK_MEAN` 평균 밝기(0–255). 이하면 UVC 밝기 재제어·안내. 기본 28
- `LOT_AF_COOLDOWN_MS` AF(시리얼)·UVC 재시도 간격(AF가 끝난 뒤부터). 기본 8000
- `LOT_AF_MAX_PER_ARM` 움직임(아밍)당 AF 최대 횟수. 기본 3
- `LOT_UM_SERIAL` 0이면 시리얼 AF를 쓰지 않음. 기본 1
- `LOT_UM_PORT` 시리얼 포트 고정(예: COM7). 기본 비움(자동)
- `LOT_UM_LED` 0이면 감시 시작·중지 때 LED를 건드리지 않음. 기본 1
- `LOT_LED_LEVEL` 감시 시작 때 LED 단계(1–12). 기본 비움(현재 단계 유지). 각인 금속은 1–2 권장
- `LOT_STABLE_FRAMES` 연속 정지 프레임 수. 기본 3
- `LOT_WATCH_POLL_MS` 폴링 간격. 기본 1200
- `LOT_STREAM_FPS` 상주 스트림 fps. 기본 2
- `LOT_HOLD_MS` 인식 후 유지 시간. 기본 2500
- `LOT_OCR_FRAMES` OCR 직전 스트림에서 모을 장 수(가장 선명한 장 사용). 기본 3
- `LOT_OCR_MIN_CONF` OCR 최소 신뢰도(0–100). 기본 50
- `LOT_OCR_RETRY` 아밍당 OCR 재시도 횟수. 기본 2
- `LOT_OCR_LANG_PATH` 학습 데이터 경로(오프라인용). 기본 비움(jsDelivr에서 1회 받아 `ocr-cache/`)
- `LOT_VITINY_DLL` 1이면 mltcCom DLL을 먼저 시도. 기본 0
- `LOT_AUTO_WATCH` 기동 시 자동 감시. 기본 0
