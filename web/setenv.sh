#!/usr/bin/env bash
set -euo pipefail

# 사용법: ./setenv.sh [EB_ENV_NAME] [env-mode|env-file]
#   예) ./setenv.sh abutsfit test
#       ./setenv.sh abutsfit prod
#       ./setenv.sh abutsfit backend/custom.env

ENV_NAME=${1:-abutsfit}
ENV_TARGET=${2:-test}

if [[ -z "$ENV_TARGET" ]]; then
  ENV_TARGET="test"
fi

if [[ "$ENV_TARGET" == *".env" || "$ENV_TARGET" == */* ]]; then
  ENV_FILE="$ENV_TARGET"
else
  case "$ENV_TARGET" in
    test|prod)
      ENV_FILE="backend/${ENV_TARGET}.env"
      ;;
    *)
      echo "지원하지 않는 env 모드: $ENV_TARGET (test|prod|.env 경로 사용)" >&2
      exit 1
      ;;
  esac
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "환경 파일을 찾을 수 없습니다: $ENV_FILE" >&2
  exit 1
fi

echo "[INFO] EB 환경: $ENV_NAME"
echo "[INFO] .env 파일: $ENV_FILE"

python3 - <<'PY' "$ENV_FILE" "$ENV_NAME"
import sys
from pathlib import Path
import subprocess
import os
import shlex

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

    if key == "PORT" and os.getenv("ALLOW_PORT", "").lower() != "true":
        continue

    # inline comment/트레일 공백 제거: 따옴표로 감싸지지 않은 값에만 적용
    if value and not (value.startswith('"') and value.endswith('"')):
        hash_pos = value.find('#')
        if hash_pos != -1:
            value = value[:hash_pos]
        value = value.strip()

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

def should_mask(k: str) -> bool:
    k = (k or "").upper()
    return any(x in k for x in ["SECRET", "TOKEN", "PASSWORD", "KEY"]) or k.endswith("_ID")

def mask_pair(pair: str) -> str:
    if "=" not in pair:
        return pair
    k, v = pair.split("=", 1)
    if should_mask(k):
        return f"{k}=*****"
    return pair

print(f"Applying env to Elastic Beanstalk environment: {env_name}")
for item in pairs:
    print(f"  {mask_pair(item)}")

# CloudFormation 4KB 제한 체크
payload = ','.join(pairs)
payload_len = len(payload)
max_len = 4096
safe_threshold = max_len - 200

if payload_len > max_len:
    print(f"[WARN] 단일 전송 시 CloudFormation 한계({max_len}b)를 초과할 수 있어 분할 전송을 사용합니다.")
elif payload_len > safe_threshold:
    print(f"[WARN] 환경변수 문자열 길이({payload_len}b)가 한계에 근접했습니다.")
else:
    print(f"[INFO] 환경변수 문자열 길이: {payload_len}b (한계 {max_len}b)")

# 1) 현재 환경변수 조회 후, 불필요 키 제거(값 비우기)
try:
    print("[INFO] 기존 환경변수 조회: eb printenv")
    out = subprocess.check_output(["eb", "printenv", "--environment", env_name], text=True)
    current_lines = [ln.strip() for ln in out.splitlines() if ln.strip() and '=' in ln]
    current_pairs = [ln for ln in current_lines if not ln.startswith('#')]
    current_keys = set([ln.split('=', 1)[0].strip() for ln in current_pairs])
except subprocess.CalledProcessError as e:
    print("[WARN] 기존 환경변수를 가져오지 못했습니다. 건너뜁니다.")
    current_keys = set()

new_keys = set([p.split('=', 1)[0] for p in pairs])
stale_keys = sorted(list(current_keys - new_keys))

def chunk_and_apply(items, label="setenv"):
    if not items:
        return
    batch = []
    batch_len = 0
    # 보수적으로 3000바이트 임계로 분할
    limit = 3000
    def flush():
        if not batch:
            return
        print(f"[INFO] eb {label} 배치 전송: {len(batch)}개")
        cmd = ["eb", "setenv", *batch, "--environment", env_name]
        # 디버그용 요약 출력
        preview = ' '.join([mask_pair(x) for x in batch[:3]])
        if len(batch) > 3:
            preview += f" ...(+{len(batch)-3})"
        print(f"        → {preview}")
        subprocess.run(cmd, check=True)
    for it in items:
        add_len = len(it) + 1  # comma/space 여유
        if batch and (batch_len + add_len) > limit:
            flush()
            batch = []
            batch_len = 0
        batch.append(it)
        batch_len += add_len
    flush()

# 먼저 불필요한 키 제거 (KEY= 형태)
if stale_keys:
    print(f"[INFO] 제거 대상 키 수: {len(stale_keys)}")
    removals = [f"{k}=" for k in stale_keys]
    chunk_and_apply(removals, label="unsetenv")
else:
    print("[INFO] 제거할 기존 키 없음")

# 다음으로 새 변수들을 분할 전송
chunk_and_apply(pairs, label="setenv")
PY
