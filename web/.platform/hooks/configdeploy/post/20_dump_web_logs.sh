#!/bin/bash
set -euo pipefail

echo "[dump_web_logs] begin (configdeploy/post)"
echo "[dump_web_logs] journalctl -u web.service (tail 400)"
journalctl -u web.service -n 400 --no-pager || true
echo "[dump_web_logs] journalctl -xe (tail 400)"
journalctl -xe --no-pager | tail -n 400 || true
echo "[dump_web_logs] end"
