# Lot Server 2 Rules

루트 `rules.md`가 최종 기준입니다.

## 0) 문서 목적

- 이 문서는 `bg/pc2/lot-server2`의 영상 감시·로컬 OCR·저장만 적습니다.
- 로트는 **영문 대문자 3글자**입니다. 외부 AI(Gemini 등)는 호출하지 않습니다.
- 페달은 쓰지 않습니다. 정지·선명 게이트 후 OCR합니다.

## 1) 역할/흐름

- Windows에서 ViTiny UM12/UM06 SDK(`vendor/vitiny`, 32비트)로 AF를 시도합니다.
- ffmpeg로 프레임을 폴링합니다. 움직임이 줄고 선명도가 임계 이상이면 `src/ocr`로 인식합니다.
- 폴링한 최신 JPEG는 `GET /live`로 화면 라이브 뷰에 씁니다(카메라를 두 번 열지 않음).
- OCR은 tesseract.js를 `src/ocr`에 감싼 내부 모듈입니다. 화이트리스트 A–Z, 결과는 3글자만 확정합니다.
- 저장 폴더는 lot-server 감시 폴더와 분리합니다. 기본값 `D:\bg\lot-server2\images`. 성공 파일 `lot-…-ABC.jpg`.
- 패킹 라벨 출력·백엔드 AI 인식 API는 호출하지 않습니다(이후 연동 시 별도).
- 프로세스 TZ: 엔트리 `src/index.js`에서 `process.env.TZ = "Asia/Seoul"`.

## 2) 연결 진입 파일

- 서비스 엔트리: `bg/pc2/lot-server2/src/index.js`
- 감시: `bg/pc2/lot-server2/src/watch.js`
- OCR: `bg/pc2/lot-server2/src/ocr/index.js`
- 초점 제어: `bg/pc2/lot-server2/src/microscope-ctl.ps1`
- 화면: `bg/pc2/lot-server2/public/index.html`

## 3) 로컬 변경 체크

- [ ] 소스 상단 `related files` 주석 갱신
- [ ] 저장 파일을 lot-server 감시 폴더에 넣지 않았는지
- [ ] 외부 AI 호출이 새로 생기지 않았는지
- [ ] 루트 rules와 충돌 여부 점검
