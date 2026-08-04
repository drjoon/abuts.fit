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

ENV_HASH_FILE=""

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

# miniforge의 eb를 명시적으로 사용
EB_CMD="/Users/joonholee/miniforge3/bin/eb"
command -v "$EB_CMD" >/dev/null 2>&1 || error "Elastic Beanstalk CLI(eb)가 설치되어 있지 않습니다: $EB_CMD"

detect_eb_environment_name() {
  local env_name=""

  # 1) 현재 선택된 EB 환경에서 직접 조회
  env_name="$( (cd "$WEB_DIR" && "$EB_CMD" status 2>/dev/null) | awk -F': ' '/Environment details for:/{print $2; exit}')"
  if [[ -n "$env_name" ]]; then
    printf '%s' "$env_name"
    return 0
  fi

  # 2) fallback: .elasticbeanstalk/config.yml의 branch-defaults에서 추출
  env_name="$(awk '/^branch-defaults:/, /^global:/' "$WEB_DIR/.elasticbeanstalk/config.yml" | awk -F': ' '/^[[:space:]]+environment:/{print $2; exit}')"
  printf '%s' "$env_name"
}

get_remote_setenv_hash() {
  local printenv_output=""
  if ! printenv_output="$(cd "$WEB_DIR" && "$EB_CMD" printenv 2>/dev/null)"; then
    printf ''
    return 0
  fi

  printf '%s\n' "$printenv_output" | awk -F'=' '
    {
      key=$1;
      val=$2;
      gsub(/^[ \t]+|[ \t]+$/, "", key);
      gsub(/^[ \t]+|[ \t]+$/, "", val);
      if (key == "ABUTS_EB_LAST_SETENV_HASH") {
        print val;
        exit;
      }
    }
  '
}

# Console/API settings override .ebextensions. Force zero-downtime deploy options
# at the API level so RollingWithAdditionalBatch cannot silently win.
ensure_immutable_deploy_options() {
  local env_name="$1"
  local region profile current_policy
  region="$(awk -F': ' '/^[[:space:]]+default_region:/{print $2; exit}' "$WEB_DIR/.elasticbeanstalk/config.yml")"
  profile="$(awk -F': ' '/^[[:space:]]+profile:/{print $2; exit}' "$WEB_DIR/.elasticbeanstalk/config.yml")"
  region="${region:-ap-south-1}"
  profile="${profile:-abuts.fit}"

  if ! command -v aws >/dev/null 2>&1; then
    warn "aws CLI 없음 → DeploymentPolicy API 강제 스킵 (.ebextensions만 의존)"
    return 0
  fi

  current_policy="$(
    aws elasticbeanstalk describe-configuration-settings \
      --application-name abuts.fit \
      --environment-name "$env_name" \
      --region "$region" \
      --profile "$profile" \
      --query "ConfigurationSettings[0].OptionSettings[?OptionName=='DeploymentPolicy'].Value | [0]" \
      --output text 2>/dev/null || true
  )"
  current_drain="$(
    aws elasticbeanstalk describe-configuration-settings \
      --application-name abuts.fit \
      --environment-name "$env_name" \
      --region "$region" \
      --profile "$profile" \
      --query "ConfigurationSettings[0].OptionSettings[?OptionName=='DeregistrationDelay'].Value | [0]" \
      --output text 2>/dev/null || true
  )"

  if [[ "$current_policy" == "Immutable" && "$current_drain" == "30" ]]; then
    info "DeploymentPolicy Immutable, DeregistrationDelay=30s 확인"
    return 0
  fi

  info "배포 옵션 동기화 (policy=${current_policy:-?}, drain=${current_drain:-?} → Immutable/30s)"
  aws elasticbeanstalk update-environment \
    --environment-name "$env_name" \
    --region "$region" \
    --profile "$profile" \
    --option-settings \
      "Namespace=aws:elasticbeanstalk:command,OptionName=DeploymentPolicy,Value=Immutable" \
      "Namespace=aws:autoscaling:updatepolicy:rollingupdate,OptionName=RollingUpdateType,Value=Immutable" \
      "Namespace=aws:autoscaling:asg,OptionName=MaxSize,Value=4" \
      "Namespace=aws:elasticbeanstalk:environment:process:default,OptionName=StickinessEnabled,Value=true" \
      "Namespace=aws:elasticbeanstalk:environment:process:default,OptionName=StickinessLBCookieDuration,Value=120" \
      "Namespace=aws:elasticbeanstalk:environment:process:default,OptionName=DeregistrationDelay,Value=30" \
    >/dev/null || error "DeploymentPolicy Immutable 적용 실패"

  info "설정 업데이트 제출됨. Ready 대기 중..."
  local i
  for i in $(seq 1 60); do
    local status
    status="$(
      aws elasticbeanstalk describe-environments \
        --environment-names "$env_name" \
        --region "$region" \
        --profile "$profile" \
        --query 'Environments[0].Status' \
        --output text 2>/dev/null || true
    )"
    if [[ "$status" == "Ready" ]]; then
      info "환경 Ready — 배포 계속"
      return 0
    fi
    sleep 10
  done
  error "환경이 Ready로 돌아오지 않았습니다 (DeploymentPolicy 변경 후)"
}

