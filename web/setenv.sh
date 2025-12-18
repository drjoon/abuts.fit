#!/usr/bin/env bash
set -euo pipefail

# 사용법: ./setenv.sh [EB_ENV_NAME]
# 예:    ./setenv.sh book2
ENV_NAME=${1:-book2}

# .env 파일 경로
ENV_FILE="backend/test.env"
# ENV_FILE="backend/prod.env" # production

if [ ! -f "$ENV_FILE" ]; then
  echo "환경 파일을 찾을 수 없습니다: $ENV_FILE" >&2
  exit 1
fi

# 주석/빈줄 제거 + 양쪽 큰따옴표 제거해서 KEY=VALUE 형태로 변환
ENV_VARS=$(
  grep -v '^[[:space:]]*#' "$ENV_FILE" |       \
  sed '/^[[:space:]]*$/d' |                    \
  sed -E 's/^([^=]+)=\"?(.*)\"?$/\1=\2/' |     \
  tr '\n' ' '
)

echo "Applying env to Elastic Beanstalk environment: $ENV_NAME"
echo "Variables: $ENV_VARS"

eb setenv $ENV_VARS --environment "$ENV_NAME"
