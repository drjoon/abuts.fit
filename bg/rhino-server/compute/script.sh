set -a
source local.env
set +a
source .venv/bin/activate
API_BASE="${RHINO_API_URL:-http://127.0.0.1:8000}"
API_BASE="${API_BASE%/}"
RES=$(curl -sS -f -X POST "$API_BASE/api/rhino/process-input-folder" || true)
if [ -z "$RES" ]; then
  echo "서버 응답이 비어있습니다. server.sh가 실행 중인지 확인하세요: $API_BASE" >&2
  exit 1
fi

echo "$RES"

JOB_ID=$(echo "$RES" | python -c 'import sys, json
try:
  print(json.load(sys.stdin).get("jobId",""))
except Exception:
  sys.exit(1)
')
if [ -z "$JOB_ID" ]; then
  echo "jobId 파싱 실패(응답이 JSON이 아닐 수 있음):" >&2
  echo "$RES" >&2
  exit 1
fi

export JOB_ID

export RHINO_API_URL="$API_BASE"

python - <<'PY'
import json
import os
import sys
import time
from urllib.request import urlopen, Request

api_base = os.environ.get("RHINO_API_URL", "http://127.0.0.1:8000").rstrip("/")
job_id = os.environ.get("JOB_ID")
interval = float(os.environ.get("RHINO_POLL_INTERVAL_SEC", "2"))
timeout = float(os.environ.get("RHINO_POLL_TIMEOUT_SEC", "600"))

start = time.time()
while True:
    req = Request(f"{api_base}/api/rhino/jobs/{job_id}")
    with urlopen(req, timeout=60) as resp:
        status = json.loads(resp.read().decode("utf-8"))
    s = status.get("status")
    if s in ("done", "error"):
        print(json.dumps(status, ensure_ascii=False))
        sys.exit(0 if s == "done" else 1)
    if time.time() - start > timeout:
        print("timeout", file=sys.stderr)
        sys.exit(2)
    time.sleep(interval)
PY