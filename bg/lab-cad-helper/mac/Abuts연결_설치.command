#!/bin/bash
# Abuts 연결 프로그램 (macOS) — 최초 1회 설치. 로그인할 때마다 자동 실행(LaunchAgent).
# related: bg/lab-cad-helper/mac/AbutsLabHelper.swift, bg/lab-cad-helper/pack-public-zip.py
set -u
SRC="$(cd "$(dirname "$0")" && pwd)"
DIR="$HOME/Library/Application Support/Abuts/LabCadHelper"
BIN="$DIR/abuts-lab-helper"
LABEL="fit.abuts.labhelper"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM="$(id -u)"

alert() {
  /usr/bin/osascript -e "display dialog \"$1\" with title \"Abuts 연결 프로그램\" buttons {\"확인\"} default button 1" >/dev/null 2>&1
}

if [ ! -f "$SRC/abuts-lab-helper" ]; then
  alert "abuts-lab-helper 파일이 없습니다. zip을 통째로 푼 뒤 다시 실행해 주세요."
  exit 1
fi

curl -s -m 2 -X POST http://127.0.0.1:8010/shutdown >/dev/null 2>&1 || true
launchctl bootout "gui/$UID_NUM/$LABEL" >/dev/null 2>&1 || true
sleep 0.5

mkdir -p "$DIR" "$HOME/Library/LaunchAgents"
cp -f "$SRC/abuts-lab-helper" "$BIN"
chmod +x "$BIN"
xattr -dr com.apple.quarantine "$BIN" >/dev/null 2>&1 || true

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$BIN</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>LimitLoadToSessionType</key><string>Aqua</string>
  <key>StandardOutPath</key><string>$DIR/helper.log</string>
  <key>StandardErrorPath</key><string>$DIR/helper.log</string>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$UID_NUM" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST"

for _ in $(seq 1 25); do
  if curl -s -m 1 http://127.0.0.1:8010/health | grep -q '"version":2'; then
    alert "설치가 끝났습니다. 브라우저로 돌아가 「설치 완료 — 열기」를 눌러 주세요."
    exit 0
  fi
  sleep 0.4
done
alert "설치는 됐지만 연결 확인에 실패했습니다. Mac을 다시 시작한 뒤 다시 시도해 주세요."
exit 1
