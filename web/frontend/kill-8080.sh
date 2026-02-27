#!/bin/zsh
# Kill all processes listening on TCP port 8080

set -euo pipefail

PORT=8080
PIDS=$(lsof -ti tcp:${PORT} || true)

if [[ -z "${PIDS}" ]]; then
  echo "[kill-8080] No processes are listening on port ${PORT}."
  exit 0
fi

echo "[kill-8080] Processes on port ${PORT}: ${PIDS}"
kill -9 ${PIDS}
echo "[kill-8080] Killed processes on port ${PORT}."