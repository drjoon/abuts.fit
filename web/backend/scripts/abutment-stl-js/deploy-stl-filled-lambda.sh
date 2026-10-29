#!/usr/bin/env bash
# Filled STL JS Lambda 생성·코드 갱신·EBS invoke 권한·EB env(ABUTMENT_STL_FILLED_LAMBDA).
# 제한 시간 60초. 넘기면 함수가 끊기고 준비 카드에 사유가 남는다.
# 짧은 11° 원뿔을 PRC 면(Z_a+0.1)까지 잇는 connectionTaperFill이 이 패키지에 들어간다.
# 원뿔 높이·원점 규칙을 바꾸면 백엔드만 올리지 말고 이 스크립트로 람다도 갱신한다.
#
#   cd web/backend && ./scripts/abutment-stl-js/deploy-stl-filled-lambda.sh [test|prod]
#
# AWS 프로필: web/.elasticbeanstalk/config.yml global.profile (기본 abuts.fit)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WEB_DIR="$(cd "$BACKEND_DIR/.." && pwd)"
DIST_DIR="$BACKEND_DIR/dist/stl-filled-lambda"
ZIP_PATH="$BACKEND_DIR/dist/stl-filled-lambda.zip"

ENV_MODE="${1:-test}"
FUNCTION_NAME="${ABUTMENT_STL_FILLED_LAMBDA_NAME:-abuts-stl-filled}"
ROLE_NAME="${ABUTMENT_STL_FILLED_LAMBDA_ROLE:-abuts-stl-filled-lambda}"
MEMORY_MB=2048
TIMEOUT_SEC=60
RESERVED_CONCURRENCY=20
BUCKETS="${ABUTMENT_STL_FILLED_S3_BUCKETS:-}"
if [[ -z "$BUCKETS" ]]; then
  BUCKETS="${AWS_S3_BUCKET_NAME:-${AWS_S3_BUCKET:-test-abuts-fit-bucket,abuts-fit}}"
fi

AWS_PROFILE="${AWS_PROFILE:-$(awk '/^  profile:/{print $2; exit}' "$WEB_DIR/.elasticbeanstalk/config.yml" 2>/dev/null || true)}"
AWS_PROFILE="${AWS_PROFILE:-default}"
export AWS_PROFILE

REGION="${AWS_REGION:-$(aws configure get region --profile "$AWS_PROFILE" 2>/dev/null || true)}"
if [[ -z "$REGION" && -f "$WEB_DIR/.elasticbeanstalk/config.yml" ]]; then
  REGION="$(awk '/^  default_region:/{print $2; exit}' "$WEB_DIR/.elasticbeanstalk/config.yml")"
fi
REGION="${REGION:-ap-northeast-2}"
export AWS_REGION="$REGION"

EB_ENV=""
if [[ -f "$WEB_DIR/.elasticbeanstalk/config.yml" ]]; then
  EB_ENV="$(awk '/^  main:/{m=1} m && /^    environment:/{print $2; exit}' "$WEB_DIR/.elasticbeanstalk/config.yml")"
fi

info() { echo -e "\033[1;34m[INFO]\033[0m $1"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m $1"; }
error() { echo -e "\033[1;31m[ERROR]\033[0m $1" >&2; exit 1; }

if [[ "$ENV_MODE" == "prod" ]]; then
  warn "prod EB env에 ABUTMENT_STL_FILLED_LAMBDA를 설정합니다."
  read -r -p "계속? (y/N): " confirm
  [[ "$confirm" == "y" || "$confirm" == "Y" ]] || exit 0
fi

command -v aws >/dev/null 2>&1 || error "aws CLI가 필요합니다."
aws sts get-caller-identity --region "$REGION" >/dev/null 2>&1 || error "AWS 자격증명 확인 실패 (profile=$AWS_PROFILE region=$REGION)"

info "빌드 (esbuild)…"
(cd "$BACKEND_DIR" && node scripts/abutment-stl-js/build-stl-filled-lambda.mjs)

rm -f "$ZIP_PATH"
(cd "$DIST_DIR" && zip -q -r "$ZIP_PATH" .)
info "zip: $ZIP_PATH ($(du -h "$ZIP_PATH" | awk '{print $1}'))"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

put_s3_policy() {
  S3_RESOURCES=""
  IFS=',' read -ra BUCKET_ARR <<< "$BUCKETS"
  for b in "${BUCKET_ARR[@]}"; do
    b="$(echo "$b" | xargs)"
    [[ -n "$b" ]] || continue
    S3_RESOURCES="${S3_RESOURCES}\"arn:aws:s3:::${b}/temp/stl-filled/*\","
  done
  S3_RESOURCES="${S3_RESOURCES%,}"
  [[ -n "$S3_RESOURCES" ]] || error "S3 버킷이 없습니다."
  POLICY_DOC="$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:HeadObject"],
    "Resource": [${S3_RESOURCES}]
  }]
}
EOF
)"
  aws iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name "stl-filled-s3" \
    --policy-document "$POLICY_DOC"
}