EB_ENV_NAME="$(detect_eb_environment_name)"
if [[ -z "$EB_ENV_NAME" ]]; then
  warn "EBS 환경명을 자동 감지하지 못했습니다. 해시 파일을 모드 단위로 사용합니다."
  ENV_HASH_FILE="$PARENT_DIR/.eb_setenv_${ENV_MODE}.sha"
else
  info "대상 EBS 환경: $EB_ENV_NAME"
  ENV_NAME_SLUG="$(printf '%s' "$EB_ENV_NAME" | tr -cs '[:alnum:]._-' '_')"
  ENV_HASH_FILE="$PARENT_DIR/.eb_setenv_${ENV_MODE}_${ENV_NAME_SLUG}.sha"
fi

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

# Keep prior hashed assets so old tabs / mixed-version requests can still
# resolve chunks after cutover (new build wins on filename collision).
ASSETS_CACHE_DIR="$PARENT_DIR/.eb_assets_cache"
mkdir -p "$ASSETS_CACHE_DIR"
if [[ -d "$DIST_DIR/assets" ]]; then
  if compgen -G "$ASSETS_CACHE_DIR/*" > /dev/null; then
    info "이전 Vite 해시 에셋을 dist에 병합 (캐시 → 신규)"
    # -n: do not overwrite newly built files
    cp -n "$ASSETS_CACHE_DIR"/* "$DIST_DIR/assets/" 2>/dev/null || true
  fi
  find "$ASSETS_CACHE_DIR" -type f -mtime +14 -delete 2>/dev/null || true
  cp -f "$DIST_DIR/assets"/* "$ASSETS_CACHE_DIR/" 2>/dev/null || true
fi

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

# 환경변수 변경 체크용 해시 계산
CORE_ENV_HASH=""
if command -v shasum >/dev/null 2>&1; then
  CORE_ENV_HASH="$(printf '%s\n' "${ENV_ARGS[@]}" | LC_ALL=C sort | shasum -a 256 | awk '{print $1}')"
else
  CORE_ENV_HASH="$(printf '%s\n' "${ENV_ARGS[@]}" | LC_ALL=C sort | openssl dgst -sha256 | awk '{print $2}')"
fi

[[ -n "$CORE_ENV_HASH" ]] || error "환경변수 해시 계산에 실패했습니다."

# 원격 환경과의 동기화 판단을 위한 sentinel 값 추가
ENV_ARGS+=("ABUTS_EB_LAST_SETENV_HASH=$CORE_ENV_HASH")

# CloudFormation 4KB 제한 대비: 전체 문자열 길이 측정
ENV_PAYLOAD_LEN=$(printf "%s," "${ENV_ARGS[@]}" | wc -c | tr -d ' ')
MAX_CF_PARAM_LEN=4096
SAFE_THRESHOLD=$((MAX_CF_PARAM_LEN - 200))

if (( ENV_PAYLOAD_LEN > MAX_CF_PARAM_LEN )); then
  error "환경변수 문자열 길이(${ENV_PAYLOAD_LEN}b)가 CloudFormation 제한(${MAX_CF_PARAM_LEN}b)를 초과합니다. .env 내용을 줄인 뒤 다시 실행하세요."
elif (( ENV_PAYLOAD_LEN > SAFE_THRESHOLD )); then
  warn "환경변수 문자열 길이(${ENV_PAYLOAD_LEN}b)가 한계(${MAX_CF_PARAM_LEN}b)에 근접했습니다. 필요 없는 키를 정리하는 것이 안전합니다."
else
  info "환경변수 문자열 길이: ${ENV_PAYLOAD_LEN}b (한계 ${MAX_CF_PARAM_LEN}b)"
fi

PREV_ENV_HASH=""
if [[ -f "$ENV_HASH_FILE" ]]; then
  PREV_ENV_HASH="$(cat "$ENV_HASH_FILE" | tr -d '\n' || true)"
fi

REMOTE_ENV_HASH="$(get_remote_setenv_hash)"
if [[ -n "$REMOTE_ENV_HASH" ]]; then
  info "원격 EBS setenv 해시 확인: ${REMOTE_ENV_HASH:0:12}..."
else
  warn "원격 EBS setenv 해시를 찾지 못했습니다. (신규 환경/미설정 가능)"
fi

if [[ "$CORE_ENV_HASH" != "$PREV_ENV_HASH" || "$CORE_ENV_HASH" != "$REMOTE_ENV_HASH" ]]; then
  info "EBS 환경변수 동기화 필요 → setenv 단일 실행"

  # 전체 payload가 4KB 이하일 때 단일 setenv가 안정적이며
  # config deploy/restart 횟수를 줄여 가용성을 높입니다.
  (cd "$WEB_DIR" && "$EB_CMD" setenv "${ENV_ARGS[@]}") || error "환경변수 설정 실패"

  printf '%s' "$CORE_ENV_HASH" > "$ENV_HASH_FILE"
else
  info "EBS 환경변수 변경 없음(로컬/원격 해시 동일) → setenv 스킵"
fi

# 1. 앱 배포 (predeploy 훅에서 npm install 실행됨)
if [[ -n "$EB_ENV_NAME" ]]; then
  ensure_immutable_deploy_options "$EB_ENV_NAME"
fi

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

(cd "$WEB_DIR" && "$EB_CMD" deploy --label "$TIMESTAMP" --message "Deploy $TIMESTAMP ($ENV_MODE)") || error "eb deploy 실패"

restore_backend_node_modules

info "배포 완료: $ZIP_PATH ($ENV_MODE 환경)"
