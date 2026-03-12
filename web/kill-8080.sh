#!/bin/zsh
# Kill all processes listening on TCP port 8080 in a loop until none remain

set -euo pipefail

PORT=8080

while true; do
  PIDS=()
  if PIDS_OUTPUT=$(lsof -ti tcp:${PORT} 2>/dev/null); then
    PIDS=(${=PIDS_OUTPUT})
  fi

  if (( ${#PIDS[@]} == 0 )); then
    echo "[kill-8080] No processes are listening on port ${PORT}."
    exit 0
  fi

  echo "[kill-8080] Processes on port ${PORT}: ${PIDS}"
  for PID in "${PIDS[@]}"; do
    echo "[kill-8080] Killing PID ${PID}"
    kill -9 "${PID}" 2>/dev/null || true
  done
  
  sleep 0.5
done