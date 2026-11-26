# Lot Server 2 Rules

루트 `rules.md`가 최종 기준입니다.

## 0) 문서 목적

- 이 문서는 `bg/pc2/lot-server2`의 영상 감시·로컬 OCR·저장만 적습니다.
- 로트는 **영문 대문자 3글자**입니다. 외부 AI(Gemini 등)는 호출하지 않습니다.
- 페달은 쓰지 않습니다. 정지·선명 게이트 후 OCR합니다.

## 1) 역할/흐름

- Windows에서 ViTiny SDK(`vendor/vitiny`, 32비트)로 LED 점등·밝기 후 단일 AF를 시도합니다(mode 20/12/6 프로브). 감시 시작·흐림/어두움·OCR 직전에 걸며, 재시도는 쿨다운·아밍당 횟수 상한이 있습니다.
- 카메라 연동: `src/camera.js`(목록·선택·Grab 프로파일·상주 스트림). Continuity/화면캡처는 자동 선택에서 뒤로 민다.
- 감시 중 ffmpeg는 **상주 1개**만 돌리고 JPEG를 덮어씁니다. 프레임마다 프로세스를 만들지 않습니다.
- 움직임이 줄고 선명도가 임계 이상이면 `src/ocr`로 인식합니다. 라이브는 `GET /live`.
- 기본 `LOT_AUTO_WATCH=0`. Continuity+자동감시는 IDE/머신 부하가 커서 수동 시작을 권장합니다.
- OCR은 tesseract.js를 `src/ocr`에 감싼 내부 모듈입니다. 화이트리스트 A–Z, 결과는 3글자만 확정합니다.
- 저장 폴더는 lot-server 감시 폴더와 분리합니다. 기본값 `D:\bg\lot-server2\images`. 성공 파일 `lot-…-ABC.jpg`.
- 패킹 라벨 출력·백엔드 AI 인식 API는 호출하지 않습니다(이후 연동 시 별도).
- 프로세스 TZ: 엔트리 `src/index.js`에서 `process.env.TZ = "Asia/Seoul"`.

## 2) 연결 진입 파일

- 서비스 엔트리: `bg/pc2/lot-server2/src/index.js`
- 카메라: `bg/pc2/lot-server2/src/camera.js`
- 감시: `bg/pc2/lot-server2/src/watch.js`
- OCR: `bg/pc2/lot-server2/src/ocr/index.js`
- 초점 제어: `bg/pc2/lot-server2/src/microscope-ctl.ps1`
- 화면: `bg/pc2/lot-server2/public/index.html`

## 3) 로컬 변경 체크

- [ ] 소스 상단 `related files` 주석 갱신
- [ ] 저장 파일을 lot-server 감시 폴더에 넣지 않았는지
- [ ] 외부 AI 호출이 새로 생기지 않았는지
- [ ] 루트 rules와 충돌 여부 점검
