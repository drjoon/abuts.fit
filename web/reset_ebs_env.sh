#!/usr/bin/env bash
set -euo pipefail

# EBS 환경변수 완전 교체 스크립트
# 사용법: ./reset_ebs_env.sh [test|prod] (기본값: test)

WEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$WEB_DIR")"

# 환경 모드: test (기본값) 또는 prod
ENV_MODE="${1:-test}"

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

# 환경 모드 검증
if [[ "$ENV_MODE" != "test" && "$ENV_MODE" != "prod" ]]; then
  error "사용법: ./reset_ebs_env.sh [test|prod] (기본값: test)"
fi

# 설정
EB_CMD="/Users/joonholee/miniforge3/bin/eb"
ENV_NAME="abutsfit"
REGION="ap-south-1"
ENV_FILE="$WEB_DIR/backend/${ENV_MODE}.env"

info "EBS 환경변수 완전 교체 시작..."
info "환경: $ENV_NAME"
info "리전: $REGION"
info "파일: $ENV_FILE"

# 환경 파일 확인
if [[ ! -f "$ENV_FILE" ]]; then
  error "환경 파일을 찾을 수 없습니다: $ENV_FILE"
fi

# 환경변수 배열 구성
declare -a ENV_ARGS
while IFS='=' read -r key value || [[ -n "$key" ]]; do
  # 빈 줄, 주석 무시
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  # 값에서 따옴표 제거
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  # KEY=VALUE 형태로 안전하게 인자 배열에 추가
  ENV_ARGS+=("$key=$value")
done < "$ENV_FILE"

info "환경변수 파일 파싱 완료: ${#ENV_ARGS[@]} 개 변수"

# 환경이 Ready 상태인지 확인
info "환경 상태 확인..."
STATUS=$("$EB_CMD" status --profile abuts.fit --region "$REGION" | grep "Status:" | awk '{print $NF}')
if [[ "$STATUS" != "Ready" ]]; then
  warn "환경이 Ready 상태가 아닙니다 (현재: $STATUS). 잠시 대기 후 재시도합니다..."
  sleep 30
fi

# 배치로 환경변수 설정 (CloudFormation 4KB 제한 때문에)
BATCH_SIZE=50
info "환경변수를 배치로 설정 (배치 크기: $BATCH_SIZE)"

for ((i=0; i<${#ENV_ARGS[@]}; i+=BATCH_SIZE)); do
  BATCH=("${ENV_ARGS[@]:$i:$BATCH_SIZE}")
  BATCH_NUM=$((i/BATCH_SIZE + 1))
  TOTAL_BATCHES=$(((${#ENV_ARGS[@]} + BATCH_SIZE - 1) / BATCH_SIZE))
  
  info "환경변수 배치 설정 ($BATCH_NUM/$TOTAL_BATCHES)"
  "$EB_CMD" setenv --profile abuts.fit --region "$REGION" "${BATCH[@]}" || error "환경변수 설정 실패 (배치 $BATCH_NUM)"
  
  # 배치 간 대기 (CloudFormation 업데이트 시간 확보)
  if [[ $BATCH_NUM -lt $TOTAL_BATCHES ]]; then
    sleep 5
  fi
done

info "✅ EBS 환경변수 교체 완료!"
info "총 ${#ENV_ARGS[@]} 개 변수가 설정되었습니다."

# 환경 상태 확인
info "🔍 환경 상태 확인..."
"$EB_CMD" status --profile abuts.fit --region "$REGION"
