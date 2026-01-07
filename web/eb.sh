#!/usr/bin/env bash
set -euo pipefail

WEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$WEB_DIR")"
FRONTEND_DIR="$WEB_DIR/frontend"
BACKEND_DIR="$WEB_DIR/backend"
DIST_DIR="$FRONTEND_DIR/dist"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ZIP_NAME="deploy-$TIMESTAMP.zip"
ZIP_PATH="$PARENT_DIR/$ZIP_NAME"

BACKEND_NODE_MODULES_DIR="$BACKEND_DIR/node_modules"
BACKEND_NODE_MODULES_BACKUP_DIR="$PARENT_DIR/.backend_node_modules__eb_deploy_backup"
FRONTEND_NODE_MODULES_DIR="$FRONTEND_DIR/node_modules"
FRONTEND_NODE_MODULES_BACKUP_DIR="$PARENT_DIR/.frontend_node_modules__eb_deploy_backup"

# 로그 출력 함수
info() {
  echo -e "\033[1;34m[INFO]\033[0m $1"
}

warn() {
  echo -e "\033[1;33m[WARN]\033[0m $1"
}

error() {
  echo -e "\033[1;31m[ERROR]\033[0m $1" >&2
  exit 1
}

# 환경 모드: test (기본값) 또는 prod
ENV_MODE="${1:-test}"

ENV_HASH_FILE="$PARENT_DIR/.eb_setenv_${ENV_MODE}.sha"

# 환경 모드 검증
if [[ "$ENV_MODE" != "test" && "$ENV_MODE" != "prod" ]]; then
  error "사용법: ./eb.sh [test|prod] (기본값: test)"
fi

# prod 배포 시 확인
if [[ "$ENV_MODE" == "prod" ]]; then
  warn "⚠️  프로덕션 환경으로 배포합니다!"
  read -p "계속하시겠습니까? (y/N): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    info "배포가 취소되었습니다."
    exit 0
  fi
fi

info "환경 모드: $ENV_MODE"

# 환경별 .env 파일 선택
ENV_FILE="$BACKEND_DIR/${ENV_MODE}.env"
if [[ ! -f "$ENV_FILE" ]]; then
  error "환경 파일을 찾을 수 없습니다: $ENV_FILE"
fi

command -v eb >/dev/null 2>&1 || error "Elastic Beanstalk CLI(eb)가 설치되어 있지 않습니다."

restore_backend_node_modules() {
  if [[ -d "$BACKEND_NODE_MODULES_BACKUP_DIR" && ! -d "$BACKEND_NODE_MODULES_DIR" ]]; then
    mv "$BACKEND_NODE_MODULES_BACKUP_DIR" "$BACKEND_NODE_MODULES_DIR" || true
    info "backend/node_modules 복구 완료"
  fi

  if [[ -d "$FRONTEND_NODE_MODULES_BACKUP_DIR" && ! -d "$FRONTEND_NODE_MODULES_DIR" ]]; then
    mv "$FRONTEND_NODE_MODULES_BACKUP_DIR" "$FRONTEND_NODE_MODULES_DIR" || true
    info "frontend/node_modules 복구 완료"
  fi
}

trap restore_backend_node_modules EXIT

info "프론트엔드 빌드"
(cd "$FRONTEND_DIR" && npm install && npm run build)

info "이전 dist 포함 zip 정리"
find "$PARENT_DIR" -maxdepth 1 -name 'deploy-*.zip' -type f -mtime +3 -delete || true

