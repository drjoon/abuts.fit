#!/usr/bin/env bash
set -e

set -a
. local.env
set +a
. .venv/bin/activate
python -c "import multipart" >/dev/null 2>&1 || {
  echo "python-multipart가 설치되어 있지 않습니다." >&2
  echo "아래를 실행하세요:" >&2
  echo "  source .venv/bin/activate" >&2
  echo "  pip install -r requirements.txt" >&2
  exit 1
}
python -m uvicorn app:app --host 127.0.0.1 --port 8000