ensure_lambda_role() {
  if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
    info "IAM 역할 존재: $ROLE_NAME"
  else
    info "IAM 역할 생성: $ROLE_NAME"
    aws iam create-role \
      --role-name "$ROLE_NAME" \
      --assume-role-policy-document "$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "lambda.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF
)" >/dev/null
    aws iam attach-role-policy \
      --role-name "$ROLE_NAME" \
      --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    info "역할 전파 대기…"
    sleep 12
  fi
  put_s3_policy
}

ensure_lambda_role

LAMBDA_ENV="Variables={TZ=Asia/Seoul}"

if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
  info "Lambda 코드 갱신: $FUNCTION_NAME"
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_PATH" \
    --architectures arm64 \
    --region "$REGION" >/dev/null
  aws lambda wait function-updated-v2 --function-name "$FUNCTION_NAME" --region "$REGION"
  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x \
    --handler index.handler \
    --timeout "$TIMEOUT_SEC" \
    --memory-size "$MEMORY_MB" \
    --environment "$LAMBDA_ENV" \
    --region "$REGION" >/dev/null
  aws lambda wait function-updated-v2 --function-name "$FUNCTION_NAME" --region "$REGION"
else
  info "Lambda 생성: $FUNCTION_NAME (arm64 ${MEMORY_MB}MB ${TIMEOUT_SEC}s)"
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x \
    --role "$ROLE_ARN" \
    --handler index.handler \
    --zip-file "fileb://$ZIP_PATH" \
    --timeout "$TIMEOUT_SEC" \
    --memory-size "$MEMORY_MB" \
    --architectures arm64 \
    --environment "$LAMBDA_ENV" \
    --region "$REGION" >/dev/null
  aws lambda wait function-active-v2 --function-name "$FUNCTION_NAME" --region "$REGION"
fi

aws lambda put-function-concurrency \
  --function-name "$FUNCTION_NAME" \
  --reserved-concurrent-executions "$RESERVED_CONCURRENCY" \
  --region "$REGION" >/dev/null
info "동시 실행 상한: $RESERVED_CONCURRENCY"

grant_eb_invoke() {
  local eb_env_name="$1"
  [[ -n "$eb_env_name" ]] || return 0
  local eb_cmd="/Users/joonholee/miniforge3/bin/eb"
  if [[ ! -x "$eb_cmd" ]]; then
    eb_cmd="$(command -v eb || true)"
  fi
  [[ -n "$eb_cmd" ]] || { warn "eb CLI 없음 — invoke IAM은 수동 확인"; return 0; }

  local instance_id profile_arn profile_name=""
  instance_id="$(AWS_PROFILE="$AWS_PROFILE" aws elasticbeanstalk describe-environment-resources \
    --environment-name "$eb_env_name" --region "$REGION" \
    --query 'EnvironmentResources.Instances[0].Id' --output text 2>/dev/null || true)"
  if [[ -n "$instance_id" && "$instance_id" != "None" ]]; then
    profile_arn="$(AWS_PROFILE="$AWS_PROFILE" aws ec2 describe-instances --instance-ids "$instance_id" --region "$REGION" \
      --query 'Reservations[0].Instances[0].IamInstanceProfile.Arn' --output text 2>/dev/null || true)"
    profile_name="${profile_arn##*/}"
  fi
  if [[ -z "$profile_name" || "$profile_name" == "None" ]]; then
    warn "EB Instance profile을 찾지 못함 ($eb_env_name)"
    return 0
  fi
  info "EB invoke 권한: $profile_name → $FUNCTION_NAME"
  POLICY_DOC="$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "lambda:InvokeFunction",
    "Resource": "arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}"
  }]
}
EOF
)"
  aws iam put-role-policy \
    --role-name "$profile_name" \
    --policy-name "invoke-${FUNCTION_NAME}" \
    --policy-document "$POLICY_DOC" 2>/dev/null || warn "인스턴스 프로필 역할에 정책 추가 실패 (role=$profile_name). EB 콘솔에서 lambda:InvokeFunction을 확인하세요."
}

if [[ -n "$EB_ENV" ]]; then
  grant_eb_invoke "$EB_ENV"
fi

if [[ -n "$EB_ENV" ]]; then
  EB_CMD="/Users/joonholee/miniforge3/bin/eb"
  [[ -x "$EB_CMD" ]] || EB_CMD="$(command -v eb || true)"
  if [[ -n "$EB_CMD" ]]; then
    info "EB setenv: ABUTMENT_STL_FILLED_LAMBDA=$FUNCTION_NAME ($EB_ENV)"
    (cd "$WEB_DIR" && "$EB_CMD" setenv "ABUTMENT_STL_FILLED_LAMBDA=$FUNCTION_NAME" --environment "$EB_ENV")
  fi
fi

info "완료: $FUNCTION_NAME (region=$REGION profile=$AWS_PROFILE timeout=${TIMEOUT_SEC}s)"
info "로컬에서 람다를 쓰려면: export ABUTMENT_STL_FILLED_LAMBDA=$FUNCTION_NAME AWS_REGION=$REGION"
