#!/usr/bin/env bash
set -euo pipefail

# background 전용 EB 배포 스크립트
# 사용 예: ./eb.sh prod
# 결과: background(+shared)만 포함된 ZIP 생성 후 eb deploy 실행

ENVIRONMENT="${1:-prod}"
ROOT_DIR="$(cd -- "$(dirname "$0")/.." && pwd)"
BG_DIR="$ROOT_DIR/background"
WEB_MODELS_DIR="$ROOT_DIR/web/backend/models"
TS="$(date +%Y%m%d-%H%M%S)"
ZIP_NAME="background-${ENVIRONMENT}-${TS}.zip"
STAGING="/tmp/abuts-fit-bg-${TS}"

echo "[bg-eb] staging: $STAGING"
rm -rf "$STAGING"
mkdir -p "$STAGING"

# background -> staging (루트로 평탄화)
rsync -av \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "*.env" \
  --exclude "*.env.*" \
  --exclude "*.zip" \
  "$BG_DIR/" "$STAGING/"

# web/backend/models/*.model.js -> staging/models/ (모든 모델 파일)
mkdir -p "$STAGING/models"
rsync -av \
  --include="*.model.js" \
  --exclude="*" \
  "$WEB_MODELS_DIR/" "$STAGING/models/"

cd "$STAGING"
echo "[bg-eb] creating zip: $ZIP_NAME"
zip -r "$ZIP_NAME" . \
  -x "*.DS_Store" "*.zip"

echo "[bg-eb] zip created: $STAGING/$ZIP_NAME"
echo "[bg-eb] to deploy manually: eb deploy --staged --label ${TS} --verbose"
echo "[bg-eb] or move zip: cp \"$STAGING/$ZIP_NAME\" ."
