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

### 작업 화면 의뢰 카드(세척.패킹)

- `/api/queue`는 백엔드 `/api/bg/packing/queue`(manufacturerStage=세척.패킹)에서 **우편함이 배정된 건만** 남긴다(`src/packing-queue.js`). 우편함 배정 규칙 이전에 남은 옛 건(우편함 없음)이 섞여 카드가 너무 많던 문제. `total`·직경 건수(`counts`)도 다시 세고, 숨긴 건수는 `hidden`.
- `LOT_QUEUE_REQUIRE_MAILBOX=0`이면 거르지 않고 백엔드 목록을 그대로 쓴다.

## 패킹 작업대 SSOT (2026-11-27)

꽂기 → 각인 인식·표시·대기열 매칭 → (설정 시) 패킹 라벨 출력·촬영 이미지 S3 첨부·포장.발송 → 다음 대기.

- 설정(`data/station-settings.json`, `GET|PUT /api/station-settings`):
  - `autoCommit` 기본 true — 인식 후 자동 매칭·라벨·포장.발송. false면 **연습 모드**(인식만).
  - `collectSamples` — 매칭 성공 때 각인 표본 수집(`LOT_ENGRAVE_COLLECT=0`이면 항상 끔).
- `/api/match`가 촬영본을 백엔드 `presign-upload`(packing-capture)로 S3에 올린 뒤 `s3Key`와 함께 lot-capture로 보낸다.
- 작업 화면: 현미경 시작/정지·설정·각인 코드·매칭·프린트(실패·재출력)·라이브·인식 히스토리·대기열·에러(클릭 → 히스토리 모달 + 복사).
- 초점·한 번 인식은 설정 모달「점검」. 재학습(`train:engrave`)은 터미널/문서만.
- 자동 출력은 패킹 라벨에서 한 번 고른 프린터(`localStorage`)를 쓴다.

## 카메라·화질 설정 (2026-11-27)

- 작업 화면 「감시」 줄의 톱니(설정) 버튼 → 모달: 카메라 선택·목록 새로고침, 밝기·대비·채도·색조(UVC), LED 단계·노출 EV(UM20 시리얼), 미리보기, 권장값으로, 저장하고 적용. Esc·바깥 클릭으로 닫는다.
- 저장: `data/camera-settings.json`(`LOT_CAMERA_SETTINGS`로 경로 변경). 재시작 후에도 유지. 감시 시작 때 UVC 값·LED 단계·EV를 건다.
- 권장값: 밝기·대비·채도 128, 색조 0, EV Auto, LED 유지. UM Viewer와 같은 화면(평균 밝기 ~85). 예전처럼 255면 평균 ~200으로 하얗게 날아간다. `LOT_UVC_BRIGHTNESS`·`LOT_UVC_CONTRAST`·`LOT_UVC_SATURATION`·`LOT_UVC_HUE`·`LOT_UM_EV`(0–19, 10=Auto)로 권장값을 바꿀 수 있다.
- API: `GET /api/camera-settings`, `PUT /api/camera-settings` `{ settings, apply }`, `POST /api/camera-settings/reset`, `GET /api/camera-preview`(jpeg).
- UvcTool.exe: `UvcTool.exe "<장치>" [apply|get|set] [brightness=128,contrast=128,...]`.
- EV(시리얼): 레지스터 0x16(UM20 0–19, 10=Auto, 7=FLK), 키 0x26(+)/0x27(-). `um-serial.ps1 -Action ev -Ev 10`.

## 인식 안전장치 (2026-11-27)

- 감시·수동 인식 결과는 지금 세척.패킹 대기 목록(우편함 배정 건)에 있는 3글자일 때만 낸다. 목록을 못 받으면 결과를 내지 않는다.
- 같은 코드를 `LOT_OCR_CONFIRM`(기본 2)번 연속 읽어야 확정. 엇갈리면 버린다.
- 1위 판독이 목록 밖이면 버리고(로그 `ocr rejected`), 목록 안의 약한 후보로 바꾸지 않는다.

## 각인 전용 인식 (2026-11-27)

테두리만 진한 양각 3글자 각인은 Tesseract로 안정적으로 못 읽어, 이 PC 안에서만 도는 전용 인식기를 쓴다(외부 AI·클라우드 없음).

