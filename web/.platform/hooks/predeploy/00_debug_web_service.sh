#!/bin/bash
set -euo pipefail

echo "[debug] ===== predeploy debug begin ====="

echo "[debug] /var/app/staging/Procfile"
if [ -f /var/app/staging/Procfile ]; then
  sed -n '1,120p' /var/app/staging/Procfile || true
else
  echo "[debug] Procfile not found in /var/app/staging"
fi

echo "[debug] ls -al /var/app/staging"
ls -al /var/app/staging || true

echo "[debug] ls -al /var/app/staging/shared"
ls -al /var/app/staging/shared
echo "[debug] ls -al /var/app/staging/backend/shared"
ls -al /var/app/staging/backend/shared || true

echo "[debug] systemctl cat web.service"
systemctl cat web.service --no-pager 2>/dev/null || true

echo "[debug] /etc/systemd/system/web.service (if exists)"
if [ -f /etc/systemd/system/web.service ]; then
  sed -n '1,220p' /etc/systemd/system/web.service || true
else
  echo "[debug] /etc/systemd/system/web.service not found"
fi

echo "[debug] ===== predeploy debug end ====="
