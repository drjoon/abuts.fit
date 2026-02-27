#!/bin/zsh
# Kill all processes listening on TCP port 8080

set -euo pipefail

PORT=8080
PIDS=()
if PIDS_OUTPUT=$(lsof -ti tcp:${PORT}); then
  PIDS=(${=PIDS_OUTPUT})
fi

if (( ${#PIDS[@]} == 0 )); then
  echo "[kill-8080] No processes are listening on port ${PORT}."
  exit 0
fi

echo "[kill-8080] Processes on port ${PORT}: ${PIDS}"
for PID in "${PIDS[@]}"; do
  echo "[kill-8080] Killing PID ${PID}"
  kill -9 "${PID}"
done
echo "[kill-8080] Killed processes on port ${PORT}."