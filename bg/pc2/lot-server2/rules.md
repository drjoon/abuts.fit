# Lot Server 2 Rules

루트 `rules.md`가 최종 기준입니다.

## 0) 문서 목적

- 이 문서는 `bg/pc2/lot-server2`의 촬영·저장만 적습니다.
- 로트 인식은 하지 않습니다. 인식은 나중에 저장 폴더를 붙여 붙입니다.

## 1) 역할/흐름

- Windows에서 ViTiny UM12/UM06 SDK(`vendor/vitiny`, 32비트)로 1회 AF를 시도합니다.
- 모드 12를 먼저 보고, 응답이 없으면 모드 6을 봅니다. 둘 다 같은 DLL입니다.
- AF가 확인되면 프레임을 저장합니다. 제어가 안 되면 짧은 연속 촬영에서 선명한 한 장을 저장합니다.
- 저장 폴더는 lot-server 감시 폴더와 분리합니다. 기본값 `D:\bg\lot-server2\images`.
- 인식 API, 백엔드, 라벨 출력은 호출하지 않습니다.
- 초점 대기는 200ms×40회(8초)에서 멈춥니다. ffmpeg 한 번은 15초에서 멈춥니다.
- 프로세스 TZ: 엔트리 `src/index.js`에서 `process.env.TZ = "Asia/Seoul"`.

## 2) 연결 진입 파일

- 서비스 엔트리: `bg/pc2/lot-server2/src/index.js`
- 초점 제어: `bg/pc2/lot-server2/src/microscope-ctl.ps1`
- 화면: `bg/pc2/lot-server2/public/index.html`
- 이후 인식이 붙을 자리: `bg/pc2/lot-server`의 감시 폴더가 아닙니다.

## 3) 로컬 변경 체크

- [ ] 소스 상단 `related files` 주석 갱신
- [ ] 저장 파일을 lot-server 감시 폴더에 넣지 않았는지
- [ ] 루트 rules와 충돌 여부 점검
