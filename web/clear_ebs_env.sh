#!/usr/bin/env bash
set -euo pipefail

# EBS 환경변수 모두 삭제 스크립트
# 사용법: ./clear_ebs_env.sh

EB_CMD="/Users/joonholee/miniforge3/bin/eb"
ENV_NAME="abutsfit"
REGION="ap-south-1"

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

info "EBS 환경변수 삭제 시작..."
info "환경: $ENV_NAME"
info "리전: $REGION"

# 현재 환경변수 조회
info "현재 환경변수 조회..."
CURRENT_VARS=$("$EB_CMD" printenv --profile abuts.fit --region "$REGION" 2>/dev/null | grep "=" | awk '{print $1}' | sort)

if [[ -z "$CURRENT_VARS" ]]; then
  warn "삭제할 환경변수가 없습니다"
  exit 0
fi

# 환경변수 개수 계산
VAR_COUNT=$(echo "$CURRENT_VARS" | wc -l)
info "삭제할 환경변수: $VAR_COUNT 개"

# 환경이 Ready 상태인지 확인
info "환경 상태 확인..."
STATUS=$("$EB_CMD" status --profile abuts.fit --region "$REGION" | grep "Status:" | awk '{print $NF}')
if [[ "$STATUS" != "Ready" ]]; then
  warn "환경이 Ready 상태가 아닙니다 (현재: $STATUS). 잠시 대기 후 재시도합니다..."
  sleep 30
fi

# 배치로 환경변수 삭제 (CloudFormation 4KB 제한 때문에)
BATCH_SIZE=50
info "환경변수를 배치로 삭제 (배치 크기: $BATCH_SIZE)"

declare -a ENV_ARRAY
while IFS= read -r var; do
  [[ -n "$var" ]] && ENV_ARRAY+=("$var=")
done <<< "$CURRENT_VARS"

for ((i=0; i<${#ENV_ARRAY[@]}; i+=BATCH_SIZE)); do
  BATCH=("${ENV_ARRAY[@]:$i:$BATCH_SIZE}")
  BATCH_NUM=$((i/BATCH_SIZE + 1))
  TOTAL_BATCHES=$(((${#ENV_ARRAY[@]} + BATCH_SIZE - 1) / BATCH_SIZE))
  
  info "환경변수 배치 삭제 ($BATCH_NUM/$TOTAL_BATCHES)"
  "$EB_CMD" setenv --profile abuts.fit --region "$REGION" "${BATCH[@]}" || error "환경변수 삭제 실패 (배치 $BATCH_NUM)"
  
  # 배치 간 대기
  if [[ $BATCH_NUM -lt $TOTAL_BATCHES ]]; then
    sleep 5
  fi
done

info "✅ EBS 환경변수 삭제 완료!"

# 환경 상태 확인
info "🔍 환경 상태 확인..."
"$EB_CMD" status --profile abuts.fit --region "$REGION"