- 순서: 활성 **지그 프로필**의 ROI(각인 면 영역)를 자른다 → 0/90/180/270도로 돌린다 → 글자 높이·글자 간격 가설마다 32×48 칸으로 맞춰 칸마다 특징(HOG 기울기 방향 + 밝기 블록)을 뽑는다 → 작은 신경망(MLP, A–Z + 배경)이 칸마다 글자 확률을 낸다 → 이웃한 세 칸이 한 코드.
- 확정 조건: 세 글자 모두 확률 0.45↑, 1위가 세척.패킹 대기 목록에 있음, 대기 목록 안 다른 코드보다 증거가 4배↑. 1위가 목록 밖이면 `not_in_queue`로 버린다(목록 안 2위로 바꾸지 않는다). 목록 밖 오독은 마진 계산에 넣지 않는다. 감시는 여기에 2회 연속 같은 판독(`LOT_OCR_CONFIRM`)을 더 요구한다.
- `LOT_RECOGNIZER=engrave`(기본, 각인 모델만) · `both`(각인이 못 읽으면 Tesseract도) · `tesseract`(이전 방식).
- 코드(개발용 지도):
  - `src/engrave/features.js` 32×48 칸 특징(HOG 9방향×4×6 + 밝기 4×6 = 240차원, 적분 영상으로 격자 전체 빠르게)
  - `src/engrave/mlp.js` 240→96→27 MLP(A–Z + 배경 `_`), SGD 학습, JSON 저장 형식 `engrave-mlp-1`
  - `src/engrave/recognize.js` `scanFrame`(ROI·회전·글자 높이 5단계×피치 3단계 격자) · `codeEvidence`(코드별 최고 창과 그 근처 증거) · `recognizeEngraving`(확정 규칙) · `locateCode`(아는 코드 위치) · `locationTrusted`
  - `src/engrave/crops.js` 회색조·ROI·회전(`rotateGray`/`rotatePoint`/`rotateBox` 같은 규칙)·칸 자르기·밝기 증강
  - `src/engrave/synth.js` 합성 각인(SVG 글꼴 윤곽·halo·면, 실측 금속면 조각 위에)
  - `src/engrave/train-data.js` 합성/실측 표본, 실측 바탕 조각, 어려운 배경 찾기
  - `src/engrave/dataset.js` 표본 저장·목록 · `src/engrave/model-store.js` 모델 버전 · `src/engrave/annotations.js` 라벨 좌표 변환
  - `src/jig-profiles.js` 지그 프로필 · `src/ocr/index.js` `recognizeLot`(각인 → 필요하면 Tesseract) · `src/index.js` API·표본 수집
  - `scripts/` seed·add·train·eval, 시험 `test/engrave.test.js`, 실측 라벨 `test/fixtures/engrave-annotations.json`(24장)
- API: `GET/PUT /api/jig-profiles`, `POST /api/jig-profiles/select {id}`, `POST /api/jig-profiles/duplicate {id,name}`, `GET /api/engrave/status`, `POST /api/engrave/test {profile?, queueOnly?}`(판독만).
- 속도: 지그 1은 회전 `90/270`만 훑어 한 장 판독을 줄인다. 감시 폴링·안정 프레임·버스트·홀드는 `local.env`(`LOT_WATCH_POLL_MS` 등). 확정은 기본 2회(`LOT_OCR_CONFIRM`)이며 2번째 촬영은 라이브 1장(quick). 촬영·인식은 화면 아래 가로 로그 카드(`ocrLog`)로 한 줄씩 쌓인다.

### 지그 프로필 (ROI 설정)

- 톱니 → 설정 모달 → **각인 인식 · 지그**. 프로필 선택(바로 사용), **복제**, 이름, ROI(X/Y/폭/높이, 프레임 대비 %), 글자 높이 범위(프레임 높이 대비 %).
- **미리보기에서 영역 그리기**를 누르고 미리보기에서 각인 면을 드래그 → **판독 시험**(미리보기 한 장으로 판독만, 매칭·저장 없음, 찾은 글자 상자를 초록/빨강으로 표시) → **지그 저장**.
- 지그를 바꾸면: 기존 프로필을 복제 → 영역만 새로 그리기 → 저장. 다시 학습할 필요 없다(분류기와 데이터셋은 ROI 상대 좌표·정규화 글자라 지그와 무관).
- 저장 파일: `data/jig-profiles.json`(`LOT_JIG_PROFILES`). 기본 프로필 `jig-1`(2026-11 지그): ROI x 33%·y 12%·폭 25%·높이 56%, 글자 높이 8.5–16.5%.

### 학습 데이터 모으기

- 작업 화면에서 매칭이 성공하면(카드 직접 선택·자동 인식 모두) 그 코드로 표본을 하나 저장한다: 같은 코드의 마지막 확정 촬영(10분 안) 또는 감시 중 라이브 프레임. 감시를 켜 둔 채 부품을 올리고 카드를 누르면 모인다. 끄기 `LOT_ENGRAVE_COLLECT=0`.
- 위치: `data/engrave-dataset/samples/YYYYMMDD/HHMMSS-mmm-CODE/`(`LOT_ENGRAVE_DATASET`)
  - `frame.jpg`(전체 프레임), `roi.jpg`(ROI 크롭, 회전 전), `letters/0-B.png …`(바로 세운 32×48 글자), `meta.json`(코드·글자·지그 프로필 id/이름·ROI·회전·회전된 ROI 기준 0–1 글자 상자·화질 설정·출처·요청 id·시각).
  - 지금 모델로 글자 위치를 믿기 어려우면(코드 확률 0.35 미만이고 세 칸 글자다움 0.6 미만) 상자 없이 저장한다(학습에는 안 쓰고 나중에 라벨을 붙일 수 있게 남김).
