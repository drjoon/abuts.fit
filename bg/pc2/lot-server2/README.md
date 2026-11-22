# lot-server2

패킹 PC(원격 Windows)에서 UM20 영상을 보다가, **움직임이 멈추고 초점이 맞으면** 로컬 OCR로 **영문 대문자 3글자** 로트를 읽습니다. 페달은 쓰지 않습니다. Gemini 등 외부 AI는 호출하지 않습니다.

`npm install`은 그 Windows PC에서 합니다. ffmpeg·sharp·tesseract.js는 설치하는 OS용 자산을 받습니다.

UMViewer를 끄고, 현미경은 PC CAM 모드로 둡니다. Windows에서는 제어 DLL이 AF를 시도한 뒤 OCR합니다. AF가 안 되면 선명도만으로 고른 장으로 OCR합니다.

카메라 연동은 `src/camera.js`입니다. 장치 목록·선택·fps/해상도 프로파일(Grab)을 담당합니다. Mac에서 Continuity(iPhone)는 자동 선택에서 뒤로 밀리고, 화면에서 직접 고를 수 있습니다.

## 실행

```bash
cd bg/pc2/lot-server2
npm install
node src/index.js
```

브라우저에서 `http://127.0.0.1:8012/` 를 엽니다. 기본으로 감시를 시작합니다(`LOT_AUTO_WATCH=0`이면 수동).

한 번만 인식하려면 `npm run capture`(내부적으로 `/recognize`와 같음).

저장 위치는 `local.env`의 `LOT_CAPTURE_DIR` 입니다. 인식 성공 파일은 `lot-…-ABC.jpg` 형식입니다. 예시는 `local.env.example`.

## 동작

1. ffmpeg로 프레임을 주기적으로 가져온다.
2. 이전 프레임과 비교해 움직임이 작아지고, 선명도가 임계 이상인 상태가 연속이면 OCR한다.
3. OCR은 `src/ocr`(tesseract.js, 문자 화이트리스트 A–Z)로 영문 3글자만 확정한다.
4. 같은 로트가 연속으로 나오면 한 번만 저장하고, 다시 움직임이 있을 때까지 유지한다.

## API

| 경로 | 설명 |
| --- | --- |
| `GET /watch` | 감시 상태·최근 로트 |
| `GET /live` | 감시 중 최신 JPEG(라이브 뷰) |
| `GET /devices` | 카메라 목록(태그 포함) |
| `POST /devices` | `{ "device": "이름" }` 선택 |
| `POST /watch/start` | 감시 시작 |
| `POST /watch/stop` | 감시 중지 |
| `POST /recognize` | 지금 한 번 인식 |
| `POST /capture` | 초점 후 저장만(OCR 없음, 점검용) |

## Windows

초점 제어는 32비트 DLL이라 `SysWOW64` PowerShell이 `vendor/vitiny`의 SDK를 부릅니다. DLL은 ViTiny UM12 SDK와 같고 UM06 SDK와 바이트가 같습니다.

## 임계값 (`local.env`)

- `LOT_MOTION_THRESHOLD` 움직임(그레이 MAD). 기본 6
- `LOT_SHARP_THRESHOLD` 선명도. 기본 8
- `LOT_STABLE_FRAMES` 연속 정지 프레임 수. 기본 3
- `LOT_WATCH_POLL_MS` 폴링 간격. 기본 450
- `LOT_HOLD_MS` 인식 후 유지 시간. 기본 2500
