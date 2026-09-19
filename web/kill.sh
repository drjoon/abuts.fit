#!/bin/zsh
# Kill processes listening on the local backend (8080) and frontend (5173).

set -euo pipefail

PORTS=(8080 5173)

kill_port() {
  local PORT="$1"

  while true; do
    PIDS=()
    if PIDS_OUTPUT=$(lsof -ti tcp:${PORT} 2>/dev/null); then
      PIDS=(${=PIDS_OUTPUT})
    fi

    if (( ${#PIDS[@]} == 0 )); then
      echo "[kill-8080] No processes are listening on port ${PORT}."
      return 0
    fi

    echo "[kill-8080] Processes on port ${PORT}: ${PIDS}"
    for PID in "${PIDS[@]}"; do
      echo "[kill-8080] Killing PID ${PID}"
      kill -9 "${PID}" 2>/dev/null || true
    done

    sleep 0.5
  done
}

for PORT in "${PORTS[@]}"; do
  kill_port "${PORT}"
done
