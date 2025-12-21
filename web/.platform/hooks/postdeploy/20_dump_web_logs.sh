#!/bin/bash
set -euo pipefail

echo "[dump_web_logs] begin (hooks/postdeploy)"

echo "[dump_web_logs] systemctl status web.service"
systemctl status web.service --no-pager || true

echo "[dump_web_logs] journalctl -u web.service (tail 400)"
journalctl -u web.service -n 400 --no-pager || true

echo "[dump_web_logs] journalctl -xe (tail 200)"
journalctl -xe --no-pager | tail -n 200 || true

echo "[dump_web_logs] end"
