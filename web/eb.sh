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
node_modules
frontend/node_modules
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

# 1. 먼저 앱 배포 (predeploy 훅에서 npm install 실행됨)
info "EB 배포"
(cd "$WEB_DIR" && eb deploy --label "$TIMESTAMP" --message "Deploy $TIMESTAMP ($ENV_MODE)") || error "eb deploy 실패"

# 2. 배포 후 환경변수 설정
info "EBS 환경변수 적용 중..."
(cd "$WEB_DIR" && eb setenv "${ENV_ARGS[@]}") || error "환경변수 설정 실패"

info "배포 완료: $ZIP_PATH ($ENV_MODE 환경)"
