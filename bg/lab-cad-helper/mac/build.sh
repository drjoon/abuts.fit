#!/bin/bash
# macOS 연결 프로그램 v3(유니버설 .app)을 빌드해 웹 다운로드 위치에 zip으로 둔다. Xcode Command Line Tools 필요.
#
# 서명·공증(선택): Developer ID가 있으면 Gatekeeper 경고 없이 열린다.
#   MAC_SIGN_IDENTITY="Developer ID Application: …" \
#   MAC_NOTARY_PROFILE="abuts-notary" \   # xcrun notarytool store-credentials 로 만든 키체인 프로필
#   bg/lab-cad-helper/mac/build.sh
# 없으면 ad-hoc 서명(Apple Silicon 실행용)만 한다.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
dest="$root/web/frontend/public/downloads/lab-helper"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

app="$work/어벗츠 연결.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"

for arch in arm64 x86_64; do
  swiftc -O -swift-version 5 -target "${arch}-apple-macos12" \
    "$here/AbutsLabHelper.swift" -o "$work/AbutsLabHelper-${arch}"
done
lipo -create "$work/AbutsLabHelper-arm64" "$work/AbutsLabHelper-x86_64" \
  -output "$app/Contents/MacOS/AbutsLabHelper"

cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>fit.abuts.labhelper</string>
  <key>CFBundleName</key><string>어벗츠 연결</string>
  <key>CFBundleDisplayName</key><string>어벗츠 연결</string>
  <key>CFBundleExecutable</key><string>AbutsLabHelper</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>5.0.0</string>
  <key>CFBundleVersion</key><string>5</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

identity="${MAC_SIGN_IDENTITY:--}"
if [ "$identity" = "-" ]; then
  codesign --force --deep --sign - "$app"
else
  codesign --force --deep --options runtime --timestamp --sign "$identity" "$app"
fi

mkdir -p "$dest"
zip="$dest/AbutsLabHelper-mac.zip"
rm -f "$zip"
ditto -c -k --sequesterRsrc --keepParent "$app" "$zip"

if [ "$identity" != "-" ] && [ -n "${MAC_NOTARY_PROFILE:-}" ]; then
  xcrun notarytool submit "$zip" --keychain-profile "$MAC_NOTARY_PROFILE" --wait
  xcrun stapler staple "$app"
  rm -f "$zip"
  ditto -c -k --sequesterRsrc --keepParent "$app" "$zip"
fi

lipo -info "$app/Contents/MacOS/AbutsLabHelper"
ls -la "$zip"