- 처음 표본: `npm run seed:engrave`(test/fixtures/engrave-annotations.json의 실측 23장: BYU·BYK·BDZ + 대기 건 UM Viewer 캡처 BYX·BZB·BYW·BYT·BYV·BZA·BYY·BYZ·BZC, 이미 있으면 건너뜀).
- 코드를 아는 사진 직접 넣기(UM Viewer 캡처 등, 지금 활성 지그 ROI 기준): `npm run add:engrave -- D:\bg\lot-server\images\<사진>.jpg=BYX …` → 표본 폴더의 `check.png`(찾은 글자 상자)를 눈으로 확인. 틀렸으면 그 표본 폴더를 지우고(다른 곳으로 옮기고) 다시 학습.

### 다시 학습

```powershell
cd D:\bg\lot-server
npm run train:engrave            # 합성 2000장(희소·혼동 글자·기하 획 보조) + 데이터셋 전체(+어려운 배경 3회), 은닉 96, 약 4–8분
npm run eval:engrave             # fixtures 라벨 프레임(코드별 집계). 날아간 장 제외: --skip-washed
npm run eval:engrave -- --dataset   # 위 + data/engrave-dataset 표본
npm run holdout:engrave -- --codes BYV,BYW,BYT   # 해당 코드를 학습에서 빼고 정확도 측정(감시·매칭 없음)
D:\bg\lot-server\nssm.exe restart AbutsLotServer   # 모델 파일은 바뀌면 자동으로 다시 읽는다(재시작은 선택)
```

- 결과: `data/engrave-models/model-<시각>.json` 새 버전, `current.json`이 가리킨다(`previous`에 이전 버전). 이전 파일은 지우지 않는다.
- 되돌리기: `data/engrave-models/current.json`의 `file`을 이전 파일 이름으로 바꾼다. 데이터 모델이 없으면 코드에 든 기본 모델 `src/engrave/model-default.json`을 쓴다.
- 학습은 항상 합성 각인 + 데이터셋의 모든 표본(모든 지그)을 합친다. 실측 바탕 질감 조각도 데이터셋에서 가져온다. 합성은 희소·혼동 글자(V/Y, T/I, W…)에 기하 획을 섞어 홀드아웃을 보강한다.
- 홀드아웃: `npm run holdout:engrave -- --codes BYV,BYW,BYT`(코드 단위, 해당 글자 실측 없음) · `npm run holdout:engrave -- --lof`(같은 코드의 다른 장으로 일반화). 희소 글자 코드는 작업 화면에서 카드 매칭으로 표본을 더 모은 뒤 재학습하는 편이 안전하다.
- 검증용: `npm run train:engrave -- --exclude BYK --out D:\tmp\m.json` 후 `node scripts/eval-engrave.mjs --model D:\tmp\m.json --only BYK --skip-washed`.
- 코드에 라벨이 붙은 `images/` 파일(`…-BDZ.jpg` 또는 `…=BYX.jpg`)도 `npm run eval:engrave -- --images D:\bg\lot-server\images`로 볼 수 있다. 시험 중에는 감시(watch)를 끄고 `/api/match`를 호출하지 않는다.

### 지그 추가

1. 작업 화면 톱니 → **각인 인식 · 지그** → 기존 프로필 **복제** → 이름 수정.
2. **미리보기에서 영역 그리기**로 새 지그의 각인 면을 드래그 → **판독 시험**(매칭·저장 없음) → **지그 저장**.
3. 글자 데이터셋·모델은 그대로 둔다(ROI만 바뀜). `data/jig-profiles.json`에 쌓인다.

### 백업·복원

- `data/`(engrave-dataset, engrave-models, jig-profiles.json, camera-settings.json, station-settings.json)는 코드 배포·덮어쓰기 대상이 아니다. 코드를 새로 풀 때 `data/`를 지우거나 덮지 않는다.
- 백업(예시):

```powershell
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
robocopy D:\bg\lot-server\data D:\bg\backup\lot-server-data-$ts /E
# 또는 프로젝트 전체( node_modules 제외 ):
robocopy D:\bg\lot-server D:\bg\lot-server-backup-$ts /E /XD node_modules captures logs ocr-cache
```

- 복원: 백업의 `data`를 `D:\bg\lot-server\data`로 다시 복사 → 필요하면 `npm run train:engrave`(또는 백업한 `engrave-models/current.json` 그대로) → `nssm.exe restart AbutsLotServer`.
