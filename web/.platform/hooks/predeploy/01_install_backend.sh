#!/bin/bash
set -e

echo "Running predeploy hook..."

# EB 배포 중 소스 코드가 위치하는 staging 디렉토리
STAGING_DIR="/var/app/staging"
BACKEND_DIR="$STAGING_DIR/backend"

if [ -d "$BACKEND_DIR" ]; then
  echo "Installing dependencies in $BACKEND_DIR"
  cd "$BACKEND_DIR"
  
  # 의존성 설치
  npm install --omit=dev --no-audit --no-fund
  
  echo "Predeploy hook completed."
else
  echo "Backend directory not found at $BACKEND_DIR"
  exit 1
fi
