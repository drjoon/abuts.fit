#!/usr/bin/env bash
# Windows 연결 프로그램(exe 하나)을 빌드해 웹 다운로드 위치에 둔다. macOS·Linux·Windows 어디서나 .NET SDK 8+.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
out="$(mktemp -d)"
dest="$root/web/frontend/public/downloads/lab-helper"

dotnet build "$here/AbutsLabHelper.csproj" -c Release -o "$out" -nologo -v q
mkdir -p "$dest"
cp "$out/AbutsLabHelper.exe" "$dest/AbutsLabHelperSetup.exe"
rm -rf "$out" "$here/bin" "$here/obj"
ls -la "$dest/AbutsLabHelperSetup.exe"