info "zip 패키지 생성"
cat <<'EOF' > "$WEB_DIR/.ebignore"
.git
/package.json
/package-lock.json
!backend/package.json
!backend/package-lock.json
/node_modules
frontend/node_modules
backend/node_modules
**/node_modules/**
*.zip
.DS_Store
*.env
*.env.*
/backend/coverage
/backend/.nyc_output
# Elastic Beanstalk Files
.elasticbeanstalk/*
!.elasticbeanstalk/*.cfg.yml
!.elasticbeanstalk/*.global.yml
EOF

rm -f "$ZIP_PATH"

# web 폴더 내부를 zip 루트로 포함
(cd "$WEB_DIR" && zip -r "$ZIP_PATH" \
  backend \
  Procfile \
  .platform \
  -x "**/node_modules/*" \
  -x "backend/node_modules/*" \
  -x "backend/coverage/*" \
  -x "backend/.nyc_output/*" \
  -x "backend/.git/*" \
  -x "*/.DS_Store" \
  -x "*.env" \
  -x "*.env.*")

info "zip에 dist 포함"
(cd "$WEB_DIR" && zip -ur "$ZIP_PATH" frontend/dist)

# 환경 파일에서 환경변수 읽기
info "환경변수 파싱 ($ENV_MODE.env)"
ENV_ARGS=()
while IFS='=' read -r key value || [[ -n "$key" ]]; do
  # 빈 줄, 주석 무시
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  # 값에서 따옴표 제거
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  # KEY=VALUE 형태로 안전하게 인자 배열에 추가 (특수문자/공백 보호)
  ENV_ARGS+=("$key=$value")
done < "$ENV_FILE"

# NODE_ENV 추가
if [[ "$ENV_MODE" == "prod" ]]; then
  ENV_ARGS+=("NODE_ENV=production")
else
  ENV_ARGS+=("NODE_ENV=test")
fi

# 환경변수 변경이 있을 때만 setenv 실행 (config-deploy 최소화)
ENV_HASH=""
if command -v shasum >/dev/null 2>&1; then
  ENV_HASH="$(printf '%s\n' "${ENV_ARGS[@]}" | LC_ALL=C sort | shasum -a 256 | awk '{print $1}')"
else
  ENV_HASH="$(printf '%s\n' "${ENV_ARGS[@]}" | LC_ALL=C sort | openssl dgst -sha256 | awk '{print $2}')"
fi

PREV_ENV_HASH=""
if [[ -f "$ENV_HASH_FILE" ]]; then
  PREV_ENV_HASH="$(cat "$ENV_HASH_FILE" | tr -d '\n' || true)"
fi

if [[ -n "$ENV_HASH" && "$ENV_HASH" != "$PREV_ENV_HASH" ]]; then
  info "EBS 환경변수 변경 감지 → setenv 실행"
  (cd "$WEB_DIR" && eb setenv "${ENV_ARGS[@]}") || error "환경변수 설정 실패"
  printf '%s' "$ENV_HASH" > "$ENV_HASH_FILE"
else
  info "EBS 환경변수 변경 없음 → setenv 스킵"
fi

# 1. 앱 배포 (predeploy 훅에서 npm install 실행됨)
info "EB 배포"
if [[ -d "$BACKEND_NODE_MODULES_DIR" ]]; then
  info "EB CLI 패키징 RecursionError 방지를 위해 backend/node_modules 임시 이동"
  rm -rf "$BACKEND_NODE_MODULES_BACKUP_DIR" || true
  mv "$BACKEND_NODE_MODULES_DIR" "$BACKEND_NODE_MODULES_BACKUP_DIR"
fi
if [[ -d "$FRONTEND_NODE_MODULES_DIR" ]]; then
  info "EB CLI 패키징 RecursionError 방지를 위해 frontend/node_modules 임시 이동"
  rm -rf "$FRONTEND_NODE_MODULES_BACKUP_DIR" || true
  mv "$FRONTEND_NODE_MODULES_DIR" "$FRONTEND_NODE_MODULES_BACKUP_DIR"
fi

(cd "$WEB_DIR" && eb deploy --label "$TIMESTAMP" --message "Deploy $TIMESTAMP ($ENV_MODE)") || error "eb deploy 실패"

restore_backend_node_modules

info "배포 완료: $ZIP_PATH ($ENV_MODE 환경)"
