#!/usr/bin/env bash
set -euo pipefail

# 사용법: ./setenv.sh [EB_ENV_NAME]
# 예:    ./setenv.sh abutsfit
ENV_NAME=${1:-abutsfit}

# .env 파일 경로
ENV_FILE="backend/test.env"
# ENV_FILE="backend/prod.env" # production

if [ ! -f "$ENV_FILE" ]; then
  echo "환경 파일을 찾을 수 없습니다: $ENV_FILE" >&2
  exit 1
fi

python3 - <<'PY' "$ENV_FILE" "$ENV_NAME"
import sys
from pathlib import Path
import subprocess

env_path = Path(sys.argv[1])
env_name = sys.argv[2]
pairs = []

for raw in env_path.read_text(encoding='utf-8').splitlines():
    line = raw.strip()
    if not line or line.startswith('#') or '=' not in line:
        continue
    key, value = line.split('=', 1)
    key = key.strip()
    value = value.strip().replace('\r', '')

    # inline comment 제거: 따옴표로 감싸지지 않은 값에서만 적용
    if value and not (value.startswith('"') and value.endswith('"')):
        hash_pos = value.find('#')
        if hash_pos != -1:
            before_hash = value[:hash_pos]
            if before_hash.endswith(' ') or before_hash.endswith('\t'):
                value = before_hash.rstrip()

    if value.startswith('"') and value.endswith('"'):
        formatted = f"{key}={value}"
    elif ' ' in value:
        formatted = f'{key}="{value}"'
    else:
        formatted = f"{key}={value}"

    pairs.append(formatted)

if not pairs:
    print("적용할 환경 변수가 없습니다.", file=sys.stderr)
    sys.exit(1)

print(f"Applying env to Elastic Beanstalk environment: {env_name}")
for item in pairs:
    print(f"  {item}")

subprocess.run(["eb", "setenv", *pairs, "--environment", env_name], check=True)
PY
