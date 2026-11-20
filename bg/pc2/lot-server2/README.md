# lot-server2

패킹 PC(원격 Windows)에서 현미경으로 한 장을 찍어 저장합니다. 로트 인식은 하지 않습니다.

`npm install`은 그 Windows PC에서 합니다. ffmpeg와 sharp는 설치하는 OS용 바이너리를 받습니다.

UMViewer를 끄고, 현미경은 PC CAM 모드로 둡니다. 제어 DLL이 UM20을 열면 초점을 맞춘 뒤 저장하고, 열지 못하면 영상만 저장합니다.

## 실행

```bash
cd bg/pc2/lot-server2
npm install
node src/index.js
```

브라우저에서 `http://127.0.0.1:8012/` 를 열고 촬영을 누릅니다.

한 장만 찍으려면 `npm run capture`.

저장 위치는 `local.env`의 `LOT_CAPTURE_DIR` 입니다. 예시는 `local.env.example`.

## Windows

초점 제어는 32비트 DLL이라 `SysWOW64` PowerShell이 `vendor/vitiny`의 SDK를 부릅니다. DLL은 ViTiny UM12 SDK와 같고 UM06 SDK와 바이트가 같습니다.
