#!/bin/bash
# macOS 헬퍼 유니버설 바이너리(arm64 + x86_64). 결과: mac/dist/abuts-lab-helper
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
for arch in arm64 x86_64; do
  swiftc -O -swift-version 5 -target "${arch}-apple-macos12" \
    AbutsLabHelper.swift -o "dist/abuts-lab-helper-${arch}"
done
lipo -create dist/abuts-lab-helper-arm64 dist/abuts-lab-helper-x86_64 -output dist/abuts-lab-helper
rm -f dist/abuts-lab-helper-arm64 dist/abuts-lab-helper-x86_64
codesign --force --sign - dist/abuts-lab-helper
lipo -info dist/abuts-lab-helper
