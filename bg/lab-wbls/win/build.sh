#!/usr/bin/env bash
# 기공소 택배 라벨 출력(exe 하나)을 빌드해 웹 다운로드 위치에 둔다.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
out="$(mktemp -d)"
dest="$root/web/frontend/public/downloads/lab-wbls"

dotnet build "$here/AbutsLabWbls.csproj" -c Release -o "$out" -nologo -v q
mkdir -p "$dest"
cp "$out/AbutsLabWbls.exe" "$dest/AbutsLabWblsSetup.exe"
rm -rf "$out" "$here/bin" "$here/obj"
ls -la "$dest/AbutsLabWblsSetup.exe"
